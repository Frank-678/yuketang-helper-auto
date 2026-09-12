import assert from 'node:assert/strict';
import test from 'node:test';

const loadRecovery = () => import('../src/state/auto-answer-recovery.js');

function createMemoryStorage() {
  const values = new Map();
  return {
    get(key, fallback = null) {
      return values.has(key) ? JSON.parse(values.get(key)) : fallback;
    },
    set(key, value) {
      values.set(key, JSON.stringify(value));
    },
    remove(key) {
      values.delete(key);
    },
    raw(key) {
      return values.get(key);
    },
  };
}

test('persists a queued answer and restores it after a refresh', async () => {
  const { createProblemRecoveryStore } = await loadRecovery();
  const storage = createMemoryStorage();

  const first = createProblemRecoveryStore({
    storage,
    lessonId: 'lesson-1',
    now: () => 1_000,
  });
  first.upsert({
    problemId: 'problem-7',
    presentationId: 'pres-2',
    slideId: 'slide-9',
    startTime: 1_000,
    endTime: 31_000,
    phase: 'queued',
    autoAnswerTime: 4_000,
  });

  const afterRefresh = createProblemRecoveryStore({
    storage,
    lessonId: 'lesson-1',
    now: () => 5_000,
  });

  assert.deepEqual(afterRefresh.get('problem-7'), {
    lessonId: 'lesson-1',
    problemId: 'problem-7',
    presentationId: 'pres-2',
    slideId: 'slide-9',
    startTime: 1_000,
    endTime: 31_000,
    phase: 'queued',
    autoAnswerTime: 4_000,
    autoAnswerQueued: true,
    done: false,
    attempts: 0,
    lastError: '',
    updatedAt: 1_000,
  });
});

test('deduplicates repeated websocket unlocks by problem id', async () => {
  const { createProblemRecoveryStore } = await loadRecovery();
  const storage = createMemoryStorage();
  const store = createProblemRecoveryStore({ storage, lessonId: 'lesson-1', now: () => 1_000 });

  store.upsert({ problemId: 'problem-7', phase: 'queued', autoAnswerTime: 4_000 });
  store.upsert({ problemId: 'problem-7', phase: 'answering', autoAnswerTime: null, attempts: 1 });

  assert.equal(store.list().length, 1);
  assert.equal(store.get('problem-7').phase, 'answering');
  assert.equal(store.get('problem-7').attempts, 1);
});

test('only queued or interrupted answering problems are eligible for opt-in recovery', async () => {
  const { shouldRecoverProblem } = await loadRecovery();
  const base = {
    problemId: 'problem-7',
    phase: 'queued',
    endTime: 10_000,
    done: false,
  };

  assert.deepEqual(
    shouldRecoverProblem(base, { enabled: true, now: 5_000 }),
    { recover: true, forceRetry: false, reason: 'pending' },
  );
  assert.deepEqual(
    shouldRecoverProblem({ ...base, phase: 'answering' }, { enabled: true, now: 5_000 }),
    { recover: true, forceRetry: false, reason: 'interrupted' },
  );
  assert.deepEqual(
    shouldRecoverProblem({ ...base, phase: 'failed' }, { enabled: true, now: 5_000 }),
    { recover: false, forceRetry: false, reason: 'not-pending' },
  );
});

test('does not retry an expired problem unless expired recovery is explicitly enabled', async () => {
  const { shouldRecoverProblem } = await loadRecovery();
  const record = {
    problemId: 'problem-7',
    phase: 'answering',
    endTime: 10_000,
    done: false,
  };

  assert.deepEqual(
    shouldRecoverProblem(record, { enabled: true, now: 11_000 }),
    { recover: false, forceRetry: false, reason: 'expired' },
  );
  assert.deepEqual(
    shouldRecoverProblem(record, { enabled: true, recoverExpired: true, now: 11_000 }),
    { recover: true, forceRetry: true, reason: 'expired-retry' },
  );
});

test('completed or disabled records never trigger automatic recovery', async () => {
  const { shouldRecoverProblem } = await loadRecovery();
  const record = { problemId: 'problem-7', phase: 'queued', endTime: null, done: false };

  assert.deepEqual(
    shouldRecoverProblem({ ...record, done: true }, { enabled: true, now: 1_000 }),
    { recover: false, forceRetry: false, reason: 'done' },
  );
  assert.deepEqual(
    shouldRecoverProblem(record, { enabled: false, now: 1_000 }),
    { recover: false, forceRetry: false, reason: 'disabled' },
  );
  assert.deepEqual(
    shouldRecoverProblem({ ...record, autoAnswerQueued: false }, { enabled: true, now: 1_000 }),
    { recover: false, forceRetry: false, reason: 'not-queued' },
  );
  assert.deepEqual(
    shouldRecoverProblem({ ...record, phase: 'done' }, { enabled: true, now: 1_000 }),
    { recover: false, forceRetry: false, reason: 'not-pending' },
  );
});

test('preserves a stored done phase instead of turning corrupted data into a queue', async () => {
  const { createProblemRecoveryStore, shouldRecoverProblem } = await loadRecovery();
  const storage = createMemoryStorage();
  storage.set('auto-answer-recovery:lesson-1', [
    { problemId: 'already-done', phase: 'done', done: false, updatedAt: 1_000 },
  ]);

  const store = createProblemRecoveryStore({ storage, lessonId: 'lesson-1', now: () => 1_000 });
  const record = store.get('already-done');

  assert.equal(record.phase, 'done');
  assert.deepEqual(
    shouldRecoverProblem(record, { enabled: true, now: 1_000 }),
    { recover: false, forceRetry: false, reason: 'not-pending' },
  );
});

test('removes a record after a successful answer so a refresh cannot resubmit it', async () => {
  const { createProblemRecoveryStore } = await loadRecovery();
  const storage = createMemoryStorage();
  const store = createProblemRecoveryStore({ storage, lessonId: 'lesson-1', now: () => 1_000 });

  store.upsert({ problemId: 'problem-7', phase: 'answering' });
  store.remove('problem-7');

  assert.equal(store.get('problem-7'), null);
  assert.deepEqual(storage.get('auto-answer-recovery:lesson-1', []), []);
});

test('keeps automatic recovery safeguards disabled by default', async () => {
  const { DEFAULT_CONFIG } = await import('../src/core/types.js');

  assert.equal(DEFAULT_CONFIG.autoRecoverUnanswered, false);
  assert.equal(DEFAULT_CONFIG.autoRecoverExpired, false);
  assert.equal(DEFAULT_CONFIG.autoScanUnanswered, false);
});

test('prunes stale records and bounds the per-course queue', async () => {
  const { createProblemRecoveryStore } = await loadRecovery();
  const storage = createMemoryStorage();
  storage.set('auto-answer-recovery:lesson-1', [
    { problemId: 'stale', phase: 'queued', updatedAt: 1_000 },
    { problemId: 'oldest', phase: 'queued', updatedAt: 9_000 },
    { problemId: 'newer', phase: 'queued', updatedAt: 9_500 },
  ]);

  const store = createProblemRecoveryStore({
    storage,
    lessonId: 'lesson-1',
    now: () => 10_000,
    ttlMs: 5_000,
    maxEntries: 1,
  });

  assert.deepEqual(store.list().map(record => record.problemId), ['newer']);
  assert.deepEqual(storage.get('auto-answer-recovery:lesson-1', []), store.list());
});
