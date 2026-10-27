import { actions } from '../state/actions.js';
import { repo } from '../state/repo.js';
import { isSuccessfulClassroomResponse, parsePresentationResponse } from '../core/presentation-response.js';
import { diag } from '../core/diagnostics.js';

export function requestLessonId(url, fallback = repo.currentLessonId) {
  try { const u = new URL(url, location.href); return u.searchParams.get('lesson_id') || u.searchParams.get('lessonId') || u.pathname.match(/\/lesson\/fullscreen\/v3\/([^/]+)/)?.[1] || fallback; } catch { return fallback; }
}
export function observeResponse(url, json, body, { lessonId, accountId, own = false } = {}) {
  if (accountId != null && accountId !== repo.accountId) return;
  if (!isSuccessfulClassroomResponse(json)) return;
  const presentation = parsePresentationResponse(url, json);
  if (presentation) {
    actions.onPresentationLoaded(presentation.id, { ...presentation.data, sourceUrl: url }, { lessonId });
    diag('presentation-captured', { lessonId, presentationId: presentation.id, slides: presentation.data.slides.length });
  } else if (Array.isArray((json.data ?? json.result ?? json)?.slides)) {
    diag('presentation-rejected', { lessonId, reason: 'missing-presentation-id' });
  }
  if (own) return;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return; } }
  if (!body || typeof body !== 'object') return;
  if (/\/lesson\/problem\/retry(?:\?|$)/.test(url)) {
    const successes = new Set((Array.isArray(json?.data?.success) ? json.data.success : []).map(x => String(x?.problemId ?? x?.id ?? x)));
    for (const p of Array.isArray(body.problems) ? body.problems : []) if (successes.has(String(p.problemId))) actions.onAnswerProblem(p.problemId, p.result, { lessonId });
  } else if (/\/lesson\/problem\/answer(?:\?|$)/.test(url) && body.problemId != null) actions.onAnswerProblem(body.problemId, body.result, { lessonId });
}

