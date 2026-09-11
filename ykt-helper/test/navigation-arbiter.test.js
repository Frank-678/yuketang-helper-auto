import assert from 'node:assert/strict';
import test from 'node:test';

const loadNavigation = () => import('../src/core/navigation-arbiter.js');

function createFakeTimers() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeoutFn(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    runNext() {
      const [id, timer] = timers.entries().next().value || [];
      if (!timer) return;
      timers.delete(id);
      timer.callback();
    },
    get pending() {
      return timers.size;
    },
    get lastDelay() {
      return [...timers.values()].at(-1)?.delay;
    },
  };
}

test('selects the latest active classroom and never falls back to inactive records', async () => {
  const { pickLatestActiveLesson } = await loadNavigation();
  const latest = pickLatestActiveLesson([
    { id: 'old', status: 1, startTime: '2026-09-11T09:00:00Z' },
    { id: 'ended', status: 0, startTime: '2026-09-11T10:00:00Z' },
    { id: 'new', status: '1', startTime: '2026-09-11T11:00:00Z' },
  ]);

  assert.equal(latest.id, 'new');
  assert.equal(pickLatestActiveLesson([{ id: 'ended', status: 0 }]), null);
});

test('waits ten seconds before navigating to the offered classroom', async () => {
  const { createNavigationArbiter } = await loadNavigation();
  const timers = createFakeTimers();
  const navigated = [];
  const arbiter = createNavigationArbiter({
    waitMs: 10_000,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    navigate: target => navigated.push(target),
  });

  assert.equal(arbiter.offer('/lesson/fullscreen/v3/new'), true);
  assert.equal(timers.lastDelay, 10_000);
  assert.deepEqual(navigated, []);
  timers.runNext();
  assert.deepEqual(navigated, ['/lesson/fullscreen/v3/new']);
});

test('cancels the pending automatic navigation after user intent', async () => {
  const { createNavigationArbiter } = await loadNavigation();
  const timers = createFakeTimers();
  const navigated = [];
  const arbiter = createNavigationArbiter({
    waitMs: 10_000,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    navigate: target => navigated.push(target),
  });

  arbiter.offer('/lesson/fullscreen/v3/new');
  assert.equal(arbiter.observeUserIntent(), true);
  assert.equal(timers.pending, 0);
  timers.runNext();
  assert.deepEqual(navigated, []);
  assert.equal(arbiter.offer('/lesson/fullscreen/v3/other'), false);
});

test('can be reset after a route change and accepts a new offer', async () => {
  const { createNavigationArbiter } = await loadNavigation();
  const timers = createFakeTimers();
  const navigated = [];
  const arbiter = createNavigationArbiter({
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
    navigate: target => navigated.push(target),
  });

  arbiter.offer('/lesson/fullscreen/v3/first');
  arbiter.observeUserIntent();
  arbiter.reset();
  assert.equal(arbiter.offer('/lesson/fullscreen/v3/second'), true);
  timers.runNext();
  assert.deepEqual(navigated, ['/lesson/fullscreen/v3/second']);
});

