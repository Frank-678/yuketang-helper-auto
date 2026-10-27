import { PROBLEM_TYPE_MAP } from '../core/types.js';
import { gm } from '../core/env.js';
import { repo } from './repo.js';
import { ui } from '../ui/ui-api.js';
import { submitAnswer, withAnswerLease } from '../tsm/answer.js';
import { queryAI, queryAIVision } from '../ai/openai.js';
import { formatProblemForVision, parseAIAnswer } from '../tsm/ai-format.js';
import { captureSlideImage, captureProblemForVision } from '../capture/screenshoot.js';
import { getOnLesson, checkinClass } from '../net/xhr-interceptor.js';
import { connectOrAttachLessonWS } from '../net/ws-interceptor.js';
import { createEventReminder, createPublishReminder } from './publish-reminder.js';
import { screenWakeLock } from '../core/screen-wake-lock.js';
import { isReminderEnabled } from '../core/reminder-preferences.js';
import { getProblemEndTime } from './problem-timing.js';
import { createDanmuFollowController } from '../core/danmu-follow.js';
import { sendDanmuText } from '../core/danmu-sender.js';
import { selectAnswerProfile, isWithinAnswerPriorityWindow } from '../core/answer-priority.js';
import { hasSubmittedAnswer, sameAnswer, validateAnswer } from '../core/answer-state.js';
import { storage } from '../core/storage.js';
import { diag } from '../core/diagnostics.js';

let autoLoop = null, joinTimer = null, joinGeneration = 0, navigationTimer = null;
let lastAutoAnswer = null;
const danmuControllers = new Map();
const publishReminder = createPublishReminder({ notify: event => ui.notifyPublish(event) });
const problemReminder = createEventReminder({ notify: event => ui.notifyClassroomEvent(event), isEnabled: (_, cfg) => isReminderEnabled('problem-start', cfg) });
const key = value => value == null ? '' : String(value);
const firstValue = (...values) => values.find(x => x != null && String(x).trim() !== '');
const refresh = lessonId => { if (key(lessonId) !== key(repo.currentLessonId) || !document.body) return; ui.updateActiveProblems?.(); ui.updateProblemList?.(); ui.refreshQuickAnswerControl?.(); };
export function hasActiveAIProfile(cfg) { const list = cfg?.profiles || []; return !!(list.find(p => p.id === cfg.activeProfileId) || list[0])?.apiKey || (!list.length && !!cfg?.kimiApiKey); }
export function effectiveAutoAnswer(lessonId) { return !ui.config.autoAnswerPaused && ((ui.config.autoAnswer && key(lessonId) === key(repo.currentLessonId)) || (ui.config.autoJoinEnabled && ui.config.autoAnswerOnAutoJoin && repo.autoJoinedLessons.has(key(lessonId)))); }
function currentPageLessonId() { return location.pathname.match(/\/(?:lesson\/fullscreen\/v3|v2\/web\/lesson)\/([^/]+)/)?.[1] || null; }
function closed(status) { return status?.finished || (Number.isFinite(status?.endTime) && Date.now() >= status.endTime); }
function windows() { const x = ui.config.answerPriorityTimes; return Array.isArray(x) ? x : String(x || '').split(/[,，\s]+/).filter(Boolean); }
function profileFor(role = 'active') {
  const cfg = { ...ui.config.ai, fastAnswerProfileId: ui.config.fastAnswerProfileId, verifyAnswerProfileId: ui.config.verifyAnswerProfileId };
  const quick = ui.config.quickAnswerMode === 'on' || (ui.config.quickAnswerMode === 'auto' && isWithinAnswerPriorityWindow(Date.now(), windows()));
  const p = selectAnswerProfile(cfg, { role: role === 'verify' ? 'verify' : quick ? 'fast' : 'active', now: Date.now(), windows: windows(), quickMode: ui.config.quickAnswerMode });
  if (role !== 'verify' && quick && (!ui.config.fastAnswerProfileId || p?.id !== ui.config.fastAnswerProfileId)) return { profile: p, quick: false, reason: '快答未配置，使用常规模型' };
  return { profile: p, quick, reason: quick ? ui.config.quickAnswerMode === 'on' ? '强制开启' : '命中时间窗口' : '常规作答' };
}
function notifyAutoAnswer(kind, problem, detail) {
  return ui.notifyClassroomEvent({ kind, title: ({ 'auto-answer-scheduled': '自动作答已排队', 'auto-answer-started': '自动作答开始', 'auto-answer-succeeded': '自动作答成功', 'auto-answer-failed': '自动作答失败' })[kind], detail: detail || problem.body || '课堂习题', problem });
}
function schedule(problem, status, lessonId) {
  if (!effectiveAutoAnswer(lessonId) || status.answering || hasSubmittedAnswer(problem.result) || status.needsReconciliation) return false;
  if (closed(status) && ui.config.submissionPolicy === 'normal') return false;
  if (status.phase === 'proposal' && ui.config.submissionPolicy === 'local') return false;
  if (status.phase === 'failed' && (status.attempts || 0) >= 3) return false;
  if (status.autoAnswerTime == null) {
    const delay = Math.max(0, Number(ui.config.autoAnswerDelay) || 0) + Math.floor(Math.random() * Math.max(0, Number(ui.config.autoAnswerRandomDelay) || 0));
    status.autoAnswerTime = Date.now() + delay; status.phase = 'queued'; repo.persistWork(lessonId);
    notifyAutoAnswer('auto-answer-scheduled', problem, `约 ${Math.ceil(delay / 1000)} 秒后处理`);
  }
  return true;
}
function getCurrentUserIdSafe() { return document.cookie.match(/(?:^|;\s*)user_id=([^;]+)/)?.[1] || null; }
function finishedKey(lessonId) { return repo.storageKey('finished-problems', lessonId); }
function isKnownFinished(id, lessonId) { const list = storage.get(finishedKey(lessonId), []); return Array.isArray(list) && list.includes(key(id)); }
function rememberFinished(id, lessonId) { try { const list = storage.get(finishedKey(lessonId), []); storage.set(finishedKey(lessonId), [...(Array.isArray(list) ? list : []).filter(x => x !== key(id)), key(id)].slice(-200)); } catch (error) { diag('storage-failed', { operation: 'finished', message: error.message }); } }

async function handleAutoAnswerInternal(problem, options = {}) {
  const lessonId = key(options.lessonId ?? problem.lessonId ?? repo.currentLessonId), ctx = repo.forLesson(lessonId);
  const status = ctx.problemStatus.get(problem.problemId);
  if (!status || status.answering || (hasSubmittedAnswer(problem.result) && !options.allowResubmit)) return;
  const manual = options.source === 'manual' || options.force === true;
  if (!manual && !effectiveAutoAnswer(lessonId)) return;
  if (!manual && (problem.draftRevision || 0) > 0 && String(problem.draftText || '').trim()) { status.phase = 'manual-draft'; status.autoAnswerTime = null; status.lastError = '已有人工草稿，等待手动处理'; return; }
  status.answering = true; status.autoAnswerTime = null; status.attempts = (status.attempts || 0) + 1;
  const revision = problem.draftRevision || 0, answerRevision = status.answerRevision || 0, account = repo.accountId, quickMode = ui.config.quickAnswerMode;
  const stillEligible = () => {
    if (repo.accountId !== account) throw new Error('账号已变化');
    if (!manual && !effectiveAutoAnswer(lessonId)) throw new Error('自动作答已暂停');
    if (quickMode !== ui.config.quickAnswerMode) throw new Error('快答策略已变化，旧结果仅保留为建议');
    if ((problem.draftRevision || 0) !== revision || (status.answerRevision || 0) !== answerRevision) throw new Error('人工答案已变化，旧 AI 结果仅保留为建议');
  };
  try {
    return await withAnswerLease(problem, lessonId, async () => {
      stillEligible();
      const disk = storage.get(repo.storageKey('work', lessonId), []);
      const confirmed = Array.isArray(disk) && disk.find(x => key(x.problemId) === key(problem.problemId) && x.status?.phase === 'confirmed' && hasSubmittedAnswer(x.result));
      if (confirmed && !options.allowResubmit) { problem.result = confirmed.result; status.done = true; status.phase = 'confirmed'; return; }
      if (status.needsReconciliation) throw new Error('上次提交结果未知，请先同步服务器答案');
      notifyAutoAnswer('auto-answer-started', problem);
      const selection = profileFor();
      let raw = problem.proposalRaw || '', candidate = problem.aiProposal, image = null;
      if (!candidate) {
        status.phase = 'generating'; repo.persistWork(lessonId);
        if (!selection.profile?.apiKey) throw new Error('AI 配置不可用，请填写 API Key；可手动编辑并提交');
        try { image = await captureSlideImage(status.slideId, { lessonId }); } catch {}
        stillEligible();
        if (!image && lessonId === key(repo.currentLessonId) && key(repo.currentSlideId) === key(status.slideId)) image = await captureProblemForVision();
        const prompt = formatProblemForVision(problem, PROBLEM_TYPE_MAP, !!problem.body) + '\n填空答案必须为按空位排列的 JSON 字符串数组；单选和多选答案也用 JSON 字符串数组。';
        const aiConfig = { ...ui.config.ai, activeProfileId: selection.profile.id };
        const deadline = ui.config.submissionPolicy === 'normal' && Number.isFinite(status.endTime) ? status.endTime : null;
        diag('ai-request', { lessonId, problemId: problem.problemId, profileId: selection.profile.id, quick: selection.quick, reason: selection.reason, deadline });
        if (image) raw = await queryAIVision(image, prompt, aiConfig, { problemType: problem.problemType, priorityDeadline: status.endTime, deadline, guard: stillEligible, resolveProfile: () => profileFor().profile, timeout: 45000 });
        else if (String(problem.body || '').trim()) raw = await queryAI(`${prompt}\n${ui.getProblemDetail(problem)}`, aiConfig, { priorityDeadline: status.endTime, deadline, guard: stillEligible, resolveProfile: () => profileFor().profile });
        else throw new Error('题目截图不可用，且没有完整题干；已停止此题');
        candidate = parseAIAnswer(problem, raw);
        problem.proposalRaw = raw; problem.updatedAt = Date.now();
        if (!candidate) throw new Error('AI 答案格式不明确，已保留原文供人工编辑');
        problem.aiProposal = candidate; repo.persistWork(lessonId);
        diag('auto-proposal', { lessonId, problemId: problem.problemId, answer: candidate, profileId: selection.profile.id });
      }
      // Persist paid AI output before checking cancellation or a newer manual edit.
      stillEligible();
      const verify = async () => {
        if (!ui.config.answerVerification || !ui.config.verifyAnswerProfileId || !image) return candidate;
        const p = profileFor('verify').profile;
        if (!p?.apiKey || p.id !== ui.config.verifyAnswerProfileId) return candidate;
        if (Number.isFinite(status.endTime) && status.endTime - Date.now() < 15000) return candidate;
        const check = await queryAIVision(image, `复核题目并独立给出答案。原候选：${JSON.stringify(candidate)}。答案用 JSON 数组；主观题用 content/pics 对象。`, { ...ui.config.ai, activeProfileId: p.id }, { problemType: problem.problemType, guard: stillEligible, timeout: 45000, deadline: ui.config.submissionPolicy === 'normal' ? status.endTime : null });
        const parsed = parseAIAnswer(problem, check); if (parsed) problem.verificationProposal = parsed;
        return parsed || candidate;
      };
      if (!selection.quick) { try { candidate = await verify(); problem.aiProposal = candidate; } catch (error) { status.verificationError = error.message; } }
      stillEligible();
      if (options.generateOnly || ui.config.submissionPolicy === 'local') { status.phase = 'proposal'; repo.persistWork(lessonId); return { route: 'local', result: candidate }; }
      const outcome = await submitAnswer(problem, candidate, { lessonId, policy: ui.config.submissionPolicy, forceRetry: options.forceRetry, allowResubmit: options.allowResubmit, leaseHeld: true, guard: stillEligible });
      if (outcome.route !== 'local') notifyAutoAnswer('auto-answer-succeeded', problem, outcome.route === 'retry' ? '答案已确认补交成功' : '答案已确认提交成功');
      if (selection.quick && ui.config.answerVerification) {
        try {
          const corrected = await verify(); stillEligible();
          if (!sameAnswer(problem, corrected, candidate) && ui.config.submissionPolicy === 'auto') {
            await submitAnswer(problem, corrected, { lessonId, forceRetry: true, allowResubmit: true, leaseHeld: true, guard: stillEligible });
            status.verificationState = 'corrected';
          } else status.verificationState = sameAnswer(problem, corrected, candidate) ? 'same' : 'suggestion';
        } catch (error) { status.verificationState = 'suggestion'; status.verificationError = error.message; }
      }
      return outcome;
    });
  } catch (error) {
    if (!['unknown', 'confirmed'].includes(status.phase)) status.phase = problem.aiProposal ? 'proposal' : 'failed';
    status.lastError = error.message;
    diag('auto-error', { lessonId, problemId: problem.problemId, message: error.message, phase: status.phase });
    if (!manual && !problem.aiProposal && status.attempts < 3 && (error.timeout || /网络|限流/.test(error.message)) && effectiveAutoAnswer(lessonId)) status.autoAnswerTime = Date.now() + 2000;
    if (manual) ui.toast(error.message, 4000); else notifyAutoAnswer('auto-answer-failed', problem, error.message);
  } finally { status.answering = false; repo.persistWork(lessonId); refresh(lessonId); }
}
export function startAutoAnswerLoop() { if (!autoLoop) autoLoop = setInterval(() => actions.tickAutoAnswer(), 500); }

export const actions = {
  onFetchTimeline(timeline, options = {}) { for (const p of Array.isArray(timeline) ? timeline : []) if (p?.type === 'problem') this.onUnlockProblem(p, { ...options, source: 'timeline' }); },
  onPresentationLoaded(id, data, options = {}) {
    const lessonId = key(options.lessonId ?? data.lessonId ?? repo.currentLessonId), ctx = repo.forLesson(lessonId);
    repo.setPresentation(id, data, lessonId);
    for (const [k, event] of [...ctx.pendingEvents]) {
      if (Date.now() - event.at > 1800000) { ctx.pendingEvents.delete(k); continue; }
      if (ctx.problems.has(event.payload.prob ?? event.payload.problemId) && ctx.slides.has(event.payload.sid ?? event.payload.slideId)) { ctx.pendingEvents.delete(k); this.onUnlockProblem(event.payload, event.options); }
    }
    for (const [pid, status] of ctx.problemStatus) { const p = ctx.problems.get(pid); if (p) schedule(p, status, lessonId); }
    repo.persistWork(lessonId);
    if (lessonId === key(repo.currentLessonId) && document.body) { ui.updatePresentationList(); refresh(lessonId); }
  },
  onUnlockProblem(data, options = {}) {
    const { notificationOnly = false, source = 'live' } = options, payload = data || {};
    const lessonId = key(options.lessonId ?? payload.lessonId ?? repo.currentLessonId), ctx = repo.forLesson(lessonId);
    const problemId = key(firstValue(payload.prob, payload.problemId, payload.problemid, payload.problem?.problemId, payload.id));
    const slideId = key(firstValue(payload.sid, payload.slideId, payload.slide?.id));
    if (!problemId) return false;
    const problem = ctx.problems.get(problemId), slide = ctx.slides.get(slideId);
    if (!problem || !slide) {
      ctx.pendingEvents.set(problemId, { payload, options: { ...options, lessonId }, at: Date.now() });
      while (ctx.pendingEvents.size > 100) ctx.pendingEvents.delete(ctx.pendingEvents.keys().next().value);
      return false;
    }
    const previous = ctx.problemStatus.get(problemId);
    const status = previous || { lessonId, presentationId: key(payload.pres ?? slide.presentationId), slideId, startTime: Number(payload.dt) || Date.now(), endTime: getProblemEndTime(payload.dt, payload.limit), done: hasSubmittedAnswer(problem.result), answering: false, autoAnswerTime: null, phase: 'idle', finished: isKnownFinished(problemId, lessonId) };
    if (previous && source === 'live') {
      if (Number(payload.dt) > status.startTime) { status.finished = false; status.startTime = Number(payload.dt); }
      status.endTime = getProblemEndTime(payload.dt, payload.limit);
    }
    ctx.problemStatus.set(problemId, status);
    const fresh = source === 'live' && !previous && !status.done && !closed(status);
    let notified = false;
    if (fresh) notified = problemReminder.handle({ kind: 'problem-start', dedupeKey: `problem-start:${repo.accountId}:${lessonId}:${problemId}:${status.startTime}`, title: '习题已发布', detail: problem.body || '老师已开启一道新题', problem, slide }, ui.config);
    if (!notificationOnly && source === 'live') schedule(problem, status, lessonId);
    // Timeline recovery is quiet and bounded; it does not replay new-question alerts.
    if (!notificationOnly && source !== 'live' && Date.now() - status.startTime < 1800000) schedule(problem, status, lessonId);
    repo.persistWork(lessonId); refresh(lessonId); return notified;
  },
  onProblemFinished(problemId, options = {}) {
    const lessonId = key(options.lessonId ?? repo.currentLessonId), state = repo.forLesson(lessonId).problemStatus.get(problemId);
    if (state) state.finished = true;
    rememberFinished(problemId, lessonId); repo.persistWork(lessonId); refresh(lessonId);
  },
  onExtendTime(payload, options = {}) {
    const lessonId = key(options.lessonId ?? repo.currentLessonId), s = repo.forLesson(lessonId).problemStatus.get(payload.prob ?? payload.problemId);
    if (!s) return;
    if (Number(payload.extend) === -1 || Number(payload.limit) === -1) s.endTime = null;
    else s.endTime = getProblemEndTime(s.startTime ?? payload.dt, payload.limit);
    repo.persistWork(lessonId); refresh(lessonId);
  },
  onPublishEvent(event, options = {}) {
    const lessonId = key(options.lessonId ?? event?.lessonId ?? repo.currentLessonId);
    const id = key(event?.contentId ?? event?.presentationId ?? event?.id ?? (event?.category === 'courseware' ? event.dedupeKey?.slice('courseware:'.length) : ''));
    if (event?.category === 'courseware' && lessonId === key(repo.currentLessonId) && id && id === key(repo.currentPresentationId)) return false;
    return publishReminder.handle({ ...event, dedupeKey: `${repo.accountId}:${lessonId}:${event.dedupeKey}` }, ui.config);
  },
  onDanmu(data, options = {}) {
    const lessonId = key(options.lessonId ?? repo.currentLessonId);
    if (!lessonId || lessonId !== currentPageLessonId()) return { triggered: false, reason: 'non-current-lesson' };
    if (!danmuControllers.has(lessonId)) danmuControllers.set(lessonId, createDanmuFollowController({ enabled: () => ui.config.autoFollowDanmu && lessonId === currentPageLessonId(), getCurrentUserId: getCurrentUserIdSafe, send: text => sendDanmuText(text, { root: (gm.uw || window).document, lessonId }) }));
    return danmuControllers.get(lessonId).handle(data, options);
  },
  onLessonFinished(options = {}) {
    const lessonId = key(options.lessonId ?? repo.currentLessonId), ctx = repo.forLesson(lessonId);
    for (const s of ctx.problemStatus.values()) { s.finished = true; s.autoAnswerTime = null; }
    repo.persistWork(lessonId); danmuControllers.get(lessonId)?.reset(); refresh(lessonId);
    return ui.notifyClassroomEvent({ kind: 'lesson-finished', dedupeKey: `lesson-finished:${lessonId}`, title: '下课提示', detail: '课程已结束' });
  },
  onAnswerProblem(problemId, result, options = {}) {
    const lessonId = key(options.lessonId ?? repo.currentLessonId), ctx = repo.forLesson(lessonId), p = ctx.problems.get(problemId);
    if (!p || !hasSubmittedAnswer(result)) return;
    p.result = result; p.remoteAnswer = result; p.updatedAt = Date.now();
    const s = ctx.problemStatus.get(problemId);
    if (s) Object.assign(s, { done: true, phase: 'confirmed', autoAnswerTime: null, needsReconciliation: false, answerRevision: (s.answerRevision || 0) + 1 });
    repo.persistWork(lessonId); refresh(lessonId);
  },
  handleAutoAnswer: handleAutoAnswerInternal,
  tickAutoAnswer() {
    const contexts = new Set([key(repo.currentLessonId), ...repo.autoJoinedLessons]);
    for (const lessonId of contexts) {
      const ctx = repo.forLesson(lessonId);
      const tasks = [...ctx.problemStatus].sort((a, b) => (a[1].endTime ?? Infinity) - (b[1].endTime ?? Infinity));
      for (const [pid, s] of tasks) {
        if (!effectiveAutoAnswer(lessonId)) { s.autoAnswerTime = null; continue; }
        if (s.autoAnswerTime != null && Date.now() >= s.autoAnswerTime) { const p = ctx.problems.get(pid); s.autoAnswerTime = null; if (p) void this.handleAutoAnswer(p, { lessonId }); }
      }
    }
  },
  parseManual(problemType, content) {
    const p = { problemType: Number(problemType) };
    let value; try { value = JSON.parse(content); } catch { value = Number(problemType) === 5 ? { content, pics: [] } : Number(problemType) === 4 ? content.split('\n') : content.toUpperCase().split(/[\s,，、]*/).filter(Boolean); }
    return validateAnswer(p, value);
  },
  async submit(problem, content, options = {}) {
    const lessonId = options.lessonId ?? problem.lessonId ?? repo.currentLessonId;
    const answer = validateAnswer(problem, this.parseManual(problem.problemType, content));
    const out = await submitAnswer(problem, answer, { ...options, lessonId }); refresh(lessonId); return out;
  },
  navigateTo(presId, slideId) { repo.currentPresentationId = key(presId); repo.currentSlideId = key(slideId); ui.updateSlideView(); ui.showPresentationPanel(true); ui.refreshQuickAnswerControl?.(); },
  launchLessonHelper() {
    if (lastAutoAnswer === null) lastAutoAnswer = ui.config.autoAnswer;
    const next = currentPageLessonId();
    if (key(next) !== key(repo.currentLessonId)) { for (const controller of danmuControllers.values()) controller.reset(); danmuControllers.clear(); }
    const changed = key(next) !== key(repo.currentLessonId);
    repo.currentLessonId = next;
    if (changed) window.dispatchEvent(new CustomEvent('ykt:lesson-change', { detail: { lessonId: next } }));
    repo.loadStoredPresentations();
    const restored = repo.forLesson(next);
    for (const [id, status] of restored.problemStatus) { const p = restored.problems.get(id); if (p && (p.aiProposal || Date.now() - status.startTime < 1800000)) schedule(p, status, next); }
    if (changed && document.body) { ui.updatePresentationList(); ui.updateSlideView(); }
    this.maybeStartAutoJoin(); void screenWakeLock.setEnabled(ui.config.keepScreenAwake);
    if (document.body) refresh(next);
  },
  startAutoAnswerLoop,
  startAutoJoinLoop() {
    if (repo.autoJoinRunning) return;
    repo.autoJoinRunning = true; const generation = ++joinGeneration;
    const loop = async () => {
      if (!repo.autoJoinRunning || generation !== joinGeneration) return;
      try {
        for (const item of await getOnLesson()) {
          const lessonId = key(item.lessonId ?? item.lesson_id ?? item.id);
          if (!lessonId || Number(item.status) !== 1 || repo.isLessonConnected(lessonId)) continue;
          const { token } = await checkinClass(lessonId);
          if (!repo.autoJoinRunning || generation !== joinGeneration) return;
          if (token) { repo.markLessonAutoJoined(lessonId); connectOrAttachLessonWS({ lessonId, auth: token }); }
        }
      } catch (error) { diag('auto-join-error', { message: error.message }); }
      finally { if (repo.autoJoinRunning && generation === joinGeneration) joinTimer = setTimeout(loop, 5000); }
    }; void loop();
  },
  stopAutoJoinLoop() { repo.autoJoinRunning = false; ++joinGeneration; clearTimeout(joinTimer); clearTimeout(navigationTimer); joinTimer = null; },
  maybeStartAutoJoin() { if (ui.config.autoJoinEnabled) { this.startAutoJoinLoop(); this.startAutoClickOnOnLessonBar(); } else this.stopAutoJoinLoop(); },
  installRouterRearm() {},
  startAutoClickOnOnLessonBar() {
    if (currentPageLessonId() || navigationTimer || !ui.config.autoJoinEnabled) return;
    let cancelled = false;
    const cancel = () => { cancelled = true; clearTimeout(navigationTimer); navigationTimer = null; for (const name of ['pointerdown', 'keydown', 'wheel']) window.removeEventListener(name, cancel, true); };
    for (const name of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(name, cancel, { capture: true, once: true });
    navigationTimer = setTimeout(async () => {
      navigationTimer = null;
      try {
        if (cancelled || !ui.config.autoJoinEnabled || currentPageLessonId()) return;
        const items = await getOnLesson(); const item = items.find(x => Number(x.status) === 1 && (x.lessonId ?? x.lesson_id ?? x.id));
        if (item && !cancelled && ui.config.autoJoinEnabled && !currentPageLessonId()) location.assign(`/lesson/fullscreen/v3/${item.lessonId ?? item.lesson_id ?? item.id}`);
      } finally { cancel(); }
    }, 10000);
  },
  syncConfig() {
    if (lastAutoAnswer && !ui.config.autoAnswer) ui.config.autoAnswerPaused = true;
    if (ui.config.autoAnswer) ui.config.autoAnswerPaused = false;
    lastAutoAnswer = ui.config.autoAnswer;
    for (const lessonId of new Set([key(repo.currentLessonId), ...repo.autoJoinedLessons])) for (const [pid, status] of repo.forLesson(lessonId).problemStatus) {
      if (!effectiveAutoAnswer(lessonId)) { status.autoAnswerTime = null; if (!status.answering && !status.done) status.phase = 'paused'; }
      else { const p = repo.forLesson(lessonId).problems.get(pid); if (p) schedule(p, status, lessonId); }
    }
    for (const controller of danmuControllers.values()) controller.reset();
    this.maybeStartAutoJoin(); void screenWakeLock.setEnabled(ui.config.keepScreenAwake);
  },
};
if (typeof window !== 'undefined') window.addEventListener('ykt:config-changed', () => actions.syncConfig());

