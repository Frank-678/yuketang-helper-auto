// src/state/actions.js
import { PROBLEM_TYPE_MAP } from '../core/types.js';
import { randInt, gm } from '../core/env.js'
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
import { compareParsedAnswers, isWithinAnswerPriorityWindow, selectAnswerProfile } from '../core/answer-priority.js';
import { getProblemEndTime } from './problem-timing.js';
import { createDanmuFollowController } from '../core/danmu-follow.js';
import { sendDanmuText } from '../core/danmu-sender.js';
import { syncActiveLessons, getLessonId } from '../core/active-lessons.js';
import { createNavigationArbiter, pickLatestActiveLesson } from '../core/navigation-arbiter.js';

let _autoLoopStarted = false;
let _autoJoinStarted = false;
let _autoOnLessonClickStarted = false;
let _autoOnLessonClickInProgress = false;
let _navigationArbiter = null;
let _autoJumpRetryTimer = null;
let _routerHooked = false;
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

function selectAutoAnswerProfile(role = 'active', now = Date.now()) {
  const aiConfig = ui.config.ai || {};
  return selectAnswerProfile(aiConfig, {
    role,
    now,
    windows: ui.config.answerPriorityWindows,
    fastProfileId: ui.config.fastAnswerProfileId,
    verifyProfileId: ui.config.verifyAnswerProfileId,
  });
}

function getUsableAutoAnswerProfile(role, now = Date.now()) {
  const candidate = selectAutoAnswerProfile(role, now);
  if (candidate?.apiKey) return candidate;

  const active = selectAutoAnswerProfile('active', now);
  return active?.apiKey ? active : candidate;
}

function hasSelectedAIProfile(profile, aiCfg) {
  return !!profile?.apiKey || (!Array.isArray(aiCfg?.profiles) && !!aiCfg?.kimiApiKey);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function verifyAutoAnswer({ problem, imageBase64, textPrompt, firstAnswer, firstRawAnswer, status, forceRetry }) {
  if (ui.config.answerVerification !== true) {
    return { answer: firstAnswer, rawAnswer: firstRawAnswer, state: 'disabled' };
  }

  const verifyProfileId = String(ui.config.verifyAnswerProfileId || '').trim();
  if (!verifyProfileId) {
    return { answer: firstAnswer, rawAnswer: firstRawAnswer, state: 'not-configured' };
  }

  const verifyProfile = selectAutoAnswerProfile('verify');
  if (!verifyProfile?.apiKey || String(verifyProfile.id) !== verifyProfileId) {
    return { answer: firstAnswer, rawAnswer: firstRawAnswer, state: 'unavailable' };
  }

  const delay = Math.max(0, Number(ui.config.answerVerificationDelay) || 0);
  if (delay > 0) await sleep(delay);

  const verificationPrompt = [
    textPrompt,
    '',
    '【快速模型候选答案】',
    JSON.stringify(firstAnswer),
    '',
    '请使用当前课件图片和题干独立复核候选答案。不要盲从候选答案；如果候选答案错误，请给出你认为正确的答案。',
    '必须按原题型要求输出，并包含“答案:”字段；只输出最终答案和必要的简短解释。',
  ].join('\n');

  const verifiedRawAnswer = await queryAIVision(
    imageBase64,
    verificationPrompt,
    ui.config.ai,
    {
      profileId: verifyProfile.id,
      problemType: problem.problemType,
    },
  );
  const verifiedAnswer = parseAIAnswer(problem, verifiedRawAnswer);
  if (!verifiedAnswer) {
    return { answer: firstAnswer, rawAnswer: firstRawAnswer, state: 'invalid' };
  }
  if (compareParsedAnswers(problem, firstAnswer, verifiedAnswer)) {
    return { answer: firstAnswer, rawAnswer: verifiedRawAnswer, state: 'confirmed' };
  }

  await submitAnswer(problem, verifiedAnswer, {
    startTime: status.startTime,
    endTime: status.endTime,
    forceRetry,
    lessonId: status.lessonId || repo.currentLessonId,
  });
  return { answer: verifiedAnswer, rawAnswer: verifiedRawAnswer, state: 'corrected' };
}

// 融合模式自动答题
async function handleAutoAnswerInternal(problem, { forceRetry = false } = {}) {
  const status = repo.problemStatus.get(problem.problemId);
  if (!status || status.answering || problem.result) {
    console.log('[AutoAnswer] 跳过：', {
      hasStatus: !!status,
      answering: status?.answering,
      hasResult: !!problem.result
    });
    return;
  }
  
  const expired = Number.isFinite(status.endTime) && Date.now() >= status.endTime;
  const shouldForceRetry = forceRetry === true || (expired && ui.config.autoForceRetry === true);
  if (expired && !shouldForceRetry) {
    console.log('[雨课堂助手][WARN][AutoAnswer] 跳过：已超时');
    return;
  }

  status.answering = true;
  notifyAutoAnswer('auto-answer-started', problem);

  try {
    console.log('[雨课堂助手][INFO][AutoAnswer] =================================');
    console.log('[雨课堂助手][INFO][AutoAnswer] 开始自动答题');
    console.log('[雨课堂助手][INFO][AutoAnswer] 题目ID:', problem.problemId);
    console.log('[雨课堂助手][INFO][AutoAnswer] 题目类型:', PROBLEM_TYPE_MAP[problem.problemType]);
    console.log('[雨课堂助手][INFO][AutoAnswer] 题目内容:', problem.body?.slice(0, 50) + '...');
    
    const answerNow = Date.now();
    const priorityWindow = isWithinAnswerPriorityWindow(answerNow, ui.config.answerPriorityWindows);
    const answerProfile = getUsableAutoAnswerProfile(priorityWindow ? 'fast' : 'active', answerNow);
    const hasAnswerAI = hasSelectedAIProfile(answerProfile, ui.config.ai);
    console.log('[雨课堂助手][INFO][AutoAnswer] 答题模型:', {
      profileId: answerProfile?.id || 'legacy/default',
      priorityWindow,
      verificationEnabled: ui.config.answerVerification === true,
    });

    if (!hasAnswerAI) {
    // ✅ 无 API Key：使用本地默认答案直接提交，确保流程不中断
    // 
      const parsed = makeDefaultAnswer(problem);
      console.log('[雨课堂助手][WARN][AutoAnswer] 无 API Key，使用本地默认答案:', JSON.stringify(parsed));

      // 提交答案（根据时限自动选择 answer/retry 逻辑）
      await submitAnswer(problem, parsed, {
        startTime: status.startTime,
        endTime: status.endTime,
        forceRetry: shouldForceRetry,
        lessonId: status.lessonId || repo.currentLessonId,
      });

      // 更新状态与UI
      actions.onAnswerProblem(problem.problemId, parsed);
      status.done = true;
      status.answering = false;
      notifyAutoAnswer('auto-answer-succeeded', problem, '这道题已使用本地默认答案提交。');

      ui.toast('使用默认答案完成作答（未配置 API Key）', 3000);
      showAutoAnswerPopup(problem, '（本地默认答案：无 API Key）');

      console.log('[雨课堂助手][INFO][AutoAnswer] 默认答案提交流程结束');
      return; // 提前返回，避免继续走图像+AI流程
    }

    const slideId = status.slideId;
    console.log('[雨课堂助手][INFO][AutoAnswer] 题目所在幻灯片:', slideId);
    console.log('[雨课堂助手][INFO][AutoAnswer] =================================');
    console.log('[雨课堂助手][INFO][AutoAnswer] 使用融合模式分析（文本+幻灯片图片）...');
    
    let imageBase64 = await captureSlideImage(slideId);
    
    // 如果获取幻灯片图片失败，回退到DOM截图
    if (!imageBase64) {
      console.log('[雨课堂助手][WARN][AutoAnswer] 无法获取幻灯片图片，尝试使用DOM截图...');
      const fallbackImage = await captureProblemForVision();
      
      if (!fallbackImage) {
        status.answering = false;
        console.error('[雨课堂助手][ERR][AutoAnswer] 所有截图方法都失败');
        notifyAutoAnswer('auto-answer-failed', problem, '无法获取题目图像，已跳过自动作答。');
        return ui.toast('无法获取题目图像，跳过自动作答', 3000);
      }
      
      imageBase64 = fallbackImage;
      console.log('[雨课堂助手][INFO][AutoAnswer] DOM截图成功');
    } else {
      console.log('[雨课堂助手][INFO][AutoAnswer] 幻灯片图片获取成功');
    }
    
    // 构建提示
    const hasTextInfo = problem.body && problem.body.trim();
    const textPrompt = formatProblemForVision(problem, PROBLEM_TYPE_MAP, hasTextInfo);
    
    // 调用 AI
    ui.toast('AI 正在分析题目...', 2000);
    const aiAnswer = await queryAIVision(imageBase64, textPrompt, ui.config.ai, {
      profileId: answerProfile?.id,
      problemType: problem.problemType,
    });
    console.log('[雨课堂助手][INFO][AutoAnswer] AI回答:', aiAnswer);
    
    // 解析答案
    const parsed = parseAIAnswer(problem, aiAnswer);
    console.log('[雨课堂助手][INFO][AutoAnswer] 解析结果:', parsed);
    
    if (!parsed) {
      status.answering = false;
      console.error('[雨课堂助手][ERR][AutoAnswer] 解析失败，AI回答格式不正确');
      notifyAutoAnswer('auto-answer-failed', problem, '无法解析 AI 返回的答案，已跳过自动作答。');
      return ui.toast('无法解析AI答案，请检查格式', 3000);
    }

    console.log('[雨课堂助手][INFO][AutoAnswer] 准备提交答案:', JSON.stringify(parsed));
    
    // 先提交快速模型答案
    await submitAnswer(problem, parsed, {
      startTime: status.startTime,
      endTime: status.endTime,
      forceRetry: shouldForceRetry,
      lessonId: status.lessonId || repo.currentLessonId,
    });

    console.log('[雨课堂助手][INFO][AutoAnswer] 首次提交成功');

    let finalAnswer = parsed;
    let finalRawAnswer = aiAnswer;
    let verificationState = 'disabled';
    try {
      const verification = await verifyAutoAnswer({
        problem,
        imageBase64,
        textPrompt,
        firstAnswer: parsed,
        firstRawAnswer: aiAnswer,
        status,
        forceRetry: shouldForceRetry,
      });
      finalAnswer = verification.answer;
      finalRawAnswer = verification.rawAnswer;
      verificationState = verification.state;
      if (verificationState === 'corrected') {
        console.log('[雨课堂助手][INFO][AutoAnswer] 验证模型发现差异，已重新提交答案');
      }
    } catch (verificationError) {
      verificationState = 'unavailable';
      console.warn('[雨课堂助手][WARN][AutoAnswer] 验证模型失败，保留首次提交:', verificationError);
    }

    console.log('[雨课堂助手][INFO][AutoAnswer] 作答流程完成:', verificationState);
    
    // 更新状态
    actions.onAnswerProblem(problem.problemId, finalAnswer);
    status.done = true;
    status.answering = false;
    const successDetail = verificationState === 'corrected'
      ? '快速答案已提交，验证模型发现错误并完成修正。'
      : verificationState === 'confirmed'
        ? '答案已提交，并通过验证模型复核。'
        : verificationState === 'unavailable' || verificationState === 'invalid'
          ? '答案已提交，但验证模型暂未完成复核。'
          : undefined;
    notifyAutoAnswer('auto-answer-succeeded', problem, successDetail);
    
    ui.toast(`自动作答完成`, 3000);
    showAutoAnswerPopup(problem, finalRawAnswer);
    
  } catch (e) {
    console.error('[雨课堂助手][ERR][AutoAnswer] 失败:', e);
    console.error('[雨课堂助手][ERR][AutoAnswer] 错误堆栈:', e.stack);
    status.answering = false;
    notifyAutoAnswer('auto-answer-failed', problem, `自动作答失败：${e?.message || '未知错误'}`);
    ui.toast(`自动作答失败: ${e.message}`, 4000);
  }
}

export function startAutoAnswerLoop() {
  if (_autoLoopStarted) return;
  _autoLoopStarted = true;

  setInterval(() => {
    const now = Date.now();
    repo.problemStatus.forEach((status, pid) => {
      if (status.autoAnswerTime !== null && now >= status.autoAnswerTime) {
        const problem = repo.problems.get(pid);
        if (problem && !problem.result) {
          status.autoAnswerTime = null;
          handleAutoAnswerInternal(problem);
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
    for (const slide of pres.slides) {
      repo.upsertSlide(slide);
      if (slide.problem) {
        repo.upsertProblem(slide.problem);
        repo.pushEncounteredProblem(slide.problem, slide, id);
      }
    }
    ui.updatePresentationList();
  },

  onUnlockProblem(data, { notificationOnly = false, lessonId = null } = {}) {
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
    const problem = repo.problems.get(problemId);
    const slide = repo.slides.get(slideId);
    if (!problem || !slide) {
      if (notificationOnly) return notifyProblemStart(payload, problem, slide, lessonId);
      console.log('[雨课堂助手][ERR][onUnlockProblem] 题目或幻灯片不存在');
      return false;
    }

    console.log('[雨课堂助手][DBG][onUnlockProblem] 题目解锁');
    console.log('[雨课堂助手][DBG][onUnlockProblem] 题目ID:', problemId);
    console.log('[雨课堂助手][DBG][onUnlockProblem] 幻灯片ID:', slideId);
    console.log('[雨课堂助手][DBG][onUnlockProblem] 课件ID:', payload.pres);

    const status = {
      presentationId: payload.pres,
      slideId,
      lessonId: lessonId ? String(lessonId) : repo.currentLessonId,
      startTime: payload.dt,
      endTime: getProblemEndTime(payload.dt, payload.limit),
      done: !!problem.result,
      autoAnswerTime: null,
      answering: false,
    };
    repo.problemStatus.set(problemId, status);

    const expired = Number.isFinite(status.endTime) && Date.now() >= status.endTime;
    const notified = notifyProblemStart(payload, problem, slide, lessonId);
    if (notificationOnly) return notified;
    if (problem.result) {
      console.log('[雨课堂助手][WARN][onUnlockProblem] 题目已作答，跳过自动流程');
      return notified;
    }
    if (expired && ui.config.autoForceRetry !== true) {
      console.log('[雨课堂助手][WARN][onUnlockProblem] 题目已过期，未开启自动强制补交');
      ui.updateActiveProblems();
      return notified;
    }

    if (ui.config.autoAnswer) {
      const delay = expired
        ? 0
        : ui.config.autoAnswerDelay + randInt(0, ui.config.autoAnswerRandomDelay);
      status.autoAnswerTime = Date.now() + delay;
      
      console.log(`[雨课堂助手][INFO][onUnlockProblem] 将在 ${Math.floor(delay / 1000)} 秒后自动作答`);
      ui.toast(`将在 ${Math.floor(delay / 1000)} 秒后使用融合模式自动作答`, 3000);
      notifyAutoAnswer('auto-answer-scheduled', problem, `将在约 ${Math.floor(delay / 1000)} 秒后开始自动作答。`);
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
    const p = repo.problems.get(problemId);
    if (p) {
      p.result = result;
      const i = repo.encounteredProblems.findIndex(e => e.problemId === problemId);
      if (i !== -1) repo.encounteredProblems[i].result = result;
      ui.updateProblemList();
    }
  },

  async handleAutoAnswer(problem) {
    return handleAutoAnswerInternal(problem);
  },

  tickAutoAnswer() {
    const now = Date.now();
    for (const [pid, status] of repo.problemStatus) {
      if (status.autoAnswerTime !== null && now >= status.autoAnswerTime) {
        const p = repo.problems.get(pid);
        if (p) {
          status.autoAnswerTime = null;
          this.handleAutoAnswer(p);
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
    this.maybeStartAutoJoin();           
    this.installRouterRearm();            
    void screenWakeLock.setEnabled(ui.config.keepScreenAwake);
  },
  
    startAutoAnswerLoop() {
    if (_autoLoopStarted) return;
    _autoLoopStarted = true;

    setInterval(() => {
      const now = Date.now();
      repo.problemStatus.forEach((status, pid) => {
        if (status.autoAnswerTime !== null && now >= status.autoAnswerTime) {
          const problem = repo.problems.get(pid);
          if (problem && !problem.result) {
            status.autoAnswerTime = null;
            handleAutoAnswerInternal(problem);
          }
        }
      });
    }, 500);
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
