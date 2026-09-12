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
  getAnswerProfile = () => null,
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
  verifyAnswer = null,
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
      const aiConfig = getAIConfig();
      const answerProfile = getAnswerProfile?.({
        problem,
        status,
        role: 'fast',
        now: currentTime,
      }) || null;
      let image = null;
      let prompt = '';
      if (!hasActiveProfile(aiConfig, answerProfile)) {
        parsed = makeDefaultAnswer(problem);
      } else {
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
        prompt = formatProblemForVision(problem, typeMap, hasTextInfo);
        aiContent = await queryAIVision(image, prompt, aiConfig, {
          profileId: answerProfile?.id,
          problemType: problem.problemType,
        });
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

      let submission = await submitAnswer(problem, parsed, submitOptions);
      let finalAnswer = parsed;
      let finalAIContent = aiContent;
      let verificationState = 'disabled';

      if (typeof verifyAnswer === 'function' && aiContent) {
        try {
          const verification = await verifyAnswer({
            problem,
            status,
            image,
            prompt,
            firstAnswer: parsed,
            firstRawAnswer: aiContent,
            forceRetry: shouldRetry,
            now: currentTime,
          });
          verificationState = verification?.state || 'unavailable';
          if (verificationState === 'corrected' && verification?.answer !== undefined) {
            submission = await submitAnswer(problem, verification.answer, submitOptions);
            finalAnswer = verification.answer;
            finalAIContent = verification.aiAnswer ?? aiContent;
          } else if (verification?.aiAnswer !== undefined) {
            finalAIContent = verification.aiAnswer;
          }
        } catch (error) {
          verificationState = 'unavailable';
          console.warn('[雨课堂助手][WARN][AutoAnswer] 验证模型失败，保留首次提交:', error);
        }
      }

      status.done = true;
      status.answering = false;
      status.phase = 'done';
      status.autoAnswerTime = null;
      status.lastError = '';
      emitStatus(status, onStatusChange, problem);
      await onAnswered?.(problem, finalAnswer, status, submission);
      const successDetail = verificationState === 'corrected'
        ? '快速答案已提交，验证模型发现差异并完成修正。'
        : (shouldRetry ? '答案已强制补交。' : undefined);
      notify?.('auto-answer-succeeded', problem, successDetail, { source, submission, verificationState });
      toast?.(shouldRetry ? 'AI 作答完成并已补交' : 'AI 作答完成', 3000);
      showPopup?.(problem, finalAIContent || '（本地默认答案）');
      return {
        ok: true,
        answer: finalAnswer,
        aiAnswer: finalAIContent,
        verificationState,
        ...submission,
      };
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
