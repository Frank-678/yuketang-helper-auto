/**
 * Runs one AI-answer attempt.  Dependencies are injected so the state action
 * can keep browser-specific UI and network code outside this state machine.
 */

function isExpired(status, now) {
  const endTime = Number(status?.endTime);
  return Number.isFinite(endTime) && now >= endTime;
}

function emitStatus(status, onStatusChange, problem) {
  try { onStatusChange?.({ ...status }, problem); } catch (error) {
    console.warn('[雨课堂助手][WARN][AutoAnswer] 状态持久化失败:', error);
  }
}

function errorMessage(error) {
  return error?.message ? String(error.message) : String(error || '未知错误');
}

export function createAutoAnswerRunner({
  typeMap = {},
  hasActiveProfile = () => false,
  getAIConfig = () => undefined,
  makeDefaultAnswer = () => null,
  captureSlideImage = async () => null,
  captureProblemForVision = async () => null,
  formatProblemForVision = () => '',
  queryAIVision = async () => '',
  parseAIAnswer = () => null,
  submitAnswer = async () => ({ route: 'answer' }),
  onAnswered,
  onStatusChange,
  notify,
  toast,
  showPopup,
  now = () => Date.now(),
} = {}) {
  async function run(problem, status, {
    force = false,
    forceRetry = false,
    allowResubmit = false,
    source = force ? 'manual' : 'auto',
    lessonId = null,
  } = {}) {
    if (!problem || !status) return { ok: false, reason: 'missing-status' };
    if (status.answering) return { ok: false, reason: 'answering' };
    if (status.done || (problem.result && !allowResubmit)) {
      return { ok: false, reason: 'answered' };
    }

    const currentTime = Number(now());
    const expired = isExpired(status, currentTime);
    if (expired && !force && !forceRetry) {
      return { ok: false, reason: 'expired' };
    }

    const shouldRetry = forceRetry || (force && expired);
    status.answering = true;
    status.phase = 'answering';
    status.autoAnswerTime = null;
    status.lastError = '';
    emitStatus(status, onStatusChange, problem);
    notify?.('auto-answer-started', problem, source === 'manual' ? '手动强制 AI 作答已开始。' : undefined, { source });

    let aiContent = '';
    try {
      let parsed;
      if (!hasActiveProfile(getAIConfig())) {
        parsed = makeDefaultAnswer(problem);
      } else {
        let image = null;
        try {
          image = await captureSlideImage(status.slideId);
        } catch (error) {
          console.warn('[雨课堂助手][WARN][AutoAnswer] 幻灯片截图失败，尝试页面截图:', error);
        }
        if (!image) {
          image = await captureProblemForVision();
        }
        if (!image) throw new Error('无法获取题目图像');

        const hasTextInfo = !!(problem.body && String(problem.body).trim());
        const prompt = formatProblemForVision(problem, typeMap, hasTextInfo);
        aiContent = await queryAIVision(image, prompt, getAIConfig());
        parsed = parseAIAnswer(problem, aiContent);
        if (!parsed) throw new Error('无法解析 AI 返回的答案');
      }

      const submitOptions = {
        startTime: status.startTime,
        endTime: status.endTime,
        forceRetry: shouldRetry,
        lessonId,
      };
      if (force) {
        submitOptions.autoGate = false;
        submitOptions.waitMs = 0;
      }

      const submission = await submitAnswer(problem, parsed, submitOptions);
      status.done = true;
      status.answering = false;
      status.phase = 'done';
      status.autoAnswerTime = null;
      status.lastError = '';
      emitStatus(status, onStatusChange, problem);
      await onAnswered?.(problem, parsed, status, submission);
      notify?.('auto-answer-succeeded', problem, shouldRetry ? '答案已强制补交。' : undefined, { source, submission });
      toast?.(shouldRetry ? 'AI 作答完成并已补交' : 'AI 作答完成', 3000);
      showPopup?.(problem, aiContent || '（本地默认答案）');
      return { ok: true, answer: parsed, aiAnswer: aiContent, ...submission };
    } catch (error) {
      status.answering = false;
      status.phase = 'failed';
      status.attempts = Math.max(0, Number(status.attempts) || 0) + 1;
      status.lastError = errorMessage(error);
      emitStatus(status, onStatusChange, problem);
      notify?.('auto-answer-failed', problem, `AI 作答失败：${status.lastError}`, { source });
      toast?.(`AI 作答失败：${status.lastError}`, 4000);
      return { ok: false, reason: 'error', error };
    }
  }

  return { run };
}
