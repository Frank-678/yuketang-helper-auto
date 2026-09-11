function nonEmptyString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

export function getLessonId(record) {
  if (!record || typeof record !== 'object') return null;
  return nonEmptyString(record.lessonId || record.lesson_id || record.id);
}

export function isActiveLesson(record) {
  return !!getLessonId(record) && Number(record?.status) === 1;
}

export function normalizeActiveLesson(record) {
  if (!isActiveLesson(record)) return null;
  return {
    ...record,
    lessonId: getLessonId(record),
  };
}

function normalizePrevious(previous) {
  const ids = new Set();
  for (const value of previous || []) {
    const id = typeof value === 'object' ? getLessonId(value) : nonEmptyString(value);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Convert the on-lesson API response into a stable active-lesson snapshot.
 * The API order is preserved because some deployments do not expose a
 * reliable start-time field.
 */
export function syncActiveLessons(previous = [], records = []) {
  const active = [];
  const seen = new Set();
  for (const record of Array.isArray(records) ? records : []) {
    const normalized = normalizeActiveLesson(record);
    if (!normalized || seen.has(normalized.lessonId)) continue;
    seen.add(normalized.lessonId);
    active.push(normalized);
  }

  const previousIds = normalizePrevious(previous);
  const activeIds = new Set(active.map(item => item.lessonId));
  const added = active.filter(item => !previousIds.has(item.lessonId));
  const removed = [...previousIds].filter(id => !activeIds.has(id));
  return { active, added, removed };
}
