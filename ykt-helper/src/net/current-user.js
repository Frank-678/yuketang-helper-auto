import { gm } from '../core/env.js';
import { CheckinError } from '../core/checkin-protocol.js';
import { parseCurrentUserResponse, readPageUserIdentity } from '../core/current-user.js';
import { diag } from '../core/diagnostics.js';

// Current-user paths verified in the public 3.0 client's profile lookup.
const PROFILE_PATHS = ['/v/course_meta/user_info', '/api/v3/user/profile', '/v2/api/web/userinfo'];

export async function resolveCurrentUserIdentity({ timeout = 6000, signal, guard }) {
  guard();
  if (signal?.aborted) throw new CheckinError('读取当前账号已取消，尚未发送签到请求');
  const known = readPageUserIdentity(document.cookie, gm.uw);
  if (known) return known;

  const origin = location.origin, controller = new AbortController();
  let stopped, rejectStop, timer;
  const stopPromise = new Promise((_, reject) => { rejectStop = reject; });
  const stop = error => { stopped = error; controller.abort(); rejectStop(error); };
  const cancel = () => stop(new CheckinError('读取当前账号已取消，尚未发送签到请求'));
  const check = () => { if (stopped) throw stopped; guard(); };
  signal?.addEventListener('abort', cancel, { once: true });
  const work = async () => {
    let lastError;
    const headers = { Accept: 'application/json', xtbz: 'ykt', 'x-client': 'h5' };
    for (const path of PROFILE_PATHS) {
      check();
      let httpStatus = 0;
      try {
        const response = await fetch(new URL(path, origin).href, { credentials: 'include', cache: 'no-store', redirect: 'error', headers, signal: controller.signal });
        httpStatus = response.status;
        check();
        if (response.url && new URL(response.url, origin).origin !== origin) throw new CheckinError('当前账号资料响应跳转到了其他站点');
        if (response.status === 401 || response.status === 403) throw new CheckinError('雨课堂登录已失效，请在官网重新登录', { code: response.status, status: response.status });
        if (!(response.status >= 200 && response.status < 300)) throw new CheckinError(`读取当前账号 HTTP ${response.status}`, { status: response.status });
        const body = await response.text();
        check();
        const userId = parseCurrentUserResponse(body);
        diag('checkin-identity-probe', { endpoint: path, httpStatus: response.status, recognized: true });
        return { userId, source: path };
      } catch (error) {
        check();
        lastError = error instanceof CheckinError ? error : new CheckinError('读取当前账号网络失败，尚未发送签到请求');
        diag('checkin-identity-probe', { endpoint: path, httpStatus, code: lastError.code, recognized: false });
        if ([401, 403, 50000].includes(lastError.code)) throw lastError;
      }
    }
    throw lastError;
  };
  try {
    timer = setTimeout(() => stop(new CheckinError('读取当前账号超时，尚未发送签到请求，请重试')), timeout);
    return await Promise.race([work(), stopPromise]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
