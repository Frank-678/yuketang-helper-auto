export const runtimeActionRef = { current: null };

/**
 * Register the state action object used by network interceptors.
 * Keeping this tiny mutable reference in core prevents net/* from importing
 * state/actions.js back while actions legitimately imports net helpers for
 * AutoJoin.
 */
export function registerRuntimeActions(actions) {
  runtimeActionRef.current = actions || null;
  return runtimeActionRef.current;
}
