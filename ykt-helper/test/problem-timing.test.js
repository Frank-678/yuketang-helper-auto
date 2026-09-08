import assert from 'node:assert/strict';
import test from 'node:test';

const loadProblemTiming = () => import('../src/state/problem-timing.js');

test('keeps an untimed problem open when the protocol sends an empty limit', async () => {
  const { getProblemEndTime } = await loadProblemTiming();

  assert.equal(getProblemEndTime(1_700_000_000_000, ''), null);
  assert.equal(getProblemEndTime(1_700_000_000_000, null), null);
  assert.equal(getProblemEndTime(1_700_000_000_000, undefined), null);
});

test('keeps an untimed problem open when the protocol uses zero as the limit', async () => {
  const { getProblemEndTime } = await loadProblemTiming();

  assert.equal(getProblemEndTime(1_700_000_000_000, 0), null);
  assert.equal(getProblemEndTime(1_700_000_000_000, '0'), null);
});

test('calculates the deadline for a positive time limit in seconds', async () => {
  const { getProblemEndTime } = await loadProblemTiming();

  assert.equal(
    getProblemEndTime(1_700_000_000_000, 30),
    1_700_000_030_000,
  );
  assert.equal(
    getProblemEndTime(1_700_000_000_000, '45'),
    1_700_000_045_000,
  );
});

test('does not create a NaN deadline for malformed limits', async () => {
  const { getProblemEndTime } = await loadProblemTiming();

  assert.equal(getProblemEndTime(1_700_000_000_000, 'not-a-number'), null);
  assert.equal(getProblemEndTime(1_700_000_000_000, -1), null);
});

test('reports no countdown for an untimed problem', async () => {
  const { getProblemRemainingSeconds } = await loadProblemTiming();

  assert.equal(getProblemRemainingSeconds(null, 1_700_000_000_000), null);
});

test('calculates the remaining countdown for a timed problem', async () => {
  const { getProblemRemainingSeconds } = await loadProblemTiming();

  assert.equal(
    getProblemRemainingSeconds(1_700_000_030_000, 1_700_000_000_000),
    30,
  );
  assert.equal(
    getProblemRemainingSeconds(1_699_999_999_000, 1_700_000_000_000),
    0,
  );
});
