# 独立审查整改与申辩说明（2026-09-18）

## 结论

2026-09-17 独立审查给出的“不通过”结论，对当时被审查的代码状态是成立的；本说明不否认原审查，而是针对其发现逐项完成整改，并说明为何该结论不应继续直接套用于当前修复分支 `fix/independent-audit-remediation-20260917`。

当前自动化证据为：

- Full Regression：run **35302178982**，五层全部通过。
- Final Independent Remediation Audit：run **35302246460**，Regression/Fault Injection/Supply-chain、Fresh Chromium Black-box、CodeQL 三组全部通过。
- Final userscript build：run **35302430080**，构建与产物合同通过，发布现场版 **1.21.6.8**。
- 最终独立审查所覆盖的产品源码之后未再修改 `src/**`；后续提交仅用于生成 release 产物、删除一次性 workflow、加入本整改说明。

因此，原审查中已确认的高优先级自动化缺陷目前均已有修复与回归证据。仍然保留一个明确边界：**真实课堂现场验收不能由 CI 替代**，所以本说明主张的是“自动化审查层面整改闭环，可以进入现场验收”，而不是声称不存在任何未来运行时问题。

## 对原独立审查逐条回应

### 1. 严格产物黑盒

原审查：产物级 Chromium 黑盒行为通过，但整体审查因其它独立 job 失败而判 failure。

整改后：最新产品代码重新运行 Fresh Chromium userscript black-box，通过。黑盒继续直接运行 freshly built `.user.js`，不 import `src/**`，覆盖首载、mobile→desktop 路由、普通页面 UI 隔离、启动阶段非预期写请求、metadata/语法等行为。

状态：**闭环**。

### 2. AI timeout 永久 pending

原审查：`GM_xmlhttpRequest` 配置 timeout，却缺少 `ontimeout`，transport timeout 后 Promise 永不 settle。

整改：
- 文本与 Vision 请求均实现明确 `ontimeout` reject。
- 默认 AI 请求预算统一为 **120 秒**。
- 自动作答强制采用 **single-step Vision**，避免默认两阶段把一次题目放大成 2–3 个串行模型请求。
- 两阶段手动 AI 中，transport timeout 不再继续发起昂贵 fallback 请求。
- 未配置可用 AI Profile/API Key 时 **fail closed**：不再生成伪造默认答案并提交。
- fault-injection 与自动作答生命周期测试覆盖 timeout、network error、no-profile 等失败路径。

状态：**闭环**。

### 3. `fetch-interceptor -> state/actions` 架构反向依赖

原审查：`src/net/fetch-interceptor.js` 仍直接 import `state/actions.js`。

整改：移除历史残留 import，网络拦截器通过 runtime dispatch/模块边界与状态层解耦；独立 architecture-boundary 检查通过，Madge circular-import 检查通过。

状态：**闭环**。

### 4. 构建供应链 high advisory

原审查：Rollup、serialize-javascript、picomatch 等存在 high advisory。

整改：
- Rollup 升级到安全的 4.63.x 系列。
- `@rollup/plugin-terser` 升级至使用安全 serialize-javascript 的版本。
- picomatch、serialize-javascript 解析到安全版本。
- `npm audit --audit-level=high` 纳入独立最终门控并通过。
- 未使用 `npm audit fix --force`，所有升级均经过 full regression + build contract。

状态：**闭环**。

### 5. API Key 存在 localStorage

原审查：AI Profile/API Key 位于页面同源 JavaScript 可读的 localStorage。

整改：
- Profile/OCR/translation/legacy key 迁移到 Tampermonkey userscript 私有存储（`GM_getValue/GM_setValue/GM_deleteValue`）。
- localStorage 中只保留脱敏后的非 secret 配置。
- 旧 localStorage key 采用“先成功写入私有区，再清除旧副本”的原子迁移策略；私有存储不可用时 fail closed，不把 secret 回写 localStorage。
- 私有 key 与 endpoint 绑定；如果页面可见配置中的 endpoint 被篡改，旧 key 不会被重新注入到新 endpoint，必须重新输入 key。
- 设置面板不会把已保存私有 secret 重新填回页面 DOM，并提供显式 secret-clear 行为。
- 对 OCR/translation 的 endpoint/key 复用也增加跨 endpoint 防护。

状态：**闭环**。

### 6. 未固定的 html2canvas runtime supply-chain surface

原审查：运行时动态加载无版本 `html2canvas.hertzen.com/dist/html2canvas.min.js`。

整改：
- html2canvas 固定到 **1.4.1**。
- jsPDF 固定到 **2.5.1**。
- MathJax 固定到 **3.2.2**。
- 上述 userscript `@require` 均附 SHA-256 integrity hash。
- 删除 runtime 动态插入远程 JavaScript 的 fallback。
- Font Awesome 6.4.0 stylesheet 也增加 SRI，并集中由单一 loader 管理。
- build contract 禁止重新出现未固定 html2canvas URL或动态 remote-script injection。

状态：**闭环**。

### 7. 原测试体系存在盲区及 Node test IPC flake

原审查：旧测试可全绿但漏掉 AI timeout 与架构耦合；同时出现 `Unable to deserialize cloned data` 的 node:test 并发 IPC flaky failure。

整改：
- 测试重构为 Legacy / Unit / Browser+Network Contract / Cross-module Scenario / Build Contract 五层。
- 新增真实 `actions -> AI -> parse -> /answer` L4、AutoJoin→WS→AI→submit、timeline、recovery、danmu sender/WS confirmation、UI button/network side effect、runtime bootstrap 等综合场景。
- contract/scenario 文件级执行改为稳定模式，避免 Node test runner IPC 并发噪音掩盖业务结果。
- 独立 fault injection、Chromium black-box、CodeQL、architecture boundary 与 supply-chain audit 作为第二套审查面。
- 当前最新 Full Regression 与 Final Independent Remediation Audit 均通过。

状态：**闭环**。

## 整改过程中额外发现并修复的问题

独立审查之后的扩展测试还发现并修复了以下问题：

- HTTP 非 2xx 不能因 body 中 `code:0` 被误判提交成功。
- `/retry` success id 的 number/string 兼容。
- XHR 提交增加有限 timeout，超时后 UI action lock 正确释放。
- 空 `[]/{}/''` 不再被错误视为“已作答”。
- `Number(null) === 0` 导致不限时题误判过期的问题在 runner/UI/AI panel 统一修复。
- AI 强制作答允许显式 resubmit，但普通自动流程仍尊重已答状态。
- 自动刷新从 desktop runtime 解耦，首载不再依赖“第二次刷新激活”。
- timeline live-delta 与 problem/slide hydration race 增加有界重试。
- 弹幕“轮”增加绝对 60 秒边界，且发送失败不再被无声吞掉。
- page-global exposure 收紧，interceptor/observer 状态改为模块私有。
- presentation 题目列表统一使用结构化 answer-state 判断。
- 没有 AI 时自动作答不再 fallback 到人为默认选项，避免错误自动提交。

## 当前可发布/验收版本

现场 userscript：**1.21.6.8**

文件：
`release/ykt-helper-1216-field.user.js`

分支：
`fix/independent-audit-remediation-20260917`

固定产物构建 run：
`35302430080`

## 申辩请求

基于以上整改证据，请将 2026-09-17 针对旧代码状态的“不通过”结论视为**已完成整改的历史审查结论**，不要继续作为当前修复分支的最终结论。

建议当前状态更新为：

> 自动化回归、独立源码审查、供应链审查、Chromium 黑盒与 CodeQL 均已通过；可以进入真实课堂现场验收。真实课堂验收完成之前，不宣称正式生产稳定。

这一定义既保留了独立审查的严谨性，也与当前已有自动化证据一致。


## 现场复验补充：AI 429 并发与提交状态（2026-09-18 11:45）

现场复验进一步发现，先前被用户感知为“AI 大量超时”的一部分失败，实际是 AI 服务返回 HTTP 429：

`Your account organization concurrency: 1, request reached max organization concurrency: 1`

截图同时出现“页面分析失败”和“自动作答失败”，证明脚本自身可能让 AI 面板分析与自动作答并发使用同一凭据，从而撞上账号并发上限。

本轮整改已完成：

1. 同一 API 凭据/endpoint 的 AI 请求进入共享串行队列，脚本自身不会再制造 >1 的并发。
2. HTTP 429 会读取 `Retry-After` 或响应消息中的 `try again after N seconds`，在有限次数内自动退避重试。
3. 自动作答固定使用单步 Vision，避免默认两阶段 Vision→Text 把一次作答放大成 2–3 个串行 AI 请求。
4. AI 默认请求预算统一为 120 秒；transport timeout 不再触发另一轮高成本 fallback。
5. 普通提交遇到 `50028 LESSON_PROBLEM_ALREADY_ANSWERED` 或 `50026 LESSON_PROBLEM_FINISHED` 时，会转换成可操作的“请使用强制补交”提示，并保留结构化错误码。
6. 新增回归测试覆盖：同凭据串行、429 自动重试、非 429 不重试、50026/50028 状态提示。

验证证据：commit `c54de267d206c8643832ea3d8b0d9f6876fd5e01` 的 Full Regression 五层均通过（Legacy / Unit / Browser+Network Contract / Cross-module Scenario / Build Contract）。

这项现场补充不改变此前独立审查对源码安全、供应链、私有凭据存储和架构整改的结论，只补充说明了真实课堂环境中额外发现并已关闭的 AI 并发故障路径。
