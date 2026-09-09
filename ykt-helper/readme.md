# ykt-helper 开发文档

> 当前发布版本为 1.21.5，正式用户脚本位于 [`../release/ykt-helper-1215.user.js`](../release/ykt-helper-1215.user.js)。`flat/` 是旧版扁平化实现，不参与当前发布。

## 项目构建

### 环境要求
- Node.js
- npm

### 构建步骤
```bash
npm ci               # 按 lockfile 安装依赖；首次开发也可使用 npm install
npm test             # 运行自动化测试
npm run build        # 构建到 rollup.config.mjs 指定的 dist/ 文件
npm run dev          # 开发模式（监听文件变化）
```

### 使用方式
构建后的当前产物是 `dist/ykt-helper-1215.user.js`；发布前将它与根目录的 `../release/ykt-helper-1215.user.js` 保持完全一致，再导入 Tampermonkey。旧的 1.21.4 及更早发布包保留作历史版本。

本版本修复不限时题目的 `limit` 为空时被错误判定为已过期的问题；空值、`0` 和非法时限均按“不限时”处理，正数时限仍按秒计算。

课堂互动还提供可选的“重复弹幕自动跟发”：最近 7 条弹幕中同一文本出现 3 次时跟发相同文本；相邻弹幕间隔达到 60 秒重新分轮，每轮最多 2 条，同一文本每轮只跟发一次，默认关闭。

1.21.5 新增自动作答恢复：自动作答队列会按课程保存在本地，刷新后可恢复刷新前已经排队或正在 AI 处理的题目。恢复和扫描均为独立开关且默认关闭；已过截止时间的自动补交还需要单独开启。题目页、活动题目卡片、题目列表和 AI 面板均提供“AI 强制作答”以及“编辑/补交”入口。

### 本地调试
`debug/` 目录提供了本地调试环境，无需 Tampermonkey 即可运行 UI。
```bash
npm run build                              # 先构建
python3 -m http.server 8765                # 从 ykt-helper/ 根目录启动
# 浏览器打开 http://localhost:8765/debug/
```

- `mock-gm.js`：模拟 GM API 并阻止脚本自动重载
- `mock-data.js`：可选的 mock 数据注入（默认为空，按需添加）
- AI 功能因缺少 `GM_xmlhttpRequest` 会报错，不影响 UI 调试
- 每次修改源码后需重新 `npm run build` 再刷新页面

## 项目架构

```
src/
├── index.js                    # 主入口
├── ai/                         # AI 服务
│   ├── openai.js              # 当前主调用：OpenAI 兼容接口（文本、视觉、OCR、翻译）
│   ├── kimi.js                # 旧版 Kimi 调用实现
│   ├── deepseek.js            # 备用实现
│   ├── gemini.js              # 备用实现
│   └── openrouter.js          # 备用实现
├── capture/
│   └── screenshoot.js         # 页面截图功能（支持Vision模式）
├── core/                      # 核心配置
│   ├── env.js                 # 环境适配器
│   ├── reminder-preferences.js # 课堂事件与提醒方式开关
│   ├── danmu-follow.js         # 弹幕提取、滑窗统计、分轮限额与自回显排除
│   ├── danmu-sender.js         # 复用课堂原生弹幕输入框和发送按钮
│   ├── realtime-dispatch.js    # 运行模式感知的实时事件分发
│   ├── runtime-mode.js         # 桌面专用运行模式与 /m/v2 路由守卫
│   ├── screen-wake-lock.js     # 可见课堂页的亮屏锁
│   ├── settings-form.js        # Profile 原子保存与提醒表单同步
│   ├── storage.js             # 存储管理
│   ├── vuex-helper.js         # vuex辅助工具，用于获取雨课堂主界面状态
│   └── types.js               # 类型定义与常量
├── net/                       # 网络拦截
│   ├── fetch-interceptor.js   # Fetch 拦截
│   ├── ws-interceptor.js      # WebSocket 拦截
│   └── xhr-interceptor.js     # XHR 拦截
├── state/                     # 状态管理
│   ├── actions.js             # 动作处理器（融合模式自动答题）
│   ├── answer-editor.js       # 编辑答案的 JSON/文本解析与提交参数
│   ├── auto-answer-recovery.js # 按课程持久化待作答状态与恢复策略
│   ├── auto-answer-runner.js  # 单题 AI 作答、补交与失败状态机
│   └── repo.js                # 数据仓库
├── tsm/                       # 雨课堂业务逻辑
│   ├── ai-format.js           # AI 格式化（智能提示和解析）
│   └── answer.js              # 答题接口
└── ui/                        # 用户界面
    ├── panels/                # 面板组件
    │   ├── *.html            # 面板模板
    │   ├── *.js              # 面板逻辑
    │   └── auto-answer-popup.js # 自动答题弹窗
    ├── styles.css             # 样式定义
    ├── styles.js              # 样式注入
    ├── toast.js               # 提示组件
    ├── toolbar.js             # 工具栏
    ├── mobile-reminder-panel.js # 遗留手机版提醒面板（桌面专用模式不挂载）
    └── ui-api.js              # UI 统一接口
```

## 课堂提醒与运行模式

- `reminder-preferences.js` 是唯一的提醒开关定义：总开关、9 个事件开关和系统通知/页面弹窗/声音三种方式开关都由它管理。
- `ui.notifyClassroomEvent()` 是桌面运行时统一使用的提醒接口；事件筛选和提醒方式筛选在这里生效。
- `/m/v2` 不再启动手机版运行时。脚本在 `document-start` 阶段将其改写为 `/v2/web` 对应路径，并同时拦截 SPA、链接和前进/后退导航；保留 `/m/v2` 的 Userscript 匹配规则仅用于执行这一步守卫。
- 若服务端根据手机 User-Agent 强制重定向，页面级 Userscript 无法拦截 HTTP 跳转；守卫会防止循环，并提示用户启用浏览器“桌面版网站”。
- 亮屏基于 Wake Lock，只在页面可见的课堂路径有效；锁屏、后台冻结和系统省电策略不在脚本可控制范围内。

### 重复弹幕自动跟发

- 在设置 → 课堂运行中打开“重复弹幕自动跟发”后，脚本监听课堂 WebSocket 的 `newdanmu` 事件。
- 统计当前班级最近 7 条非空弹幕；同一文本在窗口内出现 3 次时，自动通过课堂页面的 `.send__input` 和 `.send__btn` 发送相同文本。
- 相邻两条弹幕间隔 `< 60` 秒属于同一发送轮，间隔 `>= 60` 秒开始新轮；每轮最多跟发 2 条，同一文本每轮只跟发一次。
- 功能默认关闭；发送框不存在、发送按钮禁用或发送失败时不会重试刷屏，也不会影响题目和课堂提醒。

## 核心功能特性

### 🎯 AI 融合分析模式
- **智能识别**：同时利用页面文本信息和图像内容进行题目分析
- **Vision 支持**：使用 Kimi Vision 模型识别图表、公式、图像等视觉元素
- **自适应策略**：根据题目内容自动选择最佳分析策略
- **精确格式控制**：针对不同题型提供严格的答案格式要求

### 📝 题目类型支持
| 题型 | 答案格式 | 字数限制 | 示例 |
|-----|---------|---------|------|
| 单选题 | 单个字母 | 解释50字以内 | `答案: A` |
| 多选题 | 多个字母用顿号分开 | 解释80字以内 | `答案: A、B、C` |
| 投票题 | 单个字母 | 解释50字以内 | `答案: B` |
| 填空题 | 直接内容，多空用逗号分开 | 解释60字以内 | `答案: 光合作用,呼吸作用` |
| 主观题 | 完整回答 | 100字以内，复杂题目可适当增加 | `答案: [详细回答]` |

### 🔧 自动答题流程
1. **题目解锁检测**：实时监控新题目出现
2. **页面截图**：自动截取题目区域图像
3. **融合分析**：结合文本信息和图像内容进行AI分析
4. **智能解析**：根据题型精确解析AI回答格式
5. **自动提交**：验证答案格式后自动提交

### 刷新恢复与手动强制作答

- 在“自动作答设置”中可分别打开：
  - **刷新后恢复已排队/被中断的 AI 作答**：只恢复本地记录中已经出现过的题目；
  - **刷新后自动强制补交已过期题目**：需要同时打开上一项，默认关闭；
  - **自动扫描当前课程中未作答题目**：会扫描已缓存课件中的旧题，默认关闭。
- 在题目页、活动题目卡片、题目列表或 AI 面板点击 **AI 强制作答**，会立即开始 AI 请求，不等待自动作答延迟；题目过期时会先确认，再调用 `/api/v3/lesson/problem/retry`。
- AI 分析完成后，编辑区会显示结构化答案。可以修改 JSON 或使用题型简写，再点击 **提交编辑后的答案**。
- 同一题同时只能有一个 AI 请求；刷新、重复解锁或重复点击不会创建重复请求。AI 请求失败会保留“失败”状态，等待手动重试。
- 本地恢复记录按课程隔离，并自动清理超过 24 小时或超出 100 条上限的记录；脚本不会默认把历史课件题目自动提交。

## 核心模块接口

### state/repo.js - 数据仓库
```javascript
export const repo = {
  presentations: Map,          // 课件数据
  slides: Map,                // 幻灯片数据  
  problems: Map,              // 题目数据
  problemStatus: Map,         // 题目状态
  encounteredProblems: [],    // 遭遇的题目列表
  
  // 方法
  setPresentation(id, data),  // 设置课件
  upsertSlide(slide),         // 更新幻灯片
  upsertProblem(prob),        // 更新题目
  loadStoredPresentations()   // 加载存储的课件
}
```

### state/actions.js - 动作处理
```javascript
export const actions = {
  onPresentationLoaded(id, data),  // 课件加载完成
  onUnlockProblem(data),          // 题目解锁（融合模式分析）
  onDanmu(data),                  // 收到课堂弹幕并按设置决定是否跟发
  handleAutoAnswer(problem),       // 自动答题（融合模式）
  forceAIAnswer(problemId),        // 手动强制 AI 作答并提交
  submitParsedAnswer(problem, result), // 提交编辑后的结构化答案
  restorePendingProblemStatuses(), // 恢复本课程持久化的待作答状态
  navigateTo(presId, slideId),    // 导航到指定页面
  launchLessonHelper()            // 启动课堂助手
}
```

### state/auto-answer-recovery.js - 恢复策略

```javascript
createProblemRecoveryStore({ storage, lessonId })
// upsert/get/list/update/remove/clear：按课程读写待作答记录

shouldRecoverProblem(record, { enabled, recoverExpired, now })
// 返回 { recover, forceRetry, reason }
```

### state/auto-answer-runner.js - 单题作答执行器

```javascript
createAutoAnswerRunner(dependencies).run(problem, status, {
  force,          // 手动/恢复时绕过自动等待
  forceRetry,     // 过期后走补交接口
  source,
  lessonId,
})
// 返回 { ok, answer, aiAnswer, route }，失败时保留 status.phase='failed'
```

### ai/openai.js - 当前 AI 服务
```javascript
// 文本模式 API 调用
export async function queryAI(question, aiCfg)

// Vision / 融合模式 API 调用
export async function queryAIVision(imageBase64, textPrompt, aiCfg, options)

// 两者都从 aiCfg.activeProfileId 选择当前 Profile，并使用其 baseUrl、apiKey、model、visionModel、temperature
```

### capture/screenshoot.js - 截图服务
```javascript
// 截取问题页面截图
export async function captureProblemScreenshot()
// 返回: Promise<HTMLCanvasElement> 截图画布

// 获取Vision API专用的base64图像数据
export async function captureProblemForVision()
// 返回: Promise<string> base64编码的图像数据
// 自动压缩和优化图像大小
```

### tsm/ai-format.js - 智能格式化
```javascript
// 生成文本模式AI提示
export function formatProblemForAI(problem, TYPE_MAP)
// 根据题型生成精确的格式要求

// 生成Vision模式AI提示（融合模式）
export function formatProblemForVision(problem, TYPE_MAP, hasTextInfo)
// 结合文本信息和图像分析的智能提示

// 智能解析AI回答
export function parseAIAnswer(problem, aiAnswer)
// 支持多种答案格式的智能识别和解析
// 增强的错误处理和格式兼容性
```

### ui/ui-api.js - UI 统一接口
```javascript
export const ui = {
  config: {},                     // 配置对象
  saveConfig(),                   // 保存配置
  
  // 面板控制
  showPresentationPanel(visible), // 显示课件面板
  showAIPanel(visible),          // 显示AI融合分析面板
  toggleSettingsPanel(),         // 切换设置面板
  
  // 数据更新
  updatePresentationList(),      // 更新课件列表
  updateSlideView(),            // 更新幻灯片视图
  updateProblemList(),          // 更新题目列表
  
  // 工具方法
  toast(message),               // 显示提示
  notifyProblem(problem, slide) // 题目通知
}
```

## 面板组件

- **settings**: 配置 Kimi API Key、自动答题参数、刷新恢复与扫描开关
- **ai**: AI 融合分析交互面板（文本+图像）
- **presentation**: 课件浏览与下载
- **problem-list**: 题目历史记录
- **active-problems**: 当前活跃题目、AI 强制作答与编辑/补交入口
- **tutorial**: 使用教程
- **auto-answer-popup**: 自动答题结果弹窗

## AI 服务配置

### AI Profile 配置
1. 在设置面板新建或选择一个 AI Profile。
2. 每个 Profile 独立保存 `baseUrl`、`apiKey`、文本模型、视觉模型与 `temperature`。
3. `temperature` 可填 0–2；留空时请求体不包含该字段，使用提供商默认值。对于不接受自定义 Temperature 的模型，保持留空。
4. 当前 Profile 的 Temperature 会同时作用于文本、视觉/融合、OCR 和翻译等 OpenAI 兼容请求。

### Vision模式特性
- **自动截图**: 智能识别题目区域并截图
- **图像压缩**: 自动优化图像大小以符合API限制
- **融合分析**: 同时利用页面文本和图像信息
- **格式优化**: 针对不同题型生成专门的Vision提示

### API 兼容性
项目使用 OpenAI 兼容的 API 格式，便于后续扩展其他AI服务。

## 智能解析增强

### 答案格式识别
- **单选/投票题**: 支持 `A`、`选择A`、`答案是A` 等多种表述
- **多选题**: 支持 `A、B、C`、`A,B,C`、`ABC` 等多种分隔符
- **填空题**: 智能识别多空答案，支持逗号、分号等分隔符
- **主观题**: 保留完整内容，自动去除多余格式

### 错误恢复机制
- 详细的调试日志输出
- 多种格式尝试解析
- 智能容错处理
- 用户友好的错误提示

## 配置文件

### userscript.meta.js
包含用户脚本元数据；发版时更新 `@version`。

### rollup.config.mjs  
构建配置；`OUT_FILE` 是唯一的构建输出文件名来源。

### debug/index.html
本地调试页通过 `<script>` 直接引用 `dist/` 中的用户脚本，因此每次变更 `OUT_FILE` 时也要同步引用路径。

## 开发注意事项

1. **发版检查清单**：下列位置必须在同一版本提交中同步，避免出现“源码已更新、成品或文档未更新”的情况。
   - [ ] `userscript.meta.js` 的 `@version`
   - [ ] `rollup.config.mjs` 的 `OUT_FILE`
   - [ ] `debug/index.html` 的 `dist/` 脚本引用
   - [ ] `src/ui/panels/tutorial.html` 中显示的版本号
   - [ ] 运行 `npm test && npm run build`
   - [ ] 将构建产物复制到 `../release/`，并运行 `cmp -s dist/ykt-helper-<编号>.user.js ../release/ykt-helper-<编号>.user.js`
   - [ ] 根 `README.md` 的版本徽章、安装链接、更新记录
   - [ ] 根 `changelog.md` 的版本条目
2. **发布产物**：`dist/` 被 Git 忽略；版本化成品必须额外提交到项目根目录的 `release/` 文件夹中。
3. **UI组件**：采用 HTML + JS 模板形式，样式统一在 `styles.css` 中定义。
4. **网络处理**：通过拦截器统一处理所有网络请求。
5. **状态管理**：集中在 `repo` 和 `actions` 中，确保数据一致性。
6. **AI服务**：当前主流程使用 `openai.js` 的 OpenAI 兼容接口；设置变更要覆盖文本与视觉路径。
7. **图像处理**：注意图像大小限制，自动压缩优化。
8. **格式控制**：严格控制AI输出格式，确保解析成功率。
9. **错误处理**：提供详细的调试信息和用户反馈。

## 使用建议

### 最佳实践
1. **API Key配置**: 确保使用有效的 Kimi API Key
2. **网络环境**: 保证稳定的网络连接以支持Vision API调用
3. **页面加载**: 等待页面完全加载后再进行AI分析
4. **题目复杂度**: 对于复杂图表题目，融合模式效果最佳

### 故障排除
- **解析失败**: 检查AI回答格式是否符合要求
- **截图失败**: 确保页面内容已完全渲染
- **API错误**: 验证API Key有效性和网络连接
- **格式错误**: 查看控制台日志了解具体解析过程

---

*本项目采用融合AI分析技术，结合文本识别和图像分析，为雨课堂提供智能化的答题辅助服务。*
