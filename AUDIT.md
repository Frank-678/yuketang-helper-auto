# 雨课堂助手 1.21.7 全功能审查与连贯化方案

审查日期：2026-10-21。对象：Frank-678/yuketang-helper-auto。状态：审查与方案，未修改产品代码、未提交或推送仓库。

## 结论与范围

当前发布版已能完成部分自动作答、AI 分析和手动强制补交，应作为保留基准。主要问题集中在“草稿、AI 建议、服务器答案、题目时限、提交结果”共用模糊状态，导致功能各自可用，组合后容易漏交、误判、覆盖和重复执行。

本报告按模块列出 **53 项问题**，其中包括已复现的实现/兼容缺陷、明确功能缺口和与需求不同的行为，不把它们全部等同为每次必现的课堂故障。另列需要真实环境确认的风险。每项附代码位置、触发条件、观察结果与修复方向。

基准是提交 `4fe7c0382a00d84e2db2d6288c18d3aa2392fd86` 的 `release/ykt-helper-1217.user.js`，SHA-256：`05ceb9e3269297ee72dbe000732303883ba16412a304c4002d6f74538b6abbe9`。与当前 main 对应发布文件逐字节相同，也与用户贴出的片段特征吻合；用户尚未提供完整安装文件的校验值，因此不能宣称已经比对完整安装副本。

完成的验证：

- 对实际发布文件做 69 个 JSDOM 隔离场景检查。仅在内存副本中开放内部函数并阻止自动启动；通过替身隔离图片、AI 与提交请求，测试实际控制流和 DOM 交互。全部场景均执行结束，无测试框架异常；这不是“69 项功能均通过”。
- 原有 73 项测试全部通过。历史基准构建成功，产物通过语法检查；与仓库发布文件的字节差异仅是模板字符串中的 CRLF/LF，归一化后完全相同。
- 对 1.21.6 原始执行器和 PR #6 执行器补做 4 个针对性检查；对恢复、弹幕、提醒、跳转及模型选择模块作源码检查。
- 对照 6 份用户日志。它们内容互相重叠，按完整记录去重后为 880 条；可见 7 次独立的 45 秒 AI 超时错误，5 道题有 auto-submitted 记录。此数字不是全时段成功率。

不在本次已完成验证范围：真实雨课堂服务器权限/接口契约、Android Edge 与 Tampermonkey 沙箱、真实图片 CORS、系统通知/音频权限、锁屏与后台冻结、视觉布局及模型答案的学科正确率。没有向真实课堂发题、答题或发弹幕，也没有调用付费模型。

## 历史与运行基线

| 节点 | 提交 / PR | 判断 |
|---|---|---|
| 1.21.4 可用主线 | `cb98ed0` | 1.21.7 重建时选择的起点 |
| 旧功能恢复 | PR #1，`dd4b0bb` → `ed82303` | 后经 PR #2 撤销；原始 runner 有不限时题误判 |
| 稳定性整改 | PR #4，`35c5aff` → `9c21990` | 旧功能与接线的另一条发展路线 |
| 独立整改 | PR #5，`af37eb9` | 关闭并由 PR #6 接替，不能算已合并 |
| 后续验证与反馈 | PR #6，`9112deb` | 已关闭、未合并；纯模块有价值，执行链仍有缺陷 |
| 1.21.7 重建 | `888cb83` → `4fe7c03` | 本次实际发布文件对应的可构建源码基线 |
| 两条路线合并 | `f8dea76` | 带来重复源码与语法问题，但没有重建发布文件 |
| 当前 main | PR #7，`0a5edb7` | 源码处于合并后的状态，release 文件仍与 4fe7c03 相同 |

MyLLMData 中读取了与雨课堂有关的两份 Claude 会话记录，第三份较大的会话未完整获取。历史记录用于定位意图和提交，代码与实测结果优先于旧助手“已经验证”的表述。版本号曾被复用，不能只凭 1.21.5/1.21.6 标签判断是哪一份代码。

已有 `auto-answer-current` tag 指向当前 main 的 `0a5edb7`，并非纯净可构建基线 `4fe7c03`；恢复源码时应明确检出提交，不能误把这个 tag 当成已修好的源代码。

## 优先修复

先处理会改变答案或误判提交的路径：F01–F05、F07–F10、F14–F18、F27、F29、F42、F51。保留已有能工作的入口，逐条补场景后替换内部逻辑；不要把旧分支整体合回来。

优先级：P1＝可能改变答案、漏交/误交、假成功、数据丢失或核心流程挂起；P2＝特定操作、需求边界或兼容条件下出错。无 P0 全站必坏结论。

## 功能覆盖

| 功能 | 当前判断 | 主要事项 |
|---|---|---|
| 普通 AI 自动作答、限时/不限时 | 正常路径可用 | 边界时序、解析、关闭开关、超时恢复 |
| 手动提交/强制补交 | 有可用路径 | 本地草稿混入 result；失败回写不一致 |
| 刷新恢复/补答 | 当前版缺少完整持久化链路 | 候选答案与提交结果需保留 |
| 多题同时发布 | 能创建任务 | 全局串行队列没有截止时间调度 |
| AI 面板与多页提问 | 基本可用 | 重复请求、乱序结果、部分图片丢失 |
| OCR/翻译 | 本地模拟正常路径可用 | OCR 缺少去重；独立模型配置兼容性待验证 |
| 课件浏览/下载/报告页 | 有可用路径 | 跨课堂数据、懒加载采集、导出筛选语义 |
| 弹幕 | 实现的是旧规则 | 规则、发送确认、额度和用户输入保护 |
| 课堂提醒 | 基本分类可用 | 历史与当前课件误报；真实试卷推送格式待验证 |
| 自动加入/课堂切换 | 多处状态缺陷 | 开关、重连、SPA 上下文、无效课堂跳转 |
| 设置与存储 | 可保存但异常路径不可靠 | 重置、密钥、配额、0 值与表单草稿 |
| 手机入口/亮屏 | 源码与已有单测已检查 | 须真实 Android 与浏览器权限实测 |

## 问题目录

| 编号 | 级别 | 模块 | 问题 | 性质 |
|---|---|---|---|---|
| F01 | P1 | 答案与本地草稿 | [填空解析会改变数学答案](#f01) | 实现缺陷 |
| F02 | P1 | 答案与本地草稿 | [填空答案超过 50 字后变为主观题结构](#f02) | 实现缺陷 |
| F03 | P1 | 答案与本地草稿 | [选择题解析过宽，可能提交不存在或错误的选项](#f03) | 实现缺陷 |
| F04 | P1 | 答案与本地草稿 | [空答案数组被视为已经作答](#f04) | 实现缺陷 |
| F05 | P1 | 答案与本地草稿 | [保存本地草稿会冒充已提交答案](#f05) | 实现缺陷 |
| F06 | P2 | 答案与本地草稿 | [“保存(本地)”仅存内存，刷新就丢](#f06) | 实现缺陷 |
| F07 | P1 | 答案与本地草稿 | [其他题目提交会清空当前编辑草稿](#f07) | 实现缺陷 |
| F08 | P1 | 自动作答与提交 | [题目在排队期间结束后不会自动强制补交](#f08) | 实现缺陷 |
| F09 | P1 | 自动作答与提交 | [AI 返回后可能覆盖用户手动提交的答案](#f09) | 实现缺陷 |
| F10 | P1 | 自动作答与提交 | [关闭自动作答后，已排队任务仍会提交](#f10) | 实现缺陷 |
| F11 | P2 | 自动作答与提交 | [重新开启自动作答不能接续已有未答题](#f11) | 实现缺陷 |
| F12 | P1 | 自动作答与提交 | [题目事件早于课件数据到达时会漏题](#f12) | 实现缺陷 |
| F13 | P1 | 自动作答与提交 | [刷新后缺少可靠的任务与答案恢复](#f13) | 功能缺口 |
| F14 | P1 | 自动作答与提交 | [普通提交被服务器拒绝后不会自动判断补交](#f14) | 实现缺陷 |
| F15 | P1 | 自动作答与提交 | [响应解析失败后失去自动接续与结果核对](#f15) | 实现缺陷 |
| F16 | P1 | 自动作答与提交 | [图片加载没有超时，可永久卡在作答中](#f16) | 实现缺陷 |
| F17 | P1 | 自动作答与提交 | [雨课堂提交请求没有超时/中断处理](#f17) | 实现缺陷 |
| F18 | P1 | 自动作答与提交 | [串行 AI 队列没有按截止时间重新评估](#f18) | 实现缺陷 |
| F19 | P2 | 自动作答与提交 | [多个标签页可以重复生成与提交同一道题](#f19) | 实现缺陷 |
| F20 | P1 | 课堂与连接 | [题目状态忽略消息所属课堂](#f20) | 实现缺陷 |
| F21 | P1 | 课堂与连接 | [SPA 切换课堂后，当前课堂 ID 不更新](#f21) | 实现缺陷 |
| F22 | P1 | 课堂与连接 | [课件/题目 Map 没有真正按课堂隔离](#f22) | 实现缺陷 |
| F23 | P2 | 课堂与连接 | [“自动进入的课堂默认自动答题”开关未接入排队](#f23) | 实现缺陷 |
| F24 | P1 | 课堂与连接 | [课堂 WebSocket 断线后仍被认为已连接](#f24) | 实现缺陷 |
| F25 | P2 | 课堂与连接 | [停止自动加入后无法再次启动](#f25) | 实现缺陷 |
| F26 | P2 | 课堂与连接 | [设置中的自动加入开关不会即时启动或停止](#f26) | 实现缺陷 |
| F27 | P1 | 设置与数据 | [重置设置后已填写的 API Key 仍保留](#f27) | 实现缺陷 |
| F28 | P2 | 设置与数据 | [重置不能清除默认值中没有列出的配置](#f28) | 实现缺陷 |
| F29 | P1 | 设置与数据 | [配置写入失败仍提示“已保存”](#f29) | 实现缺陷 |
| F30 | P2 | 设置与数据 | [音量设置为 0 实际保存成 60%](#f30) | 实现缺陷 |
| F31 | P2 | 设置与数据 | [随机延迟 0 重新打开会显示为 1 秒](#f31) | 实现缺陷 |
| F32 | P2 | 设置与数据 | [无法清空已有视觉模型来复用文本模型](#f32) | 实现缺陷 |
| F33 | P2 | 设置与数据 | [切换 Profile 时丢弃未保存的编辑，并立即改变内存活动项](#f33) | 实现缺陷 |
| F34 | P1 | AI 与课件工具 | [打开一次 AI 提问可能触发三次付费请求](#f34) | 实现缺陷 |
| F35 | P2 | AI 与课件工具 | [较旧的 AI 请求可以覆盖较新的结果](#f35) | 实现缺陷 |
| F36 | P2 | AI 与课件工具 | [OCR 可重复并发调用](#f36) | 实现缺陷 |
| F37 | P2 | AI 与课件工具 | [多页提问有部分图片失败时会静默降级](#f37) | 实现缺陷 |
| F38 | P2 | AI 与课件工具 | [Markdown 渲染损坏公式和代码下划线](#f38) | 实现缺陷 |
| F39 | P2 | AI 与课件工具 | [报告页首次采集后不再补齐懒加载课件](#f39) | 实现缺陷 |
| F40 | P2 | 题目界面 | [已结束的不限时题卡片仍显示为活动题](#f40) | 实现缺陷 |
| F41 | P2 | 题目界面 | [题卡上的 AI 按钮没有绑定该题](#f41) | 实现缺陷 |
| F42 | P1 | 网络与状态回写 | [补交成功列表为空仍被标为已作答](#f42) | 实现缺陷 |
| F43 | P2 | 网络与状态回写 | [批量补交只更新第一道题](#f43) | 实现缺陷 |
| F44 | P2 | 网络与状态回写 | [fetch(Request) 的提交无法被正确回写](#f44) | 兼容缺陷 |
| F45 | P2 | 弹幕 | [当前弹幕规则与目标规则不同](#f45) | 需求差异 |
| F46 | P2 | 弹幕 | [弹幕发送失败仍消耗额度与同文去重](#f46) | 实现缺陷 |
| F47 | P2 | 弹幕 | [点击发送按钮就被当作发送成功](#f47) | 实现缺陷 |
| F48 | P2 | 弹幕 | [自动跟发覆盖用户正在输入的弹幕](#f48) | 实现缺陷 |
| F49 | P2 | 提醒 | [刷新/迟到的历史时间线被当作新题提醒](#f49) | 需求差异 |
| F50 | P2 | 提醒 | [当前正在查看的课件发布也会提醒](#f50) | 需求差异 |
| F51 | P1 | 存储与启动 | [存储满时，结束题目事件无法更新内存状态](#f51) | 实现缺陷 |
| F52 | P2 | 存储与启动 | [加载课件缓存不会恢复题目与幻灯片索引](#f52) | 实现缺陷 |
| F53 | P2 | 存储与启动 | [配置中的 ai=null 会在补默认值之前崩溃](#f53) | 实现缺陷 |

## 逐项证据与修复方向

<a id="f01"></a>

### F01 · P1 · 填空解析会改变数学答案

- 位置：[ykt-helper/src/tsm/ai-format.js:266](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/tsm/ai-format.js#L266)。
- 证据：P01/P02/P03。输入“答案: -1”得到 ["1"]；“(-∞, 0]”得到 ["0"]；“x + y”拆成三个空。首尾清理和按标点/空白切分共同损坏原答案。
- 修复：先按服务端空位数建立结构；保留负号、区间、公式与空白。优先解析结构化数组，无法确定边界就保留候选并要求编辑。

<a id="f02"></a>

### F02 · P1 · 填空答案超过 50 字后变为主观题结构

- 位置：[ykt-helper/src/tsm/ai-format.js:268](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/tsm/ai-format.js#L268)。
- 证据：P04-long-blank。同一种 problemType=4，短答案返回数组，超过 50 字直接返回 {content,pics}。提交载荷随答案长度而变。
- 修复：按题型而非字符数选择序列化器；长填空仍保存为对应空位的字符串。

<a id="f03"></a>

### F03 · P1 · 选择题解析过宽，可能提交不存在或错误的选项

- 位置：[ykt-helper/src/tsm/ai-format.js:195](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/tsm/ai-format.js#L195)。
- 证据：P05/P06。只有 A/B 两个选项时仍接受 Z；“Answer: B”没有匹配中文字段，兜底取首行首个大写字母，返回 A。
- 修复：验证选项集合与单选数量；支持严格的中英文字段及结构化输出，禁止从说明文字中随意抽字母。

<a id="f04"></a>

### F04 · P1 · 空答案数组被视为已经作答

- 位置：[ykt-helper/src/state/actions.js:206](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L206)。
- 证据：A04-empty-result-array。result=[] 是真值，导致不排队且执行器也直接跳过；列表也把空数组显示为已作答。
- 修复：统一 hasSubmittedAnswer，区分缺省、空数组、空内容和真实服务端答案。

<a id="f05"></a>

### F05 · P1 · 保存本地草稿会冒充已提交答案

- 位置：[ykt-helper/src/ui/panels/problem-list.js:265](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/problem-list.js#L265)。
- 证据：U01-save-local-blocks-auto。点“保存(本地)”把编辑内容写入 result，状态立即显示已作答；随后自动作答不再提交。
- 修复：草稿写 draftAnswer；result/remoteAnswer 只由服务器确认后更新。

<a id="f06"></a>

### F06 · P2 · “保存(本地)”仅存内存，刷新就丢

- 位置：[ykt-helper/src/ui/panels/problem-list.js:267](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/problem-list.js#L267)。
- 证据：U01 + 代码检查。该按钮只修改 repo.problems，没有写任何持久化存储。页面刷新后不能恢复这份编辑内容。
- 修复：按账号、课堂、题目保存轻量草稿；按钮明确反馈“已保存到此设备”。

<a id="f07"></a>

### F07 · P1 · 其他题目提交会清空当前编辑草稿

- 位置：[ykt-helper/src/ui/panels/problem-list.js:375](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/problem-list.js#L375)。
- 证据：U02-draft-lost-on-unrelated-answer。编辑 P 的 textarea 时，Q 作答成功触发整个题目列表重建，P 未保存的编辑内容消失。
- 修复：编辑器状态放在草稿仓库中；局部更新提交状态，不重建正在编辑的输入框。

<a id="f08"></a>

### F08 · P1 · 题目在排队期间结束后不会自动强制补交

- 位置：[ykt-helper/src/state/actions.js:225](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L225)。
- 证据：A01-teacher-ends-queued。onProblemFinished 保留排队时间，但执行器入口看到 finished=true 又直接退出。只有“已进入 AI 请求后结束”的分支会强制补交。
- 修复：统一按最新题目状态选择 normal/retry/local；已结束时依据补交策略继续生成与补交。

<a id="f09"></a>

### F09 · P1 · AI 返回后可能覆盖用户手动提交的答案

- 位置：[ykt-helper/src/state/actions.js:327](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L327)。
- 证据：A02-manual-answer-overwrite-after-finish。AI 计算期间用户已提交 B，老师随后结束题目；执行器先判断 finished，直接用 AI 的 A 强制补交，后面的手动作答保护来不及执行。
- 修复：提交前重新核对服务端状态和本地编辑版本；用户修改或提交后，旧 AI 结果只能作为建议。

<a id="f10"></a>

### F10 · P1 · 关闭自动作答后，已排队任务仍会提交

- 位置：[ykt-helper/src/state/actions.js:605](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L605)。
- 证据：A03-disabled-after-queue。排队后把 autoAnswer 设为 false，tickAutoAnswer 和执行器都不复查开关，依然发出提交。
- 修复：关闭开关时暂停队列；生成前、出网前、提交前均复查当前策略。已开始的 AI 可完成为本地建议。

<a id="f11"></a>

### F11 · P2 · 重新开启自动作答不能接续已有未答题

- 位置：[ykt-helper/src/state/actions.js:470](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L470)。
- 证据：A06-reenable-not-rescheduled。关闭状态收到题目后创建 status；再打开开关，timeline 重放被 previous 去重直接跳过，不再排队。
- 修复：开关变更后扫描本课未完成任务；去重只阻止重复副作用，不阻止合法的状态转换。

<a id="f12"></a>

### F12 · P1 · 题目事件早于课件数据到达时会漏题

- 位置：[ykt-helper/src/state/actions.js:459](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L459)。
- 证据：A05-live-event-before-data。先收到解锁事件，后收到课件数据，onPresentationLoaded 不重放先前丢弃的事件；没有后续 timeline 就一直没有提醒和任务。
- 修复：缓存待解析事件并在数据到达后接续；有界重试并提供可见失败状态。

<a id="f13"></a>

### F13 · P1 · 刷新后缺少可靠的任务与答案恢复

- 位置：[ykt-helper/src/state/actions.js:204](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L204)。
- 证据：A12-refresh-state-not-persisted。运行版没有保存排队、AI 处理中、已生成待提交的完整任务；刷新只能碰运气依赖 timeline 重新发现。
- 修复：持久化任务阶段、候选答案、编辑版本及提交结果；恢复前先查服务端，避免重答和重复扣费。

<a id="f14"></a>

### F14 · P1 · 普通提交被服务器拒绝后不会自动判断补交

- 位置：[ykt-helper/src/tsm/answer.js:199](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/tsm/answer.js#L199)。
- 证据：A10-server-closed-no-retry-fallback。本地以为开放，但 /answer 返回 50026 时，只记录失败；没有刷新题目状态后改走补交。
- 修复：结构化保留 HTTP/业务错误码；明确“已结束/截止”且允许补交时切换 retry；不存在或无权限时保留本地并停止。

<a id="f15"></a>

### F15 · P1 · 响应解析失败后失去自动接续与结果核对

- 位置：[ykt-helper/src/tsm/answer.js:46](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/tsm/answer.js#L46)。
- 证据：A11 + 10 月 20 日 09:37 日志。AI 已成功返回答案，但提交响应无法解析时被视为非瞬时错误；候选答案未进入可恢复提交任务，且没有核对是否已在服务器生效。
- 修复：把“结果未知”与“明确失败”分开；保留候选答案，先核对远端，再决定是否重交或补交。

<a id="f16"></a>

### F16 · P1 · 图片加载没有超时，可永久卡在作答中

- 位置：[ykt-helper/src/capture/screenshoot.js:74](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/capture/screenshoot.js#L74)。
- 证据：A13-image-load-hangs-answer。图片既不触发 onload 也不触发 onerror 时，Promise 永不结束；AI 的 45 秒超时还未开始计算，answering 一直为 true。
- 修复：为图片与截图阶段设置超时、取消与状态清理；有文本时按设置提供文本兜底。

<a id="f17"></a>

### F17 · P1 · 雨课堂提交请求没有超时/中断处理

- 位置：[ykt-helper/src/tsm/answer.js:34](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/tsm/answer.js#L34)。
- 证据：A14-submission-hangs-without-timeout。原生 XHR 的 timeout 为 0，且没有 ontimeout/onabort；连接悬挂或中断可能让提交 Promise 与任务状态永久等待。
- 修复：每个提交有截止时间、取消处理和“结果未知”恢复流程。

<a id="f18"></a>

### F18 · P1 · 串行 AI 队列没有按截止时间重新评估

- 位置：[ykt-helper/src/ai/openai.js:160](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ai/openai.js#L160)。
- 证据：A15-queue-sends-expired-request。Q 的剩余时间只有 10 秒，但等待 P 完成后已过截止仍发出 Q 的 AI 请求；排队时间没有计入请求预算。
- 修复：任务保留 deadline；轮到出网时重算预算和提交策略；允许补交的任务降低优先级，优先处理快截止的新题。

<a id="f19"></a>

### F19 · P2 · 多个标签页可以重复生成与提交同一道题

- 位置：[ykt-helper/src/state/actions.js:231](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L231)。
- 证据：A16-multitab-has-no-submit-lock。同一课堂在两个独立页面中，各自都能提交一次；answering 只在单页内有效。
- 修复：按账号/课堂/题目使用跨标签页租约，提交前校验远端状态；锁异常后可过期回收。

<a id="f20"></a>

### F20 · P1 · 题目状态忽略消息所属课堂

- 位置：[ykt-helper/src/state/actions.js:445](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L445)。
- 证据：A08-source-lesson-ignored。实时分发传入 lessonId，但解锁处理未接收；status 不存 lessonId，提交与结束记录使用当前页面课堂。
- 修复：所有题目事件携带并保留 account/origin/lessonId；后台监听和当前页面状态分离。

<a id="f21"></a>

### F21 · P1 · SPA 切换课堂后，当前课堂 ID 不更新

- 位置：[ykt-helper/src/index.js:77](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/index.js#L77)。
- 证据：N04-spa-lesson-state-not-updated。从 L1 经 pushState 进入 L2 后，运行时因已启动直接返回；repo.currentLessonId 仍是 L1。
- 修复：页面运行时单次启动，课堂上下文随路由切换；每次切换取消旧页面任务并装载对应课堂状态。

<a id="f22"></a>

### F22 · P1 · 课件/题目 Map 没有真正按课堂隔离

- 位置：[ykt-helper/src/ui/panels/presentation.js:838](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/presentation.js#L838)。
- 证据：U13-global-presentations-leak-across-lessons。切换到 L2 后，L1 的课件仍可展示；所谓过滤没有判断每份课件所属课堂，内存 Map 也没有清空/分区。
- 修复：建立按课堂索引的仓库；UI 只读当前课堂视图，后台任务使用自己的上下文。

<a id="f23"></a>

### F23 · P2 · “自动进入的课堂默认自动答题”开关未接入排队

- 位置：[ykt-helper/src/state/actions.js:508](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L508)。
- 证据：A09-auto-join-policy-ignored。仅开启 autoAnswerOnAutoJoin，甚至 forceAutoAnswerLessons 标记存在时，解锁处理仍只看全局 autoAnswer，不安排作答。
- 修复：统一 effectivePolicy(lessonId)，在发现、排队、恢复、提交阶段共用。

<a id="f24"></a>

### F24 · P1 · 课堂 WebSocket 断线后仍被认为已连接

- 位置：[ykt-helper/src/net/ws-interceptor.js:157](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/net/ws-interceptor.js#L157)。
- 证据：N03-dead-socket-not-reconnected。close 后 Set/Map 中的连接没有清理，isLessonConnected 不看 readyState；再次连接直接拿回 CLOSED socket。
- 修复：关闭/错误时清理，按 readyState 判断，限速退避重连并恢复该课堂时间线。

<a id="f25"></a>

### F25 · P2 · 停止自动加入后无法再次启动

- 位置：[ykt-helper/src/state/actions.js:690](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L690)。
- 证据：N05-auto-join-cannot-restart。stop 仅设置 autoJoinRunning=false，没有重置 _autoJoinStarted；再次 start 被守卫拦截。
- 修复：使用显式可重启的控制器，清理 timer、连接与 observer。

<a id="f26"></a>

### F26 · P2 · 设置中的自动加入开关不会即时启动或停止

- 位置：[ykt-helper/src/ui/panels/settings.js:263](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/settings.js#L263)。
- 证据：S06/S09。设置中开启后 running 仍为 false；已运行时关闭后 running 仍为 true。保存处理没有调启动或停止。
- 修复：设置提交成功后通知运行控制器同步策略，取消已无效的跳转计划。

<a id="f27"></a>

### F27 · P1 · 重置设置后已填写的 API Key 仍保留

- 位置：[ykt-helper/src/ui/ui-api.js:16](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/ui-api.js#L16)。
- 证据：S02-reset-api-key-reappears。新配置用浅复制共享 DEFAULT_CONFIG.ai，保存 Profile 时改动了默认对象；重置时又从被改过的默认值复制出密钥，并再次持久化。
- 修复：默认配置由工厂返回深拷贝；重置显式清空 Profile 与旧密钥，随后核验写入成功。

<a id="f28"></a>

### F28 · P2 · 重置不能清除默认值中没有列出的配置

- 位置：[ykt-helper/src/ui/panels/settings.js:299](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/settings.js#L299)。
- 证据：B05-config-legacy-key-vs-profile。customNotifyAudioSrc、aiAutoAnalyze 等字段在 DEFAULT_CONFIG 中不存在；Object.assign 不删除它们，重置后仍生效。
- 修复：完整替换受管理配置，或按明确 schema 删除旧字段；区分“重置设置”和“清理缓存”。

<a id="f29"></a>

### F29 · P1 · 配置写入失败仍提示“已保存”

- 位置：[ykt-helper/src/ui/ui-api.js:36](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/ui-api.js#L36)。
- 证据：S05-save-quota-failure。config 写入抛 QuotaExceededError 时异常被吞掉；内存已改变，旧磁盘值仍保留，保存按钮照样提示成功。
- 修复：返回可检查结果；失败时保留编辑并明确提示未持久化，运行配置和磁盘配置不可悄悄分叉。

<a id="f30"></a>

### F30 · P2 · 音量设置为 0 实际保存成 60%

- 位置：[ykt-helper/src/ui/panels/settings.js:272](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/settings.js#L272)。
- 证据：S01-zero-volume-save。+$notifyVol.value || 60 把合法的 0 当作空值，保存得到 0.6。
- 修复：使用有限数判断或空值判断，保留 0。

<a id="f31"></a>

### F31 · P2 · 随机延迟 0 重新打开会显示为 1 秒

- 位置：[ykt-helper/src/ui/panels/settings.js:213](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/settings.js#L213)。
- 证据：S04-random-zero-reopens-as-one。保存 0 后同步表单使用 ||1500，显示 1；再保存会把原本的 0 改成 1 秒。
- 修复：读取和保存共用同一个配置 schema 与默认值规则。

<a id="f32"></a>

### F32 · P2 · 无法清空已有视觉模型来复用文本模型

- 位置：[ykt-helper/src/core/settings-form.js:29](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/core/settings-form.js#L29)。
- 证据：S07-blank-vision-model-cannot-clear。输入框写明留空复用文本模型，但保存空值又保留旧 visionModel。
- 修复：把空字符串作为有效值保存，调用时再选择 visionModel || model。

<a id="f33"></a>

### F33 · P2 · 切换 Profile 时丢弃未保存的编辑，并立即改变内存活动项

- 位置：[ykt-helper/src/ui/panels/settings.js:165](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/settings.js#L165)。
- 证据：S08 + S03。修改 Profile 名称后新增/切换，再切回，编辑丢失；切换还直接改变活动配置，关闭面板也不会回滚。
- 修复：使用独立表单草稿；切换先保留当前编辑，保存成功才原子替换运行配置。

<a id="f34"></a>

### F34 · P1 · 打开一次 AI 提问可能触发三次付费请求

- 位置：[ykt-helper/src/ui/panels/ai.js:343](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/ai.js#L343)。
- 证据：U04-ai-auto-analyze-duplicated。提问事件本身打开 AI；随后 open-ai 被 AI 面板与 ui-api 两处处理，三次 showAIPanel 各安排一次分析，实际观察到 3 次请求。
- 修复：只保留一个打开入口；同题同输入版本的分析复用同一任务，重复点击只聚焦进度。

<a id="f35"></a>

### F35 · P2 · 较旧的 AI 请求可以覆盖较新的结果

- 位置：[ykt-helper/src/ui/panels/ai.js:599](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/ai.js#L599)。
- 证据：U09-late-ai-result-overwrites-new。连续问两次，第二次先返回 B，第一次后返回 A，界面最终显示 A；未校验请求版本/当前选页。
- 修复：按题目与输入版本存结果；旧请求完成可入历史，但不能覆盖当前编辑/展示。

<a id="f36"></a>

### F36 · P2 · OCR 可重复并发调用

- 位置：[ykt-helper/src/ui/panels/presentation.js:415](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/presentation.js#L415)。
- 证据：U08-ocr-doubleclick-duplicate。同一页连续调用两次，实测 OCR API 调用 2 次，没有进行中复用或按钮禁用。
- 修复：按页和图像版本复用进行中 Promise；再次识别需显式刷新。

<a id="f37"></a>

### F37 · P2 · 多页提问有部分图片失败时会静默降级

- 位置：[ykt-helper/src/ui/panels/ai.js:564](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/ai.js#L564)。
- 证据：U14-partial-multi-images-silent。选择两页，只有一页取图成功时仍直接调用 AI，界面不说明漏了哪页。
- 修复：显示每页取图状态；允许重试缺失页或明确选择继续，候选答案记录实际使用的页面。

<a id="f38"></a>

### F38 · P2 · Markdown 渲染损坏公式和代码下划线

- 位置：[ykt-helper/src/ui/panels/ai.js:153](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/ai.js#L153)。
- 证据：U10-latex-markdown-corrupted。LaTeX $x_1 + x_2$ 被改为含 em 的 HTML；代码 x_y_z 也被改写，可能导致公式无法渲染或代码错误。
- 修复：先保护数学和代码 token，再做 Markdown；使用经过测试的解析/净化链路。

<a id="f39"></a>

### F39 · P2 · 报告页首次采集后不再补齐懒加载课件

- 位置：[ykt-helper/src/ui/panels/presentation.js:632](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/presentation.js#L632)。
- 证据：U07-report-lazy-pages-frozen。第一次 DOM 只有 1 页，随后出现第 2 页，再采集仍只有 1 页。
- 修复：允许增量合并，按资源稳定标识去重；观察器只在真正采齐/退出页面后停止。

<a id="f40"></a>

### F40 · P2 · 已结束的不限时题卡片仍显示为活动题

- 位置：[ykt-helper/src/ui/panels/active-problems.js:37](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/active-problems.js#L37)。
- 证据：U03-active-finished-unlimited-card。活动卡片只看剩余时间和 result，不看 finished；不限时题结束后仍显示“不限时”和操作入口。
- 修复：展示题目窗口、任务阶段和提交结果三个维度；结束题放入“可补交/已结束”。

<a id="f41"></a>

### F41 · P2 · 题卡上的 AI 按钮没有绑定该题

- 位置：[ykt-helper/src/ui/panels/active-problems.js:68](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/panels/active-problems.js#L68)。
- 证据：U12-active-card-ai-selects-other-slide。主页面在 Q 时，点击 P 卡片的 AI 解答只触发 open-ai；面板按当前主页面选 Q。
- 修复：每个入口传完整题目/课件上下文，禁止依靠全局“最近一题”。

<a id="f42"></a>

### F42 · P1 · 补交成功列表为空仍被标为已作答

- 位置：[ykt-helper/src/net/xhr-interceptor.js:80](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/net/xhr-interceptor.js#L80)。
- 证据：N01-retry-empty-success-marked-answered。retryAnswer 自身正确抛出“服务器未返回成功信息”，但 XHR 拦截器先仅凭 code=0 把 result 写成 A，界面/自动作答因此误判。
- 修复：统一响应解释器，所有路径都必须逐题确认 success ID 后再回写远端答案。

<a id="f43"></a>

### F43 · P2 · 批量补交只更新第一道题

- 位置：[ykt-helper/src/net/xhr-interceptor.js:79](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/net/xhr-interceptor.js#L79)。
- 证据：N02-retry-batch-only-first。服务器确认 P、Q 都成功时，只同步 P；Q 在本地仍未作答，可能被重新提交。
- 修复：遍历实际 success 列表，逐题回写，保留每题失败原因。

<a id="f44"></a>

### F44 · P2 · fetch(Request) 的提交无法被正确回写

- 位置：[ykt-helper/src/net/fetch-interceptor.js:43](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/net/fetch-interceptor.js#L43)。
- 证据：N06-fetch-Request-body-not-observed。页面把请求体放在 Request 对象而不是第二参数 body 时，拦截器读不到，成功提交仍未反映在 repo。
- 修复：从克隆的 Request 读取请求体；只读不改变原始 body 的消费状态。

<a id="f45"></a>

### F45 · P2 · 当前弹幕规则与目标规则不同

- 位置：[ykt-helper/src/core/danmu-follow.js:5](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/core/danmu-follow.js#L5)。
- 证据：D01-follows-after-three-not-seven。当前实现第 3 条相同文本就跟发；没有 30 秒窗口；连续弹幕无 60 秒间隔时，一轮可持续任意长。
- 修复：按“30 秒连续 7 条取最高频；并列取最新；单轮最长 60 秒；每轮至多 2 条”重写独立策略模块。

<a id="f46"></a>

### F46 · P2 · 弹幕发送失败仍消耗额度与同文去重

- 位置：[ykt-helper/src/core/danmu-follow.js:101](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/core/danmu-follow.js#L101)。
- 证据：D02-send-failure-consumes-quota。找不到输入框或发送失败后，sentCount 已加 1、文本已加入 followedTexts；恢复控件后同文也不会重试。
- 修复：候选、占位中、已发出三阶段分离；明确发送前失败可回滚占位，结果不明保留记录。

<a id="f47"></a>

### F47 · P2 · 点击发送按钮就被当作发送成功

- 位置：[ykt-helper/src/core/danmu-sender.js:56](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/core/danmu-sender.js#L56)。
- 证据：D03-send-true-without-outbound。即使按钮没有任何发送处理器，也返回 sent:true。真实站点控件异步更新或拒绝时会产生假成功。
- 修复：校验对应课堂的出站帧，能拿到回执则进一步确认；界面区分已点击、已发出与已确认。

<a id="f48"></a>

### F48 · P2 · 自动跟发覆盖用户正在输入的弹幕

- 位置：[ykt-helper/src/core/danmu-sender.js:52](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/core/danmu-sender.js#L52)。
- 证据：D04-existing-draft-overwritten。输入框已有“my draft”仍被替换为 auto。
- 修复：检测用户正在输入或输入框非空时跳过/延后；不主动发送或清空用户草稿。

<a id="f49"></a>

### F49 · P2 · 刷新/迟到的历史时间线被当作新题提醒

- 位置：[ykt-helper/src/state/actions.js:423](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L423)。
- 证据：A07-historical-timeline-retriggers。10 分钟前的不限时题重放后同时产生 problem-start 和 auto-answer-scheduled。可恢复未完成作答，但“新发布”提醒不应随历史回放重发。
- 修复：发布时间线与恢复队列分离；历史只恢复状态，未答补做按补答策略执行并用不同通知。

<a id="f50"></a>

### F50 · P2 · 当前正在查看的课件发布也会提醒

- 位置：[ykt-helper/src/state/actions.js:550](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L550)。
- 证据：R01-current-presentation-still-notifies。currentPresentationId=PR 时，再发 PR 的 publishpresentation 仍提示 courseware-publish。
- 修复：按账号/课堂/内容 ID 去重，并过滤当前课件；另有新课件仍应提醒。

<a id="f51"></a>

### F51 · P1 · 存储满时，结束题目事件无法更新内存状态

- 位置：[ykt-helper/src/state/actions.js:526](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/actions.js#L526)。
- 证据：B04-remember-finished-quota-blocks-state。rememberFinished 的 storage.set 抛错后，onProblemFinished 尚未设置 finished；实测 finished 仍 false，整个事件处理被上层吞掉。
- 修复：先完成内存状态转换，再尽力持久化；写入失败单独可见，不能阻断课堂事件。

<a id="f52"></a>

### F52 · P2 · 加载课件缓存不会恢复题目与幻灯片索引

- 位置：[ykt-helper/src/state/repo.js:63](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/state/repo.js#L63)。
- 证据：B02-cache-load-not-hydrated。课件缓存装载后 presentations=1，但 slides=0、problems=0；在没有再次请求课件时，自动答题找不到题。
- 修复：缓存载入与网络载入共用同一归一化/索引流程，并通知待解析事件继续执行。

<a id="f53"></a>

### F53 · P2 · 配置中的 ai=null 会在补默认值之前崩溃

- 位置：[ykt-helper/src/ui/ui-api.js:17](https://github.com/Frank-678/yuketang-helper-auto/blob/4fe7c0382a00d84e2db2d6288c18d3aa2392fd86/ykt-helper/src/ui/ui-api.js#L17)。
- 证据：B03-missing-ai-config-crashes-boot。代码先读取 _config.ai.kimiApiKey，后面才处理 ai 缺省；损坏/旧格式配置的 ai=null 会导致整个脚本初始化失败。
- 修复：在访问深层字段前验证/迁移配置；损坏配置可隔离恢复，保留用户可导出的原值。

## 仍需确认或单独处理的边界

以下不计入上面的确定问题数：

1. **JPEG 内容标为 PNG**：capture 返回 JPEG Base64，AI 请求却构造 `data:image/png;base64,...`（B01 已确认载荷如此）。是否拒绝取决于模型服务商；应统一 MIME 或保留完整 data URL。
2. **题型/ID 类型兼容**：problemType="1" 会解析失败（P07）；数字/字符串混合 ID 也存在 Map 失配风险。实际日志 ID 为字符串，不能把长整数精度损失认定为本次 PROBLEM_NOT_FOUND 的已证根因。入口应归一化并保持长 ID 字符串。
3. **课件标题 HTML 注入**：标题通过 innerHTML 写入，已在模拟 DOM 中生成带 onerror 的 img（U05）。真实脚本执行还受站点 CSP 影响，未在真实站点利用；应改为 textContent。不要把它夸大成已证实账号泄漏。
4. **首次/过晚注入**：XHR/fetch 到 DOM/UI 挂载之后才安装，前面的任一异常也可能阻断安装；外部 @require、CDN、浏览器注入时机需实机验证。应把最小事件采集前移，UI 延后。
5. **截图兜底可能指向另一题**：指定幻灯片失败后回退当前 DOM，多题同时处理或用户已翻页时可能拍错。没有真实页面截图证据，列为风险；兜底必须确认题目 ID。
6. **自动跳转会选非活跃课堂并阻断原生点击**：源码有 status=1 选不到就用第一项的回退；捕获点击后拦截官方跳转，API 失败时无官方行为恢复。另有主页可见时每分钟整页刷新（R02 已确认调用路径）。应只跳活跃课堂，给用户操作优先权；这不是用户其他 Vue 项目刷新问题的根因证据。
7. **缓存容量与诊断**：maxPresentations 只裁剪每课的持久化列表，其他课程与内存 Map 不统一清理；诊断含题目/答案，导出只保留时分秒而非每条完整日期。建议全局 LRU/TTL、分级日志、结构化导出；不能仅凭历史记录断定本次一定配额满。
8. **截图/导出外部资源**：图片 CORS 或任意一页加载失败会使 PDF 导出终止；默认只导出题目页，普通课件可能提示无可导出页面（U11）。明确“导出当前筛选/全部课件”，逐页失败可重试。
9. **拦截器兼容性**：XHR.open 只透传前三参（N07），fetch URL 对象、Request、JSON/blob 响应类型及 Tampermonkey unsafeWindow 分界需覆盖；托管 WS 是否走到页面实际补丁也要实机核实。
10. **当前 main 源码仍然损坏**：`f8dea76` 合并带入重复导入、非法 return、缺依赖；当前发布文件保持旧的可运行内容。此事是维护与发版风险，不是所有现有运行故障的解释。

## 统一“本地 / 提交 / 强制补交”的方案

### 用户可见流程

每题共用一个答案编辑器。编辑时自动保存本地草稿，AI 建议单独呈现，用户可采用、修改或保留旧草稿。主按钮根据上下文变化，其旁边的菜单保留显式选择：保存本地、正常提交、强制补交。默认操作不要求用户理解接口。

| 当前情况 | 主操作 | 自动模式的处理 | 必须保留的反馈 |
|---|---|---|---|
| 草稿刚编辑/AI 刚生成 | 保存到本地草稿 | 依据策略进入下一步 | 未提交；答案来源和编辑时间 |
| 题目开放，尚未作答 | 提交答案 | 正常提交 | 提交中 → 已提交，必须核实响应 |
| 已截止/老师已结束，允许补交 | 强制补交 | 使用补交流程 | 补交中 → 已补交；失败仍保留草稿 |
| 已结束，但当前策略只允许正常提交 | 保存本地，提供补交入口 | 暂停提交，等待显式选择 | 已结束，草稿已保存 |
| 服务器已有相同答案 | 查看已提交答案 | 不重复调用 AI/提交 | 已与服务器一致 |
| 已提交后又修改了答案 | 更新答案/补交修改 | 依据平台实际改答能力处理 | 草稿与服务器版本不同，保留旧提交记录 |
| 网络超时/响应解析失败 | 核实提交结果 | 先查远端，再决定是否重试 | 结果未知，不显示假成功 |
| 50026：明确已结束 | 必要时强制补交 | 更新状态后按既定策略切换 | 只针对明确可补交的情况 |
| 50028：已经作答 | 同步服务器答案 | 先核对差异，不能默认覆盖 | 已作答；新草稿是否仍待提交 |
| 50013：题目不存在 | 保留本地并检查题目 | 不盲目重试/强交 | 课堂/题目/身份需重新核实 |
| 未登录、无权限、题型载荷无效 | 保存本地 | 暂停对应任务 | 具体失败原因与恢复入口 |
| 用户关闭自动作答或正在编辑 | 继续编辑/手动提交 | 暂停队列与提交 | AI 完成可保留为建议，不覆盖人工内容 |

自动策略可设为三档：**仅生成并保存本地、自动正常提交、自动正常提交并在必要时补交**。全局设置可被课堂设置覆盖；你已选定的策略持续有效，不必每题重复确认。手动明确选择优先于自动策略。能力判断以服务器实际结果为准，“强制补交”不是保证平台一定接受。

### 内部状态与共同入口

不要再用一个 result 代表草稿、AI 建议、服务器答案。每题至少保留：

- 身份：origin、accountId、lessonId、problemId、presentationId、slideId。
- 题目状态：未发布、开放、已结束、未知；startTime/endTime；与服务端同步时间。
- 答案：draftAnswer、draftRevision、aiProposal、remoteAnswer、remoteRevision/更新时间。
- 任务阶段：排队、生成中、可提交、提交中、核实中、已确认、失败、暂停。
- 提交记录：模式、尝试 ID、答案指纹、HTTP/业务错误码、success IDs、结果是否确定。

所有入口调用同一个作答服务：题目页、列表、AI 面板、自动任务、刷新恢复、复核修正。提交前校验最新草稿版本、所属课堂、自动策略、服务端状态和跨标签页租约。服务器确认前不能把本地草稿写成已提交。

图片、AI、提交、核实分别有超时和取消边界。已产生的候选答案立即保存在本地，提交重试优先复用，不重新调用模型。任务按截止时间和用户意图调度；不要让长 OCR/翻译任务堵住马上截止的答题任务。

### 轻量存储

持久化 ID、阶段、少量文本和结构化答案，不保存 Base64 图片或整份 API 响应。按账号与课堂隔离，给草稿和任务设置总量/TTL，课件缓存单独 LRU。借鉴旧版本每课最多 100 条、24 小时 TTL 的边界思路，但补充全局限制；具体值可配置。写入失败必须可见，不能阻断内存状态，也不能假称已保存。

## 快答：强制开启 / 强制关闭 / 按时间自动

快答控制模型和生成顺序，提交策略控制答案去向，两者独立。强制开启快答不等于自动开启作答，更不等于强制补交。关闭自动作答时，任何快答档位都不能自动提交。

| 快答模式 | 决策规则 | 非常接近截止时 | 配置时间段外 |
|---|---|---|---|
| 强制开启 | 始终选择配置的快答模型/流程 | 仍用快答，服从提交权限 | 仍开启 |
| 强制关闭 | 始终使用常规模型/流程 | 不得偷偷切到快答；按提交策略提交、补交或保留本地 | 关闭 |
| 按时间自动（默认） | 命中用户设置的快答时间窗口才开启 | 重新计算预算，不越过用户选定的规则 | 常规流程 |

自动模式先兼容旧的“每日时间点前 1 分钟至后 10 分钟”规则，时区使用浏览器本地时区，界面显示实际窗口。剩余作答时间是调度预算，不擅自替代这个时间点规则。如果未来增加“余时不足时也快答”，应作为自动模式中的显式可选条件，默认关闭；强制关闭仍有最高优先级。

常规流程使用常规模型，开启复核时优先提交前复核。快答流程使用快答模型先给出候选；是否立即提交由独立的提交策略决定，是否复核也独立配置。仅本地模式下，快答与复核都只能产生本地候选。提交后复核发现差异，必须重新查询远端与可改答能力，调用统一提交服务；不能复用首交参数盲目再次普通提交，也不能自动覆盖后来的人工编辑。

每次准备真正发出 AI 请求时，重新评估有效配置、时间窗口、队列等待和截止时间；生成完成、提交前再核对题目状态、人工修订和提交策略。预算覆盖图片/截图、队列、模型、可选复核和提交，并保留网络余量。不限时题的 null 不参与截止计算；老师提前结束使用新的状态。剩余时间不足时跳过可选复核不等于允许补交，补交仍由独立策略决定。

快答模型缺失或配置无效时，显示“快答不可用”及原因，按预先选择的降级策略使用常规模型或只保留本地；不能显示已用快答，也不能随机生成默认答案并当作 AI 答案。运行中切换模式取消尚未出网的旧计划，已付费请求的结果可保存为建议，禁止因此再开一组重复请求。关自动作答、人工编辑优先于旧任务的自动提交。

设置使用单个三选一控件，避免“开启”和“禁用”两个复选框互相矛盾。全局设置允许被课堂覆盖，题卡显示有效模式、原因、实际模型和提交方式，例如：“按时间自动 · 命中 10:00 窗口 · Fast Profile · 必要时补交”。诊断保存决定时间、窗口/预算和真实使用的 Profile ID，排查时才能核实没有选错模型。

验收至少覆盖三档 × 时间窗内/外、跨午夜、排队跨窗口、无时限、老师提前结束、快答配置失效、途中关闭自动作答、人工修改、复核结果不同但服务器拒绝更新；未通过这些组合不能认定快答已恢复。

## 弹幕方案

独立于作答任务运行，默认只对当前正在查看的课堂发送：

1. 保留最近 7 条有效的他人弹幕；7 条必须在 30 秒内。没有凑齐 7 条不发送。
2. 在这 7 条中统计完整文本，最高频优先；频率并列取最后出现的文本。全不同则取最新一条。
3. 一轮从首条有效弹幕开始，最长 60 秒；相邻消息间隔达到 60 秒也开始新轮。每轮最多发出 2 条，同一文本每轮一次。一次触发消费这一批消息，避免窗口重叠重复发。
4. 候选 → 等待发送 → 已发出/失败，分别记录。发送前失败不占正式额度；已观察到出站帧但服务器结果不明时，不贸然重复发送。待发送占位也计入并发上限，避免短时间超额。
5. 不覆盖用户输入：输入框非空、用户正在打字、页面不属于该课堂、控件不可用时跳过或延后。关闭开关立即取消待发任务。
6. 匹配课堂、文本和发送尝试；出站帧只证明已发出，服务器回执/自身回声才进一步证明接收。不要把“调用 click()”叫成功，也不要把发出当成服务器确认。
7. 过滤自己的消息；缺少用户 ID 时用本次待发记录和短 TTL 辅助去重，避免误吞其他人的同文消息。

旧版本的“7 条/30 秒最高频”和出站确认模块值得参考；发送确认改成异步后，所有调用者必须 await，额度的预留/提交/回滚也必须一起更新。仅替换 sender 而保留同步 controller 会形成新的竞态。

## 1.21.5 / 1.21.6 / 后续整改的迁移判断

不能把“整版运行失败”理解为每个新功能都无价值，也不能因为某个模块测试通过就整分支合入。坐标应是具体 commit，版本号只用于展示。

| 新功能/模块 | 当时问题或当前边界 | 建议 | 接入后的验收条件 |
|---|---|---|---|
| 持久化恢复队列（c670f5f 起） | 队列阶段与页面状态耦合；结果未知时可能重答；当前版又缺恢复 | 保留隔离与 TTL 思路，改为统一作答任务 | 刷新前后同一候选不丢；远端已成功不重交；切账号不串题 |
| AI 强制作答、编辑补交 | 各入口自己的提交路径；AI 面板有分析无自然提交接续 | 统一编辑器与策略服务 | 从任意入口产生同一草稿、同一任务与一致状态 |
| 新 auto-answer-runner | 原始 1.21.6 把 null 经 Number 转为 0，误判过期；PR6 修了 null，但提交前仍缺人工版本复查 | 保留依赖注入/阶段划分，重做状态决策 | 不限时、人工编辑、结束时机、取消都通过 |
| 7 条弹幕窗口（7356b61 起） | 新策略比当前旧版接近目标；额度仍需和异步发送确认协调 | 迁移纯策略，不整体移植旧接线 | 30 秒与 60 秒边界、并列、失败、连发、自己回声均覆盖 |
| 出站发送确认（f0437ea 起） | 能证明发出，未必证明服务器接收；关联字段可能过少 | 保留，补课堂与尝试关联 | 不出现“点了但没发”；不误认别人的消息 |
| 活跃课堂列表/多课堂连接 | 连接表有价值；全局 repo.currentLessonId 仍易串状态 | 多课堂监听可以保留，UI 固定当前课堂视图 | 跨课堂事件、下课、断线、切页均隔离 |
| 发布提醒按课堂/内容去重（520a520 起） | 正确方向；未知协议与历史回放不能都叫新发布 | 优先迁移纯分类/去重模块 | 当前课件静默，其他新课件提醒，翻旧页不误报 |
| 时间线首次基线/后续增量 | 完全忽略 timeline 又漏掉迟到/重连后的题 | 分开通知与恢复决策 | 历史不重新提醒，未完成任务仍能恢复 |
| 自动截止后补交（349b5e6 起） | 各层 force/expired 判断不一致 | 改成统一提交策略的一档 | 题目在截图前、AI 中、提交前结束均行为一致 |
| 快速 Profile/时间窗（9ff3a3b 起） | 选择模块可复用，实际请求必须真的用该 Profile | 在核心链路稳定后增加 | 可从请求日志验证 Profile；窗口跨日、队列等待正确 |
| 提交后准确模型复核 | 复核更改再次普通提交，模拟 50028 时 correction-failed，保留首答案；这不等于已修正 | 优先“提交前复核”；若先快交，修正也必须走统一改答判断 | 界面明确首答案、复核建议、远端最终答案；不能把建议说成已更新 |
| 10 秒跳转与用户意图仲裁 | 纯控制器可用；旧整合仍有抢跳/错误课堂回退 | 可选模块，默认尊重手动进入 | 点击/触摸/滚动/键盘后取消；不跳 status 非活跃记录 |
| 设置持久化失败回滚/反馈（PR6） | 对解决 F29 有价值；不能解决默认对象共享与草稿混淆的全部问题 | 作为独立设置补丁迁移 | 写入失败看得见，密钥不残留，运行与持久配置一致 |

新增功能不应一口气全部恢复。先做好统一作答服务与草稿，再依次恢复：补交、刷新恢复、提醒、弹幕、可选多课堂、快速/复核与跳转。

## 分支收敛：26 个暂收至 3 个

截至本次读取，远端有 26 个分支、没有未关闭 PR；这些分支均未标为 protected。以下是清理方案，不是已完成的远端删除记录。当前 GitHub 连接器没有删分支/建 tag 工具，CLI 的只读 dry-run 推送也因缺写入认证失败，远端未改动。

| 暂留分支 | 用途 | 后续处理 |
|---|---|---|
| `main` | 唯一集成主线 | 先恢复可构建源码，后续只合入有场景证据的小批修复 |
| `rebuild/1.21.7-from-1.21.4` | 现有 README 安装链接直接引用 | 安装链接迁到固定 release/tag 后，再归档此分支 |
| `fix/pr5-verification-and-save-feedback-20260920` | 暂存 PR #6 未合并工作供逐模块迁移 | 不直接全合；提取完成并归档后删除 |

长期可以只留 main 和一个正在工作的修复分支；版本用 tag/release，备份用归档 tag，不再用 backup、audit、scratch 分支作长期目录。每个修复分支完成即删除，不为每次测试新增长期分支。

待删除的 23 个分支中，16 个分支的所有提交已被上述 3 个分支覆盖；7 个仍有未覆盖提交（共 6 个独立分支头，其中两个是同一 SHA）。**未覆盖不等于应丢弃，也不等于应合入。** 先按完整 SHA 建远端归档 tag，保留分支名→SHA 清单，再删除分支引用。

| 待归档后删除的分支 | 分支头 SHA | 相对保留集合未覆盖提交数 | 判断 |
|---|---|---:|---|
| `audit/full-regression-20260917` | `b38daf939d4d03ae6b9f9a5aa21143f5060a3ce9` | 0 | 已被保留分支覆盖 |
| `audit/independent-blackbox-20260917` | `8e123ae913e48156950dd94d0cf9bdb5b1bc6f37` | 0 | 已被保留分支覆盖 |
| `audit/runtime-bootstrap-real` | `8f5ae400338ace1f5d1302686d81a04e17b65331` | 0 | 已被保留分支覆盖 |
| `audit/runtime-bootstrap-scenario` | `8f5ae400338ace1f5d1302686d81a04e17b65331` | 0 | 已被保留分支覆盖 |
| `audit/runtime-bootstrap-scratch` | `8f5ae400338ace1f5d1302686d81a04e17b65331` | 0 | 已被保留分支覆盖 |
| `audit/runtime-bootstrap-scratch-2` | `8f5ae400338ace1f5d1302686d81a04e17b65331` | 0 | 已被保留分支覆盖 |
| `audit/runtime-bootstrap-validation` | `4b78acbc4ae420fa21410f430c4203e41eae3214` | 1 | 含独有提交，须归档 |
| `backup-before-b85ca499` | `b2fa1f5fe5d56f672e5d2049e257b8ae009c2d2f` | 2 | 含独有提交，须归档 |
| `backup/pre-core-rebuild-20260917` | `0af2f7fa5ab13eb2c9283a741c8586d3d3c4f25b` | 0 | 已被保留分支覆盖 |
| `backup/pre-final-consolidation-20260917` | `6504f74c6922dcce024b63746436533ee7f48297` | 0 | 已被保留分支覆盖 |
| `backup/pre-independent-blackbox-20260917` | `b38daf939d4d03ae6b9f9a5aa21143f5060a3ce9` | 0 | 已被保留分支覆盖 |
| `backup/pre-restore-20260916` | `bbc690a758bb346ece9be45e07a3301b73c89999` | 4 | 含独有提交，须归档 |
| `backup/pre-restore-before-revert-20260916` | `bbc690a758bb346ece9be45e07a3301b73c89999` | 4 | 含独有提交，须归档 |
| `backup/pre-stability-fix-20260916` | `ed823033fcc64f65be955935bdb9419332e82bf8` | 0 | 已被保留分支覆盖 |
| `chrome141` | `8075578d5902afa563cc579dbb8d116bc1208e54` | 0 | 已被保留分支覆盖 |
| `dev-2.0` | `799f26a4f11b18a9cd799a7e0a80a2c8d9b06022` | 0 | 已被保留分支覆盖 |
| `feat/dev3.0` | `ab0268b8e223af59e76944b2f4d10774df9480b3` | 4 | 含独有提交，须归档 |
| `feat/recover-auto-answer-1215` | `dd4b0bb3b43ed4b2bacd4791d92299bfe15e129e` | 0 | 已被保留分支覆盖 |
| `fix/independent-audit-remediation-20260917` | `af37eb9ac6341f384f6ad7fc9be082b50270341a` | 0 | 已被保留分支覆盖 |
| `fix/stability-auto-answer-20260916` | `35c5affb86f4be2a2c4c49b236a1c36049ab9bb6` | 0 | 已被保留分支覆盖 |
| `restore/pre-revert-ed823033` | `b5f51f47e6ca5b8fb632cdc32922a9f6448969a7` | 5 | 含独有提交，须归档 |
| `revert-1-feat/recover-auto-answer-1215` | `922330ddb759224617fa59b8e2e47a20c1cf55a7` | 1 | 含独有提交，须归档 |
| `zy-dev` | `9c869e119b721ae9dd8dd5d11ec7aebfefb6f9c7` | 0 | 已被保留分支覆盖 |

删除前还需同步处理引用：README 安装链接指向 rebuild 分支，所以暂留；7 个 `apply-*.yml` 工作流硬编码旧的 `fix/stability-auto-answer-20260916` 并会写回分支，`stability-audit.yml` 的 push 条件也引用它。这些一次性自动修补工作流应退役，保留通用的只读 test/build CI。否则删除后可能出现无法 checkout，或以后重新推送而复活旧分支。

复现资料包提供完整 manifest、退役工作流 patch 和默认只预览的清理脚本。脚本在写入模式下要求 GitHub CLI 可查询当前 PR/保护状态，校验每个待删分支仍是审查时的 SHA，并检查远端 main 已清除旧工作流引用；使用同一次原子推送建立归档 tag 并按 expected SHA 删除 23 个分支。任一步不满足就停止，不强推 main、不重写提交历史。归档 tag 可以恢复原分支；它们也不代表经验证的发布版。

建议执行顺序：审阅退役工作流 patch → 应用并提交到 main → 脚本预览 → 在已认证环境执行 `python3 branch-cleanup.py --repo <仓库路径> --apply` → 确认只剩 3 个分支及安装链接仍可用。patch 和脚本均未在远端执行。

## 分批修复与验收

| 批次 | 范围 | 必须验证的真实组合 |
|---|---|---|
| 0 | 固定已使用成品、恢复可构建源码、保护默认设置 | 新构建与既有成品只含预期差异；能回滚 |
| 1 | 答案解析、草稿/远端分离、统一提交与状态确认 | AI + 人工修改；开放/截止/提前结束；空 success；网络结果未知 |
| 2 | 取消/超时、按题锁与截止调度 | 多题同时发布；关闭开关；截图卡住；两标签页 |
| 3 | 刷新恢复与课堂上下文 | AI 中刷新；提交后刷新；切课堂/切账号/重连 |
| 4 | 统一题目编辑器与提醒 | 其他题成功不丢草稿；历史不误报；当前课件静默 |
| 5 | 弹幕策略与发送确认 | 7 条窗口、并列、60 秒换轮、失败不乱扣额度、保护人工输入 |
| 6 | 模型选择、复核、OCR/翻译/下载 | 一次操作仅一个任务；旧结果不覆盖新结果；多页缺图可见 |

手机真实验收至少覆盖：普通/不限时/填空/多选/主观题；老师在排队前后结束；一次发 3–4 题；横竖屏、后台返回与刷新；网络切换；只有补交返回空 success；关闭自动作答；一份草稿在另题提交后仍保留。没有通过的场景不写成“全功能已修好”。

## 不能直接认定为已经实现的功能

当前发布文件不能因 README 或其他分支提到就算已具备：完整中断恢复、未答题自动扫描、每日启停/白黑名单、服务端无人值守、手机号密码登录、动态二维码、多 Profile 快答复核、自然的 AI 生成后提交/补交/本地决策。测试/考试题组的真实加载与提交还需要独立接口证据，不能把收到“发布通知”等同于已经能答整份试卷。

## 现有正常路径与排除项

隔离检查确认：普通 AI 作答一次请求后正常提交；不限时题 endTime=null 的当前 1.21.7 路径可提交；老师在 AI 执行中结束后会走 retry；retryAnswer 本身会检查 success IDs；OCR 重新识别后翻译会使用新文字（U06），没有复现“翻译缓存一直用旧内容”。这些正常路径应保留。

因此，本报告没有把早期 1.21.6 的 null 过期错误直接归到当前运行版，也没有把所有 50013、超时与解析失败都归因于同一个原因。

## 附录：场景原始观察记录

这是观察记录，不是修复后的断言通过清单。请求与答案均为隔离测试假数据。

```json
[
  {
    "id": "C01-normal-auto",
    "evidence": {
      "requests": [
        "/api/v3/lesson/problem/answer"
      ],
      "result": [
        "A"
      ]
    }
  },
  {
    "id": "C02-unlimited-auto",
    "evidence": {
      "endTime": null,
      "result": [
        "A"
      ]
    }
  },
  {
    "id": "A01-teacher-ends-queued",
    "evidence": {
      "requests": 0,
      "status": {
        "presentationId": "PR",
        "slideId": "SP",
        "startTime": 1800000000000,
        "endTime": 1800000060000,
        "done": false,
        "autoAnswerTime": 1800000000000,
        "answering": false,
        "finished": true
      }
    }
  },
  {
    "id": "A02-manual-answer-overwrite-after-finish",
    "evidence": {
      "requests": [
        {
          "url": "/api/v3/lesson/problem/retry",
          "body": {
            "problems": [
              {
                "problemId": "P",
                "problemType": 1,
                "dt": 1800000002000,
                "result": [
                  "A"
                ]
              }
            ]
          }
        }
      ],
      "finalResult": [
        "A"
      ]
    }
  },
  {
    "id": "A03-disabled-after-queue",
    "evidence": {
      "autoAnswer": false,
      "requests": 1,
      "result": [
        "A"
      ]
    }
  },
  {
    "id": "A04-empty-result-array",
    "evidence": {
      "result": [],
      "scheduled": null,
      "requests": 0
    }
  },
  {
    "id": "A05-live-event-before-data",
    "evidence": {
      "hasStatus": false,
      "reminders": 0
    }
  },
  {
    "id": "A06-reenable-not-rescheduled",
    "evidence": {
      "scheduled": null
    }
  },
  {
    "id": "A07-historical-timeline-retriggers",
    "evidence": {
      "scheduled": 1800000000000,
      "reminderKinds": [
        "problem-start",
        "auto-answer-scheduled"
      ]
    }
  },
  {
    "id": "A08-source-lesson-ignored",
    "evidence": {
      "pageLesson": "L1",
      "status": {
        "presentationId": "PR",
        "slideId": "SP",
        "startTime": 1800000000000,
        "endTime": 1800000060000,
        "done": false,
        "autoAnswerTime": 1800000000000,
        "answering": false,
        "finished": false
      },
      "finishedStorageKeys": [
        "ykt-helper:config"
      ]
    }
  },
  {
    "id": "A09-auto-join-policy-ignored",
    "evidence": {
      "scheduled": null
    }
  },
  {
    "id": "A10-server-closed-no-retry-fallback",
    "evidence": {
      "routes": [
        "/api/v3/lesson/problem/answer"
      ]
    }
  },
  {
    "id": "A11-submission-response-parse-error",
    "evidence": {
      "aiCompleted": true,
      "notice": [
        "自动作答失败: 解析响应失败",
        4000
      ]
    }
  },
  {
    "id": "A12-refresh-state-not-persisted",
    "evidence": {
      "keys": [
        "ykt-helper:config"
      ],
      "containsQueuedWork": false
    }
  },
  {
    "id": "P01-negative",
    "evidence": {
      "input": "答案: -1",
      "type": 4,
      "parsed": [
        "1"
      ]
    }
  },
  {
    "id": "P02-interval",
    "evidence": {
      "input": "答案: (-∞, 0]",
      "type": 4,
      "parsed": [
        "0"
      ]
    }
  },
  {
    "id": "P03-expression",
    "evidence": {
      "input": "答案: x + y",
      "type": 4,
      "parsed": [
        "x",
        "+",
        "y"
      ]
    }
  },
  {
    "id": "P04-long-blank",
    "evidence": {
      "input": "答案: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "type": 4,
      "parsed": {
        "content": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "pics": []
      }
    }
  },
  {
    "id": "P05-choice-invalid",
    "evidence": {
      "input": "答案: Z",
      "type": 1,
      "parsed": [
        "Z"
      ]
    }
  },
  {
    "id": "P06-choice-english",
    "evidence": {
      "input": "Answer: B",
      "type": 1,
      "parsed": [
        "A"
      ]
    }
  },
  {
    "id": "P07-type-string",
    "evidence": {
      "input": "答案: A",
      "type": "1",
      "parsed": null
    }
  },
  {
    "id": "S01-zero-volume-save",
    "evidence": {
      "savedVolume": 0.6
    }
  },
  {
    "id": "S02-reset-api-key-reappears",
    "evidence": {
      "keyStillInProfile": true,
      "keyStillInStorage": true,
      "legacyKey": "\"\""
    }
  },
  {
    "id": "S03-profile-switch-unsaved-active",
    "evidence": {
      "activeInMemory": "default",
      "storedConfig": null,
      "createdProfile": "p_mywpiww0"
    }
  },
  {
    "id": "S04-random-zero-reopens-as-one",
    "evidence": {
      "savedRandomMs": 0,
      "displayedSeconds": "1"
    }
  },
  {
    "id": "S05-save-quota-failure",
    "evidence": {
      "memory": false,
      "disk": true,
      "lastNotice": [
        "设置已保存"
      ]
    }
  },
  {
    "id": "S06-auto-join-settings-no-start",
    "evidence": {
      "enabled": true,
      "running": false
    }
  },
  {
    "id": "U01-save-local-blocks-auto",
    "evidence": {
      "markedResult": [
        "B"
      ],
      "requests": 0,
      "status": "PID: P / 类型: 1 / 状态: 已作答 / 截止: 未知"
    }
  },
  {
    "id": "U02-draft-lost-on-unrelated-answer",
    "evidence": {
      "draftExists": false
    }
  },
  {
    "id": "U03-active-finished-unlimited-card",
    "evidence": {
      "cards": 1,
      "text": "choose不限时查看AI 解答"
    }
  },
  {
    "id": "U04-ai-auto-analyze-duplicated",
    "evidence": {
      "gmCalls": 3
    }
  },
  {
    "id": "U05-title-html-injection",
    "evidence": {
      "injectedHandler": "window.probe=1"
    }
  },
  {
    "id": "U06-ocr-refresh-stale-translation",
    "evidence": {
      "displayed": "translated-new"
    }
  },
  {
    "id": "U07-report-lazy-pages-frozen",
    "evidence": {
      "first": 1,
      "after": 1
    }
  },
  {
    "id": "N01-retry-empty-success-marked-answered",
    "evidence": {
      "lowLevelError": "服务器未返回成功信息",
      "result": [
        "A"
      ]
    }
  },
  {
    "id": "N02-retry-batch-only-first",
    "evidence": {
      "first": [
        "A"
      ]
    }
  },
  {
    "id": "N03-dead-socket-not-reconnected",
    "evidence": {
      "sameSocket": true,
      "state": 3
    }
  },
  {
    "id": "N04-spa-lesson-state-not-updated",
    "evidence": {
      "url": "/lesson/fullscreen/v3/L2",
      "currentLesson": "L1",
      "retainedProblems": 1
    }
  },
  {
    "id": "N05-auto-join-cannot-restart",
    "evidence": {
      "calls": 1,
      "running": false
    }
  },
  {
    "id": "D01-follows-after-three-not-seven",
    "evidence": {
      "observations": [
        {
          "triggered": false,
          "text": "same",
          "count": 1,
          "sentCount": 0,
          "reason": "threshold"
        },
        {
          "triggered": false,
          "text": "same",
          "count": 2,
          "sentCount": 0,
          "reason": "threshold"
        },
        {
          "triggered": true,
          "text": "same",
          "count": 3,
          "sentCount": 1
        }
      ]
    }
  },
  {
    "id": "D02-send-failure-consumes-quota",
    "evidence": {
      "last": {
        "handled": true,
        "triggered": false,
        "text": "same",
        "count": 5,
        "sentCount": 1,
        "reason": "already-followed"
      },
      "sentCount": 1,
      "followed": [
        "same"
      ]
    }
  },
  {
    "id": "D03-send-true-without-outbound",
    "evidence": {
      "result": {
        "sent": true,
        "text": "same"
      }
    }
  },
  {
    "id": "D04-existing-draft-overwritten",
    "evidence": {
      "value": "auto"
    }
  },
  {
    "id": "R01-current-presentation-still-notifies",
    "evidence": {
      "notices": [
        "courseware-publish"
      ]
    }
  },
  {
    "id": "R02-home-reloads-while-visible",
    "evidence": {
      "intervalMs": 60000,
      "hidden": false,
      "pathname": "/v2/web/index",
      "reloadAttempt": [
        "Not implemented: navigation to another Document"
      ]
    }
  },
  {
    "id": "B01-camera-image-wrong-MIME",
    "evidence": {
      "imageUrl": "data:image/png;base64,/9j/AAAA"
    }
  },
  {
    "id": "B02-cache-load-not-hydrated",
    "evidence": {
      "presentations": 1,
      "slides": 0,
      "problems": 0
    }
  },
  {
    "id": "B03-missing-ai-config-crashes-boot",
    "evidence": {
      "error": "Cannot read properties of null (reading 'kimiApiKey')"
    }
  },
  {
    "id": "B04-remember-finished-quota-blocks-state",
    "evidence": {
      "error": "QuotaExceededError",
      "finished": false
    }
  },
  {
    "id": "A13-image-load-hangs-answer",
    "evidence": {
      "answering": true,
      "settled": false,
      "requests": 0,
      "timeoutTimers": []
    }
  },
  {
    "id": "A14-submission-hangs-without-timeout",
    "evidence": {
      "answering": true,
      "xhrTimeout": 0,
      "onTimeoutInstalled": "undefined"
    }
  },
  {
    "id": "A15-queue-sends-expired-request",
    "evidence": {
      "queuedRequestStillSent": 2,
      "secondRequestTimeoutMs": 15000,
      "secondDeadlinePassed": true
    }
  },
  {
    "id": "A16-multitab-has-no-submit-lock",
    "evidence": {
      "totalSubmissions": 2
    }
  },
  {
    "id": "S07-blank-vision-model-cannot-clear",
    "evidence": {
      "savedVisionModel": "moonshot-v1-8k-vision-preview"
    }
  },
  {
    "id": "S08-edits-lost-on-profile-switch",
    "evidence": {
      "name": "Kimi"
    }
  },
  {
    "id": "U08-ocr-doubleclick-duplicate",
    "evidence": {
      "ocrCalls": 2
    }
  },
  {
    "id": "U09-late-ai-result-overwrites-new",
    "evidence": {
      "display": "主界面当前页面（miss键命中）图像分析结果：答案: A\nAI 建议答案：[\"A\"]"
    }
  },
  {
    "id": "U10-latex-markdown-corrupted",
    "evidence": {
      "html": "<p>$x<em>1 + x</em>2$</p>",
      "code": "<pre class=\"ykt-md-code\"><code data-lang=\"python\">x<em>y</em>z=1\n<p></code></pre></p>"
    }
  },
  {
    "id": "U11-default-export-filters-ordinary-slides",
    "evidence": {
      "showAll": false,
      "lastNotice": [
        "当前筛选下没有可导出的页面"
      ]
    }
  },
  {
    "id": "N06-fetch-Request-body-not-observed",
    "evidence": {}
  },
  {
    "id": "N07-xhr-open-drops-auth-arguments",
    "evidence": {
      "nativeOpenArgumentCount": 3
    }
  },
  {
    "id": "B05-config-legacy-key-vs-profile",
    "evidence": {
      "customAudioRetained": "data:audio/wav;base64,AAAA",
      "autoAnalyzeRetained": true
    }
  },
  {
    "id": "C03-normal-AI-auto",
    "evidence": {
      "gmCalls": 1,
      "routes": [
        "/api/v3/lesson/problem/answer"
      ],
      "result": [
        "A"
      ]
    }
  },
  {
    "id": "C04-teacher-ends-during-AI-retries",
    "evidence": {
      "routes": [
        "/api/v3/lesson/problem/retry"
      ],
      "result": [
        "A"
      ]
    }
  },
  {
    "id": "C05-correct-retry-success-validation",
    "evidence": {
      "code": 0,
      "success": [
        "P"
      ]
    }
  },
  {
    "id": "S09-disable-auto-join-does-not-stop",
    "evidence": {
      "config": false,
      "running": true
    }
  },
  {
    "id": "U12-active-card-ai-selects-other-slide",
    "evidence": {
      "clickedProblem": "P",
      "panelText": "主界面当前页: 第  页\n📝 此页面包含题目"
    }
  },
  {
    "id": "U13-global-presentations-leak-across-lessons",
    "evidence": {
      "titles": [
        "deck"
      ],
      "remainingProblems": 1
    }
  },
  {
    "id": "U14-partial-multi-images-silent",
    "evidence": {
      "display": "课件浏览（传入/string键命中）图像分析结果：images=1"
    }
  }
]
```

### 历史执行器针对性观察

```json
[
  {
    "id": "H01-null-deadline",
    "ref": "dd4b0bb",
    "ok": false,
    "reason": "expired"
  },
  {
    "id": "H01-null-deadline",
    "ref": "origin/fix/pr5-verification-and-save-feedback-20260920",
    "ok": false,
    "reason": "error",
    "error": "未配置可用的 AI Profile 或 API Key，自动作答未提交"
  },
  {
    "id": "H02-manual-answer-during-AI",
    "ref": "PR6",
    "submitted": [
      {
        "answer": [
          "A"
        ],
        "options": {
          "endTime": null,
          "forceRetry": false,
          "lessonId": null,
          "autoGate": false,
          "waitMs": 0
        }
      }
    ]
  },
  {
    "id": "H03-verification-reuses-normal-submit",
    "ref": "PR6",
    "calls": [
      {
        "answer": [
          "A"
        ],
        "forceRetry": false
      },
      {
        "answer": [
          "B"
        ],
        "forceRetry": false
      }
    ],
    "ok": true,
    "verificationState": "correction-failed",
    "finalAnswer": [
      "A"
    ]
  }
]
```
