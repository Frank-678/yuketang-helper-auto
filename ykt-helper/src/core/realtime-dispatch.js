// src/core/realtime-dispatch.js
import { getRealtimeEvent } from './publish-events.js';

/**
 * Converts a raw realtime frame into an action call without coupling the
 * protocol parser to the action layer.  The current userscript runs only the
 * desktop runtime, while this option remains available for protocol tests.
 */
export function dispatchRealtimeMessage(message, {
  getRuntimeMode = () => 'desktop',
  handlers = {},
} = {}) {
  const realtime = getRealtimeEvent(message);
  const notificationOnly = getRuntimeMode() === 'mobile-reminder';
  const options = { notificationOnly };
  let handled = true;

  switch (realtime?.kind) {
    case 'timeline':
      handlers.onFetchTimeline?.(realtime.timeline, options);
      break;
    case 'unlockproblem':
      handlers.onUnlockProblem?.(realtime.problem, options);
      break;
    case 'publish':
      handlers.onPublishEvent?.(realtime.event, options);
      break;
    case 'lessonfinished':
      handlers.onLessonFinished?.(options);
      break;
    default:
      handled = false;
  }

  return { realtime, notificationOnly, handled };
}
