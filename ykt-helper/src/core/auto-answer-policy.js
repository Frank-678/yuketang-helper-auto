export function normalizeLessonId(lessonId) {
  if (lessonId === null || lessonId === undefined) return '';
  return String(lessonId).trim();
}

export function lessonSetHas(setLike, lessonId) {
  const key = normalizeLessonId(lessonId);
  if (!key || !setLike || typeof setLike.has !== 'function') return false;
  if (setLike.has(key)) return true;

  // Older runtime state may contain numeric ids while newer code stores strings.
  // Compare normalized values so policy remains stable across upgrades/reloads.
  if (typeof setLike[Symbol.iterator] === 'function') {
    for (const value of setLike) {
      if (normalizeLessonId(value) === key) return true;
    }
  }
  return false;
}

export function shouldAutoAnswerForLesson({
  lessonId,
  config,
  autoJoinedLessons,
  forceAutoAnswerLessons,
} = {}) {
  if (config?.autoAnswer === true) return true;

  const key = normalizeLessonId(lessonId);
  if (!key) return false;

  if (
    config?.autoAnswerOnAutoJoin === true
    && lessonSetHas(autoJoinedLessons, key)
  ) {
    return true;
  }

  return lessonSetHas(forceAutoAnswerLessons, key);
}
