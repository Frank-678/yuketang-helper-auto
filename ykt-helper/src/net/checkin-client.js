import { gm } from '../core/env.js';
import { CheckinError, buildCheckinRequest, parseCheckinResponse } from '../core/checkin-protocol.js';
import { resolveCurrentUserIdentity } from './current-user.js';
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
        timeout, anonymous: false,
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
      const response = await fetch(request.url, { method: 'POST', credentials: 'include', headers: request.headers, body: JSON.stringify(request.payload), signal: controller.signal });
      return { status: response.status, body: await response.text(), headers: `set-auth: ${response.headers.get('set-auth') || ''}` };
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
  if (accountId !== 'anonymous' && !options.force && state.phase === 'confirmed' && ctx.auth?.token && state.channel === channel && Date.now() - state.confirmedAt < 30000) return Promise.resolve({ ...ctx.auth, confirmed: true, code: 0, lessonId: id, channel });
  const run = async () => {
    let stage = 'preflight', requestSent = false;
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
      const started = Date.now(), remaining = () => Math.max(1, Math.min(timeout, timeout - (Date.now() - started)));
      let identity;
      if (channel === 'app') {
        stage = 'identity';
        changed(id, 'identifying', { channel, stage, code: null, lastError: '', nextAttemptAt: 0 });
        diag('checkin-identity-start', { lessonId: id, channel });
        identity = await resolveCurrentUserIdentity({ timeout: Math.min(6000, remaining()), signal: options.signal, guard });
        guard();
        diag('checkin-identity-ready', { lessonId: id, source: identity.source });
      }
      const request = buildCheckinRequest({ origin: location.origin, lessonId: id, userId: identity?.userId, cookie: document.cookie, channel });
      stage = 'checkin';
      changed(id, 'signing', { channel, stage, code: null, lastError: '', nextAttemptAt: 0 });
      diag('checkin-start', { lessonId: id, channel });
      const sendGuard = () => { guard(); requestSent = true; };
      const response = await (channel === 'app' ? requestAppCheckin : requestWebCheckin)(request, { timeout: remaining(), signal: options.signal, guard: sendGuard });
      if (repo.accountId !== accountId) throw new CheckinError('账号已变化，旧签到结果已丢弃');
      stage = 'response';
      const result = { ...parseCheckinResponse({ ...response, lessonId: id, channel }), userId: identity?.userId };
      ctx.auth = { token: result.token, setAuth: result.setAuth, userId: result.userId };
      changed(id, 'confirmed', { channel, stage: 'confirmed', code: 0, confirmedAt: Date.now(), lastError: '', nextAttemptAt: 0 });
      diag('checkin-confirmed', { lessonId: id, channel, bearerAvailable: !!result.setAuth });
      return result;
    } catch (error) {
      if (repo.accountId === accountId) {
        const phase = error.code === 50070 ? 'refused' : error.unknown ? 'unknown' : 'failed';
        changed(id, phase, { channel, stage, code: error.code ?? null, lastError: error.message, nextAttemptAt: Date.now() + (error.unknown ? 30000 : 60000) });
        diag('checkin-failed', { lessonId: id, channel, code: error.code ?? null, phase, stage, requestSent, httpStatus: error.status || 0 });
      } else Object.assign(ctx.checkin, { phase: 'cancelled', lastError: '账号已变化' });
      throw error;
    }
  };
  const promise = Promise.resolve().then(run).finally(() => { if (inFlight.get(key) === promise) inFlight.delete(key); });
  inFlight.set(key, promise); return promise;
}
