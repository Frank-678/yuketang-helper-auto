function normalizeProblemId(value) {
  if (value === undefined || value === null) return null;
  const id = String(value).trim();
  return id || null;
}

/** Keep UI-only dismissals separate from the actual problem state. */
export function createProblemDismissalState() {
  const dismissed = new Set();

  return {
    dismiss(problemId) {
      const id = normalizeProblemId(problemId);
      if (!id) return false;
      dismissed.add(id);
      return true;
    },

    isDismissed(problemId) {
      const id = normalizeProblemId(problemId);
      return !!id && dismissed.has(id);
    },

    prune(activeProblemIds = []) {
      const active = new Set(
        [...activeProblemIds]
          .map(normalizeProblemId)
          .filter(Boolean),
      );
      for (const id of dismissed) {
        if (!active.has(id)) dismissed.delete(id);
      }
    },

    clear() {
      dismissed.clear();
    },
  };
}
