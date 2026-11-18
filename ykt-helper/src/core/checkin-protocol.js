// Request contracts verified against the publicly distributed 3.0 client.
// These fields describe a client protocol; no third-party code or credentials
// are bundled with the helper.
export class CheckinError extends Error {
  constructor(message, { code = null, status = 0, unknown = false } = {}) {
    super(message); this.name = 'CheckinError'; this.code = code; this.status = status; this.unknown = unknown;
  }
}

export function readCheckinCookies(cookie = '') {
  const out = {};
  for (const part of String(cookie).split(';')) {
    const split = part.indexOf('=');
    if (split > 0) out[part.slice(0, split).trim()] = part.slice(split + 1).trim();
  }
  return out;
}

export function buildCheckinRequest({ origin, lessonId, userId, cookie = '', channel = 'app' }) {
  const target = new URL(origin);
  if (target.protocol !== 'https:' || !/^(www|pro|changjiang|huanghe)\.yuketang\.cn$/.test(target.hostname) || target.port) throw new CheckinError('当前地址不是支持的雨课堂站点');
  const id = String(lessonId ?? '').trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new CheckinError('课堂编号无效');
  if (!['app', 'web'].includes(channel)) throw new CheckinError('签到通道无效');
  const cookies = readCheckinCookies(cookie);
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', xtbz: 'ykt' };
  if (cookies.csrftoken) headers['x-csrftoken'] = cookies.csrftoken;
  if (cookies.sessionid) headers.sessionid = cookies.sessionid;
  if (channel === 'app') {
    const uid = String(userId ?? cookies.user_id ?? '').trim();
    if (!uid || /[\r\n]/.test(uid)) throw new CheckinError('尚未识别当前账号，请先在雨课堂网页完成登录');
    Object.assign(headers, {
      'User-Agent': 'Android', 'x-client': 'app', 'x-uid': uid,
      brand: 'google Pixel 9 Pro', uuid: '', buildnumber: '1610',
      xtua: 'client=app&tag=1.3.3&platform=Android', systemversion: '16',
      incremental: '14624737', isphysicaldevice: 'true',
    });
  } else headers['x-client'] = 'h5';
  // Browser requests use their own cookie jar. The privileged transport may
  // attach a manager-read snapshot for this endpoint; never document.cookie.
  return { url: `${target.origin}/api/v3/lesson/checkin`, headers, payload: { source: channel === 'app' ? 21 : 9, lessonId: id, joinIfNotIn: true } };
}

export function parseCheckinResponse({ status, body, headers = '', lessonId, channel }) {
  if (!(status >= 200 && status < 300)) throw new CheckinError(`签到请求 HTTP ${status}`, { status, unknown: !status || status >= 500 });
  let json;
  try { json = typeof body === 'string' ? JSON.parse(body) : body; } catch { throw new CheckinError('签到响应无法解析，结果待核实', { status, unknown: true }); }
  if (!json || typeof json !== 'object' || !['number', 'string'].includes(typeof json.code) || String(json.code).trim() === '') throw new CheckinError('服务器未返回明确签到结果', { status, unknown: true });
  const code = Number(json.code);
  if (code !== 0) {
    const reason = code === 50070 ? '服务器仍要求动态二维码验证' : code === 50000 || code === 401 ? '签到请求未通过登录态校验' : String(json.msg || json.message || '服务器拒绝签到').slice(0, 120);
    throw new CheckinError(`${reason}（${json.code}）`, { code: Number.isFinite(code) ? code : String(json.code), status });
  }
  const data = json.data ?? json.result;
  if (json.success === false || data?.checkedIn === false || data?.isCheckedIn === false || data?.is_checked_in === false) throw new CheckinError('服务器未确认签到完成，结果待核实', { status, unknown: true });
  const token = data?.lessonToken;
  if (typeof token !== 'string' || !token.trim()) throw new CheckinError('服务器返回成功，但缺少课堂凭据，签到结果待核实', { status, unknown: true });
  const returnedLesson = data.lessonId ?? data.lesson_id;
  if (returnedLesson != null && String(returnedLesson) !== String(lessonId)) throw new CheckinError('服务器返回了另一课堂的凭据', { status, unknown: true });
  const bearer = String(headers).match(/^set-auth\s*:\s*([^\r\n]*)/im)?.[1]?.trim() || '';
  return { token: token.trim(), setAuth: bearer.replace(/^Bearer\s+/i, ''), lessonId: String(lessonId), channel, confirmed: true, code: 0 };
}
