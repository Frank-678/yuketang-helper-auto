/**
 * Timeline replay is used to hydrate the current page and is not a teacher's
 * live unlock event.  Other sources retain the historical live behavior for
 * compatibility with existing websocket handlers.
 */
export function isLiveProblemSource(source) {
  return source !== 'timeline';
}
