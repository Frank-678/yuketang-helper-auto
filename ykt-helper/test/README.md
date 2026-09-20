# 雨课堂助手测试架构

本目录的目标不是“测试数量多”，而是让每个用户可见功能都有可追溯的行为合同，并让跨模块回归能在发布前被稳定复现。

## 分层

### `test/*.test.js` — Legacy regression

历史测试暂时保留在根目录，不一次性重写。它们用于防止重构时丢失既有断言。新测试原则上不再直接加到根目录；有机会时逐步迁入下面四层。

### `test/unit/*.test.js` — L1 纯逻辑矩阵

允许 mock：无。

要求：

- 模块必须无 DOM / 网络副作用。
- 同一输入域优先写成表驱动 matrix，而不是复制十几个 test body。
- 必须覆盖边界值、非法值、旧版本格式。
- 典型对象：题型解析、时间计算、状态判断、Profile 选择、配置迁移。

### `test/contract/*.test.js` — L2/L3 边界合同

允许 mock：浏览器 API、GM API、XHR/WebSocket、DOM 控件。

不允许 mock：被测试模块内部的业务逻辑。

要求：

- 验证网络 URL、header、payload、返回码和失败行为。
- 验证 UI/DOM 边界时只 mock 浏览器原语，不复制产品判断逻辑。
- 一个失败必须能说明“产品与外部系统之间的合同哪里断了”。
- AI Profile、OCR、翻译等凭据必须覆盖“运行时可读、page localStorage 不落明文、旧配置先私有写成功再清洗”的迁移合同。

### `test/scenario/*.test.js` — L4 跨模块场景

允许 mock：真正无法在 CI 使用的外部边界，例如 AI 服务器、雨课堂服务器、浏览器图片加载。

不允许 mock：场景内部的业务模块。例如“自动 AI”场景应尽量使用真实 `actions -> runner -> capture -> AI client -> parser -> submit`。

要求：

- 从用户或服务器入口开始，断言最终副作用，而不是只断言中间函数被调用。
- 同时检查状态机最终状态和网络副作用。
- 场景之间必须完全隔离；模块级缓存需要独立 lesson/id 或显式 reset。
- 必须覆盖成功、失败、超时、重复动作、刷新/恢复、跨 lesson 等负向路径。

### `test/build/*.test.js` — L5 构建产物合同

在 `npm run build` 之后执行。

要求：

- 检查 userscript metadata、入口覆盖、关键功能确实打进 bundle。
- 私有凭据存储所需的 `GM_getValue` / `GM_setValue` / `GM_deleteValue` grants 必须存在于最终 bundle。
- 确认不存在运行时 import/export。
- 确认最终浏览器脚本没有 Electron/Windows/CLI 产品代码。
- 历史 release 不应成为 build 输出目标。

## 公共测试设施

`test/support/browser-harness.js`：最小浏览器、DOM、localStorage、GM request、XMLHttpRequest fake。

`test/support/raw-loader.mjs`：仅在 Node 测试中把 `.html/.css` 模块作为空字符串加载，使真实 UI/actions 模块可被导入；不会进入产品 bundle。

新增 fake 应优先加入 `support`，不要在每个测试文件中各写一份不兼容实现。

## 十条强制 L4 链路

以下链路必须有 scenario 测试，且不能只靠静态正则：

1. live 新题 -> 排队 -> AI -> 解析 -> `/answer` -> done。
2. 已答题 -> AI 强制作答 -> AI -> submit/retry -> done。
3. 编辑答案 -> 单击提交 -> 一次 `/answer`。
4. 编辑答案 -> 强制补交 -> 一次 `/retry`。
5. 不限时题 -> 不误判 expired -> 正常作答。
6. unlock 先到、题目数据后到 -> retry -> 正常排队。
7. queued/answering 刷新 -> recovery -> 最多一次提交。
8. 自动进入课堂 -> 建立监听 -> 新题 -> 自动答题。
9. 7 条弹幕 -> sender -> 捕获对应出站 WS frame -> sentCount+1。
10. 非 lesson 页周期刷新；lesson 页不强刷。

## 回归测试写法约束

- **测试故障现象，不测试实现长相。** 能做行为断言就不要用源码正则。
- **测试先红后修。** 新发现的现场 Bug 先写能复现的测试，再改实现。
- **禁止用测试迁就 Bug。** 如果旧测试与明确的新产品语义冲突，应说明旧合同为何错误后再更新。
- **网络成功后才能本地标成功。** 所有提交/跟发类测试都必须覆盖服务器失败。
- **防重复是合同的一部分。** 用户快速双击、重复 WS、重复 timeline、刷新恢复都应验证最多一次副作用。
- **旧数据格式是长期合同。** 配置和 recovery 的旧 schema 必须保留迁移测试。
- **分支/版本名不作为真相。** 历史行为基线按 commit SHA 和实际测试结果确认。

## 本地/CI 命令

```bash
npm run test:legacy
npm run test:unit
npm run test:contract
npm run test:scenario
npm run build
npm run test:build
npm run test:all
```

GitHub Actions 的 `Full Regression` 将五层拆成独立 job。某一层失败时，其他层仍运行，避免第一处失败遮蔽后续问题。

## 完成标准

测试数量没有硬上限。判断是否“够”看覆盖结构：

- 每个用户可见开关至少一条 on/off 行为测试；
- 每种题型至少一条 AI 解析 + 提交 payload 测试；
- 每条关键 L4 链有正向和至少一个负向测试；
- 所有真实历史回归都必须留下永久 regression case；
- `legacy / unit / contract / scenario / build-contract` 五层全绿后，才允许生成候选现场版本。
