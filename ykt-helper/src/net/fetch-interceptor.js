// src/net/fetch-interceptor.js
import { gm } from '../core/env.js';
import { actions } from '../state/actions.js';
import { diag } from '../core/diagnostics.js';

const PRESENTATION_URL_HINTS = ['/lesson', '/presentation', '/slides', '/problem'];

// Pure function: check whether a fetch response body is a presentation payload.
export function parsePresentationFetchResponse(url, json) {
  if (!json || !Array.isArray(json?.data?.slides)) return null;
  if (!(json.code === 0 || json.success)) return null;
  let id = null;
  try { id = new URL(url, 'https://placeholder.invalid/').searchParams.get('presentation_id'); } catch {}
  return { id, data: json.data };
}

// Intercepts the page's real fetch() (on unsafeWindow) to capture presentation
// loads and answer submissions that the page issues via fetch rather than XHR.
// Must be called from startDesktopRuntime() after gm is available.
export function installFetchInterceptor() {
  const target = gm.uw || window;
  if (target.__YKT_FETCH_PATCHED__) return;
  target.__YKT_FETCH_PATCHED__ = true;

  const rawFetch = target.fetch;
  if (typeof rawFetch !== 'function') return;

  target.fetch = async function (...args) {
    const [input] = args;
    const url = typeof input === 'string' ? input : input?.url || '';
    const resp = await rawFetch.apply(this, args);

    if (PRESENTATION_URL_HINTS.some(hint => url.includes(hint))) {
      try {
        const json = JSON.parse(await resp.clone().text());
        const parsed = parsePresentationFetchResponse(url, json);
        if (parsed) {
          diag('fetch-presentation', { id: parsed.id, slides: parsed.data?.slides?.length });
          actions.onPresentationLoaded(parsed.id, parsed.data);
        } else if (url.includes('/problem/answer') || url.includes('/problem/retry')) {
          // Capture page's own manual answer submitted via fetch (XHR path is in xhr-interceptor)
          try {
            const reqBody = args[1]?.body;
            if (reqBody && (json.code === 0 || json.success)) {
              const body = JSON.parse(typeof reqBody === 'string' ? reqBody : '{}');
              if (url.includes('/problem/retry')) {
                const first = Array.isArray(body?.problems) ? body.problems[0] : null;
                if (first?.problemId) {
                  diag('page-answer', { problemId: first.problemId, result: first.result, route: 'retry' });
                  actions.onAnswerProblem(first.problemId, first.result);
                }
              } else {
                const { problemId, result } = body;
                if (problemId) {
                  diag('page-answer', { problemId, result, route: 'answer' });
                  actions.onAnswerProblem(problemId, result);
                }
              }
            }
          } catch {}
        }
      } catch (e) {
        console.warn('[雨课堂助手][ERR][fetch-interceptor] 解析响应失败:', e);
      }
    }

    return resp;
  };
}
