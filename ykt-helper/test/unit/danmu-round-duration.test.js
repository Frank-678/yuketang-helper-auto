import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDanmuFollowTracker,
  createDanmuRoundTracker,
} from '../../src/core/danmu-follow.js';

test('round tracker starts a new round after one minute even without a one-minute silence gap', () => {
  const tracker = createDanmuRoundTracker({ roundGapMs: 60_000 });
  assert.deepEqual(tracker.observe(0), { roundStarted: false, roundNumber: 1, at: 0 });
  assert.deepEqual(tracker.observe(30_000), { roundStarted: false, roundNumber: 1, at: 30_000 });

  const next = tracker.observe(60_000);
  assert.equal(next.roundStarted, true);
  assert.equal(next.roundNumber, 2);
});

test('follow send quota resets at hard one-minute boundary during continuous traffic', () => {
  const tracker = createDanmuFollowTracker({
    windowSize: 1,
    burstWindowMs: 30_000,
    roundGapMs: 60_000,
    maxSendsPerRound: 2,
  });

  assert.equal(tracker.observe('first', 0).triggered, true);
  assert.equal(tracker.observe('second', 1_000).triggered, true);
  const blocked = tracker.observe('third', 2_000);
  assert.equal(blocked.triggered, false);
  assert.equal(blocked.reason, 'round-limit');

  // Messages remained continuous: the last gap is only 58 seconds, but the
  // absolute age of the round has reached one minute, so quota must reset.
  const afterBoundary = tracker.observe('new-round', 60_000);
  assert.equal(afterBoundary.triggered, true);
  assert.equal(afterBoundary.sentCount, 1);
});
