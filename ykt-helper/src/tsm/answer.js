import { ui } from '../ui/ui-context.js';
import { repo } from '../state/repo.js';
import { shouldAutoAnswerForLesson } from '../core/auto-answer-policy.js';
import { chooseAnswerRoute } from './answer-routing.js';

const ANSWER_REQUEST_TIMEOUT_MS = 15000;

function sleep(ms) { return new Promise(r => setTimeout(r, Math.max(0, ms|0))); }

function answerBusinessError(resp, context = '提交') {
  const code = Number(resp?.code);
  const raw = String(resp?.msg || '请求失败');
  let message = `${raw} (${resp?.code})`;
  if (code === 50028) {
    message = '题目已提交过，普通提交被服务器拒绝；请使用“强制补交” (50028)';
  } else if (code === 50026) {
    message = '题目已结束，普通提交被服务器拒绝；请使用“强制补交” (50026)';
  }
  const error = new Error(message);
  error.code = Number.isFinite(code) ? code : resp?.code;
  error.serverMessage = raw;
  error.context = context;
  return error;
}
function calcAutoWaitMs() {
  const base = Math.max(0, (ui?.config?.autoAnswerDelay ?? 0));
  const rand = Math.max(0, (ui?.config?.autoAnswerRandomDelay ?? 0));
  return base + (rand ? Math.floor(Math.random() * rand) : 0);
}

const DEFAULT_HEADERS = () => ({
  'Content-Type': 'application/json',
  'xtbz': 'ykt',
  'X-Client': 'h5',
  'Authorization': 'Bearer ' + (typeof localStorage !== 'undefined' ? localStorage.getItem('Authorization') : ''),
});

/**
 * Low-level POST helper using XMLHttpRequest to align with site requirements.
 * Every mutating request is bounded so UI/action locks cannot remain pending forever.
 * @param {string} url
 * @param {object} data
 * @param {Record<string,string>} headers
 * @returns {Promise<any>}
 */
function xhrPost(url, data, headers) {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.timeout = ANSWER_REQUEST_TIMEOUT_MS;
      for (const [k, v] of Object.entries(headers || {})) xhr.setRequestHeader(k, v);
      xhr.onload = () => {
        const status = Number(xhr.status);
        if (Number.isFinite(status) && status !== 0 && (status < 200 || status >= 300)) {
          reject(new Error(`HTTP ${status} 请求失败`));
          return;
        }
        try {
          const resp = JSON.parse(xhr.responseText);
          if (resp && typeof resp === 'object') {
            resolve(resp);
          } else {
            reject(new Error('解析响应失败'));
          }
        } catch {
          reject(new Error('解析响应失败'));
        }
      };
      xhr.onerror = () => reject(new Error('网络请求失败'));
      xhr.ontimeout = () => reject(new Error(`网络请求超时（${ANSWER_REQUEST_TIMEOUT_MS}ms）`));
      xhr.send(JSON.stringify(data));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * POST /api/v3/lesson/problem/answer
 * Mirrors the 1.16.1 logic (no UI). Returns {code, data, msg, ...} on success code===0.
 * @param {{problemId:number, problemType:number}} problem
 * @param {any} result
 * @param {{headers?:Record<string,string>, dt?:number}} [options]
 */
export async function answerProblem(problem, result, options = {}) {
  const url = '/api/v3/lesson/problem/answer';
  const headers = { ...DEFAULT_HEADERS(), ...(options.headers || {}) };
  const payload = {
    problemId: problem.problemId,
    problemType: problem.problemType,
    dt: options.dt ?? Date.now(),
    result,
  };

  const resp = await xhrPost(url, payload, headers);
  if (resp.code === 0) return resp;
  throw answerBusinessError(resp, 'answer');
}

/**
 * POST /api/v3/lesson/problem/retry
 * Expects server to echo success ids in data.success (as in v1.16.1).
 * @param {{problemId:number, problemType:number}} problem
 * @param {any} result
 * @param {number} dt - simulated answer time (epoch ms)
 * @param {{headers?:Record<string,string>}} [options]
 */
export async function retryAnswer(problem, result, dt, options = {}) {
  const url = '/api/v3/lesson/problem/retry';
  const headers = { ...DEFAULT_HEADERS(), ...(options.headers || {}) };
  const payload = {
    problems: [{
      problemId: problem.problemId,
      problemType: problem.problemType,
      dt,
      result,
    }],
  };

  const resp = await xhrPost(url, payload, headers);
  if (resp.code !== 0) {
    throw answerBusinessError(resp, 'retry');
  }
  const okList = resp?.data?.success || [];
  const targetId = String(problem.problemId);
  const confirmed = Array.isArray(okList) && okList.some(id => String(id) === targetId);
  if (!confirmed) {
    throw new Error('服务器未返回成功信息');
  }
  return resp;
}

/**
 * High-level orchestrator: answer first; if deadline has passed, optionally retry.
 * This is the module adaptation of the 1.16.1 userscript submit flow.
 *
 * @param {{problemId:number, problemType:number}} problem
 * @param {any} result
 * @param {Object} submitOptions
 * @param {number} [submitOptions.startTime] - unlock time (epoch ms). Required for retry path.
 * @param {number} [submitOptions.endTime]   - deadline (epoch ms). If now >= endTime -> retry path.
 * @param {boolean} [submitOptions.forceRetry=false] - when past deadline, directly use retry without prompting.
 * @param {number} [submitOptions.retryDtOffsetMs=2000] - dt = startTime + offset when retrying.
 * @param {Record<string,string>} [submitOptions.headers] - extra/override headers.
 * @returns {Promise<{'route':'answer'|'retry', resp:any}>}
 * @param {number|string} [submitOptions.lessonId] - 所属课堂；缺省时将使用 repo.currentLessonId
 * @param {boolean} [submitOptions.autoGate=true]  - 是否启用“自动进入课堂/默认自动答题”的判定（向后兼容，默认开启）
 * @param {number} [submitOptions.waitMs]          - 覆盖自动等待时间；未提供时按设置计算
 */
export async function submitAnswer(problem, result, submitOptions = {}) {
  const startTime = submitOptions?.startTime;
  const endTime = submitOptions?.endTime;
  const forceRetry = submitOptions?.forceRetry ?? false;
  const retryDtOffsetMs = submitOptions?.retryDtOffsetMs ?? 2000;
  const headers = submitOptions?.headers;
  const autoGate = submitOptions?.autoGate ?? true;
  const waitMs = submitOptions?.waitMs;
  const lessonIdFromOpts = submitOptions && 'lessonId' in submitOptions ? submitOptions.lessonId : undefined;

  const lessonId = (lessonIdFromOpts ?? repo?.currentLessonId ?? null);
  const autoAnswerEnabled = shouldAutoAnswerForLesson({
    lessonId,
    config: ui?.config,
    autoJoinedLessons: repo?.autoJoinedLessons,
    forceAutoAnswerLessons: repo?.forceAutoAnswerLessons,
  });
  if (autoGate && autoAnswerEnabled) {
    const ms = typeof waitMs === 'number' ? Math.max(0, waitMs) : calcAutoWaitMs();
    if (ms > 0) {
      const guard = (typeof endTime === 'number') ? Math.max(0, endTime - Date.now() - 80) : ms;
      await sleep(Math.min(ms, guard));
    }
  }

  const now = Date.now();
  const pastDeadline = typeof endTime === 'number' && now >= endTime;
  const route = chooseAnswerRoute({ now, endTime, forceRetry });

  if (route === 'retry') {
    console.group('[雨课堂助手][DEBUG][answer] >>> 进入补交分支判断');
    console.log('problemId:', problem.problemId);
    console.log('pastDeadline:', pastDeadline, '(now=', now, ', endTime=', endTime, ')');
    console.log('forceRetry:', forceRetry);
    console.log('传入 startTime:', startTime, '传入 endTime:', endTime);

    const ps = repo?.problemStatus?.get?.(problem.problemId);
    console.log('从 repo.problemStatus 获取:', ps);

    const st = Number.isFinite(startTime) ? startTime : (ps?.startTime);
    const et = Number.isFinite(endTime)   ? endTime   : (ps?.endTime);
    console.log('最终用于 retry 的 st=', st, ' et=', et);

    const off  = Math.max(0, retryDtOffsetMs);
    let dt;

    if (Number.isFinite(st)) {
      dt = st + off;
      console.log('补交 dt = startTime + offset =', dt);
    } else if (Number.isFinite(et)) {
      dt = Math.max(0, et - Math.max(off, 5000));
      console.log('补交 dt = near endTime window =', dt);
    } else {
      dt = Date.now() - off;
      console.log('补交 dt = fallback =', dt);
    }

    console.log('>>> 即将调用 retryAnswer()');
    console.groupEnd();

    try {
      const resp = await retryAnswer(problem, result, dt, { headers });
      console.log('[雨课堂助手][INFO][answer] 补交成功 (/retry)', { problemId: problem.problemId, dt, pastDeadline, forceRetry });
      return { route: 'retry', resp };
    } catch (e) {
      console.error('[雨课堂助手][ERR][answer] 补交失败 (/retry)：', e);
      console.error('[雨课堂助手][ERR][answer] 失败参数：', { st, et, dt, pastDeadline, forceRetry });
      throw e;
    }
  }

  const resp = await answerProblem(problem, result, { headers, dt: now });
  return { route: 'answer', resp };
}
