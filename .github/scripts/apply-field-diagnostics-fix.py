from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


actions_path = Path('ykt-helper/src/state/actions.js')
runner_path = Path('ykt-helper/src/state/auto-answer-runner.js')
actions = actions_path.read_text(encoding='utf-8')
runner = runner_path.read_text(encoding='utf-8')

# 1. Bounded retry for the live-event/data-hydration race.
actions = replace_once(
    actions,
    "const danmuFollowControllers = new Map();\nconst timelineProblemTracker = createTimelineProblemTracker();\n",
    "const danmuFollowControllers = new Map();\nconst timelineProblemTracker = createTimelineProblemTracker();\nconst LIVE_UNLOCK_RETRY_DELAY_MS = 250;\nconst LIVE_UNLOCK_RETRY_LIMIT = 40;\n",
    'insert live unlock retry constants',
)

actions = replace_once(
    actions,
    "  onUnlockProblem(data, { notificationOnly = false, source = 'live', lessonId = null } = {}) {",
    "  onUnlockProblem(data, { notificationOnly = false, source = 'live', lessonId = null, liveRetryCount = 0 } = {}) {",
    'extend onUnlockProblem options',
)

old_missing = """    const problem = getProblemById(problemId);\n    const slide = repo.slides.get(slideId) || repo.slides.get(String(slideId));\n    if (!problem || !slide) {\n      if (notificationOnly && isLiveUnlock) return notifyProblemStart(payload, problem, slide, lessonId);\n      console.log('[雨课堂助手][ERR][onUnlockProblem] 题目或幻灯片不存在');\n      return false;\n    }\n"""
new_missing = """    const problem = getProblemById(problemId);\n    const slide = repo.slides.get(slideId) || repo.slides.get(String(slideId));\n    if (!problem || !slide) {\n      const notified = isLiveUnlock ? notifyProblemStart(payload, problem, slide, lessonId) : false;\n      if (isLiveUnlock && !notificationOnly && liveRetryCount < LIVE_UNLOCK_RETRY_LIMIT) {\n        if (liveRetryCount === 0) {\n          console.warn('[雨课堂助手][WARN][onUnlockProblem] 实时新题已到达，但题目/幻灯片数据尚未加载；开始短暂重试', {\n            problemId,\n            slideId,\n            lessonId,\n          });\n        }\n        setTimeout(() => {\n          actions.onUnlockProblem(payload, {\n            notificationOnly: false,\n            source,\n            lessonId,\n            liveRetryCount: liveRetryCount + 1,\n          });\n        }, LIVE_UNLOCK_RETRY_DELAY_MS);\n        return notified;\n      }\n      if (isLiveUnlock && !notificationOnly) {\n        console.error('[雨课堂助手][ERR][onUnlockProblem] 实时新题数据重试后仍未加载，自动作答未启动', {\n          problemId,\n          slideId,\n          lessonId,\n          liveRetryCount,\n        });\n        ui.toast('自动作答未启动：实时新题数据 10 秒内仍未加载', 5000);\n      } else {\n        console.log('[雨课堂助手][ERR][onUnlockProblem] 题目或幻灯片不存在');\n      }\n      return notified;\n    }\n"""
actions = replace_once(actions, old_missing, new_missing, 'replace missing problem/slide handling')

# 2. Visible field diagnostics for barrage send outcome.
old_danmu = """    if (result.triggered) {\n      if (result.sendResult?.sent) {\n        console.log('[雨课堂助手][INFO][DanmuFollow] 已自动跟发:', result.text, {\n          count: result.count,\n          sentCount: result.sentCount,\n        });\n      } else {\n        console.warn('[雨课堂助手][WARN][DanmuFollow] 达到跟发条件，但发送失败:', result.text, result.sendResult);\n      }\n    }\n"""
new_danmu = """    if (result.triggered) {\n      if (result.sendResult?.sent) {\n        console.log('[雨课堂助手][INFO][DanmuFollow] 已自动跟发:', result.text, {\n          count: result.count,\n          sentCount: result.sentCount,\n        });\n        ui.toast(`弹幕已自动跟发：${result.text}`, 2500);\n      } else {\n        const failureReason = result.sendResult?.reason || 'unknown';\n        console.warn('[雨课堂助手][WARN][DanmuFollow] 达到跟发条件，但发送失败:', result.text, result.sendResult);\n        ui.toast(`弹幕自动跟发失败（${failureReason}）`, 4000);\n      }\n    }\n"""
actions = replace_once(actions, old_danmu, new_danmu, 'add barrage outcome diagnostics')

# 3. Always-visible runner start marker plus safe console diagnostics.
old_runner_start = """    emitStatus(status, onStatusChange, problem);\n    notify?.('auto-answer-started', problem, source === 'manual' ? '手动强制 AI 作答已开始。' : undefined, { source });\n\n    let aiContent = '';\n"""
new_runner_start = """    emitStatus(status, onStatusChange, problem);\n    notify?.('auto-answer-started', problem, source === 'manual' ? '手动强制 AI 作答已开始。' : undefined, { source });\n    console.log('[雨课堂助手][INFO][AutoAnswer] 开始作答', {\n      problemId: problem?.problemId,\n      source,\n      lessonId,\n      force,\n      forceRetry,\n    });\n    toast?.(source === 'manual' ? '手动 AI 作答开始' : '自动作答开始', 1500);\n\n    let aiContent = '';\n"""
runner = replace_once(runner, old_runner_start, new_runner_start, 'add runner start diagnostics')

old_profile = """      let image = null;\n      let prompt = '';\n      if (!hasActiveProfile(aiConfig, answerProfile)) {\n        parsed = makeDefaultAnswer(problem);\n      } else {\n"""
new_profile = """      let image = null;\n      let prompt = '';\n      const activeAIProfile = hasActiveProfile(aiConfig, answerProfile);\n      console.log('[雨课堂助手][INFO][AutoAnswer] 作答模式', {\n        problemId: problem?.problemId,\n        mode: activeAIProfile ? 'ai' : 'default-fallback',\n        profileId: answerProfile?.id || null,\n      });\n      if (!activeAIProfile) {\n        parsed = makeDefaultAnswer(problem);\n      } else {\n"""
runner = replace_once(runner, old_profile, new_profile, 'add profile diagnostics')

old_submit = """      let submission = await submitAnswer(problem, parsed, submitOptions);\n      let finalAnswer = parsed;\n"""
new_submit = """      let submission = await submitAnswer(problem, parsed, submitOptions);\n      console.log('[雨课堂助手][INFO][AutoAnswer] 首次提交成功', {\n        problemId: problem?.problemId,\n        route: submission?.route || null,\n      });\n      let finalAnswer = parsed;\n"""
runner = replace_once(runner, old_submit, new_submit, 'add submit diagnostics')

old_catch = """      notify?.('auto-answer-failed', problem, `AI 作答失败：${status.lastError}`, { source });\n      toast?.(`AI 作答失败：${status.lastError}`, 4000);\n      return { ok: false, reason: 'error', error };\n"""
new_catch = """      console.error('[雨课堂助手][ERR][AutoAnswer] 作答失败', {\n        problemId: problem?.problemId,\n        source,\n        error: status.lastError,\n      });\n      notify?.('auto-answer-failed', problem, `AI 作答失败：${status.lastError}`, { source });\n      toast?.(`AI 作答失败：${status.lastError}`, 4000);\n      return { ok: false, reason: 'error', error };\n"""
runner = replace_once(runner, old_catch, new_catch, 'add failure diagnostics')

actions_path.write_text(actions, encoding='utf-8')
runner_path.write_text(runner, encoding='utf-8')
print('Applied field diagnostics and live unlock hydration retry patch.')
