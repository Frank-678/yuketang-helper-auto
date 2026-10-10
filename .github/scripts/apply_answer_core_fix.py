from pathlib import Path

root = Path('ykt-helper')

# Shared answer-state semantics: only meaningful payload content means answered.
state = root / 'src/core/answer-state.js'
state.write_text("""/** Return true only when a backend/local result contains meaningful submitted content. */
export function hasSubmittedAnswer(result) {
  if (result === null || result === undefined) return false;
  if (typeof result === 'string') return result.trim().length > 0;
  if (Array.isArray(result)) return result.some(hasSubmittedAnswer);
  if (typeof result === 'object') return Object.values(result).some(hasSubmittedAnswer);
  return true;
}
""", encoding='utf-8')

# Runner fixes: null deadline is untimed; force resubmit bypasses stale done/result state.
p = root / 'src/state/auto-answer-runner.js'
s = p.read_text(encoding='utf-8')
if "import { hasSubmittedAnswer } from '../core/answer-state.js';" not in s:
    s = "import { hasSubmittedAnswer } from '../core/answer-state.js';\n\n" + s

old = """function isExpired(status, now) {
  const endTime = Number(status?.endTime);
  return Number.isFinite(endTime) && now >= endTime;
}"""
new = """function isExpired(status, now) {
  const rawEndTime = status?.endTime;
  if (rawEndTime === null || rawEndTime === undefined || rawEndTime === '') return false;
  const endTime = Number(rawEndTime);
  return Number.isFinite(endTime) && now >= endTime;
}"""
assert old in s, 'runner expiry context changed'
s = s.replace(old, new, 1)

old = """if (status.done || (problem.result && !allowResubmit)) {
      return { ok: false, reason: 'answered' };
    }"""
new = """if ((status.done || hasSubmittedAnswer(problem.result)) && !allowResubmit) {
      return { ok: false, reason: 'answered' };
    }"""
assert old in s, 'runner answered guard context changed'
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# Action-layer answer-state and requeue fixes.
p = root / 'src/state/actions.js'
s = p.read_text(encoding='utf-8')
anchor = "import { buildAnswerSubmitOptions } from './answer-editor.js';"
assert anchor in s, 'actions import anchor missing'
if "import { hasSubmittedAnswer } from '../core/answer-state.js';" not in s:
    s = s.replace(anchor, anchor + "\nimport { hasSubmittedAnswer } from '../core/answer-state.js';", 1)

replacements = [
    ("done: !!problem?.result,", "done: hasSubmittedAnswer(problem?.result),"),
    ("if (record.done || record.phase === 'done' || problem.result) {", "if (record.done || record.phase === 'done' || hasSubmittedAnswer(problem.result)) {"),
    ("if (!problem || !pid || problem.result || getProblemStatus(pid)) continue;", "if (!problem || !pid || hasSubmittedAnswer(problem.result) || getProblemStatus(pid)) continue;"),
    ("if (problem && !problem.result) {", "if (problem && !hasSubmittedAnswer(problem.result)) {"),
    ("status.done = !!problem.result;", "status.done = hasSubmittedAnswer(problem.result);"),
    ("if (problem.result) {\n      console.log('[雨课堂助手][WARN][onUnlockProblem] 题目已作答，跳过自动流程');", "if (hasSubmittedAnswer(problem.result)) {\n      console.log('[雨课堂助手][WARN][onUnlockProblem] 题目已作答，跳过自动流程');"),
]
for old, new in replacements:
    assert old in s, f'actions context missing: {old[:70]!r}'
    s = s.replace(old, new, 1)

old = "if (autoAnswerEnabled && status.autoAnswerQueued && !status.answering && status.phase !== 'failed' && status.autoAnswerTime === null) {"
new = "if (autoAnswerEnabled && status.autoAnswerQueued && !status.answering && status.autoAnswerTime === null) {\n      status.phase = 'queued';\n      status.lastError = '';"
assert old in s, 'actions scheduling gate context changed'
s = s.replace(old, new, 1)

old = """return handleAutoAnswerInternal(problem, {
      ...options,
      status,
      force: true,
      source: 'manual',
    });"""
new = """return handleAutoAnswerInternal(problem, {
      ...options,
      status,
      force: true,
      allowResubmit: true,
      source: 'manual',
    });"""
assert old in s, 'forceAIAnswer context changed'
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')

# Manual buttons must submit immediately, never inherit auto-answer delay.
p = root / 'src/ui/panels/problem-list.js'
s = p.read_text(encoding='utf-8')
assert s.count("{ startTime, endTime }") >= 1
assert s.count("{ startTime, endTime, forceRetry: true }") >= 2
s = s.replace("{ startTime, endTime }", "{ startTime, endTime, autoGate: false, waitMs: 0 }")
s = s.replace("{ startTime, endTime, forceRetry: true }", "{ startTime, endTime, forceRetry: true, autoGate: false, waitMs: 0 }")
p.write_text(s, encoding='utf-8')

# Answer-state unit tests.
(root / 'test/answer-state.test.js').write_text("""import assert from 'node:assert/strict';
import test from 'node:test';
import { hasSubmittedAnswer } from '../src/core/answer-state.js';

test('empty backend result containers are still unanswered', () => {
  for (const value of [null, undefined, '', '   ', [], {}, [''], { content: '', pics: [] }]) {
    assert.equal(hasSubmittedAnswer(value), false);
  }
});

test('non-empty answer payloads count as submitted', () => {
  assert.equal(hasSubmittedAnswer(['A']), true);
  assert.equal(hasSubmittedAnswer({ content: 'x', pics: [] }), true);
  assert.equal(hasSubmittedAnswer('A'), true);
  assert.equal(hasSubmittedAnswer(0), true);
});
""", encoding='utf-8')

# Focused runner regressions.
t = root / 'test/auto-answer-runner.test.js'
s = t.read_text(encoding='utf-8')
marker = "untimed empty-result problems reach the answer runner"
if marker not in s:
    s += """

test('untimed empty-result problems reach the answer runner', async () => {
  const { createAutoAnswerRunner } = await loadRunner();
  for (const result of [[], {}]) {
    let submitted = 0;
    const runner = createAutoAnswerRunner({
      hasActiveProfile: () => false,
      makeDefaultAnswer: () => ['A'],
      submitAnswer: async () => { submitted += 1; return { route: 'answer' }; },
    });
    const problem = { problemId: 'untimed-empty-result', problemType: 1, result };
    const status = { done: false, answering: false, endTime: null, phase: 'queued', autoAnswerTime: null };
    const response = await runner.run(problem, status);
    assert.equal(response.ok, true);
    assert.equal(submitted, 1);
  }
});

test('manual force with allowResubmit bypasses done status and existing result', async () => {
  const { createAutoAnswerRunner } = await loadRunner();
  let submitted = 0;
  const runner = createAutoAnswerRunner({
    hasActiveProfile: () => false,
    makeDefaultAnswer: () => ['B'],
    submitAnswer: async () => { submitted += 1; return { route: 'answer' }; },
  });
  const problem = { problemId: 'force-resubmit', problemType: 1, result: ['A'] };
  const status = { done: true, answering: false, endTime: null, phase: 'done', autoAnswerTime: null };
  const response = await runner.run(problem, status, { force: true, allowResubmit: true, source: 'manual' });
  assert.equal(response.ok, true);
  assert.equal(submitted, 1);
  assert.deepEqual(response.answer, ['B']);
});
"""
    t.write_text(s, encoding='utf-8')

# Static wiring checks.
(root / 'test/answer-core-wiring.test.js').write_text(r"""import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const actions = fs.readFileSync(new URL('../src/state/actions.js', import.meta.url), 'utf8');
const runner = fs.readFileSync(new URL('../src/state/auto-answer-runner.js', import.meta.url), 'utf8');
const list = fs.readFileSync(new URL('../src/ui/panels/problem-list.js', import.meta.url), 'utf8');

test('force AI explicitly allows resubmission', () => {
  assert.match(actions, /force:\s*true,[\s\S]{0,120}allowResubmit:\s*true,[\s\S]{0,120}source:\s*'manual'/);
});

test('manual problem-list submits bypass automatic delay', () => {
  const immediate = list.match(/autoGate:\s*false,\s*waitMs:\s*0/g) || [];
  assert.ok(immediate.length >= 3, `expected >=3 immediate submit call sites, got ${immediate.length}`);
});

test('live scheduling is not permanently blocked by a prior failed phase', () => {
  assert.doesNotMatch(actions, /status\.phase\s*!==\s*'failed'/);
});

test('runner treats null deadlines as untimed instead of epoch zero', () => {
  assert.match(runner, /rawEndTime === null[\s\S]{0,120}return false/);
});
""", encoding='utf-8')
