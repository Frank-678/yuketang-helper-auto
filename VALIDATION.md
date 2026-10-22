# 验证与范围

本地 136/136 项通过，0 失败、0 跳过。远端修复分支和 main 的 CI 均通过；主线归档作业成功。

- 修复分支 CI：https://github.com/Frank-678/yuketang-helper-auto/actions/runs/39753253529
- main CI：https://github.com/Frank-678/yuketang-helper-auto/actions/runs/39753439763
- 实际构建入口：ykt-helper/src/index.js。
- 稳定与版本安装副本逐字节一致，CI 拒绝陈旧发布文件。
- 136 项由保留的纯模块单测与实际打包脚本的 JSDOM 组合断言组成；请求、题目、身份和密钥均为构造数据。
- 当前仍保留部分 UI 循环依赖，Rollup 会提示警告；初始化、晚注入与 SPA 切换回归通过，不将此表述为架构已全部消除循环。
- 未操作真实课堂/弹幕、未调用付费模型。真实服务器接口、改答权限、Android/Tampermonkey、CORS、后台冻结和模型学科正确率未作真实验收。
- 完整考试试卷、服务器无人值守、手机号密码自动登录、动态二维码不是本轮已实现功能；README 如实注明。

## 本地回归记录

```text

> ykt-helper-userscript@1.0.0 pretest
> npm run build


> ykt-helper-userscript@1.0.0 build
> rollup -c


> ykt-helper-userscript@1.0.0 postbuild
> node -e "import('./rollup.config.mjs').then(({ OUT_FILE }) => console.log('\n✅ Build done: ' + OUT_FILE))"


✅ Build done: dist/ykt-helper-1220.user.js

> ykt-helper-userscript@1.0.0 test
> node --test test/*.test.js

✔ includes one minute before and ten minutes after a configured time (2.34338ms)
✔ supports a priority window crossing midnight (0.326752ms)
✔ selects configured fast and verification profiles and falls back safely (0.546357ms)
✔ compares equivalent choice and text answers after normalization (0.446279ms)
✔ explicit quick mode overrides clock windows in both directions (0.327974ms)
✔ routes a teacher ending a problem early to onProblemFinished (3.71812ms)
✔ routes a time extension with its problem payload to onExtendTime (0.490034ms)
✔ does not treat the page's own probleminfo timer reply as a teacher publication (0.552496ms)
✔ reminds about quizzes and exams pushed as newquiz / newpaper (0.709588ms)
✔ keeps slide navigation and presentation refreshes out of publish reminders (0.58889ms)
✔ requires seven messages within thirty seconds and chooses the most frequent full text (1.694803ms)
✔ ties choose the last occurrence and all distinct texts choose the latest (0.576251ms)
✔ old messages outside the thirty second window do not count (0.188899ms)
✔ reservations enforce two sends per absolute minute, even before asynchronous completion (0.391619ms)
✔ same text is suppressed in one round; a definite failure rolls back its reservation (0.290469ms)
✔ a late result from the previous round cannot consume new-round quota (0.226234ms)
✔ controller awaits the sender and never counts its own messages (1.666641ms)
✔ disabled and notification-only controllers never send; parser retains identity (0.296097ms)
✔ uses a granted browser notification when a mobile host has no GM notification API (2.594441ms)
✔ does not invoke the browser notification constructor without granted permission (1.170278ms)
✔ keeps an untimed problem open when the protocol sends an empty limit (1.641574ms)
✔ keeps an untimed problem open when the protocol uses zero as the limit (0.22344ms)
✔ calculates the deadline for a positive time limit in seconds (0.163912ms)
✔ does not create a NaN deadline for malformed limits (0.151063ms)
✔ reports no countdown for an untimed problem (0.448753ms)
✔ calculates the remaining countdown for a timed problem (0.639054ms)
[雨课堂助手][AI Text] Status: 200
[雨课堂助手][AI Text] 收到模型响应
[雨课堂助手][AI Text] Status: 200
[雨课堂助手][AI Text] 收到模型响应
[雨课堂助手][AI OpenAI Vision 单步] Status: 200
[雨课堂助手][AI OpenAI Vision 单步] 收到模型响应
[AI OpenAI Vision] 成功获取回答(单步)
✔ uses the active profile temperature for a text completion (5.64801ms)
✔ omits temperature when the active profile leaves it blank (0.647506ms)
✔ uses the active profile temperature for a vision completion (1.094206ms)
✔ classifies an exam or test group publication as an assessment reminder (4.095547ms)
✔ reads an assessment group nested inside a websocket data payload (0.452198ms)
✔ classifies a published presentation as a courseware reminder (0.328505ms)
✔ does not mistake a displayed slide for a newly published courseware item (0.442253ms)
✔ does not treat opening an existing presentation as a courseware publication (0.286854ms)
✔ keeps an unclassified publish event selectable as a generic release reminder (0.329176ms)
✔ ignores ordinary websocket messages that are not publication events (0.357228ms)
✔ honors each publish-reminder category independently (1.440257ms)
✔ uses the existing bell switch as a global off switch for publish reminders (0.934911ms)
✔ routes a group publication to the notification path rather than the answer path (0.573848ms)
✔ uses the protocol problemid to distinguish successive problem publications (0.303428ms)
✔ uses a scalar problem value to distinguish successive problem publications (0.269728ms)
✔ uses a scalar presentation value as the courseware dedupe key (0.212825ms)
✔ does not mistake non-publish problem operations for a new assessment (0.165174ms)
✔ keeps unlockproblem metadata when the protocol sends a scalar problem id (1.179392ms)
✔ notifies a published group once while repeated websocket events arrive (3.54805ms)
✔ does not notify a release category that the user disabled (0.255858ms)
✔ allows the same group to notify again after the dedupe window (0.224752ms)
✔ dedupes repeated new-problem websocket frames independently of publish events (0.254576ms)
✔ sends mobile realtime problem events through the notification-only path (3.73781ms)
✔ keeps desktop realtime events on the normal action path (0.362475ms)
✔ routes newdanmu frames to the barrage handler (0.505947ms)
✔ published stable and versioned scripts are byte-identical to the current build (3.239054ms)
✔ lets users disable every classroom reminder event independently (2.2213ms)
✔ uses the master reminder switch to silence every event (0.305712ms)
✔ lets users independently choose native notification, popup, and sound delivery (1.815651ms)
✔ preserves a user-selected zero notification volume (0.410926ms)
✔ marks every mobile /m/v2 route for desktop redirection (2.920097ms)
✔ converts mobile entry and lesson URLs to their desktop equivalents (0.406831ms)
✔ waits at the root entry and never starts desktop features before a mobile route is redirected (0.232153ms)
✔ redirects an initially loaded mobile URL to the matching desktop URL (1.692299ms)
✔ rewrites SPA, link, and history navigation away from mobile URLs (0.91467ms)
✔ stops after one attempt when a server redirects the same route back to mobile (1.210608ms)
✔ bundled parser preserves negative (96.462489ms)
✔ bundled parser preserves interval (16.097852ms)
✔ bundled parser preserves expression (8.586711ms)
✔ bundled parser preserves long blank (14.186204ms)
✔ bundled parser preserves english answer (8.801407ms)
✔ bundled parser preserves invalid option (7.007408ms)
✔ bundled parser preserves string problem type (6.607238ms)
✔ bundled parser preserves multiple blanks (7.606392ms)
✔ bundled parser preserves ambiguous blank boundary (9.5758ms)
✔ local drafts persist without pretending that the server has an answer; unrelated updates preserve input nodes (38.743363ms)
✔ ordinary AI answering sends exactly one generation and one normal submission (25.443172ms)
✔ a question closed while still queued continues through the allowed retry route (16.690979ms)
✔ a manual submission during AI generation wins, including after teacher finish (43.885987ms)
✔ turning automatic answering off during AI preserves its paid result without submitting (35.419535ms)
✔ empty result arrays do not suppress automatic answering; local mode never submits (13.926525ms)
✔ 50026 falls back to retry only when policy permits (16.126705ms)
✔ an empty retry success list never updates the remote answer, even with the native interceptor installed (8.494354ms)
✔ unparseable submission responses preserve the proposal and require reconciliation before another submission (13.151281ms)
✔ native submit timeout settles the task as unknown instead of leaving it hanging (16.302755ms)
✔ batch retries synchronize every confirmed ID, not just the first (24.135842ms)
✔ fetch(Request) bodies are observed without consuming the original request (28.005296ms)
✔ XHR.open preserves all optional native arguments (6.007211ms)
✔ classroom events remain scoped even if two lessons reuse a question identifier (5.724354ms)
✔ unlock arriving before presentation data resumes after data loads, with no second timeline needed (28.961238ms)
✔ managed sockets are cleared after close and can reconnect (15.982702ms)
✔ automatic join can stop and restart, and settings changes apply to its running controller (23.171097ms)
✔ a reset clears API keys and non-default audio/analysis fields without mutating defaults (6.911507ms)
✔ settings preserve zero volume, zero random delay, and explicitly cleared vision model (79.199656ms)
✔ profile switching retains edited drafts and does not activate unsaved profiles (35.30745ms)
✔ one AI open operation produces a single paid request even if multiple UI events fire (79.078758ms)
✔ a late AI response cannot replace a newer page analysis (42.866392ms)
✔ double OCR clicks share one in-flight request (26.351639ms)
✔ a missing page in a multi-page question is reported before the model is called (18.431849ms)
✔ Markdown preserves TeX underscores and code without turning them into emphasis (6.955271ms)
✔ report pages merge later-loaded slides after the first successful collection (14.366465ms)
✔ loading a scoped presentation cache hydrates slide and question indexes (7.368952ms)
✔ storage failure never prevents the in-memory teacher-finished transition (11.286528ms)
✔ ai=null configuration migrates before any deep field access (6.038146ms)
✔ quick on, window false, uses fast-model in the actual request (12.583773ms)
✔ quick off, window true, uses fixture-model in the actual request (13.900663ms)
✔ quick auto, window true, uses fast-model in the actual request (12.184303ms)
✔ quick auto, window false, uses fixture-model in the actual request (13.27961ms)
✔ two tabs cannot independently generate and submit the same question (31.061329ms)
✔ save failure rolls runtime settings back and reports that persistence failed (8.52546ms)
✔ current courseware is quiet while another new publication is deduplicated (6.332892ms)
✔ finished untimed cards disappear and each remaining card opens its own question (28.8269ms)
✔ danmu never overwrites a user draft and click alone never counts as dispatch (19.912876ms)
✔ a matching outbound frame confirms dispatch only for the correct lesson (9.705282ms)
✔ a stuck image download has a bounded timeout and cannot leave answering stuck (18.860602ms)
✔ an expired queue deadline is checked when dispatched, before a paid request is sent (18.746694ms)
✔ JPEG images retain the matching MIME in the actual vision payload (8.291003ms)
✔ refresh restores an interrupted task and local proposal without repeating the model call (20.083768ms)
✔ SPA route changes switch the classroom view without retaining the previous lesson data (57.48174ms)
✔ internal submission observations cannot invalidate the same task during post-submit verification (16.918034ms)
✔ courseware titles remain text rather than executable HTML (20.340924ms)
✔ automatic-join policy can schedule its own lesson without enabling the manual-lesson switch (9.705852ms)
✔ paused automatic-join answering stays paused across persistence and reload (7.868189ms)
✔ late boot starts once without forced reloads or duplicate toolbars (153.397587ms)
✔ existing manual drafts are never silently replaced by a later automatic task (7.544932ms)
✔ cached unfinished proposals are actually rescheduled on boot, not only restored into a dormant map (28.655897ms)
✔ a newer unlimited extension wins over stale explicit deadline options (9.978927ms)
✔ recognizes both classroom URL shapes (3.151844ms)
✔ acquires the screen wake lock only while an enabled classroom is visible (1.012846ms)
✔ releases the screen wake lock as soon as the user disables it (0.477715ms)
✔ reacquires the wake lock when the visible classroom returns from the background (7.324457ms)
✔ does not request a wake lock outside a classroom page (0.540899ms)
✔ reports an unsupported browser without throwing (0.388644ms)
✔ shares an in-flight request so disabling always releases the acquired sentinel (1.62554ms)
✔ releases a sentinel that resolves after the user disables wake lock (1.850793ms)
✔ does not mutate any profile field when temperature validation fails (2.992319ms)
✔ writes every profile field together after temperature validation succeeds (0.355655ms)
✔ syncs every reminder checkbox from the current configuration when a panel opens (0.625263ms)
✔ injects on supported root and exact /web entry URLs before mobile routing starts (2.675961ms)
✔ injects on the supported mobile /m/v2 entry points without matching unrelated hosts (0.611594ms)
ℹ tests 136
ℹ suites 0
ℹ pass 136
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2175.87828

```
