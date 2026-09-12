/**
 * Persistent state for automatic-answer work that may be interrupted by a
 * page refresh.  This module deliberately has no browser or repository
 * dependency so that recovery policy can be tested independently.
 */

export const RECOVERY_STORAGE_PREFIX = 'auto-answer-recovery:';
export const DEFAULT_RECOVERY_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RECOVERY_MAX_ENTRIES = 100;

const PENDING_PHASES = new Set(['queued', 'answering']);

function asId(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return String(value);
}

function asFiniteOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asNonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function normalizePhase(value) {
  return ['queued', 'answering', 'failed', 'done'].includes(value) ? value : 'queued';
}

export function normalizeRecoveryRecord(input = {}, { lessonId, now = Date.now() } = {}) {
  const problemId = asId(input.problemId ?? input.id);
  if (!problemId) return null;

  const lesson = asId(lessonId ?? input.lessonId) || '';
  return {
    lessonId: lesson,
    problemId,
    presentationId: asId(input.presentationId ?? input.pres),
    slideId: asId(input.slideId ?? input.sid),
    startTime: asFiniteOrNull(input.startTime ?? input.dt),
    endTime: asFiniteOrNull(input.endTime),
    phase: normalizePhase(input.phase),
    autoAnswerTime: asFiniteOrNull(input.autoAnswerTime),
    autoAnswerQueued: input.autoAnswerQueued !== false,
    attempts: asNonNegativeInteger(input.attempts),
    lastError: input.lastError ? String(input.lastError) : '',
    done: input.done === true,
    updatedAt: asFiniteOrNull(input.updatedAt) ?? now,
  };
}

/**
 * Decide whether a persisted record may be resumed automatically.
 * Expired retry is intentionally a separate opt-in because it calls the
 * server's retry endpoint and can submit an answer after the visible window.
 */
export function shouldRecoverProblem(record, {
  enabled = false,
  recoverExpired = false,
  now = Date.now(),
} = {}) {
  if (!enabled) return { recover: false, forceRetry: false, reason: 'disabled' };
  if (!record || record.done) return { recover: false, forceRetry: false, reason: 'done' };
  if (!PENDING_PHASES.has(record.phase)) {
    return { recover: false, forceRetry: false, reason: 'not-pending' };
  }
  if (record.autoAnswerQueued === false && record.phase !== 'answering') {
    return { recover: false, forceRetry: false, reason: 'not-queued' };
  }

  const endTime = asFiniteOrNull(record.endTime);
  if (endTime !== null && now >= endTime) {
    if (!recoverExpired) return { recover: false, forceRetry: false, reason: 'expired' };
    return { recover: true, forceRetry: true, reason: 'expired-retry' };
  }

  return {
    recover: true,
    forceRetry: false,
    reason: record.phase === 'answering' ? 'interrupted' : 'pending',
  };
}

function storageKey(lessonId) {
  return `${RECOVERY_STORAGE_PREFIX}${String(lessonId)}`;
}

/**
 * Small bounded local persistence store.  One store is created per lesson so
 * that a course switch cannot accidentally recover another course's queue.
 */
export function createProblemRecoveryStore({
  storage,
  lessonId,
  now = () => Date.now(),
  ttlMs = DEFAULT_RECOVERY_TTL_MS,
  maxEntries = DEFAULT_RECOVERY_MAX_ENTRIES,
} = {}) {
  const lesson = asId(lessonId);
  if (!lesson) return null;

  const key = storageKey(lesson);
  let records = new Map();

  function persist() {
    try {
      storage?.set?.(key, [...records.values()]);
    } catch (error) {
      console.warn('[雨课堂助手][WARN][Recovery] 保存待作答状态失败:', error);
    }
  }

  function prune() {
    const current = Number(now());
    const hasTtl = Number.isFinite(current) && Number.isFinite(ttlMs) && ttlMs > 0;
    let changed = false;

    for (const [problemId, record] of records) {
      if (record.lessonId !== lesson || (hasTtl && current - record.updatedAt > ttlMs)) {
        records.delete(problemId);
        changed = true;
      }
    }

    const limit = Number.isFinite(maxEntries) ? Math.max(1, Math.floor(maxEntries)) : DEFAULT_RECOVERY_MAX_ENTRIES;
    if (records.size > limit) {
      const oldest = [...records.values()]
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .slice(0, records.size - limit);
      oldest.forEach(record => records.delete(record.problemId));
      changed = true;
    }
    return changed;
  }

  function load() {
    let raw = [];
    try {
      raw = storage?.get?.(key, []) || [];
    } catch (error) {
      console.warn('[雨课堂助手][WARN][Recovery] 读取待作答状态失败:', error);
    }

    const entries = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' ? Object.values(raw) : []);
    records = new Map();
    for (const input of entries) {
      const record = normalizeRecoveryRecord(input, { lessonId: lesson, now: Number(now()) });
      if (record) records.set(record.problemId, record);
    }
    if (prune()) persist();
    return list();
  }

  function list() {
    return [...records.values()].map(record => ({ ...record }));
  }

  function get(problemId) {
    const record = records.get(asId(problemId));
    return record ? { ...record } : null;
  }

  function upsert(input = {}) {
    const problemId = asId(input.problemId ?? input.id);
    if (!problemId) return null;
    const existing = records.get(problemId) || {};
    const record = normalizeRecoveryRecord(
      { ...existing, ...input, updatedAt: input.updatedAt ?? Number(now()) },
      { lessonId: lesson, now: Number(now()) },
    );
    if (!record) return null;
    records.set(problemId, record);
    prune();
    persist();
    return { ...record };
  }

  function update(problemId, patch = {}) {
    const existing = records.get(asId(problemId));
    if (!existing) return upsert({ ...patch, problemId });
    return upsert({ ...existing, ...patch, problemId: existing.problemId });
  }

  function remove(problemId) {
    const removed = records.delete(asId(problemId));
    if (removed) persist();
    return removed;
  }

  function clear() {
    records.clear();
    persist();
  }

  load();
  return { key, load, list, get, upsert, update, remove, clear };
}
