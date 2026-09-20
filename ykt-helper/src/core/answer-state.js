/** Return true only when a backend/local result contains meaningful submitted content. */
export function hasSubmittedAnswer(result) {
  if (result === null || result === undefined) return false;
  if (typeof result === 'string') return result.trim().length > 0;
  if (Array.isArray(result)) return result.some(hasSubmittedAnswer);
  if (typeof result === 'object') return Object.values(result).some(hasSubmittedAnswer);
  return true;
}
