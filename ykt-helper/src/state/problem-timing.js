/**
 * Convert the protocol's problem timing fields into a deadline.
 * A missing, zero, or malformed limit means that the problem is untimed.
 * @param {number|string|null|undefined} startTime - unlock time in epoch ms
 * @param {number|string|null|undefined} limit - time limit in seconds
 * @returns {number|null} deadline in epoch ms, or null for an untimed problem
 */
export function getProblemEndTime(startTime, limit) {
  const start = Number(startTime);
  const rawLimit = typeof limit === 'string' ? limit.trim() : limit;

  if (
    !Number.isFinite(start)
    || rawLimit === ''
    || rawLimit === null
    || rawLimit === undefined
  ) {
    return null;
  }

  const duration = Number(rawLimit);
  if (!Number.isFinite(duration) || duration <= 0) return null;

  return start + duration * 1000;
}

/**
 * Return the number of whole seconds remaining for a timed problem.
 * @param {number|string|null|undefined} endTime - deadline in epoch ms
 * @param {number} [now=Date.now()] - current time in epoch ms
 * @returns {number|null} remaining seconds, or null for an untimed problem
 */
export function getProblemRemainingSeconds(endTime, now = Date.now()) {
  if (endTime === null || endTime === undefined || endTime === '') return null;

  const end = Number(endTime);
  const current = Number(now);
  if (!Number.isFinite(end) || !Number.isFinite(current)) return null;

  return Math.max(0, Math.floor((end - current) / 1000));
}
