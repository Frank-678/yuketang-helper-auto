import { storage } from '../core/storage.js';
import { hasSubmittedAnswer } from '../core/answer-state.js';

export class IdMap extends Map {
  get(k) { return super.get(String(k)); }
  has(k) { return super.has(String(k)); }
  set(k, v) { return super.set(String(k), v); }
  delete(k) { return super.delete(String(k)); }
}
function accountScope() {
  try {
    const uid = document.cookie.match(/(?:^|;\s*)user_id=([^;]+)/)?.[1];
    if (uid) return `user-${uid}`;
    // The token is never persisted in a task key or diagnostic record.
    const token = localStorage.getItem('Authorization') || '';
    let hash = 2166136261;
    for (const c of token) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return token ? `session-${hash >>> 0}` : 'anonymous';
  } catch { return 'anonymous'; }
}
const classrooms = new Map();
let currentLessonId = null;
function fresh(lessonId, scope) {
  return { lessonId: String(lessonId || ''), scope, presentations: new IdMap(), slides: new IdMap(), problems: new IdMap(), problemStatus: new IdMap(), encounteredProblems: [], pendingEvents: new Map(), currentPresentationId: null, currentSlideId: null, currentSelectedUrl: null, loadedWork: false };
}
export const repo = {
  get accountId() { return accountScope(); },
  get currentLessonId() { return currentLessonId; },
  set currentLessonId(value) { currentLessonId = value == null ? null : String(value); },
  forLesson(lessonId = this.currentLessonId) {
    const scope = accountScope();
    const key = `${scope}:${lessonId || ''}`;
    if (!classrooms.has(key)) classrooms.set(key, fresh(lessonId, scope));
    return classrooms.get(key);
  },
  storageKey(kind, lessonId = this.currentLessonId) { return `${kind}-${accountScope()}-${lessonId || 'unknown'}`; },
  setPresentation(id, data, lessonId = this.currentLessonId, { persist = true } = {}) {
    const ctx = this.forLesson(lessonId);
    const pres = { ...data, id: String(id), lessonId: String(lessonId || '') };
    ctx.presentations.set(id, pres);
    for (const raw of pres.slides || []) {
      const slide = { ...raw, id: String(raw.id), presentationId: String(id), lessonId: ctx.lessonId };
      ctx.slides.set(slide.id, slide);
      if (slide.problem) {
        const prob = this.upsertProblem({ ...slide.problem, problemId: String(slide.problem.problemId ?? slide.problem.id), lessonId: ctx.lessonId, slideId: slide.id, presentationId: String(id) }, lessonId);
        slide.problem = prob;
        this.pushEncounteredProblem(prob, slide, id, lessonId);
      }
    }
    if (persist) {
      try {
        const key = this.storageKey('presentations', lessonId);
        storage.alterMap(key, m => { m.delete(String(id)); m.set(String(id), pres); const max = Math.max(1, Math.min(20, Number(storage.get('config', {})?.maxPresentations) || 5)); while (m.size > max) m.delete(m.keys().next().value); });
      } catch (error) { this.storageError = error.message; }
    }
    return pres;
  },
  upsertSlide(slide, lessonId = this.currentLessonId) { this.forLesson(lessonId).slides.set(slide.id, slide); },
  upsertProblem(prob, lessonId = this.currentLessonId) {
    const ctx = this.forLesson(lessonId);
    const old = ctx.problems.get(prob.problemId) || {};
    const next = { ...old, ...prob, problemId: String(prob.problemId), problemType: Number(prob.problemType), lessonId: ctx.lessonId };
    if (Object.hasOwn(prob, 'result')) {
      next.remoteAnswer = hasSubmittedAnswer(prob.result) ? prob.result : null;
      const status = ctx.problemStatus.get(prob.problemId);
      if (status) { status.done = hasSubmittedAnswer(prob.result); status.needsReconciliation = false; }
    }
    Object.assign(old, next);
    ctx.problems.set(next.problemId, old);
    return old;
  },
  pushEncounteredProblem(prob, slide, presentationId, lessonId = this.currentLessonId) {
    const ctx = this.forLesson(lessonId);
    const old = ctx.encounteredProblems.find(p => String(p.problemId) === String(prob.problemId));
    const ref = { ...prob, slide, presentationId: String(presentationId), slideId: String(slide.id), lessonId: ctx.lessonId };
    if (old) Object.assign(old, ref); else ctx.encounteredProblems.push(ref);
  },
  saveDraft(problemId, text, lessonId = this.currentLessonId) {
    const p = this.forLesson(lessonId).problems.get(problemId);
    if (!p) return false;
    p.draftText = String(text); p.draftRevision = (p.draftRevision || 0) + 1; p.updatedAt = Date.now();
    return this.persistWork(lessonId);
  },
  persistWork(lessonId = this.currentLessonId) {
    const ctx = this.forLesson(lessonId), now = Date.now();
    const records = [...ctx.problems].map(([problemId, p]) => ({ problemId, problemType: p.problemType, draftText: p.draftText, draftRevision: p.draftRevision || 0, aiProposal: p.aiProposal, pendingAnswer: p.pendingAnswer, proposalRaw: String(p.proposalRaw || '').slice(0, 12000), result: p.result, updatedAt: p.updatedAt || now, status: ctx.problemStatus.get(problemId) })).filter(x => now - x.updatedAt < 86400000).slice(-100);
    try { storage.set(this.storageKey('work', lessonId), records); return true; }
    catch (error) { this.storageError = error.message; return false; }
  },
  loadWork(lessonId = this.currentLessonId) {
    const ctx = this.forLesson(lessonId); if (ctx.loadedWork) return; ctx.loadedWork = true;
    const records = storage.get(this.storageKey('work', lessonId), []);
    for (const record of Array.isArray(records) ? records : []) {
      if (!record?.problemId || Date.now() - record.updatedAt > 86400000) continue;
      const existing = ctx.problems.get(record.problemId);
      const p = { ...(existing || {}), ...record, lessonId: ctx.lessonId }; delete p.status;
      // Fresh server data wins over a previously cached server answer.
      if (existing && Object.hasOwn(existing, 'result')) p.result = existing.result;
      if (existing) Object.assign(existing, p);
      ctx.problems.set(record.problemId, existing || p);
      if (record.status) ctx.problemStatus.set(record.problemId, { ...record.status, answering: false, autoAnswerTime: null, phase: record.status.phase === 'submitting' ? 'unknown' : record.status.phase, needsReconciliation: ['submitting', 'unknown'].includes(record.status.phase) });
    }
  },
  loadStoredPresentations(lessonId = this.currentLessonId) {
    if (!lessonId) return;
    // Legacy per-lesson cache is accepted once; new writes are account scoped.
    const cached = storage.getMap(this.storageKey('presentations', lessonId));
    for (const [id, data] of cached) this.setPresentation(id, data, lessonId, { persist: false });
    this.loadWork(lessonId);
  },
  listeningLessons: new Set(), lessonTokens: new IdMap(), lessonSockets: new IdMap(),
  autoJoinRunning: false, autoJoinedLessons: new Set(), forceAutoAnswerLessons: new Set(),
  markLessonConnected(lessonId, ws, token) { const id = String(lessonId); if (token) this.lessonTokens.set(id, token); if (ws) this.lessonSockets.set(id, ws); this.listeningLessons.add(id); },
  isLessonConnected(lessonId) { const ws = this.lessonSockets.get(lessonId); return ws && (!ws.__yktAccountId || ws.__yktAccountId === this.accountId) && (ws.readyState === 0 || ws.readyState === 1) ? ws : false; },
  markLessonAutoJoined(lessonId, enabled = true) { if (lessonId == null) return; if (enabled) this.autoJoinedLessons.add(String(lessonId)); else this.autoJoinedLessons.delete(String(lessonId)); },
};
for (const key of ['presentations', 'slides', 'problems', 'problemStatus', 'encounteredProblems', 'currentPresentationId', 'currentSlideId', 'currentSelectedUrl']) Object.defineProperty(repo, key, { get() { return this.forLesson()[key]; }, set(value) { this.forLesson()[key] = value; } });
