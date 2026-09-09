import assert from 'node:assert/strict';
import test from 'node:test';

const loadDismissal = () => import('../src/core/active-problem-dismissal.js');

test('keeps a dismissed active-problem card hidden until the problem leaves the active set', async () => {
  const { createProblemDismissalState } = await loadDismissal();
  const state = createProblemDismissalState();

  state.dismiss('problem-1');
  assert.equal(state.isDismissed('problem-1'), true);

  state.prune(new Set(['problem-1', 'problem-2']));
  assert.equal(state.isDismissed('problem-1'), true);

  state.prune(new Set(['problem-2']));
  assert.equal(state.isDismissed('problem-1'), false);
});

test('normalizes numeric problem ids for dismissal state', async () => {
  const { createProblemDismissalState } = await loadDismissal();
  const state = createProblemDismissalState();

  state.dismiss(42);
  assert.equal(state.isDismissed('42'), true);
  state.clear();
  assert.equal(state.isDismissed(42), false);
});
