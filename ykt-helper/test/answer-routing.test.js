import assert from 'node:assert/strict';
import test from 'node:test';

const loadAnswerRouting = () => import('../src/tsm/answer-routing.js');

test('uses the normal answer route before the deadline', async () => {
  const { chooseAnswerRoute } = await loadAnswerRouting();

  assert.equal(chooseAnswerRoute({ now: 1_000, endTime: 2_000 }), 'answer');
});

test('uses retry after the deadline even without an explicit force flag', async () => {
  const { chooseAnswerRoute } = await loadAnswerRouting();

  assert.equal(chooseAnswerRoute({ now: 2_000, endTime: 2_000 }), 'retry');
});

test('uses retry when explicitly forced before the deadline', async () => {
  const { chooseAnswerRoute } = await loadAnswerRouting();

  assert.equal(chooseAnswerRoute({ now: 1_000, endTime: 2_000, forceRetry: true }), 'retry');
});

test('treats an untimed problem as a normal answer unless explicitly forced', async () => {
  const { chooseAnswerRoute } = await loadAnswerRouting();

  assert.equal(chooseAnswerRoute({ now: 2_000, endTime: null }), 'answer');
  assert.equal(chooseAnswerRoute({ now: 2_000, endTime: null, forceRetry: true }), 'retry');
});
