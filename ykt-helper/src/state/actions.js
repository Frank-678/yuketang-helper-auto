// src/state/actions.js
import { PROBLEM_TYPE_MAP } from '../core/types.js';
import { randInt, gm } from '../core/env.js'
import { storage } from '../core/storage.js';
import { repo } from './repo.js';
import { ui } from '../ui/ui-api.js';
import { submitAnswer, retryAnswer } from '../tsm/answer.js';;
import { queryAI, queryAIVision} from '../ai/openai.js';
import { showAutoAnswerPopup } from '../ui/panels/auto-answer-popup.js';
import { formatProblemForVision, parseAIAnswer } from '../tsm/ai-format.js';
import { captureSlideImage, captureProblemForVision } from '../capture/screenshoot.js';  
import { getOnLesson, checkinClass } from '../net/xhr-interceptor.js';
import { connectOrAttachLessonWS } from '../net/ws-interceptor.js';
import { createEventReminder, createPublishReminder } from './publish-reminder.js';
import { screenWakeLock } from '../core/screen-wake-lock.js';
import { isReminderEnabled } from '../core/reminder-preferences.js';
import { isCurrentPublishEvent } from '../core/publish-events.js';
import { compareParsedAnswers, selectAnswerProfile } from '../core/answer-priority.js';
import { getProblemEndTime } from './problem-timing.js';
import { createProblemRecoveryStore, shouldRecoverProblem } from './auto-answer-recovery.js';
import { createAutoAnswerRunner } from './auto-answer-runner.js';
import { buildAnswerSubmitOptions } from './answer-editor.js';
import { createDanmuFollowController } from '../core/danmu-follow.js';
import { sendDanmuText } from '../core/danmu-sender.js';
import { isLiveProblemSource } from '../core/problem-event-source.js';
import { syncActiveLessons, getLessonId } from '../core/active-lessons.js';
import { createNavigationArbiter, pickLatestActiveLesson } from '../core/navigation-arbiter.js';

let _autoLoopStarted = false;
let _autoJoinStarted = false;
let _autoOnLessonClickStarted = false;
let _autoOnLessonClickInProgress = false;
let _navigationArbiter = null;
let _autoJumpRetryTimer = null;
let _routerHooked = false;
let _problemRecoveryStore = null;
let _problemRecoveryLessonId = null;
const publishReminder = createPublishReminder({
  notify: event => ui.notifyPublish(event),
});
const problemStartReminder = createEventReminder({
  notify: event => ui.notifyClassroomEvent(event),
  isEnabled: (_event, config) => isReminderEnabled('problem-start', config),
});

const danmuFollowControllers = new Map();

function createDanmuFollowControllerForLesson(lessonId) {
  return createDanmuFollowController({
    enabled: () => ui.config.autoFollowDanmu === true,
    getCurrentUserId: getCurrentUserIdSafe,
    onRoundStart: event => ui.notifyClassroomEvent({
      kind: 'danmu-round-start',
      dedupeKey: `danmu-round-start:${lessonId}:${event.roundNumber}`,
      title: '新一轮弹幕开始',
      detail: `检测到第 ${event.roundNumber} 轮弹幕。首条内容：${event.text}`,
    }),
    onFollowTrigger: event => ui.notifyClassroomEvent({
      kind: 'danmu-follow-trigger',
      dedupeKey: `danmu-follow-trigger:${lessonId}:${event.roundNumber}:${event.text}`,
      title: '弹幕达到自动跟发条件',
      detail: `最近 ${event.batchSize} 条弹幕中，“${event.text}”出现 ${event.count} 次，脚本即将自动跟发。`,
    }),
    send: text => sendDanmuText(text, {
      root: (gm.uw || window).document || document,
    }),
  });
}

function getDanmuFollowController(lessonId) {
  const key = String(lessonId || '__current__');
  let controller = danmuFollowControllers.get(key);
  if (!controller) {
    controller = createDanmuFollowControllerForLesson(key);
    danmuFollowControllers.set(key, controller);
  }
  return controller;
}

function currentPageLessonId() {
  const match = String(window.location.pathname || '').match(/\/lesson\/fullscreen\/v3\/([^/]+)/);
  return match ? match[1] : null;
}

const AUTO_ANSWER_EVENT_META = {
  'auto-answer-scheduled': ['自动作答已排队', '脚本已为这道题安排自动作答。'],
  'auto-answer-started': ['自动作答开始', '脚本正在处理这道题。'],
  'auto-answer-succeeded': ['自动作答成功', '这道题的答案已提交。'],
  'auto-answer-failed': ['自动作答失败', '这道题未能完成自动作答。'],
};

function firstValue(...values) {
  return values.find(value => value !== undefined && value !== null && String(value).trim() !== '');
}

function notifyProblemStart(data, problem, slide, lessonId = null) {
  const payload = data && typeof data === 'object' ? data : {};
  const problemId = firstValue(
    problem?.problemId,
    problem?.id,
    payload.prob,
    payload.problemId,
    payload.problemid,
    payload.problem?.problemId,
    payload.problem?.id,
  );
  const detail = problem?.body
    || payload.body
    || payload.title
    || payload.name
    || '老师已开启一道新题，请打开课堂查看。';

  return problemStartReminder.handle({
    kind: 'problem-start',
    dedupeKey: `problem-start:${lessonId || 'unknown'}:${problemId || payload.sid || payload.dt || 'unknown'}`,
    title: '习题已发布',
    nativeTitle: '雨课堂习题提示',
    detail,
    problem,
    slide,
  }, ui.config);
}

function notifyAutoAnswer(kind, problem, detail) {
  const [title, defaultDetail] = AUTO_ANSWER_EVENT_META[kind] || ['自动作答提示', '自动作答状态发生变化。'];
  const lessonId = repo.problemStatus.get(problem?.problemId)?.lessonId || repo.currentLessonId || 'unknown';
  return ui.notifyClassroomEvent({
    kind,
    dedupeKey: `${kind}:${lessonId}:${problem?.problemId || Date.now()}`,
    title,
    detail: detail || defaultDetail,
    problem,
  });
}

function getCurrentUserIdSafe() {
  const target = gm.uw || window;
  try {
    if (target?.YktUser?.id !== undefined && target?.YktUser?.id !== null) {
      return target.YktUser.id;
    }
    const initialUserId = target?.__INITIAL_STATE__?.user?.userId;
    if (initialUserId !== undefined && initialUserId !== null) return initialUserId;
    const cookie = target?.document?.cookie || '';
    const match = cookie.match(/(?:^|;\s*)user_id=(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// 无AI默认答案生成
function makeDefaultAnswer(problem) {
  switch (problem.problemType) {
    case 1: // 单选
    case 2: // 多选
    case 3: // 投票
      return ['A'];
    case 4: // 填空
      // 按需求示例返回 [" 1"]（保留前导空格）
      return [' 1'];
    case 5: // 主观/问答
      return { content: '略', pics: [] };
    default:
      // 兜底：按单选处理
      return ['A'];
  }
}

function problemIdKey(problemId) {
  return problemId === undefined || problemId === null ? null : String(problemId);
}

function getProblemById(problemId) {
  const key = problemIdKey(problemId);
  if (!key) return null;
  return repo.problems.get(problemId)
    || repo.problems.get(key)
    || repo.problems.get(Number.isNaN(Number(key)) ? key : Number(key))
    || null;
}

function getProblemStatus(problemId) {
  const key = problemIdKey(problemId);
  if (!key) return null;
  return repo.problemStatus.get(problemId)
    || repo.problemStatus.get(key)
    || repo.problemStatus.get(Number.isNaN(Number(key)) ? key : Number(key))
    || null;
}

function getProblemRecoveryStore(lessonIdOverride = null) {
  const lessonId = lessonIdOverride || repo.currentLessonId;
  if (!lessonId) return null;
  const key = String(lessonId);
  if (!_problemRecoveryStore || _problemRecoveryLessonId !== key) {
    _problemRecoveryLessonId = key;
    _problemRecoveryStore = createProblemRecoveryStore({ storage, lessonId: key });
  }
  return _problemRecoveryStore;
}

function statusPhase(status) {
  if (status?.phase === 'queued' || status?.phase === 'answering' || status?.phase === 'failed') {
    return status.phase;
  }
  if (status?.answering) return 'answering';
  if (status?.done) return 'done';
  return 'queued';
}

function persistProblemStatus(problemId, status, problem = getProblemById(problemId)) {
  const store = getProblemRecoveryStore(status?.lessonId || repo.currentLessonId);
  if (!store || !status) return;
  if (status.done || problem?.result) {
    store.remove(problemId);
    return;
  }

  store.upsert({
    lessonId: status.lessonId || repo.currentLessonId,
    problemId: problemIdKey(problemId),
    presentationId: status.presentationId,
    slideId: status.slideId,
    startTime: status.startTime,
    endTime: status.endTime,
    phase: statusPhase(status),
    autoAnswerTime: status.autoAnswerTime,
    autoAnswerQueued: status.autoAnswerQueued === true,
    attempts: status.attempts,
    lastError: status.lastError,
    done: false,
  });
}

function statusFromRecoveryRecord(record) {
  const phase = record.phase === 'failed' ? 'failed' : 'queued';
  return {
    lessonId: record.lessonId || null,
    presentationId: record.presentationId,
    slideId: record.slideId,
    startTime: record.startTime,
    endTime: record.endTime,
    done: false,
    autoAnswerTime: null,
    answering: false,
    phase,
    autoAnswerQueued: record.autoAnswerQueued !== false,
    attempts: record.attempts || 0,
    lastError: record.lastError || '',
    recoveredFrom: record.phase,
    recoveryForceRetry: false,
  };
}

function createStatusForProblem(problem, { autoAnswerQueued = false } = {}) {
  return {
    presentationId: problem?.presentationId || null,
    slideId: problem?.slideId || null,
    lessonId: problem?.lessonId || null,
    startTime: problem?.startTime ?? null,
    endTime: problem?.endTime ?? null,
    done: !!problem?.result,
    autoAnswerTime: null,
    answering: false,
    phase: 'queued',
    autoAnswerQueued,
    attempts: 0,
    lastError: '',
    recoveryForceRetry: false,
  };
}

function ensureProblemStatus(problem, { autoAnswerQueued = false } = {}) {
  if (!problem?.problemId) return null;
  const pid = problemIdKey(problem.problemId);
  let status = getProblemStatus(pid);
  if (!status) {
    const recovered = getProblemRecoveryStore()?.get(pid);
    status = recovered
      ? statusFromRecoveryRecord(recovered)
      : createStatusForProblem(problem, { autoAnswerQueued });
    repo.problemStatus.set(pid, status);
  }
  return status;
}

function scheduleRecoveredStatus(status, decision, now = Date.now()) {
  if (!status || !decision?.recover) return;
  status.autoAnswerTime = now;
  status.recoveryForceRetry = !!decision.forceRetry;
  status.autoAnswerQueued = true;
  status.phase = 'queued';
}

function restorePendingProblemStatuses() {
  const store = getProblemRecoveryStore();
  if (!store) return 0;

  const now = Date.now();
  let restored = 0;
  for (const record of store.list()) {
    const problem = getProblemById(record.problemId);
    if (!problem) continue;
    if (record.done || record.phase === 'done' || problem.result) {
      store.remove(record.problemId);
      continue;
    }

    const status = statusFromRecoveryRecord(record);
    const decision = shouldRecoverProblem(record, {
      enabled: ui.config.autoRecoverUnanswered === true,
      recoverExpired: ui.config.autoRecoverExpired === true,
      now,
    });
    scheduleRecoveredStatus(status, decision, now);
    repo.problemStatus.set(record.problemId, status);
    if (decision.recover) persistProblemStatus(record.problemId, status, problem);
    restored++;
  }

  if (ui.config.autoScanUnanswered === true) {
    for (const encountered of repo.encounteredProblems || []) {
      const problem = getProblemById(encountered.problemId);
      const pid = problemIdKey(encountered.problemId);
      if (!problem || !pid || problem.result || getProblemStatus(pid)) continue;
      const status = createStatusForProblem({
        ...problem,
        presentationId: encountered.presentationId,
        slideId: encountered.slideId || encountered.slide?.id,
      }, { autoAnswerQueued: true });
      const decision = shouldRecoverProblem(status, {
        enabled: true,
        recoverExpired: ui.config.autoRecoverExpired === true,
        now,
      });
      scheduleRecoveredStatus(status, decision, now);
      repo.problemStatus.set(pid, status);
      if (decision.recover) persistProblemStatus(pid, status, problem);
      restored++;
    }
  }

  if (restored) ui.updateActiveProblems();
  return restored;
}

if (typeof window !== 'undefined') {
  window.addEventListener('ykt:auto-answer-config-changed', () => {
    restorePendingProblemStatuses();
  });
}

export function hasActiveAIProfile(aiCfg, selectedProfile = null) {
  if (selectedProfile) return !!selectedProfile.apiKey;
  const cfg = aiCfg || {};
  const profiles = Array.isArray(cfg.profiles) ? cfg.profiles : [];
  if (profiles.length > 0) {
    const activeId = cfg.activeProfileId;
    const p = profiles.find(x => x.id === activeId) || profiles[0];
    return !!(p && p.apiKey);
  }
  // 兼容旧版
  return !!cfg.kimiApiKey;
}

function selectAutoAnswerProfile(role = 'active', now = Date.now()) {
  const aiConfig = ui.config.ai || {};
  const candidate = selectAnswerProfile(aiConfig, {
    role,
    now,
    windows: ui.config.answerPriorityWindows,
    fastProfileId: ui.config.fastAnswerProfileId,
    verifyProfileId: ui.config.verifyAnswerProfileId,
  });
  // 快速 Profile 没有密钥时回退到当前 Profile，避免因误配而改用默认答案。
  if (role === 'fast' && !candidate?.apiKey) {
    const active = selectAnswerProfile(aiConfig, { role: 'active', now });
    if (active?.apiKey) return active;
  }
  return candidate;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function verifyAutoAnswer({
  problem,
  image,
  prompt,
  firstAnswer,
  firstRawAnswer,
  now,
}) {
  if (ui.config.answerVerification !== true) {
    return { answer: firstAnswer, aiAnswer: firstRawAnswer, state: 'disabled' };
  }

  const verifyProfileId = String(ui.config.verifyAnswerProfileId || '').trim();
  if (!verifyProfileId) {
    return { answer: firstAnswer, aiAnswer: firstRawAnswer, state: 'not-configured' };
  }

  const verifyProfile = selectAutoAnswerProfile('verify', now);
  if (!verifyProfile?.apiKey || String(verifyProfile.id) !== verifyProfileId) {
    return { answer: firstAnswer, aiAnswer: firstRawAnswer, state: 'unavailable' };
  }

  const delay = Math.max(0, Number(ui.config.answerVerificationDelay) || 0);
  if (delay > 0) await sleep(delay);

  const verificationPrompt = [
    prompt,
    '',
    '【快速模型候选答案】',
    JSON.stringify(firstAnswer),
    '',
    '请使用当前课件图片和题干独立复核候选答案。不要盲从候选答案；如果候选答案错误，请给出你认为正确的答案。',
    '必须按原题型要求输出，并包含“答案:”字段；只输出最终答案和必要的简短解释。',
  ].join('\n');

  const verifiedRawAnswer = await queryAIVision(
    image,
    verificationPrompt,
    ui.config.ai,
    {
      profileId: verifyProfile.id,
      problemType: problem.problemType,
    },
  );
  const verifiedAnswer = parseAIAnswer(problem, verifiedRawAnswer);
  if (!verifiedAnswer) {
    return { answer: firstAnswer, aiAnswer: firstRawAnswer, state: 'invalid' };
  }
  if (compareParsedAnswers(problem, firstAnswer, verifiedAnswer)) {
    return { answer: firstAnswer, aiAnswer: verifiedRawAnswer, state: 'confirmed' };
  }

  return {
    answer: verifiedAnswer,
    aiAnswer: verifiedRawAnswer,
    state: 'corrected',
  };
}

const autoAnswerRunner = createAutoAnswerRunner({
  typeMap: PROBLEM_TYPE_MAP,
  hasActiveProfile: hasActiveAIProfile,
  getAIConfig: () => ui.config.ai,
  getAnswerProfile: ({ role, now }) => selectAutoAnswerProfile(role, now),
  makeDefaultAnswer,
  captureSlideImage,
  captureProblemForVision,
  formatProblemForVision,
  queryAIVision,
  parseAIAnswer,
  submitAnswer,
  verifyAnswer: verifyAutoAnswer,
  onAnswered: (problem, result) => actions.onAnswerProblem(problem.problemId, result),
  onStatusChange: (status, problem) => persistProblemStatus(problem?.problemId, status, problem),
  notify: notifyAutoAnswer,
  toast: (message, timeout) => ui.toast(message, timeout),
  showPopup: showAutoAnswerPopup,
});

// 融合模式自动答题；force=true 用于刷新恢复和用户手动重试。
async function handleAutoAnswerInternal(problem, options = {}) {
  if (!problem?.problemId) return { ok: false, reason: 'missing-problem' };
  const status = options.status || getProblemStatus(problem.problemId);
  if (!status && !options.force) return { ok: false, reason: 'missing-status' };
  const ensuredStatus = status || ensureProblemStatus(problem, { autoAnswerQueued: false });
  return autoAnswerRunner.run(problem, ensuredStatus, {
    force: options.force === true,
    forceRetry: options.forceRetry === true,
    allowResubmit: options.allowResubmit === true,
    source: options.source || (options.force ? 'manual' : 'auto'),
    lessonId: options.lessonId || ensuredStatus.lessonId || repo.currentLessonId,
  });
}

export function startAutoAnswerLoop() {
  if (_autoLoopStarted) return;
  _autoLoopStarted = true;

  setInterval(() => {
    const now = Date.now();
    repo.problemStatus.forEach((status, pid) => {
      if (status.autoAnswerTime !== null && now >= status.autoAnswerTime) {
        const problem = getProblemById(pid);
        if (problem && !problem.result) {
          status.autoAnswerTime = null;
          persistProblemStatus(pid, status, problem);
          handleAutoAnswerInternal(problem, {
            status,
            force: status.recoveryForceRetry === true,
            forceRetry: status.recoveryForceRetry === true,
            source: status.recoveryForceRetry === true ? 'recovery' : 'auto',
          });
        }
      }
    });
  }, 500);
}

export const actions = {
  onFetchTimeline(timeline, options = {}) {
    for (const piece of Array.isArray(timeline) ? timeline : []) {
      if (piece?.type === 'problem') {
        this.onUnlockProblem(piece, { ...options, source: 'timeline' });
      }
    }
  },

  onPresentationLoaded(id, data) {
    repo.setPresentation(id, data);
    const pres = repo.presentations.get(id);
    for (const slide of pres?.slides || []) {
      repo.upsertSlide(slide);
      if (slide.problem) {
        repo.upsertProblem(slide.problem);
        repo.pushEncounteredProblem(slide.problem, slide, id);
      }
    }
    restorePendingProblemStatuses();
    ui.updatePresentationList();
  },

  onUnlockProblem(data, { notificationOnly = false, source = 'live', lessonId = null } = {}) {
    const isLiveUnlock = isLiveProblemSource(source);
    const payload = data && typeof data === 'object' ? data : {};
    const problemId = firstValue(
      payload.prob,
      payload.problemId,
      payload.problemid,
      payload.problem?.problemId,
      payload.problem?.id,
      payload.id,
    );
    const slideId = firstValue(payload.sid, payload.slideId, payload.slide?.id);
    const problem = getProblemById(problemId);
    const slide = repo.slides.get(slideId) || repo.slides.get(String(slideId));
    if (!problem || !slide) {
      if (notificationOnly && isLiveUnlock) return notifyProblemStart(payload, problem, slide, lessonId);
      console.log('[雨课堂助手][ERR][onUnlockProblem] 题目或幻灯片不存在');
      return false;
    }

    console.log(`[雨课堂助手][DBG][onUnlockProblem] ${isLiveUnlock ? '题目解锁' : '历史时间线题目状态恢复'}`);
    console.log('[雨课堂助手][DBG][onUnlockProblem] 题目ID:', problemId);
    console.log('[雨课堂助手][DBG][onUnlockProblem] 幻灯片ID:', slideId);
    console.log('[雨课堂助手][DBG][onUnlockProblem] 课件ID:', payload.pres);

    const pid = problemIdKey(problemId);
    const recoveryStore = getProblemRecoveryStore(lessonId || repo.currentLessonId);
    const recovered = recoveryStore?.get(pid);
    const previous = getProblemStatus(pid);
    const isFirstUnlock = !previous && !recovered;
    const status = previous || (recovered ? statusFromRecoveryRecord(recovered) : createStatusForProblem(problem, {
      autoAnswerQueued: isLiveUnlock && !!ui.config.autoAnswer,
    }));

    status.presentationId = payload.pres ?? status.presentationId;
    status.slideId = slideId ?? status.slideId;
    status.lessonId = lessonId ? String(lessonId) : (status.lessonId || repo.currentLessonId || null);
    status.startTime = payload.dt ?? status.startTime;
    status.endTime = getProblemEndTime(payload.dt, payload.limit) ?? status.endTime ?? null;
    status.done = !!problem.result;
    status.answering = !!status.answering;
    status.phase = statusPhase(status);
    status.autoAnswerTime = status.autoAnswerTime ?? null;
    status.autoAnswerQueued = isFirstUnlock
      ? isLiveUnlock && !!ui.config.autoAnswer
      : status.autoAnswerQueued !== false;
    // 刷新恢复的过期任务可能已经排队等待 /retry；重复解锁事件不能清掉这个标记。
    status.recoveryForceRetry = status.recoveryForceRetry === true;
    const expired = Number.isFinite(status.endTime) && Date.now() >= status.endTime;
    if (expired && ui.config.autoForceRetry === true) status.recoveryForceRetry = true;
    repo.problemStatus.set(pid, status);
    if (isLiveUnlock) persistProblemStatus(pid, status, problem);

    if (problem.result) {
      console.log('[雨课堂助手][WARN][onUnlockProblem] 题目已作答，跳过自动流程');
      recoveryStore?.remove(pid);
      return false;
    }

    // fetchtimeline replays historical slides when navigating/reloading.  It
    // may hydrate status for the active-problem UI, but it must not look like a
    // newly published question or queue an automatic answer.
    if (!isLiveUnlock) {
      ui.updateActiveProblems();
      return false;
    }

    const notified = notifyProblemStart(payload, problem, slide, lessonId);
    if (notificationOnly) return notified;

    if (expired && ui.config.autoForceRetry !== true) {
      console.log('[雨课堂助手][WARN][onUnlockProblem] 题目已过期，未开启自动强制补交');
      ui.updateActiveProblems();
      return notified;
    }

    if (ui.config.autoAnswer && status.autoAnswerQueued && !status.answering && status.phase !== 'failed' && status.autoAnswerTime === null) {
      const delay = expired
        ? 0
        : ui.config.autoAnswerDelay + randInt(0, ui.config.autoAnswerRandomDelay);
      status.autoAnswerTime = Date.now() + delay;
      
      console.log(`[雨课堂助手][INFO][onUnlockProblem] 将在 ${Math.floor(delay / 1000)} 秒后自动作答`);
      ui.toast(`将在 ${Math.floor(delay / 1000)} 秒后使用融合模式自动作答`, 3000);
      notifyAutoAnswer('auto-answer-scheduled', problem, `将在约 ${Math.floor(delay / 1000)} 秒后开始自动作答。`);
      persistProblemStatus(pid, status, problem);
    }
    
    ui.updateActiveProblems();
    return notified;
  },

  onPublishEvent(event, { lessonId = null } = {}) {
    const contextualEvent = {
      ...event,
      lessonId: event?.lessonId || (lessonId ? String(lessonId) : null),
      currentLessonId: repo.currentLessonId,
      currentPresentationId: repo.currentPresentationId,
    };
    if (isCurrentPublishEvent(contextualEvent, contextualEvent)) {
      console.log('[雨课堂助手][INFO][Publish] 忽略当前正在查看的课件发布事件:', {
        lessonId: contextualEvent.lessonId,
        presentationId: contextualEvent.presentationId || contextualEvent.entityId,
      });
      return false;
    }
    const notified = publishReminder.handle(contextualEvent, ui.config);
    if (notified) {
      console.log('[雨课堂助手][INFO][Publish] 已提醒发布事件:', contextualEvent.category, contextualEvent.dedupeKey);
    }
    return notified;
  },

  async onDanmu(data, options = {}) {
    const pageLessonId = currentPageLessonId();
    const messageLessonId = options.lessonId ? String(options.lessonId) : null;
    if (messageLessonId && pageLessonId && messageLessonId !== pageLessonId) {
      return { handled: true, triggered: false, reason: 'non-current-lesson', lessonId: messageLessonId };
    }
    if (messageLessonId && !pageLessonId) {
      return { handled: true, triggered: false, reason: 'non-current-lesson', lessonId: messageLessonId };
    }

    const lessonId = messageLessonId || pageLessonId || repo.currentLessonId || '__current__';
    const result = await getDanmuFollowController(lessonId).handle(data, options);
    if (result.triggered) {
      if (result.sendResult?.sent) {
        console.log('[雨课堂助手][INFO][DanmuFollow] 已自动跟发:', result.text, {
          count: result.count,
          sentCount: result.sentCount,
        });
      } else {
        console.warn('[雨课堂助手][WARN][DanmuFollow] 达到跟发条件，但发送失败:', result.text, result.sendResult);
      }
    }
    return result;
  },

  onLessonFinished({ lessonId = null } = {}) {
    const eventLessonId = lessonId ? String(lessonId) : repo.currentLessonId;
    return ui.notifyClassroomEvent({
      kind: 'lesson-finished',
      dedupeKey: `lesson-finished:${eventLessonId || Date.now()}`,
      title: '下课提示',
      detail: eventLessonId && eventLessonId !== repo.currentLessonId
        ? `课堂 ${eventLessonId} 已结束。`
        : '当前课程已结束。',
    });
  },

  onAnswerProblem(problemId, result) {
    const p = getProblemById(problemId);
    if (p) {
      p.result = result;
      const i = repo.encounteredProblems.findIndex(e => String(e.problemId) === String(problemId));
      if (i !== -1) repo.encounteredProblems[i].result = result;
      const status = getProblemStatus(problemId);
      if (status) {
        status.done = true;
        status.answering = false;
        status.phase = 'done';
        status.autoAnswerTime = null;
      }
      getProblemRecoveryStore()?.remove(problemId);
      ui.updateProblemList();
    }
  },

  async handleAutoAnswer(problem, options = {}) {
    const resolved = getProblemById(problem?.problemId) || problem;
    if (!resolved?.problemId) return { ok: false, reason: 'missing-problem' };
    const status = options.status || ensureProblemStatus(resolved, {
      autoAnswerQueued: options.force !== true,
    });
    return handleAutoAnswerInternal(resolved, { ...options, status });
  },

  async forceAIAnswer(problemId, options = {}) {
    const problem = getProblemById(problemId);
    if (!problem) return { ok: false, reason: 'missing-problem' };
    const status = ensureProblemStatus(problem, { autoAnswerQueued: false });
    if (!status) return { ok: false, reason: 'missing-status' };
    return handleAutoAnswerInternal(problem, {
      ...options,
      status,
      force: true,
      source: 'manual',
    });
  },

  tickAutoAnswer() {
    const now = Date.now();
    for (const [pid, status] of repo.problemStatus) {
      if (status.autoAnswerTime !== null && now >= status.autoAnswerTime) {
        const p = getProblemById(pid);
        if (p) {
          status.autoAnswerTime = null;
          persistProblemStatus(pid, status, p);
          this.handleAutoAnswer(p, {
            status,
            force: status.recoveryForceRetry === true,
            forceRetry: status.recoveryForceRetry === true,
            source: status.recoveryForceRetry === true ? 'recovery' : 'auto',
          });
        }
      }
    }
  },

  async submit(problem, content) {
    const result = this.parseManual(problem.problemType, content);
    await submitAnswer(problem, result,{
      lessonId: repo.currentLessonId,
      autoGate: false  // 手动提交
    });
    this.onAnswerProblem(problem.problemId, result);
  },

  async submitParsedAnswer(problem, result, { forceRetry = false } = {}) {
    const resolved = getProblemById(problem?.problemId) || problem;
    if (!resolved?.problemId) return { ok: false, reason: 'missing-problem' };
    const status = ensureProblemStatus(resolved, { autoAnswerQueued: false });
    if (!status) return { ok: false, reason: 'missing-status' };
    persistProblemStatus(resolved.problemId, status, resolved);
    const submission = await submitAnswer(
      resolved,
      result,
      buildAnswerSubmitOptions(status, {
        lessonId: repo.currentLessonId,
        forceRetry,
      }),
    );
    this.onAnswerProblem(resolved.problemId, result);
    return { ok: true, ...submission };
  },

  parseManual(problemType, content) {
    switch (problemType) {
      case 1: case 2: case 3: return content.split('').sort();
      case 4: return content.split('\n').filter(Boolean);
      case 5: return { content, pics: [] };
      default: return null;
    }
  },

  navigateTo(presId, slideId) {
    repo.currentPresentationId = presId;
    repo.currentSlideId = slideId;
    ui.updateSlideView();
    ui.showPresentationPanel(true);
  },

  launchLessonHelper() {
    const path = window.location.pathname;
    const m = path.match(/\/lesson\/fullscreen\/v3\/([^/]+)/);
    const nextLessonId = m ? m[1] : null;
    if (repo.currentLessonId !== nextLessonId) {
      const previousKey = String(repo.currentLessonId || '__current__');
      danmuFollowControllers.get(previousKey)?.reset();
      danmuFollowControllers.delete(previousKey);
    }
    repo.currentLessonId = nextLessonId;
    if (repo.currentLessonId) {
      console.log(`[雨课堂助手][DBG] 检测到课堂页面 lessonId: ${repo.currentLessonId}`);
    }

    if (typeof window.GM_getTab === 'function' && typeof window.GM_saveTab === 'function' && repo.currentLessonId) {
      window.GM_getTab((tab) => {
        tab.type = 'lesson';
        tab.lessonId = repo.currentLessonId;
        window.GM_saveTab(tab);
      });
    }
    repo.loadStoredPresentations();
    restorePendingProblemStatuses();
    this.maybeStartAutoJoin();           
    this.installRouterRearm();            
    void screenWakeLock.setEnabled(ui.config.keepScreenAwake);
  },
  
  startAutoAnswerLoop() {
    return startAutoAnswerLoop();
  },

  restorePendingProblemStatuses() {
    return restorePendingProblemStatuses();
  },

  // 自动进入课堂
  startAutoJoinLoop() {
    if (_autoJoinStarted) return;
    _autoJoinStarted = true;
    repo.autoJoinRunning = true;

    const loop = async () => {
      if (!repo.autoJoinRunning) return;
      try {
        const list = await getOnLesson();
        const snapshot = syncActiveLessons([...repo.activeLessons.values()], list);
        repo.activeLessons.clear();
        for (const item of snapshot.active) repo.activeLessons.set(item.lessonId, item);

        for (const staleLessonId of snapshot.removed) {
          const staleSocket = repo.lessonSockets.get(staleLessonId);
          repo.markLessonDisconnected(staleLessonId, 'inactive');
          try { staleSocket?.close?.(); } catch {}
        }

        // 每个 status===1 的课堂都独立建立或复用连接。
        for (const it of snapshot.active) {
          const lessonId = getLessonId(it);
          if (repo.isLessonConnected(lessonId)) continue; // 已有连接

          console.log('[雨课堂助手][INFO][AutoJoin] 检测到正在上课的课堂，准备进入:', lessonId);
          try {
            const { token, setAuth } = await checkinClass(lessonId);
            if (!token) {
              console.warn('[雨课堂助手][WARN][AutoJoin] 未获取到 lessonToken，跳过:', lessonId);
              continue;
            }
            connectOrAttachLessonWS({ lessonId, auth: token });
            // 标记该课堂为“自动进入”
            repo.markLessonAutoJoined(lessonId, true);
            if (ui.config.autoAnswerOnAutoJoin) {
              repo.forceAutoAnswerLessons.add(lessonId);
            }
          } catch (e) {
            console.error('[雨课堂助手][ERR][AutoJoin] 进入课堂失败:', lessonId, e);
          }
        }
      } catch (e) {
          console.error('[雨课堂助手][ERR][AutoJoin] 拉取正在上课失败:', e);
      } finally {
        setTimeout(loop, 5000);
      }
    };
    loop();
  },

  stopAutoJoinLoop() {
    repo.autoJoinRunning = false;
    _navigationArbiter?.cancel();
    if (_autoJumpRetryTimer !== null) {
      clearTimeout(_autoJumpRetryTimer);
      _autoJumpRetryTimer = null;
    }
  },

  /** 统一判断并启动自动加入链路（可多次调用，内部防重） */
  maybeStartAutoJoin() {
    if (!ui.config.autoJoinEnabled) return;
    this.startAutoJoinLoop();
    this.startAutoClickOnOnLessonBar();
  },

  /** 前端路由变化时，重新检查并挂载自动加入 */
  installRouterRearm() {
    if (_routerHooked) return;
    _routerHooked = true;
    const uw = (gm && gm.uw) ? gm.uw : (window.unsafeWindow || window);
    const rearm = ({ userIntent = true } = {}) => {
      // 任何站内路由变化都视为用户已经做出选择；自动跳转只拥有当前页面的
      // 一次机会，不能在用户切换课件后再次抢回导航权。
      if (userIntent) _navigationArbiter?.observeUserIntent();
      // 重置一次“onlesson 点击守卫”的进行中标记，避免被卡住
      _autoOnLessonClickInProgress = false;
      // 每次路由变更都尝试启动（内部有防重，所以安全）
      this.maybeStartAutoJoin();
      void screenWakeLock.sync();
    };
    const wrap = (obj, key) => {
      const orig = obj[key];
      obj[key] = function (...args) {
        const ret = orig.apply(this, args);
        try { rearm(); } catch {}
        return ret;
      };
    };
    wrap(uw.history, 'pushState');
    wrap(uw.history, 'replaceState');
    uw.addEventListener('popstate', rearm);
    uw.addEventListener('visibilitychange', () => {
      if (!document.hidden) rearm({ userIntent: false });
    });
  },

  // ===== 自动跳转“正在上课”课堂：先给用户十秒选择时间 =====
  startAutoClickOnOnLessonBar() {
    if (_autoOnLessonClickStarted) return;

    // 仅在非课堂页（首页/课表页等）生效
    if (/\/lesson\//.test(location.pathname)) return;
    _autoOnLessonClickStarted = true;

    const uw = (gm && gm.uw) ? gm.uw : (window.unsafeWindow || window);

    _navigationArbiter = createNavigationArbiter({
      waitMs: 10_000,
      navigate: target => {
        console.log('[雨课堂助手][INFO][AutoJoin] 十秒内无用户操作，自动进入最新课堂:', target);
        (uw.location || location).assign(target);
      },
    });

    const cancelAutomaticNavigation = (event) => {
      // 脚本内部的合成事件不能夺走用户的导航选择权；真实输入才算用户操作。
      if (event?.isTrusted === false) return;
      if (_navigationArbiter.observeUserIntent()) {
        console.log('[雨课堂助手][INFO][AutoJoin] 检测到用户操作，取消自动跳转');
      }
      if (_autoJumpRetryTimer !== null) {
        clearTimeout(_autoJumpRetryTimer);
        _autoJumpRetryTimer = null;
      }
    };

    const doc = uw.document || document;
    for (const eventName of ['pointerdown', 'mousedown', 'touchstart', 'keydown', 'wheel']) {
      doc.addEventListener(eventName, cancelAutomaticNavigation, {
        capture: true,
        passive: eventName === 'wheel' || eventName === 'touchstart',
      });
    }

    async function offerLatestClassroom() {
      if (_autoOnLessonClickInProgress || _navigationArbiter.userHasIntent || _navigationArbiter.hasPending) {
        return false;
      }
      _autoOnLessonClickInProgress = true;
      try {
        const list = await getOnLesson();
        const latest = pickLatestActiveLesson(list);
        if (!latest) {
          console.log('[雨课堂助手][INFO][AutoJoin] 当前没有 status=1 的活跃课堂，暂不跳转');
          return false;
        }

        const lessonId = getLessonId(latest);
        const target = `/lesson/fullscreen/v3/${lessonId}`;
        const currentPath = (uw.location || location).pathname;
        if (currentPath === target) return true;

        const offered = _navigationArbiter.offer(target);
        if (offered) {
          console.log('[雨课堂助手][INFO][AutoJoin] 已找到最新活跃课堂，等待十秒确认:', lessonId);
        }
        return offered;
      } catch (error) {
        console.warn('[雨课堂助手][WARN][AutoJoin][API] 获取最新活跃课堂失败:', error);
        return false;
      } finally {
        _autoOnLessonClickInProgress = false;
      }
    }

    const retryOffer = () => {
      if (_navigationArbiter.userHasIntent || _navigationArbiter.hasPending || /\/lesson\//.test((uw.location || location).pathname)) {
        _autoJumpRetryTimer = null;
        return;
      }
      _autoJumpRetryTimer = setTimeout(async () => {
        _autoJumpRetryTimer = null;
        const offered = await offerLatestClassroom();
        if (!offered) retryOffer();
      }, 5000);
    };

    void offerLatestClassroom().then(offered => {
      if (!offered) retryOffer();
    });
  },
};
