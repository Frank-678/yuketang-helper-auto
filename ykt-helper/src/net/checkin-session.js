import { CheckinError } from '../core/checkin-protocol.js';
import { selectCheckinSession } from '../core/checkin-session.js';

export function resolveCheckinSession({ timeout = 1500, signal, guard }) {
  guard();
  if (signal?.aborted) return Promise.reject(new CheckinError('读取签到登录态已取消'));
  const callbackApi = window.GM_cookie, promiseApi = window.GM?.cookie;
  const api = typeof callbackApi?.list === 'function' ? callbackApi : typeof promiseApi?.list === 'function' ? promiseApi : null;
  const fallback = status => ({ ...selectCheckinSession(location.origin, document.cookie), cookieApi: status });
  if (!api) return Promise.resolve(fallback('unavailable'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (rows, status, error) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      try { guard(); if (error) throw error; resolve({ ...selectCheckinSession(location.origin, document.cookie, rows), cookieApi: status }); } catch (reason) { reject(reason); }
    };
    const cancel = () => finish([], 'cancelled', new CheckinError('读取签到登录态已取消'));
    const timer = setTimeout(() => finish([], 'timeout'), timeout);
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      // Cookie paths are evaluated against the actual target, not the lesson
      // document. The metadata explicitly grants access to this exact path.
      const details = { url: new URL('/api/v3/lesson/checkin', location.origin).href };
      const result = api === callbackApi ? api.list(details, (rows, error) => finish(error ? [] : rows, error ? 'denied' : 'available')) : api.list(details);
      if (result?.then) result.then(rows => finish(rows, 'available'), () => finish([], 'denied'));
    } catch { finish([], 'denied'); }
  });
}
