import { CheckinError, readCheckinCookies } from './checkin-protocol.js';

export function normalizeUserId(value) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return null;
  if (!['string', 'number'].includes(typeof value)) return null;
  const id = String(value).trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) && !/^(?:0|undefined|null|anonymous)$/i.test(id) && !id.startsWith('u_') ? id : null;
}

function profileId(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  for (const key of ['user_id', 'userId', 'uid', 'id']) {
    const id = normalizeUserId(profile[key]);
    if (id) return id;
  }
  return null;
}

export function readPageUserIdentity(cookie, target) {
  const cookieId = normalizeUserId(readCheckinCookies(cookie).user_id);
  if (cookieId) return { userId: cookieId, source: 'cookie' };
  try {
    const id = profileId(target?.YktUser);
    if (id) return { userId: id, source: 'page-user' };
    const initial = profileId(target?.__INITIAL_STATE__?.user);
    if (initial) return { userId: initial, source: 'initial-state' };
  } catch {}
  return null;
}

// These are responses from current-user endpoints, never a classroom roster.
export function parseCurrentUserResponse(body) {
  let json;
  try {
    // JSON numbers can contain long account IDs. Preserve the original digits
    // before JSON.parse rounds them beyond Number.MAX_SAFE_INTEGER.
    json = typeof body === 'string' ? JSON.parse(body.replace(/("(?:user_id|userId|uid|id)"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"')) : body;
  } catch { throw new CheckinError('当前账号资料响应无法解析，尚未发送签到请求'); }
  let data = json;
  for (let depth = 0; depth < 3; depth++) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) break;
    const code = data.code ?? data.status_code;
    if ((code != null && String(code) !== '0') || data.success === false || data.is_login === false || data.isLogin === false) {
      const numeric = typeof code === 'number' || typeof code === 'string' ? Number(code) : NaN;
      const auth = [401, 403, 50000].includes(numeric);
      throw new CheckinError(auth ? '雨课堂登录已失效，请在官网重新登录' : '当前账号资料接口未返回成功结果', { code: Number.isFinite(numeric) ? numeric : null });
    }
    if (data.data != null) data = data.data;
    else if (data.result != null) data = data.result;
    else break;
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const profile of [data.user_profile, data.user_info, data.user, data.profile, data.userInfo, data.userProfile, data.member, data]) {
      const id = profileId(profile);
      if (id) return id;
    }
  }
  throw new CheckinError('当前登录态未能读取账号编号，请返回课程首页刷新后重试；尚未发送签到请求');
}
