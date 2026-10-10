import assert from 'node:assert/strict';
import test from 'node:test';

const loadAnswerPriority = () => import('../src/core/answer-priority.js');

const profiles = [
  { id: 'active', apiKey: 'active-key', model: 'accurate' },
  { id: 'fast', apiKey: 'fast-key', model: 'fast' },
  { id: 'verify', apiKey: 'verify-key', model: 'verify' },
];

test('includes one minute before and ten minutes after a configured time', async () => {
  const { isWithinAnswerPriorityWindow } = await loadAnswerPriority();
  const windows = [{ at: '10:00' }];

  assert.equal(isWithinAnswerPriorityWindow(new Date(2026, 0, 1, 9, 59), windows), true);
  assert.equal(isWithinAnswerPriorityWindow(new Date(2026, 0, 1, 10, 10), windows), true);
  assert.equal(isWithinAnswerPriorityWindow(new Date(2026, 0, 1, 9, 58), windows), false);
  assert.equal(isWithinAnswerPriorityWindow(new Date(2026, 0, 1, 10, 11), windows), false);
});

test('supports a priority window crossing midnight', async () => {
  const { isWithinAnswerPriorityWindow } = await loadAnswerPriority();
  const windows = [{ at: '00:05', beforeMs: 10 * 60_000, afterMs: 10 * 60_000 }];

  assert.equal(isWithinAnswerPriorityWindow(new Date(2026, 0, 1, 23, 58), windows), true);
  assert.equal(isWithinAnswerPriorityWindow(new Date(2026, 0, 1, 0, 15), windows), true);
  assert.equal(isWithinAnswerPriorityWindow(new Date(2026, 0, 1, 0, 16), windows), false);
});

test('selects configured fast and verification profiles and falls back safely', async () => {
  const { selectAnswerProfile } = await loadAnswerPriority();
  const ai = { profiles, activeProfileId: 'active' };

  assert.equal(selectAnswerProfile(ai, {
    role: 'fast',
    fastProfileId: 'fast',
    windows: [{ at: '10:00' }],
    now: new Date(2026, 0, 1, 10, 1),
  }).id, 'fast');
  assert.equal(selectAnswerProfile(ai, {
    role: 'verify',
    verifyProfileId: 'verify',
  }).id, 'verify');
  assert.equal(selectAnswerProfile(ai, {
    role: 'fast',
    fastProfileId: 'missing',
    windows: [{ at: '10:00' }],
    now: new Date(2026, 0, 1, 10, 1),
  }).id, 'active');
});

test('compares equivalent choice and text answers after normalization', async () => {
  const { compareParsedAnswers } = await loadAnswerPriority();
  const problem = { problemType: 2 };

  assert.equal(compareParsedAnswers(problem, ['B', 'A'], ['A', 'B']), true);
  assert.equal(compareParsedAnswers(problem, { content: '  同一个答案\n' }, { content: '同一个答案' }), true);
  assert.equal(compareParsedAnswers(problem, ['A'], ['B']), false);
});
