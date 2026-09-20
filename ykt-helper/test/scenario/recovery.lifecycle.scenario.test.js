import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_RECOVERY_MAX_ENTRIES,
  DEFAULT_RECOVERY_TTL_MS,
  createProblemRecoveryStore,
  normalizeRecoveryRecord,
  shouldRecoverProblem,
} from '../../src/state/auto-answer-recovery.js';

function memoryStore(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get(key, dv) { return map.has(key) ? structuredClone(map.get(key)) : dv; },
    set(key, value) { map.set(key, structuredClone(value)); },
    dump() { return Object.fromEntries(map); },
  };
}

test('normalization accepts legacy id aliases and preserves lesson isolation', () => {
  const r = normalizeRecoveryRecord({ id: 7, pres: 8, sid: 9, dt: '1000', endTime: '2000', phase: 'answering', attempts: '2' }, { lessonId: 42, now: 3000 });
  assert.deepEqual(r, {
    lessonId: '42', problemId: '7', presentationId: '8', slideId: '9', startTime: 1000, endTime: 2000,
    phase: 'answering', autoAnswerTime: null, autoAnswerQueued: true, attempts: 2, lastError: '', done: false, updatedAt: 3000,
  });
});

test('normalization rejects missing problem id', () => {
  assert.equal(normalizeRecoveryRecord({ slideId: 1 }), null);
});

for (const phase of ['queued', 'answering']) {
  test(`${phase} record recovers when enabled and before deadline`, () => {
    const result = shouldRecoverProblem({ phase, done: false, autoAnswerQueued: true, endTime: 5000 }, { enabled: true, now: 2000 });
    assert.equal(result.recover, true);
    assert.equal(result.forceRetry, false);
  });
}

for (const phase of ['failed', 'done', 'unknown']) {
  test(`${phase} record is not automatically recovered`, () => {
    const result = shouldRecoverProblem({ phase, done: phase === 'done', autoAnswerQueued: true }, { enabled: true, now: 2000 });
    assert.equal(result.recover, false);
  });
}

test('queued record with autoAnswerQueued=false does not recover', () => {
  assert.deepEqual(shouldRecoverProblem({ phase: 'queued', done: false, autoAnswerQueued: false }, { enabled: true }), { recover: false, forceRetry: false, reason: 'not-queued' });
});

test('interrupted answering record recovers even when queue flag is false', () => {
  assert.deepEqual(shouldRecoverProblem({ phase: 'answering', done: false, autoAnswerQueued: false }, { enabled: true, now: 100 }), { recover: true, forceRetry: false, reason: 'interrupted' });
});

test('expired record stays stopped by default', () => {
  assert.deepEqual(shouldRecoverProblem({ phase: 'queued', done: false, autoAnswerQueued: true, endTime: 100 }, { enabled: true, recoverExpired: false, now: 101 }), { recover: false, forceRetry: false, reason: 'expired' });
});

test('expired record only becomes retry when explicitly opted in', () => {
  assert.deepEqual(shouldRecoverProblem({ phase: 'queued', done: false, autoAnswerQueued: true, endTime: 100 }, { enabled: true, recoverExpired: true, now: 101 }), { recover: true, forceRetry: true, reason: 'expired-retry' });
});

for (const endTime of [null, undefined, '', 'bad']) {
  test(`non-finite deadline ${JSON.stringify(endTime)} is treated as untimed during recovery`, () => {
    const result = shouldRecoverProblem({ phase: 'queued', done: false, autoAnswerQueued: true, endTime }, { enabled: true, now: 999999 });
    assert.equal(result.recover, true);
    assert.equal(result.forceRetry, false);
  });
}

test('recovery disabled is a hard stop regardless of record state', () => {
  assert.deepEqual(shouldRecoverProblem({ phase: 'answering', done: false }, { enabled: false }), { recover: false, forceRetry: false, reason: 'disabled' });
});

test('stores with different lesson ids cannot see each other records', () => {
  const storage = memoryStore();
  const a = createProblemRecoveryStore({ storage, lessonId: 'lesson-a', now: () => 1000 });
  const b = createProblemRecoveryStore({ storage, lessonId: 'lesson-b', now: () => 1000 });
  a.upsert({ problemId: 'q1', phase: 'queued' });
  assert.equal(a.get('q1').lessonId, 'lesson-a');
  assert.equal(b.get('q1'), null);
});

test('update preserves existing identifiers and replaces requested fields', () => {
  const storage = memoryStore();
  const store = createProblemRecoveryStore({ storage, lessonId: 'l', now: () => 1000 });
  store.upsert({ problemId: 'q1', slideId: 's1', phase: 'queued', attempts: 0 });
  const updated = store.update('q1', { phase: 'answering', attempts: 1 });
  assert.equal(updated.problemId, 'q1');
  assert.equal(updated.slideId, 's1');
  assert.equal(updated.phase, 'answering');
  assert.equal(updated.attempts, 1);
});

test('remove only deletes requested record and persists', () => {
  const storage = memoryStore();
  const store = createProblemRecoveryStore({ storage, lessonId: 'l', now: () => 1000 });
  store.upsert({ problemId: 'q1' });
  store.upsert({ problemId: 'q2' });
  assert.equal(store.remove('q1'), true);
  assert.equal(store.get('q1'), null);
  assert.ok(store.get('q2'));
  assert.equal(store.remove('missing'), false);
});

test('clear removes every record in the lesson store', () => {
  const storage = memoryStore();
  const store = createProblemRecoveryStore({ storage, lessonId: 'l', now: () => 1000 });
  for (let i = 0; i < 5; i++) store.upsert({ problemId: `q${i}` });
  store.clear();
  assert.deepEqual(store.list(), []);
});

test('TTL pruning deletes stale records on load', () => {
  const now = DEFAULT_RECOVERY_TTL_MS + 1001;
  const key = 'auto-answer-recovery:l';
  const storage = memoryStore({ [key]: [{ lessonId: 'l', problemId: 'old', phase: 'queued', updatedAt: 0 }, { lessonId: 'l', problemId: 'new', phase: 'queued', updatedAt: now }] });
  const store = createProblemRecoveryStore({ storage, lessonId: 'l', now: () => now });
  assert.equal(store.get('old'), null);
  assert.ok(store.get('new'));
});

test('max entry pruning retains newest records', () => {
  let now = 0;
  const storage = memoryStore();
  const store = createProblemRecoveryStore({ storage, lessonId: 'l', now: () => ++now, maxEntries: 3, ttlMs: 999999 });
  for (let i = 0; i < 6; i++) store.upsert({ problemId: `q${i}` });
  assert.deepEqual(store.list().map(x => x.problemId).sort(), ['q3', 'q4', 'q5']);
});

test('default max entries constant remains bounded', () => {
  assert.equal(DEFAULT_RECOVERY_MAX_ENTRIES, 100);
  assert.ok(DEFAULT_RECOVERY_TTL_MS >= 24 * 60 * 60 * 1000);
});

test('foreign-lesson records in shared storage are pruned instead of recovered', () => {
  const key = 'auto-answer-recovery:l';
  const storage = memoryStore({ [key]: [{ lessonId: 'other', problemId: 'q1', phase: 'queued', updatedAt: 10 }] });
  const store = createProblemRecoveryStore({ storage, lessonId: 'l', now: () => 20 });
  assert.equal(store.get('q1'), null);
});
