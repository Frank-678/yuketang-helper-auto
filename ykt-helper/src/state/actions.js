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
import { getProblemEndTime } from './problem-timing.js';
import { createProblemRecoveryStore, shouldRecoverProblem } from './auto-answer-recovery.js';
import { createAutoAnswerRunner } from './auto-answer-runner.js';
import { buildAnswerSubmitOptions } from './answer-editor.js';
import { createDanmuFollowController } from '../core/danmu-follow.js';
import { sendDanmuText } from '../core/danmu-sender.js';

let _autoLoopStarted = false;
let _autoJoinStarted = false;
let _autoOnLessonClickStarted = false;
let _autoOnLessonClickInProgress = false;
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

function createDanmuFollowControllerForLesson() {
  return createDanmuFollowController({
    enabled: () => ui.config.autoFollowDanmu === true,
    getCurrentUserId: getCurrentUserIdSafe,
    send: text => sendDanmuText(text, {
      root: (gm.uw || window).document || document,
    }),
  });
}

function getDanmuFollowController(lessonId) {
  const key = String(lessonId || '__current__');
  let controller = danmuFollowControllers.get(key);
  if (!controller) {
    controller = createDanmuFollowControllerForLesson();
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

function notifyProblemStart(data, problem, slide) {
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
    dedupeKey: `problem-start:${problemId || payload.sid || payload.dt || 'unknown'}`,
    title: '习题已发布',
    nativeTitle: '雨课堂习题提示',
    detail,
    problem,
    slide,
  }, ui.config);
}

function notifyAutoAnswer(kind, problem, detail) {
  const [title, defaultDetail] = AUTO_ANSWER_EVENT_META[kind] || ['自动作答提示', '自动作答状态发生变化。'];
  return ui.notifyClassroomEvent({
    kind,
    dedupeKey: `${kind}:${problem?.problemId || Date.now()}`,
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

function getProblemRecoveryStore() {
  const lessonId = repo.currentLessonId;
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
  const store = getProblemRecoveryStore();
  if (!store || !status) return;
  if (status.done || problem?.result) {
    store.remove(problemId);
    return;
  }

  store.upsert({
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

export function hasActiveAIProfile(aiCfg) {
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

const autoAnswerRunner = createAutoAnswerRunner({
  typeMap: PROBLEM_TYPE_MAP,
  hasActiveProfile,
  getAIConfig: () => ui.config.ai,
  makeDefaultAnswer,
  captureSlideImage,
  captureProblemForVision,
  formatProblemForVision,
  queryAIVision,
  parseAIAnswer,
  submitAnswer,
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
    lessonId: repo.currentLessonId,
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
      if (piece?.type === 'problem') this.onUnlockProblem(piece, options);
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

  onUnlockProblem(data, { notificationOnly = false } = {}) {
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
      if (notificationOnly) return notifyProblemStart(payload, problem, slide);
      console.log('[雨课堂助手][ERR][onUnlockProblem] 题目或幻灯片不存在');
      return false;
    }

    console.log('[雨课堂助手][DBG][onUnlockProblem] 题目解锁');
    console.log('[雨课堂助手][DBG][onUnlockProblem] 题目ID:', problemId);
    console.log('[雨课堂助手][DBG][onUnlockProblem] 幻灯片ID:', slideId);
    console.log('[雨课堂助手][DBG][onUnlockProblem] 课件ID:', payload.pres);

    const pid = problemIdKey(problemId);
    const recoveryStore = getProblemRecoveryStore();
    const recovered = recoveryStore?.get(pid);
    const previous = getProblemStatus(pid);
    const isFirstUnlock = !previous && !recovered;
    const status = previous || (recovered ? statusFromRecoveryRecord(recovered) : createStatusForProblem(problem, {
      autoAnswerQueued: !!ui.config.autoAnswer,
    }));

    status.presentationId = payload.pres ?? status.presentationId;
    status.slideId = slideId ?? status.slideId;
    status.startTime = payload.dt ?? status.startTime;
    status.endTime = getProblemEndTime(payload.dt, payload.limit) ?? status.endTime ?? null;
    status.done = !!problem.result;
    status.answering = !!status.answering;
    status.phase = statusPhase(status);
    status.autoAnswerTime = status.autoAnswerTime ?? null;
    status.autoAnswerQueued = isFirstUnlock
      ? !!ui.config.autoAnswer
      : status.autoAnswerQueued !== false;
    // 刷新恢复的过期任务可能已经排队等待 /retry；重复解锁事件不能清掉这个标记。
    status.recoveryForceRetry = status.recoveryForceRetry === true;
    repo.problemStatus.set(pid, status);
    persistProblemStatus(pid, status, problem);

    if ((Number.isFinite(status.endTime) && Date.now() >= status.endTime) || problem.result) {
      console.log('[雨课堂助手][WARN][onUnlockProblem] 题目已过期或已作答，跳过');
      if (problem.result) recoveryStore?.remove(pid);
      return;
    }

    const notified = notifyProblemStart(payload, problem, slide);
    if (notificationOnly) return notified;

    if (ui.config.autoAnswer && status.autoAnswerQueued && !status.answering && status.phase !== 'failed' && status.autoAnswerTime === null) {
      const delay = ui.config.autoAnswerDelay + randInt(0, ui.config.autoAnswerRandomDelay);
      status.autoAnswerTime = Date.now() + delay;
      
      console.log(`[雨课堂助手][INFO][onUnlockProblem] 将在 ${Math.floor(delay / 1000)} 秒后自动作答`);
      ui.toast(`将在 ${Math.floor(delay / 1000)} 秒后使用融合模式自动作答`, 3000);
      notifyAutoAnswer('auto-answer-scheduled', problem, `将在约 ${Math.floor(delay / 1000)} 秒后开始自动作答。`);
      persistProblemStatus(pid, status, problem);
    }
    
    ui.updateActiveProblems();
    return notified;
  },

  onPublishEvent(event) {
    const notified = publishReminder.handle(event, ui.config);
    if (notified) {
      console.log('[雨课堂助手][INFO][Publish] 已提醒发布事件:', event.category, event.dedupeKey);
    }
    return notified;
  },

  onDanmu(data, options = {}) {
    const pageLessonId = currentPageLessonId();
    const messageLessonId = options.lessonId ? String(options.lessonId) : null;
    if (messageLessonId && pageLessonId && messageLessonId !== pageLessonId) {
      return { handled: true, triggered: false, reason: 'non-current-lesson', lessonId: messageLessonId };
    }
    if (messageLessonId && !pageLessonId) {
      return { handled: true, triggered: false, reason: 'non-current-lesson', lessonId: messageLessonId };
    }

    const lessonId = messageLessonId || pageLessonId || repo.currentLessonId || '__current__';
    const result = getDanmuFollowController(lessonId).handle(data, options);
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

  onLessonFinished() {
    return ui.notifyClassroomEvent({
      kind: 'lesson-finished',
      dedupeKey: `lesson-finished:${repo.currentLessonId || Date.now()}`,
      title: '下课提示',
      detail: '当前课程已结束。',
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
        // 期望结构：每项至少含 { lessonId, status }，其中 status==1 表示正在上课
        for (const it of list) {
          const lessonId = it.lessonId || it.lesson_id || it.id;
          const status = it.status;
          if (!lessonId || status !== 1) continue;
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
    const rearm = () => {
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
    uw.addEventListener('visibilitychange', () => { if (!document.hidden) rearm(); });
  },

  // ===== 自动点击“正在上课”条：无需预先拿 lesson_id，复用官方路由逻辑 =====
  startAutoClickOnOnLessonBar() {
    if (_autoOnLessonClickStarted) return;
    _autoOnLessonClickStarted = true;

    // 仅在非课堂页（首页/课表页等）生效
    if (/\/lesson\//.test(location.pathname)) return;

    const uw = (gm && gm.uw) ? gm.uw : (window.unsafeWindow || window);

    async function tryApiJumpFirst() {
      if (_autoOnLessonClickInProgress) return false;
      _autoOnLessonClickInProgress = true;
      try {
        const list = await getOnLesson();              // ← 强化后的版本
        const arr = Array.isArray(list) ? list : [];
        // A) 严格：status===1
        let on = arr.find(x => (x?.status === 1) && (x.lessonId || x.lesson_id || x.id));
        // B) 回退：没有严格匹配，但有 lessonId 就用第一条
        if (!on) {
          const withId = arr.find(x => (x && (x.lessonId || x.lesson_id || x.id)));
          if (withId) {
            console.warn('[雨课堂助手][WARN][AutoJoin][API] 没有 status===1，但存在 lessonId，使用回退项：', {
              status: withId.status,
              keys: Object.keys(withId || {}),
              sample: withId
            });
            on = withId;
          }
        }
        if (!on) {
          // 详细日志：环境、主机、列表长度与前 3 项
          try {
            console.warn('[雨课堂助手][ERR][AutoJoin][API] EMPTY on-lesson list', {
              host: location.hostname,
              path: location.pathname,
              length: Array.isArray(list) ? list.length : -1,
              sample: Array.isArray(list) ? list.slice(0, 3) : list
            });
          } catch {}
          _autoOnLessonClickInProgress = false; 
          return false;
        }
        const lessonId = on.lessonId || on.lesson_id || on.id;
        let target = null;
        
        if (lessonId) target = `/lesson/fullscreen/v3/${lessonId}`;
        else     target = `/v2/web/lesson/${lessonId}`; 
        if (location.pathname === target) { _autoOnLessonClickInProgress = false; return true; }

        // 为了少日志，先 replace 再 assign（站内有时也会 push /index）
        history.replaceState(null, '', location.href);
        location.assign(target);
        return true;
      } catch (e) {
        console.warn('[雨课堂助手][ERR][AutoJoin][API] 跳转失败：', e, {
          host: location.hostname,
          path: location.pathname
        });
        _autoOnLessonClickInProgress = false;
        return false;
      }
    }

    function attachGuardAndTrigger(root = uw.document) {
      const bar = root.querySelector('.onlesson .jump_lesson__bar');
      if (!bar || bar.__ykt_guard_bound__) return false;
      if (_autoOnLessonClickInProgress) return false;

      bar.__ykt_guard_bound__ = true;
      console.log('[雨课堂助手][INFO][AutoJoin][DOM] 发现 onlesson 条，接管点击（捕获阶段）');

      const handler = async (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation?.();
        ev.stopPropagation();
        if (_autoOnLessonClickInProgress) return;

        // 延时阶梯：考虑 WS 刚推完 banner 但接口还没更新
        const delays = [0, 250, 600, 1200, 2000, 3000];
        for (const d of delays) {
          if (d) await new Promise(r => setTimeout(r, d));
          if (await tryApiJumpFirst()) return;
        }
        console.warn('[雨课堂助手][WARN][AutoJoin][DOM] on-lesson 接口仍为空，放弃本次点击');
        try {
          console.group('%c[AutoJoin][DOM] on-lesson 仍为空，放弃本次点击', 'color:#f60');
          console.log('env:', { host: location.hostname, path: location.pathname, href: location.href });
          console.log('retryDelays(ms):', delays);
          console.log('hint:', '可能是域/路径不匹配、会话未带上、或 WS/接口不同步导致。请展开上方 [getOnLesson] 折叠日志查看每个候选 URL 的状态与响应片段。');
          console.groupEnd();
        } catch {}
      };

      bar.addEventListener('click', handler, { capture: true });
      // 触发一次我们自己的 click（优先进入捕获处理器）
      try {
        const W = bar.ownerDocument?.defaultView || uw;
        const ClickEvt = W.MouseEvent || uw.MouseEvent;
        bar.dispatchEvent(new ClickEvt('click', { bubbles: true, cancelable: true, view: W }));
      } catch (e) {
        // 兜底：部分环境对 MouseEvent 构造器有限制
        try { bar.click(); } catch (_) {}
      }
      return true;
    }

    // A) 首选：直接 API 跳转（若此时就能拿到 on-lesson，就不必等 DOM）
    tryApiJumpFirst().then((ok) => {
      if (ok) return;
      // B) DOM 渲染后接管点击
      if (attachGuardAndTrigger()) return;
      const mo = new uw.MutationObserver(() => {
        if (attachGuardAndTrigger()) { mo.disconnect(); return; }
      });
      mo.observe(uw.document.documentElement, { childList: true, subtree: true });
      // setTimeout(() => mo.disconnect(), 10000);
    });
  },
};
