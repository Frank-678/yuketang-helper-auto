import assert from 'node:assert/strict';
import test from 'node:test';
import { createAutoAnswerRunner } from '../../src/state/auto-answer-runner.js';

function harness(overrides = {}) {
  const events = [];
  const calls = { captureSlide: 0, captureFallback: 0, query: 0, submit: 0, answered: 0, status: [] };
  const deps = {
    typeMap: { 1: '单选题', 2: '多选题', 4: '填空题', 5: '主观题' },
    getAIConfig: () => ({ profiles: [{ id: 'p1', apiKey: 'k' }], activeProfileId: 'p1' }),
    getAnswerProfile: () => ({ id: 'p1' }),
    hasActiveProfile: () => true,
    makeDefaultAnswer: problem => problem.problemType === 2 ? ['A', 'C'] : ['A'],
    captureSlideImage: async () => { calls.captureSlide += 1; return 'slide-image'; },
    captureProblemForVision: async () => { calls.captureFallback += 1; return 'fallback-image'; },
    formatProblemForVision: problem => `prompt:${problem.problemId}`,
    queryAIVision: async () => { calls.query += 1; return '答案: A'; },
    parseAIAnswer: () => ['A'],
    submitAnswer: async (problem, answer, options) => { calls.submit += 1; calls.lastSubmit = { problem, answer, options }; return { route: options.forceRetry ? 'retry' : 'answer', resp: { code: 0 } }; },
    onAnswered: async () => { calls.answered += 1; },
    onStatusChange: status => calls.status.push({ ...status }),
    notify: (type, _problem, detail, meta) => events.push({ channel: 'notify', type, detail, meta }),
    toast: message => events.push({ channel: 'toast', message }),
    showPopup: (_problem, content) => events.push({ channel: 'popup', content }),
    now: () => 2_000,
    ...overrides,
  };
  return { runner: createAutoAnswerRunner(deps), calls, events };
}

function status(overrides = {}) {
  return {
    slideId: 's1', presentationId: 'p1', startTime: 1_000, endTime: 10_000,
    phase: 'queued', answering: false, done: false, attempts: 0, autoAnswerTime: 2_000, lastError: '',
    ...overrides,
  };
}
function problem(overrides = {}) { return { problemId: 'q1', problemType: 1, body: '2+2=?', result: null, ...overrides }; }

for (const endTime of [null, undefined, '', 'not-a-number']) {
  test(`untimed/non-numeric deadline ${JSON.stringify(endTime)} still reaches AI and submit`, async () => {
    const { runner, calls } = harness();
    const s = status({ endTime });
    const result = await runner.run(problem(), s, { lessonId: 'l1' });
    assert.equal(result.ok, true);
    assert.equal(calls.query, 1);
    assert.equal(calls.submit, 1);
    assert.equal(s.phase, 'done');
  });
}

test('real expired automatic attempt stops before AI', async () => {
  const { runner, calls, events } = harness({ now: () => 20_000 });
  const s = status({ endTime: 10_000 });
  const result = await runner.run(problem(), s, { lessonId: 'l1' });
  assert.deepEqual(result, { ok: false, reason: 'expired' });
  assert.equal(calls.query, 0);
  assert.equal(calls.submit, 0);
  assert.equal(events.length, 0);
});

test('manual force on expired problem performs retry route and emits full lifecycle', async () => {
  const { runner, calls, events } = harness({ now: () => 20_000 });
  const s = status({ endTime: 10_000 });
  const result = await runner.run(problem(), s, { force: true, allowResubmit: true, source: 'manual', lessonId: 'l1' });
  assert.equal(result.ok, true);
  assert.equal(result.route, 'retry');
  assert.equal(calls.lastSubmit.options.forceRetry, true);
  assert.deepEqual(events.filter(e => e.channel === 'notify').map(e => e.type), ['auto-answer-started', 'auto-answer-succeeded']);
  assert.match(events.find(e => e.channel === 'toast')?.message || '', /手动 AI 作答开始/);
});

for (const emptyResult of [null, undefined, '', [], {}]) {
  test(`empty result ${JSON.stringify(emptyResult)} is not treated as answered`, async () => {
    const { runner, calls } = harness();
    const result = await runner.run(problem({ result: emptyResult }), status(), { lessonId: 'l1' });
    assert.equal(result.ok, true);
    assert.equal(calls.submit, 1);
  });
}

for (const answeredResult of [['A'], { content: 'x' }, 'A']) {
  test(`non-empty result ${JSON.stringify(answeredResult)} blocks normal auto rerun`, async () => {
    const { runner, calls } = harness();
    const result = await runner.run(problem({ result: answeredResult }), status(), { lessonId: 'l1' });
    assert.deepEqual(result, { ok: false, reason: 'answered' });
    assert.equal(calls.query, 0);
    assert.equal(calls.submit, 0);
  });
}

test('manual force with allowResubmit overrides both done and local result', async () => {
  const { runner, calls } = harness();
  const result = await runner.run(problem({ result: ['A'] }), status({ done: true, phase: 'done' }), { force: true, allowResubmit: true, source: 'manual', lessonId: 'l1' });
  assert.equal(result.ok, true);
  assert.equal(calls.query, 1);
  assert.equal(calls.submit, 1);
});

test('answering lock prevents duplicate concurrent attempt before any side effect', async () => {
  const { runner, calls, events } = harness();
  const result = await runner.run(problem(), status({ answering: true, phase: 'answering' }), { force: true });
  assert.deepEqual(result, { ok: false, reason: 'answering' });
  assert.equal(calls.captureSlide, 0);
  assert.equal(calls.query, 0);
  assert.equal(calls.submit, 0);
  assert.equal(events.length, 0);
});

test('slide capture failure falls back to problem capture', async () => {
  const { runner, calls } = harness({ captureSlideImage: async () => { calls.captureSlide += 1; throw new Error('slide missing'); } });
  const result = await runner.run(problem(), status(), { lessonId: 'l1' });
  assert.equal(result.ok, true);
  assert.equal(calls.captureSlide, 1);
  assert.equal(calls.captureFallback, 1);
  assert.equal(calls.query, 1);
});

test('empty slide capture falls back to problem capture', async () => {
  const { runner, calls } = harness({ captureSlideImage: async () => { calls.captureSlide += 1; return null; } });
  const result = await runner.run(problem(), status(), { lessonId: 'l1' });
  assert.equal(result.ok, true);
  assert.equal(calls.captureFallback, 1);
});

test('missing every image source fails visibly and remains retryable', async () => {
  const { runner, calls, events } = harness({ captureSlideImage: async () => null, captureProblemForVision: async () => null });
  const s = status();
  const result = await runner.run(problem(), s, { lessonId: 'l1' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'error');
  assert.equal(s.phase, 'failed');
  assert.equal(s.answering, false);
  assert.equal(s.attempts, 1);
  assert.match(s.lastError, /无法获取题目图像/);
  assert.equal(calls.submit, 0);
  assert.ok(events.some(e => e.type === 'auto-answer-failed'));
});

test('AI request failure never submits and produces failed state', async () => {
  const { runner, calls } = harness({ queryAIVision: async () => { calls.query += 1; throw new Error('api down'); } });
  const s = status();
  const result = await runner.run(problem(), s, { lessonId: 'l1' });
  assert.equal(result.ok, false);
  assert.equal(calls.submit, 0);
  assert.equal(s.phase, 'failed');
  assert.match(s.lastError, /api down/);
});

test('unparseable AI output never submits', async () => {
  const { runner, calls } = harness({ parseAIAnswer: () => null });
  const s = status();
  const result = await runner.run(problem(), s, { lessonId: 'l1' });
  assert.equal(result.ok, false);
  assert.equal(calls.submit, 0);
  assert.match(s.lastError, /无法解析 AI/);
});

test('submit failure never marks done and preserves retryable failed state', async () => {
  const { runner, calls } = harness({ submitAnswer: async () => { calls.submit += 1; throw new Error('server rejected'); } });
  const s = status();
  const result = await runner.run(problem(), s, { lessonId: 'l1' });
  assert.equal(result.ok, false);
  assert.equal(s.done, false);
  assert.equal(s.phase, 'failed');
  assert.equal(s.answering, false);
  assert.match(s.lastError, /server rejected/);
});

test('successful attempt clears transient state only after submit succeeds', async () => {
  const { runner, calls } = harness();
  const s = status({ lastError: 'old', autoAnswerTime: 1234 });
  const result = await runner.run(problem(), s, { lessonId: 'l1' });
  assert.equal(result.ok, true);
  assert.equal(s.done, true);
  assert.equal(s.answering, false);
  assert.equal(s.phase, 'done');
  assert.equal(s.autoAnswerTime, null);
  assert.equal(s.lastError, '');
  assert.equal(calls.answered, 1);
});

test('runner always disables submitAnswer auto delay gate because scheduling already happened', async () => {
  const { runner, calls } = harness();
  await runner.run(problem(), status(), { lessonId: 'l1' });
  assert.equal(calls.lastSubmit.options.autoGate, false);
  assert.equal(calls.lastSubmit.options.waitMs, 0);
});

test('AI profile id selected by runner is forwarded to vision request', async () => {
  let seenOptions;
  const { runner } = harness({
    getAnswerProfile: () => ({ id: 'fast-profile' }),
    queryAIVision: async (_image, _prompt, _config, options) => { seenOptions = options; return '答案: A'; },
  });
  await runner.run(problem({ problemType: 2 }), status(), { lessonId: 'l1' });
  assert.equal(seenOptions.profileId, 'fast-profile');
  assert.equal(seenOptions.problemType, 2);
});

test('no active AI profile fails closed and never submits a fabricated answer', async () => {
  const { runner, calls, events } = harness({ hasActiveProfile: () => false });
  const s = status();
  const result = await runner.run(problem(), s, { lessonId: 'l1' });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'error');
  assert.equal(calls.query, 0);
  assert.equal(calls.submit, 0);
  assert.equal(s.phase, 'failed');
  assert.equal(s.answering, false);
  assert.match(s.lastError, /AI|Profile|API Key|配置/i);
  assert.ok(events.some(event => event.type === 'auto-answer-failed'));
});

test('verification same/unavailable does not create a second submission', async () => {
  for (const verification of [{ state: 'same' }, { state: 'unavailable' }]) {
    const { runner, calls } = harness({ verifyAnswer: async () => verification });
    const result = await runner.run(problem(), status(), { lessonId: 'l1' });
    assert.equal(result.ok, true);
    assert.equal(calls.submit, 1);
  }
});

test('verification correction creates exactly one second submission and exposes corrected result', async () => {
  const { runner, calls } = harness({ verifyAnswer: async () => ({ state: 'corrected', answer: ['B'], aiAnswer: '答案: B' }) });
  const result = await runner.run(problem(), status(), { lessonId: 'l1' });
  assert.equal(result.ok, true);
  assert.equal(calls.submit, 2);
  assert.deepEqual(result.answer, ['B']);
  assert.equal(result.aiAnswer, '答案: B');
  assert.equal(result.verificationState, 'corrected');
});


test('automatic runner forces single-step vision to avoid multi-request timeout amplification', async () => {
  let seenOptions;
  const { runner } = harness({
    queryAIVision: async (_image, _prompt, _config, options) => {
      seenOptions = options;
      return '答案: A';
    },
  });
  const result = await runner.run(problem(), status(), { lessonId: 'l1' });
  assert.equal(result.ok, true);
  assert.equal(seenOptions.disableTwoStep, true);
});
