# 1.21.6 课堂编排 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让桌面用户脚本可靠监听当前账号所有正在上课的课堂，并修复发布提醒、弹幕跟发、截止后强制作答、快慢模型验证和自动跳转行为。

**Architecture:** 继续使用现有 ES Module + Rollup 架构，新增小型纯函数模块承载活动课堂同步、时间窗口和跳转仲裁；网络层只负责提取课堂上下文、连接生命周期和弹幕发送确认，业务层负责策略。所有跨模块输入输出显式携带 `lessonId`。

**Tech Stack:** JavaScript ES modules, Tampermonkey WebSocket/XHR APIs, Rollup, Node `node:test`, existing DOM APIs; no new dependency.

**Spec:** `docs/superpowers/specs/2026-09-11-classroom-orchestration-design.md`

## Global Constraints

- 版本从 `1.21.5` 提升到 `1.21.6`。
- 监听范围只包括接口返回 `status === 1` 的当前账号活动课堂。
- 桌面专用 `/m/v2` 路由守卫保持不变。
- 后台课堂不执行当前页面的弹幕发送，不改变前台课件状态。
- `/retry` 只能在用户明确开启强制补交时使用。
- 任何日志不得输出 token、Cookie、Authorization、API Key 或完整 hello 帧。
- 每个任务先写失败测试、确认失败，再写最小实现；每个任务独立提交。

---

### Task 1: 活动课堂注册表与连接生命周期

**Files:**
- Create: `ykt-helper/src/core/active-lessons.js`
- Modify: `ykt-helper/src/state/repo.js`
- Modify: `ykt-helper/src/net/xhr-interceptor.js`
- Modify: `ykt-helper/src/net/ws-interceptor.js`
- Modify: `ykt-helper/src/state/actions.js`
- Test: `ykt-helper/test/active-lessons.test.js`

**Interfaces:**
- `syncActiveLessons(previous, list) -> { active, added, removed }`：规范化 lesson ID、只保留 `status === 1`、保留接口顺序和可用时间字段。
- `repo.markLessonDisconnected(lessonId, reason)`：删除 socket/token/listening 状态并清除自动加入标记。
- `connectOrAttachLessonWS({ lessonId, auth })`：建立或复用指定课堂连接，关闭后允许重新建立。

- [ ] **Step 1: Write the failing test**

```js
test('syncs only active lessons and reports stale lessons for cleanup', () => {
  const result = syncActiveLessons(
    [{ lessonId: 'old', status: 1 }, { lessonId: 'keep', status: 1 }],
    [{ lessonId: 'keep', status: 1 }, { lessonId: 'new', status: 1 }, { lessonId: 'future', status: 0 }],
  );
  assert.deepEqual(result.active.map(x => x.lessonId), ['keep', 'new']);
  assert.deepEqual(result.added.map(x => x.lessonId), ['new']);
  assert.deepEqual(result.removed, ['old']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/active-lessons.test.js`
Expected: FAIL because `src/core/active-lessons.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement normalization with `lessonId || lesson_id || id`, strict numeric/string status handling limited to `1`, and set-based added/removed comparison. Add `markLessonDisconnected`; invoke it from WebSocket `close` and error cleanup. Update the auto-join loop to synchronize the full active list and establish one connection per added lesson.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/active-lessons.test.js test/realtime-dispatch.test.js`
Expected: PASS, with no credential-bearing logs.

- [ ] **Step 5: Commit**

```bash
git add src/core/active-lessons.js src/state/repo.js src/net/xhr-interceptor.js src/net/ws-interceptor.js src/state/actions.js test/active-lessons.test.js
git commit -m "feat: track active classroom connections"
```

### Task 2: 课堂上下文发布提醒

**Files:**
- Modify: `ykt-helper/src/core/publish-events.js`
- Modify: `ykt-helper/src/core/realtime-dispatch.js`
- Modify: `ykt-helper/src/state/publish-reminder.js`
- Modify: `ykt-helper/src/state/actions.js`
- Modify: `ykt-helper/src/ui/ui-api.js`
- Test: `ykt-helper/test/publish-events.test.js`
- Test: `ykt-helper/test/publish-reminder.test.js`
- Test: `ykt-helper/test/realtime-dispatch.test.js`

**Interfaces:**
- `classifyPublishEvent(message, { lessonId, currentLessonId, currentPresentationId } = {}) -> event|null`
- Event fields: `{ category, lessonId, entityId, presentationId, dedupeKey, title, detail, suppressReason? }`.
- `createPublishReminder().handle(event, config)` continues returning a boolean.

- [ ] **Step 1: Write the failing tests**

Add tests asserting: a different lesson is notified; another presentation in the same lesson is notified; the currently viewed presentation is suppressed; equal entity IDs in different lessons produce different dedupe keys; nested `data.type/op` is recognized.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/publish-events.test.js test/publish-reminder.test.js test/realtime-dispatch.test.js`
Expected: FAIL because events currently lack lesson/presentation context and `actions.onPublishEvent` drops dispatch options.

- [ ] **Step 3: Write minimal implementation**

Unwrap operation fields from supported nested payloads, preserve explicit entity IDs, attach lesson context in dispatch, accept `(event, options)` in actions, and make dedupe keys include lesson ID. Use the current page lesson/presentation IDs only for suppression, not for filtering background publish events.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/publish-events.test.js test/publish-reminder.test.js test/realtime-dispatch.test.js`
Expected: PASS and existing false-positive exclusions remain green.

- [ ] **Step 5: Commit**

```bash
git add src/core/publish-events.js src/core/realtime-dispatch.js src/state/publish-reminder.js src/state/actions.js src/ui/ui-api.js test/publish-events.test.js test/publish-reminder.test.js test/realtime-dispatch.test.js
git commit -m "fix: scope classroom publication reminders"
```

### Task 3: 弹幕 7/30 秒策略与真实发送确认

**Files:**
- Modify: `ykt-helper/src/core/danmu-follow.js`
- Modify: `ykt-helper/src/core/danmu-sender.js`
- Modify: `ykt-helper/src/net/ws-interceptor.js`
- Modify: `ykt-helper/src/state/actions.js`
- Test: `ykt-helper/test/danmu-follow.test.js`

**Interfaces:**
- `createDanmuFollowTracker({ windowSize: 7, windowMs: 30000, roundGapMs: 60000, maxSendsPerRound: 2 })`.
- `sendDanmuText(text, { root, awaitConfirmationMs }) -> Promise<{sent, verified, text, reason?}>`.
- `confirmDanmuSend(message) -> number` resolves matching pending sends without exposing payload contents in logs.

- [ ] **Step 1: Write the failing tests**

Replace the old 3-of-7 assertion with tests for seven non-empty messages inside 30 seconds, most-frequent selection, deterministic latest-on-tie selection, no trigger when the seventh message falls outside 30 seconds, two-follow round limit, and a sender result that remains unverified until an outbound frame is observed.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/danmu-follow.test.js`
Expected: FAIL because the current tracker requires three equal messages and `sendDanmuText` returns success immediately after `click()`.

- [ ] **Step 3: Write minimal implementation**

Implement a seven-item time-bounded sliding window and frequency selection. Make the controller await the sender result. Have the WebSocket send interceptor pass parsed outbound frames to the sender confirmation registry; recognize only likely danmu send operations and matching text. Use a bounded timeout and never click again after timeout.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/danmu-follow.test.js test/realtime-dispatch.test.js`
Expected: PASS; non-current lesson messages remain ignored for sending.

- [ ] **Step 5: Commit**

```bash
git add src/core/danmu-follow.js src/core/danmu-sender.js src/net/ws-interceptor.js src/state/actions.js test/danmu-follow.test.js
git commit -m "fix: verify automatic barrage follows"
```

### Task 4: 截止后强制补交

**Files:**
- Modify: `ykt-helper/src/core/types.js`
- Modify: `ykt-helper/src/state/actions.js`
- Modify: `ykt-helper/src/tsm/answer.js`
- Modify: `ykt-helper/src/ui/panels/active-problems.js`
- Modify: `ykt-helper/src/ui/panels/settings.html`
- Modify: `ykt-helper/src/ui/panels/settings.js`
- Test: `ykt-helper/test/problem-timing.test.js`
- Test: `ykt-helper/test/answer-routing.test.js`

**Interfaces:**
- `chooseAnswerRoute({ now, endTime, forceRetry }) -> 'answer'|'retry'`.
- `submitAnswer(problem, result, { forceRetry, startTime, endTime, lessonId })` uses the chosen route and returns `{ route, resp }`.

- [ ] **Step 1: Write the failing tests**

Add tests proving automatic handling can opt into retry after a deadline, default behavior still skips expired questions, and an expired manual/forced request selects `/retry` with a bounded `dt`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/problem-timing.test.js test/answer-routing.test.js`
Expected: FAIL because `onUnlockProblem` and `handleAutoAnswerInternal` currently discard expired questions before `submitAnswer`.

- [ ] **Step 3: Write minimal implementation**

Add `autoForceRetry: false`; preserve expired problem state when the option is enabled; pass the lesson-specific ID and `forceRetry` to `submitAnswer`; expose a per-problem “强制补交” action only when the problem is expired and the user invokes it. Do not treat a request attempt as success unless the response confirms success.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/problem-timing.test.js test/answer-routing.test.js test/realtime-dispatch.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.js src/state/actions.js src/tsm/answer.js src/ui/panels/active-problems.js src/ui/panels/settings.html src/ui/panels/settings.js test/problem-timing.test.js test/answer-routing.test.js
git commit -m "feat: allow opt-in deadline retry"
```

### Task 5: 快速模型、时间点窗口与精确验证

**Files:**
- Create: `ykt-helper/src/core/answer-priority.js`
- Modify: `ykt-helper/src/core/types.js`
- Modify: `ykt-helper/src/ai/openai.js`
- Modify: `ykt-helper/src/state/actions.js`
- Modify: `ykt-helper/src/ui/panels/settings.html`
- Modify: `ykt-helper/src/ui/panels/settings.js`
- Test: `ykt-helper/test/answer-priority.test.js`
- Test: `ykt-helper/test/profile-temperature.test.js`

**Interfaces:**
- `isWithinAnswerPriorityWindow(now, windows, timezoneOffsetMinutes) -> boolean`.
- `selectAnswerProfile(aiConfig, { now, windows, role }) -> profile|null`.
- `compareParsedAnswers(problem, first, verified) -> boolean`.

- [ ] **Step 1: Write the failing tests**

Test the inclusive one-minute-before/ten-minute-after window, midnight crossing, empty-window fallback, fast-profile selection, and one correction only when verification differs.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/answer-priority.test.js`
Expected: FAIL because no priority window or fast/verification profile fields exist.

- [ ] **Step 3: Write minimal implementation**

Add profile role selection without changing existing Profile credentials. Call the fast model for the first answer only inside a configured window; submit it; optionally call the verification model and submit a single correction through the normal or retry route according to deadline. On unavailable fast/verification profile, log the reason and fall back to the active profile. Redact AI request diagnostics.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/answer-priority.test.js test/profile-temperature.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/answer-priority.js src/core/types.js src/ai/openai.js src/state/actions.js src/ui/panels/settings.html src/ui/panels/settings.js test/answer-priority.test.js test/profile-temperature.test.js
git commit -m "feat: add fast answer priority windows"
```

### Task 6: 自动跳转仲裁与过期课堂回收

**Files:**
- Create: `ykt-helper/src/core/navigation-arbiter.js`
- Modify: `ykt-helper/src/state/actions.js`
- Modify: `ykt-helper/src/net/xhr-interceptor.js`
- Modify: `ykt-helper/src/ui/panels/settings.html`
- Modify: `ykt-helper/src/ui/panels/settings.js`
- Test: `ykt-helper/test/navigation-arbiter.test.js`

**Interfaces:**
- `createNavigationArbiter({ waitMs: 10000, now, navigate })` with `observeUserIntent()` and `offer(target)`.
- `pickLatestActiveLesson(list) -> lesson|null`.

- [ ] **Step 1: Write the failing tests**

Test that no user action after 10 seconds navigates to the newest active lesson, any user intent cancels the pending jump, a second offer replaces an older target, and inactive lessons are never selected.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/navigation-arbiter.test.js`
Expected: FAIL because the current code jumps immediately and falls back to arbitrary non-active entries.

- [ ] **Step 3: Write minimal implementation**

Install one-time pointer/keyboard/history observers during the pending window. Sort only with explicit lesson time fields (`startTime`, `start_time`, `beginTime`, `createdAt`) and otherwise preserve API order. Cancel timers on navigation, visibility changes, or user intent. Keep connection cleanup independent from foreground navigation.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/navigation-arbiter.test.js test/active-lessons.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/navigation-arbiter.js src/state/actions.js src/net/xhr-interceptor.js src/ui/panels/settings.html src/ui/panels/settings.js test/navigation-arbiter.test.js
git commit -m "fix: defer automatic classroom navigation"
```

### Task 7: 版本、文档、构建与回归验证

**Files:**
- Modify: `ykt-helper/userscript.meta.js`
- Modify: `ykt-helper/rollup.config.mjs`
- Modify: `ykt-helper/readme.md`
- Modify: `README.md`
- Modify: `changelog.md`
- Create/replace: `release/ykt-helper-1216.user.js`
- Test: existing `ykt-helper/test/*.test.js`

- [ ] **Step 1: Update version references**

Change all current `1.21.5`/`1215` references that describe the active release to `1.21.6`/`1216`; keep older release files as history. Update installation URLs to the current organization repository where appropriate.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all existing and new tests pass with zero failures.

- [ ] **Step 3: Build the userscript**

Run: `npm run build`
Expected: Rollup exits with status 0 and writes `dist/ykt-helper-1216.user.js`.

- [ ] **Step 4: Synchronize and compare release output**

Run: `cp dist/ykt-helper-1216.user.js ../release/ykt-helper-1216.user.js && cmp -s dist/ykt-helper-1216.user.js ../release/ykt-helper-1216.user.js`
Expected: `cmp` exits 0; generated header contains `@version 1.21.6`.

- [ ] **Step 5: Review diff and security-sensitive logs**

Run: `git diff --check && git diff --stat && git diff -- src/net/ws-interceptor.js src/ai/openai.js src/tsm/answer.js`
Expected: no whitespace errors, only planned files changed, and no token/API-key/full-payload logging remains.

- [ ] **Step 6: Commit**

```bash
git add userscript.meta.js rollup.config.mjs readme.md ../README.md ../changelog.md ../release/ykt-helper-1216.user.js
git commit -m "release: publish yukt helper 1.21.6"
```
