from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one literal match, found {count}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


def regex_once(path, pattern, repl, flags=0):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    new, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one regex match, found {count}: {pattern[:100]!r}')
    p.write_text(new, encoding='utf-8')


ACTIONS = 'ykt-helper/src/state/actions.js'
RUNNER = 'ykt-helper/src/state/auto-answer-runner.js'
ROUTING = 'ykt-helper/src/tsm/answer-routing.js'
REPO = 'ykt-helper/src/state/repo.js'

# 1) One per-lesson policy for foreground and auto-joined classrooms.
replace_once(
    ACTIONS,
    "let _autoJoinStarted = false;\n",
    "let _autoJoinStarted = false;\nlet _autoJoinGeneration = 0;\nlet _autoJoinTimer = null;\n",
)
replace_once(
    ACTIONS,
    """function currentPageLessonId() {
  const match = String(window.location.pathname || '').match(/\\/lesson\\/fullscreen\\/v3\\/([^/]+)/);
  return match ? match[1] : null;
}
""",
    """function currentPageLessonId() {
  const match = String(window.location.pathname || '').match(/\\/lesson\\/fullscreen\\/v3\\/([^/]+)/);
  return match ? match[1] : null;
}

function shouldAutoAnswerForLesson(lessonId) {
  if (ui?.config?.autoAnswer === true) return true;
  const key = String(lessonId || '').trim();
  if (!key) return false;
  if (repo?.autoJoinedLessons?.has(key) && ui?.config?.autoAnswerOnAutoJoin === true) return true;
  if (repo?.forceAutoAnswerLessons?.has(key)) return true;
  return false;
}
""",
)
replace_once(
    ACTIONS,
    """if (typeof window !== 'undefined') {
  window.addEventListener('ykt:auto-answer-config-changed', () => {
    restorePendingProblemStatuses();
  });
}
""",
    """if (typeof window !== 'undefined') {
  window.addEventListener('ykt:auto-answer-config-changed', () => {
    restorePendingProblemStatuses();
    if (ui.config.autoJoinEnabled) actions.maybeStartAutoJoin();
    else actions.stopAutoJoinLoop();
  });
}
""",
)

# 2) Timeline hydration must not permanently suppress a later real unlock.
replace_once(
    ACTIONS,
    """    const previous = getProblemStatus(pid);
    const isFirstUnlock = !previous && !recovered;
""",
    """    const previous = getProblemStatus(pid);
    const autoAnswerEnabled = shouldAutoAnswerForLesson(
      lessonId || previous?.lessonId || recovered?.lessonId || problem?.lessonId || repo.currentLessonId
    );
    const isFirstUnlock = !previous && !recovered;
""",
)
replace_once(
    ACTIONS,
    "autoAnswerQueued: isLiveUnlock && !!ui.config.autoAnswer,",
    "autoAnswerQueued: isLiveUnlock && autoAnswerEnabled,",
)
replace_once(
    ACTIONS,
    """    status.autoAnswerQueued = isFirstUnlock
      ? isLiveUnlock && !!ui.config.autoAnswer
      : status.autoAnswerQueued !== false;
""",
    """    status.autoAnswerQueued = isFirstUnlock
      ? isLiveUnlock && autoAnswerEnabled
      : status.autoAnswerQueued !== false;
    if (isLiveUnlock && autoAnswerEnabled && !status.done) {
      status.autoAnswerQueued = true;
    }
""",
)
replace_once(
    ACTIONS,
    "if (ui.config.autoAnswer && status.autoAnswerQueued && !status.answering && status.phase !== 'failed' && status.autoAnswerTime === null) {",
    "if (autoAnswerEnabled && status.autoAnswerQueued && !status.answering && status.phase !== 'failed' && status.autoAnswerTime === null) {",
)

# 3) Recovery state belongs to the problem's classroom, not whichever page is foreground now.
replace_once(
    ACTIONS,
    "      getProblemRecoveryStore()?.remove(problemId);",
    "      getProblemRecoveryStore(status?.lessonId || repo.currentLessonId)?.remove(problemId);",
)

# 4) Auto-join becomes restartable, generation-safe, and cleans up managed sockets.
replace_once(
    ACTIONS,
    """    _autoJoinStarted = true;
    repo.autoJoinRunning = true;

    const loop = async () => {
      if (!repo.autoJoinRunning) return;
""",
    """    _autoJoinStarted = true;
    repo.autoJoinRunning = true;
    const generation = ++_autoJoinGeneration;

    const loop = async () => {
      if (!repo.autoJoinRunning || generation !== _autoJoinGeneration) return;
""",
)
replace_once(
    ACTIONS,
    """        const list = await getOnLesson();
        const snapshot = syncActiveLessons([...repo.activeLessons.values()], list);
""",
    """        const list = await getOnLesson();
        if (!repo.autoJoinRunning || generation !== _autoJoinGeneration) return;
        const snapshot = syncActiveLessons([...repo.activeLessons.values()], list);
""",
)
replace_once(
    ACTIONS,
    """            // 标记该课堂为“自动进入”
            repo.markLessonAutoJoined(lessonId, true);
            if (ui.config.autoAnswerOnAutoJoin) {
              repo.forceAutoAnswerLessons.add(lessonId);
            }
""",
    """            // 标记该课堂为“自动进入”；是否自动答题由统一策略动态读取配置。
            repo.markLessonAutoJoined(lessonId, true);
""",
)
replace_once(
    ACTIONS,
    """      } finally {
        setTimeout(loop, 5000);
      }
    };
    loop();
""",
    """      } finally {
        if (repo.autoJoinRunning && generation === _autoJoinGeneration) {
          _autoJoinTimer = setTimeout(loop, 5000);
        }
      }
    };
    void loop();
""",
)
replace_once(
    ACTIONS,
    """  stopAutoJoinLoop() {
    repo.autoJoinRunning = false;
    _navigationArbiter?.cancel();
    if (_autoJumpRetryTimer !== null) {
      clearTimeout(_autoJumpRetryTimer);
      _autoJumpRetryTimer = null;
    }
  },
""",
    """  stopAutoJoinLoop() {
    repo.autoJoinRunning = false;
    _autoJoinStarted = false;
    _autoJoinGeneration += 1;
    if (_autoJoinTimer !== null) {
      clearTimeout(_autoJoinTimer);
      _autoJoinTimer = null;
    }
    _navigationArbiter?.cancel();
    if (_autoJumpRetryTimer !== null) {
      clearTimeout(_autoJumpRetryTimer);
      _autoJumpRetryTimer = null;
    }
    for (const lessonId of [...repo.autoJoinedLessons]) {
      const socket = repo.lessonSockets.get(String(lessonId));
      try { socket?.close?.(); } catch {}
      repo.markLessonDisconnected(lessonId, 'auto-join-stopped');
    }
  },
""",
)

# Normalise auto-joined classroom keys so scheduling policy and websocket state agree.
replace_once(
    REPO,
    """  markLessonAutoJoined(lessonId, enabled = true) {
    if (!lessonId) return;
    if (enabled) this.autoJoinedLessons.add(lessonId);
    else this.autoJoinedLessons.delete(lessonId);
  },
""",
    """  markLessonAutoJoined(lessonId, enabled = true) {
    const key = String(lessonId || '').trim();
    if (!key) return;
    if (enabled) this.autoJoinedLessons.add(key);
    else this.autoJoinedLessons.delete(key);
  },
""",
)

# 5) The scheduler already waits. The runner must submit immediately rather than waiting again.
replace_once(
    RUNNER,
    """      const submitOptions = {
        startTime: status.startTime,
        endTime: status.endTime,
        forceRetry: shouldRetry,
        lessonId,
      };
      if (force) {
        submitOptions.autoGate = false;
        submitOptions.waitMs = 0;
      }
""",
    """      const submitOptions = {
        startTime: status.startTime,
        endTime: status.endTime,
        forceRetry: shouldRetry,
        lessonId,
        autoGate: false,
        waitMs: 0,
      };
""",
)

# Preserve the first successful submission if a verification correction is rejected.
replace_once(
    RUNNER,
    """          if (verificationState === 'corrected' && verification?.answer !== undefined) {
            submission = await submitAnswer(problem, verification.answer, submitOptions);
            finalAnswer = verification.answer;
            finalAIContent = verification.aiAnswer ?? aiContent;
          } else if (verification?.aiAnswer !== undefined) {
""",
    """          if (verificationState === 'corrected' && verification?.answer !== undefined) {
            try {
              const correctedSubmission = await submitAnswer(problem, verification.answer, submitOptions);
              submission = correctedSubmission;
              finalAnswer = verification.answer;
              finalAIContent = verification.aiAnswer ?? aiContent;
            } catch (error) {
              verificationState = 'correction-failed';
              console.warn('[雨课堂助手][WARN][AutoAnswer] 验证模型给出修正，但修正提交失败，保留首次成功提交:', error);
            }
          } else if (verification?.aiAnswer !== undefined) {
""",
)

# 6) Expired questions only use /retry when the caller explicitly opted in.
Path(ROOT / ROUTING).write_text("""/** Select the server route for one answer attempt. */
export function chooseAnswerRoute({
  now = Date.now(),
  endTime = null,
  forceRetry = false,
  allowRetryAfterDeadline = false,
} = {}) {
  if (forceRetry) return 'retry';
  if (endTime === null || endTime === undefined || endTime === '') return 'answer';
  const current = Number(now);
  const deadline = Number(endTime);
  if (
    allowRetryAfterDeadline
    && Number.isFinite(current)
    && Number.isFinite(deadline)
    && current >= deadline
  ) {
    return 'retry';
  }
  return 'answer';
}
""", encoding='utf-8')

print('Applied deterministic stability fixes successfully.')
