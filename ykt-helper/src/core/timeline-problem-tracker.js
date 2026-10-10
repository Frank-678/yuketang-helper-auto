function firstScalar(...values) {
  return values.find(value => (
    value !== undefined
    && value !== null
    && typeof value !== 'object'
    && String(value).trim() !== ''
  ));
}

export function getTimelineProblemKey(piece) {
  if (!piece || piece.type !== 'problem') return null;

  const problemId = firstScalar(
    piece.prob,
    piece.problemId,
    piece.problemid,
    piece.problem?.problemId,
    piece.problem?.id,
    piece.id,
  );
  if (problemId !== undefined) return `problem:${String(problemId)}`;

  const presentationId = firstScalar(piece.pres, piece.presentationId, piece.presentation?.id);
  const slideId = firstScalar(piece.sid, piece.slideId, piece.slide?.id);
  const timestamp = firstScalar(piece.dt, piece.timestamp, piece.time);
  if (presentationId !== undefined || slideId !== undefined || timestamp !== undefined) {
    return `fallback:${presentationId ?? ''}:${slideId ?? ''}:${timestamp ?? ''}`;
  }

  return null;
}

/**
 * A fetchtimeline frame is a snapshot/replay, not intrinsically historical or
 * live.  The first snapshot for each lesson establishes the baseline.  Later
 * snapshots promote only previously unseen problem entries to `timeline-live`.
 */
export function createTimelineProblemTracker() {
  const seenByLesson = new Map();

  return {
    classify(timeline, { lessonId = null } = {}) {
      const lessonKey = String(lessonId || '__current__');
      const problems = (Array.isArray(timeline) ? timeline : [])
        .filter(piece => piece?.type === 'problem');
      const entries = problems.map(piece => ({ piece, key: getTimelineProblemKey(piece) }));
      const existing = seenByLesson.get(lessonKey);

      if (!existing) {
        const baseline = new Set(entries.map(entry => entry.key).filter(Boolean));
        seenByLesson.set(lessonKey, baseline);
        return entries.map(entry => ({
          ...entry,
          isNew: false,
          source: 'timeline',
          phase: 'baseline',
        }));
      }

      return entries.map(entry => {
        const isNew = !!entry.key && !existing.has(entry.key);
        if (entry.key) existing.add(entry.key);
        return {
          ...entry,
          isNew,
          source: isNew ? 'timeline-live' : 'timeline',
          phase: isNew ? 'live-new' : 'known',
        };
      });
    },

    reset(lessonId = null) {
      seenByLesson.delete(String(lessonId || '__current__'));
    },

    clear() {
      seenByLesson.clear();
    },
  };
}
