import { ui } from '../ui/ui-api.js';
import { repo } from '../state/repo.js';
import { diag } from '../core/diagnostics.js';
import { hasSubmittedAnswer, sameAnswer, validateAnswer } from '../core/answer-state.js';

export class SubmissionError extends Error {
  constructor(message, { code = null, unknown = false, status = null } = {}) { super(message); this.name = 'SubmissionError'; this.code = code; this.unknown = unknown; this.status = status; }
}
function headers() { return { 'Content-Type': 'application/json', xtbz: 'ykt', 'X-Client': 'h5', Authorization: 'Bearer ' + (globalThis.localStorage?.getItem('Authorization') || '') }; }
function post(url, payload, options = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.__yktOwnSubmission = true;
    xhr.open('POST', url, true);
    xhr.timeout = options.timeout ?? 20000;
    for (const [k, v] of Object.entries({ ...headers(), ...options.headers })) xhr.setRequestHeader(k, v);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new SubmissionError(`提交 HTTP ${xhr.status}`, { status: xhr.status, unknown: xhr.status >= 500 }));
      let data;
      try { data = typeof xhr.response === 'object' && xhr.response !== null ? xhr.response : JSON.parse(xhr.responseText); }
      catch { return reject(new SubmissionError('提交响应无法解析，需核实服务器答案', { unknown: true })); }
      if (!data || typeof data !== 'object' || data.code === undefined) return reject(new SubmissionError('服务器未返回明确结果', { unknown: true }));
      if (Number(data.code) !== 0) return reject(new SubmissionError(`${data.msg || data.message || '提交失败'} (${data.code})`, { code: Number(data.code) }));
      resolve(data);
    };
    xhr.onerror = () => reject(new SubmissionError('提交网络中断，结果待核实', { unknown: true }));
    xhr.ontimeout = () => reject(new SubmissionError('提交超时，结果待核实', { unknown: true }));
    xhr.onabort = () => reject(new SubmissionError('提交已中断，结果待核实', { unknown: true }));
    if (options.signal?.aborted) return reject(new Error('操作已取消'));
    const abort = () => xhr.abort();
    options.signal?.addEventListener('abort', abort, { once: true });
    xhr.addEventListener?.('loadend', () => options.signal?.removeEventListener('abort', abort), { once: true });
    try { options.guard?.(); xhr.send(JSON.stringify(payload)); } catch (error) { reject(error); }
  });
}
export async function answerProblem(problem, result, options = {}) {
  return post('/api/v3/lesson/problem/answer', { problemId: String(problem.problemId), problemType: Number(problem.problemType), dt: options.dt ?? Date.now(), result }, options);
}
export async function retryAnswer(problem, result, dt, options = {}) {
  const resp = await post('/api/v3/lesson/problem/retry', { problems: [{ problemId: String(problem.problemId), problemType: Number(problem.problemType), dt, result }] }, options);
  if (!Array.isArray(resp?.data?.success) || !resp.data.success.some(id => String(id?.problemId ?? id?.id ?? id) === String(problem.problemId))) throw new SubmissionError('服务器未确认此题补交成功');
  return resp;
}
export async function withAnswerLease(problem, lessonId, task) {
  return withLease(`${location.origin}:${repo.accountId}:${lessonId}:${problem.problemId}`, task);
}
const localLocks = new Set();
async function withLease(key, task) {
  if (localLocks.has(key)) throw new Error('此题已有提交任务');
  localLocks.add(key);
  try {
    if (globalThis.navigator?.locks?.request) return await navigator.locks.request(key, { ifAvailable: true }, lock => { if (!lock) throw new Error('另一标签页正在处理此题'); return task(); });
    const token = `${Date.now()}-${Math.random()}`, leaseKey = `ykt-helper:lease:${key}`;
    const read = () => { try { return JSON.parse(localStorage.getItem(leaseKey)); } catch { return null; } };
    const prior = read(); if (prior && prior.until > Date.now()) throw new Error('另一标签页正在处理此题');
    try { localStorage.setItem(leaseKey, JSON.stringify({ token, until: Date.now() + 60000 })); }
    catch { throw new Error('无法建立跨标签页提交锁，请释放存储空间'); }
    await new Promise(resolve => setTimeout(resolve, 0));
    if (read()?.token !== token) throw new Error('另一标签页已接管此题');
    const timer = setInterval(() => { if (read()?.token === token) { try { localStorage.setItem(leaseKey, JSON.stringify({ token, until: Date.now() + 60000 })); } catch {} } }, 20000);
    try { return await task(); } finally { clearInterval(timer); if (read()?.token === token) localStorage.removeItem(leaseKey); }
  } finally { localLocks.delete(key); }
}
export async function submitAnswer(problem, answer, options = {}) {
  const lessonId = String(options.lessonId ?? problem.lessonId ?? repo.currentLessonId ?? '');
  const accountId = repo.accountId;
  const ctx = repo.forLesson(lessonId);
  const p = ctx.problems.get(problem.problemId) || problem;
  const result = validateAnswer(p, answer);
  const state = ctx.problemStatus.get(problem.problemId) || {};
  const mode = options.forceRetry ? 'retry' : (options.policy || ui.config.submissionPolicy || 'auto');
  p.pendingAnswer = result; p.updatedAt = Date.now();
  if (mode === 'local') { repo.persistWork(lessonId); return { route: 'local', result }; }
  const operation = async () => {
    const guard = () => { if (repo.accountId !== accountId) throw new Error('账号已变化，提交已停止'); options.guard?.(); };
    guard();
    if (state.needsReconciliation && !options.forceRetry) throw new SubmissionError('上次提交结果未知，请先核实并同步服务器答案', { unknown: true });
    if (!options.allowResubmit && hasSubmittedAnswer(p.result)) {
      if (sameAnswer(p, p.result, result)) return { route: 'already-confirmed', result };
      if (mode !== 'retry') throw new SubmissionError('服务器已有另一份答案，请明确选择强制补交修改', { code: 50028 });
    }
    const start = Number(options.startTime ?? state.startTime);
    const rawEnd = Object.hasOwn(state, 'endTime') ? state.endTime : options.endTime;
    const end = rawEnd == null || rawEnd === '' ? null : Number(rawEnd);
    const closed = state.finished === true || (Number.isFinite(end) && Date.now() >= end);
    if (closed && mode === 'normal') { const e = new SubmissionError('题目已结束，答案已保留在本地'); e.name = 'DeadlineError'; throw e; }
    let route = mode === 'retry' || closed ? 'retry' : 'answer';
    state.phase = 'submitting'; ctx.problemStatus.set(problem.problemId, state); repo.persistWork(lessonId);
    const perform = async () => {
      guard();
      const dt = Number.isFinite(start) && start > 0 ? Math.min(start + 2000, Number.isFinite(end) ? end - 1 : start + 2000) : Number.isFinite(end) ? end - 1000 : Date.now() - 2000;
      return route === 'retry' ? retryAnswer(p, result, dt, { ...options, guard }) : answerProblem(p, result, { ...options, guard });
    };
    try {
      let resp;
      try { resp = await perform(); }
      catch (error) {
        if (error.code !== 50026 || mode !== 'auto' || route === 'retry') throw error;
        state.finished = true; route = 'retry'; resp = await perform();
      }
      p.result = result; p.remoteAnswer = result; p.updatedAt = Date.now();
      Object.assign(state, { done: true, phase: 'confirmed', needsReconciliation: false, lastError: '', submissionRoute: route });
      repo.persistWork(lessonId);
      diag('submit-confirmed', { lessonId, problemId: p.problemId, route });
      return { route, resp, result };
    } catch (error) {
      state.phase = error.unknown || error.code === 50028 ? 'unknown' : 'failed'; state.needsReconciliation = state.phase === 'unknown'; state.lastError = error.message;
      repo.persistWork(lessonId); throw error;
    }
  };
  return options.leaseHeld ? operation() : withLease(`${location.origin}:${accountId}:${lessonId}:${problem.problemId}`, operation);
}
