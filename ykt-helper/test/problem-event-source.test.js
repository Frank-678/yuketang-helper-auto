import assert from 'node:assert/strict';
import test from 'node:test';

const load = () => import('../src/core/problem-event-source.js');

test('only live problem events can trigger reminders or automation', async () => {
  const { isLiveProblemSource } = await load();

  assert.equal(isLiveProblemSource('live'), true);
  assert.equal(isLiveProblemSource(undefined), true);
  assert.equal(isLiveProblemSource('timeline'), false);
  assert.equal(isLiveProblemSource('history'), true);
});
