/** Select the server route for one answer attempt. */
export function chooseAnswerRoute({ now = Date.now(), endTime = null, forceRetry = false } = {}) {
  if (forceRetry) return 'retry';
  if (endTime === null || endTime === undefined || endTime === '') return 'answer';
  const current = Number(now);
  const deadline = Number(endTime);
  if (Number.isFinite(current) && Number.isFinite(deadline) && current >= deadline) {
    return 'retry';
  }
  return 'answer';
}
