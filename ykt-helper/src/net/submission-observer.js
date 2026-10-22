import { actions } from '../state/actions.js';
import { repo } from '../state/repo.js';

export function requestLessonId(url, fallback = repo.currentLessonId) {
  try { const u = new URL(url, location.href); return u.searchParams.get('lesson_id') || u.searchParams.get('lessonId') || u.pathname.match(/\/lesson\/fullscreen\/v3\/([^/]+)/)?.[1] || fallback; } catch { return fallback; }
}
export function observeResponse(url, json, body, { lessonId, own = false } = {}) {
  if (!json || (json.code !== undefined && Number(json.code) !== 0)) return;
  const data = json.data || json;
  if (Array.isArray(data.slides) && data.id != null) actions.onPresentationLoaded(data.id, { ...data, sourceUrl: url }, { lessonId });
  if (own) return;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return; } }
  if (!body || typeof body !== 'object') return;
  if (/\/lesson\/problem\/retry(?:\?|$)/.test(url)) {
    const successes = new Set((Array.isArray(json?.data?.success) ? json.data.success : []).map(x => String(x?.problemId ?? x?.id ?? x)));
    for (const p of Array.isArray(body.problems) ? body.problems : []) if (successes.has(String(p.problemId))) actions.onAnswerProblem(p.problemId, p.result, { lessonId });
  } else if (/\/lesson\/problem\/answer(?:\?|$)/.test(url) && body.problemId != null) actions.onAnswerProblem(body.problemId, body.result, { lessonId });
}
