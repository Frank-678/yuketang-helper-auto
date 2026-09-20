# 雨课堂助手全量回归测试矩阵

> 产品边界：最终只保留轻量浏览器 JavaScript userscript。Windows/Electron/CLI/桌面网络观察器等桌面软件方向不进入最终产品，也不作为后续发布目标。历史分支中的这类提交只做一次审计：若包含可独立复用的纯 JS 逻辑则单独移植，否则整体舍弃。
>
> 目标：版本号和人工印象都不能再作为“功能没坏”的依据。每个用户可见功能必须至少有一条行为测试；关键链路必须从入口覆盖到最终副作用。

## 测试层级

- **L1 纯函数单元测试**：输入/输出、边界值、序列化、题型解析、时间计算。
- **L2 状态机/服务测试**：注入依赖，验证状态迁移、重试、锁、恢复、Profile 选择、提交路由。
- **L3 浏览器合同测试**：用最小 DOM / Window / GM / XHR / WebSocket mock，验证真实 UI 事件和网络调用参数。
- **L4 场景链路测试**：模拟课堂事件，从实时消息一直走到提醒/AI/提交/状态完成；模拟刷新、自动进入课堂、弹幕等多模块协作。
- **L5 构建产物合同**：build 后检查 userscript metadata、关键功能标识、入口匹配和历史版本不被覆盖。

## A. 启动 / 路由 / 生命周期

- [ ] document-start 安装 WS 拦截器。
- [ ] DOM 未 ready / 已 ready 两种启动路径。
- [ ] late mount 只自动刷新一次，不形成 reload loop。
- [ ] 周期刷新只启动一个 timer。
- [ ] 非课堂页 60 秒周期刷新。
- [ ] `/lesson/` 页面跳过周期强刷。
- [ ] `/m/v2` 正确转换桌面路由；query/hash 保留。
- [ ] 移动端重定向循环保护。
- [ ] SPA pushState / replaceState / popstate / hashchange 重新检查 runtime。
- [ ] 根入口、桌面首页、课堂页的 runtime 启动策略。

## B. 配置 / 存储 / Profile

- [ ] 默认配置完整。
- [ ] 旧版 `kimiApiKey` 迁移到 Profile。
- [ ] 旧版顶层 `profiles/activeProfileId` 迁移到 `ai.profiles/ai.activeProfileId`（若历史数据存在）。
- [ ] shallow merge 不丢失 `ai` 子字段默认值。
- [ ] 保存 Profile 后重载配置仍一致。
- [ ] 多 Profile 增删切换。
- [ ] Temperature 空值/0/边界/非法值。
- [ ] fast / verify Profile 选择。
- [ ] 当前 Profile 无 key 时明确失败/回退策略。
- [ ] API URL、模型、visionModel 读取正确。
- [ ] 自动答题及恢复开关持久化。
- [ ] 所有提醒渠道/声音/弹幕/亮屏配置持久化。

## C. 实时事件 / 题目识别 / timeline

- [ ] `unlockproblem` 直接实时新题。
- [ ] `fetchtimeline` 首次快照只建 baseline。
- [ ] 后续 timeline 新 problem 识别为 live-new。
- [ ] timeline 重复项不重复提醒/答题。
- [ ] 翻页/旧课件打开/刷新不误报。
- [ ] problemId 各种字段别名：prob/problemId/problemid/problem.id。
- [ ] slideId 各种字段别名。
- [ ] 新题事件先到、题目数据后到：重试后继续完整流程。
- [ ] 10 秒仍无数据：可见失败提示，不静默。
- [ ] 多 lesson 同 problemId 隔离。

## D. 提醒

- [ ] 新题提醒去重。
- [ ] 自动作答 scheduled / started / succeeded / failed 四阶段。
- [ ] 手动 AI 强制作答 started / succeeded / failed。
- [ ] 系统通知 / popup / sound 各自开关。
- [ ] 总提醒开关。
- [ ] 课程结束提醒。
- [ ] assessment/courseware/other 发布提醒。
- [ ] 当前正在查看的同课件发布抑制；跨课/跨课件仍提醒。

## E. 自动作答状态机（最高优先级）

- [ ] 新题 + autoAnswer=true 必须进入 queued。
- [ ] delay + random delay 只等待一次。
- [ ] 到时 runner 必须启动。
- [ ] `endTime=null/undefined/''/0 invalid-limit` 不误判过期。
- [ ] 真正过期且未开启 retry 不自动提交。
- [ ] 开启 autoForceRetry 只重试一次。
- [ ] 空 `result`: null/undefined/''/[]/{} 都视为未作答。
- [ ] 非空 result 视为已答。
- [ ] answering 锁防止并发双提交。
- [ ] failed 状态可由新 live 事件重新排队。
- [ ] 提交成功状态 done；恢复记录删除。
- [ ] AI/截图/解析/网络任一步失败状态 failed，并可手动重试。
- [ ] correction 二次提交失败仍保留首次成功。

## F. AI Profile / AI 请求

- [ ] 有有效 Profile 时 runner 必须走 AI，不得悄悄 default-fallback。
- [ ] 无 Profile 时 fallback 行为明确且有日志/提示。
- [ ] active Profile 正确选择。
- [ ] fast window 正确选择 fast Profile。
- [ ] fast key 缺失回退 active Profile。
- [ ] verify Profile 独立选择。
- [ ] OpenAI-compatible 请求 URL、Authorization、model、temperature、max_tokens 正确。
- [ ] vision 请求图片 payload 正确。
- [ ] HTTP 非 2xx / JSON 错误 / API error 字段正确抛错。
- [ ] 空 choices / 空 content 正确失败。
- [ ] OCR/翻译配置不污染答题 Profile。

## G. 截图 / AI prompt / 答案解析（所有题型）

- [ ] 优先课件图截图；失败后页面题目截图 fallback。
- [ ] 无图时明确失败。
- [ ] 单选：A/B/C/D、带解释、中文标点。
- [ ] 多选：AB/ACD/逗号/空格/数组形式。
- [ ] 投票题。
- [ ] 填空题：单空、多空、换行/逗号、数字/文本。
- [ ] 主观题：纯文本、对象结构。
- [ ] AI 返回 JSON / Markdown code fence / `答案:` 文本。
- [ ] 非法答案不能提交。

## H. 提交 / 强制补交 / 编辑答案

- [ ] 普通 `/answer` 路由。
- [ ] `/retry` 仅在显式 forceRetry 或允许截止后 retry 时使用。
- [ ] lessonId / problemId / presentationId / slideId 请求参数正确。
- [ ] 单选/多选/填空/主观题 payload 正确。
- [ ] 手动“提交”点击立即请求，不继承 auto delay。
- [ ] “强制补交”立即请求 retry。
- [ ] “AI 强制作答”忽略 done/result 本地状态并重新 AI → 提交。
- [ ] AI 强制作答不允许并发重复点击。
- [ ] 提交 API 失败必须提示失败，不得本地标 done。
- [ ] 服务器成功后才更新本地 result/status。
- [ ] 快速连续点击不产生多笔重复提交。

## I. 刷新恢复

- [ ] queued 刷新后恢复。
- [ ] answering 刷新后按策略恢复。
- [ ] failed 默认不自动恢复，除非策略要求。
- [ ] expired 默认不补交。
- [ ] expired + autoRecoverExpired 走 retry。
- [ ] 恢复记录按 lesson 隔离。
- [ ] done 后删除恢复记录。
- [ ] 24h / 100 条清理上限。

## J. 自动进入课堂 / 多课堂

- [ ] 只识别 status=1 活跃课。
- [ ] 多活跃课堂分别建 WS。
- [ ] 已连接不重复连接。
- [ ] 课堂结束关闭 socket/清理状态。
- [ ] stop 后可 restart。
- [ ] autoAnswerOnAutoJoin 动态开关即时生效。
- [ ] 自动进入课堂的答题策略不依赖全局 autoAnswer。
- [ ] 自动跳转选最新课堂。
- [ ] 用户鼠标/键盘/滚轮/触摸/路由操作取消自动跳转。

## K. 弹幕

- [ ] newdanmu 分发。
- [ ] 自己的回显排除。
- [ ] 30 秒内 7 条触发。
- [ ] 频率最高文本跟发；全不同按最新一条。
- [ ] 一轮 <=60 秒、最多 2 次、同文本一次。
- [ ] 手动发弹幕不错误消耗脚本 sentCount。
- [ ] 找不到控件 / disabled / 未捕获出站帧 / 异常均返回明确原因。
- [ ] 成功必须捕获匹配的出站 WS frame。
- [ ] 失败不重复刷屏。

## L. UI

- [ ] 设置面板打开时从当前 config 回填。
- [ ] 保存按钮触发持久化和 config-changed 事件。
- [ ] AI 面板只对当前选题操作。
- [ ] 题目列表每题操作作用于正确 problemId。
- [ ] 编辑器按题型解析。
- [ ] 提交/强制补交/AI强制作答按钮单击只触发一次。
- [ ] pending 时按钮应禁用或防重入。
- [ ] 成功/失败 toast 文案与真实结果一致。
- [ ] 题目页外不显示当前题框。

## M. Wake Lock / 通知 / 辅助功能

- [ ] 可见课堂请求 wake lock。
- [ ] hidden / disable 时释放。
- [ ] 并发请求不遗留锁。
- [ ] 自定义提示音、默认提示音、音量。
- [ ] GM_notification 不可用时不影响主流程。

## N. 构建 / 发布

- [ ] npm test 全绿。
- [ ] npm run build 成功。
- [ ] userscript `@match` 覆盖三个站点及 desktop/mobile 入口。
- [ ] metadata version 与现场版一致。
- [ ] 历史 release 文件不可被覆盖。
- [ ] build bundle 含实时事件、AI、提交、弹幕、刷新关键代码。
- [ ] 临时 patch workflow 不进入最终 main。
- [ ] 最终发布树中不存在 `ykt-helper-win`、Electron、Windows installer 或桌面 CLI 依赖。

## 关键场景链路（必须有 L4）

1. **课堂正常自动 AI**：WS/timeline live-new → 数据加载 → 新题提醒 → scheduled → runner started → AI vision → parse → `/answer` → success → done。
2. **手动 AI 强制作答**：已存在本地 result/done → 点击一次 → runner started → AI → `/answer` 或显式 retry → success。
3. **编辑答案普通提交**：编辑 → 点击一次 → 立即 `/answer` → 成功后 done；失败保持未完成。
4. **编辑答案强制补交**：编辑 → 点击一次 → `/retry` → 成功。
5. **不限时题**：`limit=null/0/invalid` → 不过期 → AI 正常开始。
6. **实时事件数据竞态**：unlock 先到 → presentation 数据后到 → 重试恢复 → 自动答题继续。
7. **刷新恢复**：queued 中刷新 → 恢复 → 只提交一次。
8. **自动进入课堂**：首页检测活跃课 → 建 WS → 新题 → 自动答题。
9. **弹幕跟发**：7 条/30s → 通知 → sender → 捕获 WS 确认 → sentCount+1。
10. **周期刷新**：非 lesson 页 timer → reload；lesson 页 tick → skip。

## 完成判据

- 关键链路 1–10 全部有行为测试且通过。
- 所有用户可见开关至少有一条开/关测试。
- 每种题型至少覆盖 AI 解析 + 提交 payload。
- 网络失败、超时、重复点击、空数据、跨 lesson、刷新均有负向测试。
- CI 同时执行 unit/contract/scenario/build，不允许只靠静态正则证明功能可用。
- 最终产物是一份轻量 userscript；Windows/Electron 桌面程序不进入最终发布。
