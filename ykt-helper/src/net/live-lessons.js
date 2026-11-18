import { LiveLessonsError, parseLiveLessonResponse } from '../core/live-lessons.js';
import { normalizeSiteAuthorization } from '../core/checkin-session.js';
import { repo } from '../state/repo.js';
import { diag } from '../core/diagnostics.js';

const PATHS = ['/api/v3/classroom/on-lesson', '/mooc-api/v1/lms/classroom/on-lesson', '/apiv3/classroom/on-lesson'];

export async function getOnLesson({ timeout = 8000, signal } = {}) {
  const origin = new URL(location.origin);
  if (origin.protocol !== 'https:' || !/^(www|pro|changjiang|huanghe)\.yuketang\.cn$/.test(origin.hostname) || origin.port) throw new LiveLessonsError('当前地址不是支持的雨课堂站点');
  const account = repo.accountId, controller = new AbortController();
  let stopped, rejectStop, timer;
  const stopPromise = new Promise((_, reject) => { rejectStop = reject; });
  const check = () => {
    if (stopped) throw stopped;
    if (repo.accountId !== account) throw new LiveLessonsError('账号已变化，旧课堂列表已丢弃', { reason: 'account-changed' });
  };
  const stop = error => { stopped = error; controller.abort(); rejectStop(error); };
  const cancel = () => stop(new LiveLessonsError('课堂列表读取已取消', { reason: 'cancelled' }));
  const headers = { Accept: 'application/json', xtbz: 'ykt', 'x-client': 'h5' };
  try { const authorization = normalizeSiteAuthorization(localStorage.getItem('Authorization')); if (authorization) headers.Authorization = authorization; } catch {}
  const work = async () => {
    let lastError;
    for (const path of PATHS) {
      check();
      let status = 0;
      try {
        diag('live-lessons-start', { endpoint: path, authorizationAvailable: !!headers.Authorization });
        const response = await fetch(new URL(path, origin).href, { credentials: 'include', cache: 'no-store', redirect: 'error', headers, signal: controller.signal });
        status = response.status; check();
        if (response.url && new URL(response.url, origin).origin !== origin.origin) throw new LiveLessonsError('课堂列表响应跳转到了其他站点', { reason: 'redirect' });
        if (!(status >= 200 && status < 300)) throw new LiveLessonsError(`课堂列表读取失败：HTTP ${status}`, { status, reason: 'http-error' });
        const body = await response.text(); check();
        const lessons = parseLiveLessonResponse(body);
        diag('live-lessons-loaded', { endpoint: path, httpStatus: status, count: lessons.length });
        return lessons;
      } catch (error) {
        check();
        const safe = error instanceof LiveLessonsError ? error : new LiveLessonsError('课堂列表网络请求失败，请重试', { reason: 'network' });
        diag('live-lessons-failed', { endpoint: path, httpStatus: status, code: safe.code, reason: safe.reason });
        lastError = safe;
        // Legacy aliases are only for a missing endpoint. A business error,
        // a valid empty result, or an unreadable response is not an empty list.
        if (![404, 405].includes(safe.status)) throw safe;
      }
    }
    throw lastError;
  };
  try {
    if (signal?.aborted) throw new LiveLessonsError('课堂列表读取已取消', { reason: 'cancelled' });
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => stop(new LiveLessonsError('课堂列表读取超时，请重试', { reason: 'timeout' })), Math.max(1, Math.min(30000, Number(timeout) || 8000)));
    return await Promise.race([work(), stopPromise]);
  } catch (error) {
    if (error instanceof LiveLessonsError && ['timeout', 'cancelled', 'account-changed'].includes(error.reason)) diag('live-lessons-failed', { reason: error.reason });
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
