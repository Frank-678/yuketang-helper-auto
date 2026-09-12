import { getLessonId, isActiveLesson } from './active-lessons.js';

const LATEST_TIME_KEYS = [
  'startTime',
  'start_time',
  'startAt',
  'start_at',
  'beginTime',
  'begin_time',
  'lessonStartTime',
  'lesson_start_time',
  'createdAt',
  'created_at',
];

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.abs(value) < 1e12 ? value * 1000 : value;
  }

  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    const number = Number(text);
    return Math.abs(number) < 1e12 ? number * 1000 : number;
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}
function latestTimestamp(lesson) {
  for (const key of LATEST_TIME_KEYS) {
    const timestamp = toTimestamp(lesson?.[key]);
    if (timestamp !== null) return timestamp;
  }
  return null;
}

/** Return the newest status=1 lesson, preserving API order when no time exists. */
export function pickLatestActiveLesson(records) {
  const active = (Array.isArray(records) ? records : [])
    .filter(isActiveLesson)
    .filter(record => getLessonId(record) !== null);
  if (!active.length) return null;

  const decorated = active.map((record, index) => ({
    record,
    index,
    timestamp: latestTimestamp(record),
  }));
  if (!decorated.some(item => item.timestamp !== null)) return decorated[0].record;

  decorated.sort((left, right) => {
    if (left.timestamp === null) return 1;
    if (right.timestamp === null) return -1;
    return right.timestamp - left.timestamp || left.index - right.index;
  });
  return decorated[0].record;
}

/**
 * Give a user a short opportunity to choose a classroom before an automatic
 * navigation takes over. A user intent permanently cancels the current offer
 * until the arbiter is reset for a new route/page.
 */
export function createNavigationArbiter({
  waitMs = 10_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  navigate = () => {},
} = {}) {
  let timer = null;
  let pendingTarget = null;
  let userIntent = false;

  function cancelTimer() {
    if (timer === null) return;
    clearTimeoutFn(timer);
    timer = null;
  }

  function offer(target) {
    if (userIntent || typeof target !== 'string' || !target.trim()) return false;
    pendingTarget = target;
    cancelTimer();
    timer = setTimeoutFn(() => {
      timer = null;
      const nextTarget = pendingTarget;
      pendingTarget = null;
      if (!userIntent && nextTarget) navigate(nextTarget);
    }, Math.max(0, Number(waitMs) || 0));
    return true;
  }

  function observeUserIntent() {
    const changed = !userIntent || timer !== null || pendingTarget !== null;
    userIntent = true;
    cancelTimer();
    pendingTarget = null;
    return changed;
  }

  function reset() {
    cancelTimer();
    pendingTarget = null;
    userIntent = false;
  }

  return {
    offer,
    observeUserIntent,
    reset,
    cancel: observeUserIntent,
    get hasPending() {
      return timer !== null && pendingTarget !== null;
    },
    get userHasIntent() {
      return userIntent;
    },
  };
}
