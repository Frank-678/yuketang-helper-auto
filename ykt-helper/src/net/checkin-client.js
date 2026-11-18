import { gm } from '../core/env.js';
import { CheckinError, buildCheckinRequest, parseCheckinResponse } from '../core/checkin-protocol.js';
import { resolveCurrentUserIdentity } from './current-user.js';
import { resolveCheckinSession } from './checkin-session.js';
import { repo } from '../state/repo.js';
import { diag } from '../core/diagnostics.js';

const inFlight = new Map();
function changed(lessonId, phase, details = {}) {
  const state = repo.forLesson(lessonId).checkin;
  Object.assign(state, { phase, updatedAt: Date.now(), ...details });
  window.dispatchEvent(new CustomEvent('ykt:checkin-changed', { detail: { lessonId: String(lessonId), phase } }));
}

function requestAppCheckin(request, { timeout, signal, guard }) {
  return new Promise((resolve, reject) => {
    let settled = false, handle;
    const finish = (error, response) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve(response);
    };
    const cancel = () => { finish(new CheckinError('签到请求已取消', { unknown: true })); handle?.abort?.(); };
    const timer = setTimeout(() => { finish(new CheckinError('签到请求超时，结果待核实', { unknown: true })); handle?.abort?.(); }, timeout);
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      guard();
      handle = gm.xhr({
        method: 'POST', url: request.url, headers: request.headers, data: JSON.stringify(request.payload),
        timeout, anonymous: false, cookiePartition: { topLevelSite: 'https://yuketang.cn' },
        ...(request.cookie ? { cookie: request.cookie } : {}),
        onload: response => {
          try {
            if (response.finalUrl && new URL(response.finalUrl).origin !== location.origin) return finish(new CheckinError('签到响应跳转到了其他站点', { unknown: true }));
            finish(null, { status: response.status, body: response.responseText, headers: response.responseHeaders });
          } catch { finish(new CheckinError('签到响应地址无效', { unknown: true })); }
        },
        onerror: () => finish(new CheckinError('签到网络中断，结果待核实', { unknown: true })),
        ontimeout: () => finish(new CheckinError('签到请求超时，结果待核实', { unknown: true })),
        onabort: () => finish(new CheckinError('签到请求已取消', { unknown: true })),
      });
    } catch (error) { finish(error); }
  });
}

async function requestWebCheckin(request, { timeout, signal, guard }) {
  const controller = new AbortController();
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const cancel = () => { controller.abort(); rejectAbort(new CheckinError('签到请求已取消，结果待核实', { unknown: true })); };
  let timer;
  try {
    if (signal?.aborted) throw new CheckinError('签到请求已取消');
    signal?.addEventListener('abort', cancel, { once: true });
    const work = async () => {
      guard();
      const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => !/^(user-agent|cookie|referer|origin|host)$/i.test(name)));
      const response = await fetch(request.url, { method: 'POST', credentials: 'include', redirect: 'error', headers, body: JSON.stringify(request.payload), signal: controller.signal });
      if (response.url && new URL(response.url, location.origin).origin !== location.origin) throw new CheckinError('签到响应跳转到了其他站点', { unknown: true });
      return { status: response.status, body: await response.text(), headers: `set-auth: ${response.headers?.get('set-auth') || ''}` };
    };
    return await Promise.race([work(), aborted, new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new CheckinError('签到请求超时，结果待核实', { unknown: true })); }, timeout); })]);
  } catch (error) { if (error instanceof CheckinError) throw error; throw new CheckinError('签到网络中断，结果待核实', { unknown: true }); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

export function getLessonCheckinState(lessonId = repo.currentLessonId) {
  return { ...repo.forLesson(lessonId).checkin };
}

export function requestLessonCheckin(lessonId, options = {}) {
  const id = String(lessonId ?? ''), accountId = repo.accountId, ctx = repo.forLesson(id);
  const key = `${accountId}:${id}`, channel = options.channel || 'app';
  if (inFlight.has(key)) return inFlight.get(key);
  const state = ctx.checkin;
  if (!options.force && state.nextAttemptAt > Date.now()) return Promise.reject(new CheckinError(state.lastError || '请稍后重试签到', { code: state.code }));
  if (accountId !== 'anonymous' && !options.force && state.phase === 'confirmed' && ctx.auth?.token && state.channel === channel && Date.now() - state.confirmedAt < 30000) return Promise.resolve({ ...ctx.auth, transport: state.transport, confirmed: true, code: 0, lessonId: id, channel });
  const run = async () => {
    let stage = 'preflight', requestSent = false, transport = channel === 'app' ? 'gm' : 'browser', identity;
    const guard = () => {
      if (repo.accountId !== accountId) throw new CheckinError('账号已变化，签到请求已停止');
      options.guard?.();
    };
    try {
      guard();
      if (channel === 'app' && typeof window.GM_xmlhttpRequest !== 'function') throw new CheckinError('当前脚本管理器未提供客户端请求能力，请启用 GM_xmlhttpRequest 或切换普通签到');
      // Validate the destination and lesson before any identity lookup.
      buildCheckinRequest({ origin: location.origin, lessonId: id, cookie: document.cookie, channel: channel === 'app' ? 'web' : channel });
      const timeout = Math.max(1, Math.min(30000, Number(options.timeout) || 12000));
      const clock = () => globalThis.performance?.now?.() ?? Date.now(), started = clock();
      const remaining = () => { const budget = timeout - (clock() - started); if (budget <= 0) throw new CheckinError('签到操作已超时，请手动重试'); return Math.max(1, Math.ceil(Math.min(timeout, budget))); };
      let session;
      if (channel === 'app') {
        stage = 'identity';
        changed(id, 'identifying', { channel, stage, code: null, lastError: '', nextAttemptAt: 0 });
        diag('checkin-identity-start', { lessonId: id, channel });
        identity = await resolveCurrentUserIdentity({ timeout: Math.min(6000, remaining()), signal: options.signal, guard });
        guard();
        diag('checkin-identity-ready', { lessonId: id, source: identity.source });
        stage = 'session';
        changed(id, 'preparing', { channel, stage });
        session = await resolveCheckinSession({ timeout: Math.min(1500, remaining()), signal: options.signal, guard });
        guard();
        diag('checkin-session-ready', { lessonId: id, source: session.source, cookieApi: session.cookieApi, sessionHeaderAvailable: !!session.sessionid, csrfHeaderAvailable: !!session.csrftoken });
      }
      const request = buildCheckinRequest({ origin: location.origin, lessonId: id, userId: identity?.userId, cookie: document.cookie, channel });
      if (session?.sessionid) request.headers.sessionid = session.sessionid;
      if (session?.csrftoken) request.headers['x-csrftoken'] = session.csrftoken;
      if (session?.cookie) request.cookie = session.cookie;
      stage = 'checkin';
      changed(id, 'signing', { channel, stage, transport, code: null, lastError: '', nextAttemptAt: 0 });
      diag('checkin-start', { lessonId: id, channel, transport });
      const sendGuard = () => { guard(); requestSent = true; };
      let response = await (channel === 'app' ? requestAppCheckin : requestWebCheckin)(request, { timeout: remaining(), signal: options.signal, guard: sendGuard });
      if (repo.accountId !== accountId) throw new CheckinError('账号已变化，旧签到结果已丢弃');
      stage = 'response';
      let parsed;
      try { parsed = parseCheckinResponse({ ...response, lessonId: id, channel }); }
      catch (error) {
        // A definitive authentication rejection is safe to retry once using
        // the page's own session. Keep source=21 and the App identity headers.
        // Unknown outcomes, timeouts and dynamic-QR refusals are never retried.
        if (channel !== 'app' || error.unknown || (![50000, 401].includes(error.code) && ![401, 403].includes(error.status))) throw error;
        guard();
        if (options.signal?.aborted) throw new CheckinError('签到请求已取消');
        transport = 'browser'; stage = 'checkin';
        diag('checkin-transport-fallback', { lessonId: id, from: 'gm', to: transport, code: error.code, httpStatus: error.status });
        changed(id, 'signing', { channel, stage, transport });
        response = await requestWebCheckin(request, { timeout: remaining(), signal: options.signal, guard: sendGuard });
        guard(); stage = 'response';
        parsed = parseCheckinResponse({ ...response, lessonId: id, channel });
      }
      const result = { ...parsed, userId: identity?.userId, transport };
      ctx.auth = { token: result.token, setAuth: result.setAuth, userId: result.userId };
      changed(id, 'confirmed', { channel, stage: 'confirmed', transport, code: 0, confirmedAt: Date.now(), lastError: '', nextAttemptAt: 0 });
      diag('checkin-confirmed', { lessonId: id, channel, transport, bearerAvailable: !!result.setAuth });
      return result;
    } catch (error) {
      if (repo.accountId === accountId) {
        if (stage === 'response' && [50000, 401].includes(error.code) && identity?.source?.startsWith('/')) error.message = `网页账号读取正常，但签到鉴权失败（${error.code}）。请导出诊断日志`;
        const phase = error.code === 50070 ? 'refused' : error.unknown ? 'unknown' : 'failed';
        changed(id, phase, { channel, stage, transport, code: error.code ?? null, lastError: error.message, nextAttemptAt: Date.now() + (error.unknown ? 30000 : 60000) });
        diag('checkin-failed', { lessonId: id, channel, code: error.code ?? null, phase, stage, transport, requestSent, httpStatus: error.status || 0 });
      } else Object.assign(ctx.checkin, { phase: 'cancelled', lastError: '账号已变化' });
      throw error;
    }
  };
  const promise = Promise.resolve().then(run).finally(() => { if (inFlight.get(key) === promise) inFlight.delete(key); });
  inFlight.set(key, promise); return promise;
}
