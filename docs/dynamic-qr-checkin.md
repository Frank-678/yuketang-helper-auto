# 动态码课堂免扫码签到：实施与验证

日期：2026-11-18（北京时间）  
分支：`feat/dynamic-qr-checkin`  
基线：`fba66658669ce75a0a1c920fa1c09d0474bb6f1c`，main 1.22.1  
测试版：`1.22.2-beta.2`

## 依据与实现选择

用户已经确认工小湖在其动态码课堂中免扫码签到成功。本轮以这个现场结果为前提，定位真实客户端协议，没有把旧版文档的限制作为实现结论。

博客中的 session_key / get_user_course_list 是概括性描述。本轮进一步只读检查了作者公开发布的 3.0 iOS 资源包，从包内客户端脚本中确认请求结构：

- 资源：[工小湖 3.0 公开发布包](https://github.com/StalinDev54/gongxiaohu/releases/download/3.0/__UNI__A896164_1117110406.ipa)。
- 资源大小：11,119,358 bytes。
- 资源 SHA-256：`3f0a1205015badc759e9d48309fe6453d1655bf248f58edb82e871114a68afed`。
- 包内 `app-service.js` SHA-256：`72dd98d379f8b32475b4e623f7a886082390c399e75723660451cb8eb23d806a`。
- 客户端通道：当前区域的 `/api/v3/lesson/checkin`，POST JSON `source=21`、字符串 `lessonId`、`joinIfNotIn=true`。
- 客户端身份：`x-client=app`、当前账号 `x-uid`、Android User-Agent，以及客户端版本/平台字段。可读会话提供 sessionid / CSRF 请求头，完整 Cookie 由脚本管理器的当前站点 Cookie jar 携带。
- 普通通道：同一站点和接口，`source=9`，使用浏览器请求。
- 服务端以业务 code=0、lessonToken 和 Set-Auth 返回课堂凭据；客户端也有明确处理 50070 的分支，不能无条件报成功。

HTTP 接口字段作为兼容依据，助手代码独立实现。公开客户端资源、会员逻辑、原始脚本、账号凭据均未加入本仓库。本功能不需要调用作者网关或注册作者服务。

## beta.2：实际反馈中的账号识别失败

beta.1 现场截图显示“尚未识别当前账号”。对应诊断有三次 `checkin-failed`，均为 `code=null`、`httpStatus=0`，之前没有 `checkin-start`。结合构造请求的代码路径，失败发生在客户端获取用户 ID 的前置检查，尚未向签到接口发送请求；这份日志不能证明 App 通道被服务器拒绝。

beta.2 在 Cookie 和页面用户对象没有 ID 时，使用当前网页的完整登录态，只读查询本人资料。已从同一公开客户端确认的路径依次为 `/v/course_meta/user_info`、`/api/v3/user/profile`、`/v2/api/web/userinfo`。请求限于当前站点，不读课堂名单来推测账号，也不要求重新提供登录凭据。读取期间显示“正在识别当前登录账号”，支持超时、取消与账号变化检查。

资料中的长数字 ID 在 JSON 解析前保留原始数字，传给签到请求和后续 WebSocket 握手。失败资料、缺少 ID 和明确登录失效分别处理；用户资料不写入日志或持久缓存。诊断仅记录接口路径、HTTP 状态、业务码、识别是否成功及失败阶段。没有可识别会话的页面每次重新查询本人资料，不复用上次账号的签到确认。

## 改动

1. `core/checkin-protocol.js`：构造请求并验证响应，只允许精确匹配的雨课堂 HTTPS 站点；长 ID 保留字符串；HTTP 错误、业务错误、缺少 Token、错误课堂 ID 和显式否定签到状态均不会确认成功。
2. `net/checkin-client.js`：App 通道使用 GM_xmlhttpRequest，普通通道使用 fetch；同一账号/课堂请求去重，独立超时与取消；30 秒短缓存；未知结果等待 30 秒，明确失败等待 60 秒，手动重试可跳过等待。
3. 签到状态区分 idle / identifying / signing / confirmed / refused / unknown / failed。按账号和课堂保存本次状态与内存凭据；账号变化后丢弃旧响应。无 user_id 时也使用可读会话标记隔离账号。
4. 自动进入统一调用新签到服务。一堂课失败后继续处理其他正在上课的课堂；开关关闭或账号变化后不再处理旧列表。
5. `Set-Auth` 按课堂传给后续答案提交；不写入全局 Authorization、草稿或诊断日志。自动进入标记也按账号隔离。
6. 新增工具栏二维码图标及“课堂签到”面板，提供客户端通道开关、自动签到开关、立即签到、真实错误码和连接状态。设置面板同步对应选项。
7. WebSocket 的 cookie 用户 ID 保持字符串，避免超过 JavaScript 安全整数范围时变号。
8. 测试版采用独立输出文件及分支更新地址，保留 main 的稳定发布副本。

## 使用

在脚本管理器中导入 `release/ykt-helper-dynamic-qr.user.js`，刷新雨课堂网页。保持已登录状态，点击工具栏二维码图标：

1. “动态码课堂免扫码签到”保持开启，使用客户端通道。
2. 需要自动运行时，开启“开课后自动签到并进入课堂”；目前沿用约 5 秒的开课检测间隔。
3. 也可在当前课堂点击“立即签到”，查看服务器确认或实际错误码。
4. 关闭动态码选项会使用普通签到通道。

脚本管理器需要提供 GM_xmlhttpRequest，并允许其携带当前站点登录态与客户端请求头。自行配置的 AI 接口仍使用原有配置；签到凭据仅发往当前雨课堂区域。

## 验证

- beta.2 本地完整测试：225 项通过，0 失败。beta.1 新增 28 项覆盖客户端请求协议、真实错误码、超时与取消、并发去重、账号/课堂隔离、内存凭据传递、设置与面板、自动签到队列；beta.2 再新增 17 项，覆盖无 user_id Cookie 的实际失败场景、本人资料响应与长 ID、接口兼容、登录过期、超时与取消、会话变化及状态显示。
- Node userscript 语法检查通过。
- 构建文件与两个测试版发布副本逐字节一致。
- main 的稳定发布文件没有修改。
- 未在用户实际登录态中向雨课堂发起签到；目标课堂与 Android 脚本管理器的实机验收仍需完成。隔离测试通过不等于服务器实机验收通过。

## 分支与交付

2026-11-18 重试 GitHub 上传成功。完整源码、测试、构建产物及说明已发布到独立分支 [feat/dynamic-qr-checkin](https://github.com/Frank-678/yuketang-helper-auto/tree/feat/dynamic-qr-checkin)，远端文件树与本地交付内容一致。此前 GitHub App 的 403 写入错误已恢复。

该分支的推送会触发 Stability Audit，运行完整回归测试和构建产物语法检查；最新状态与日志见 [GitHub Actions](https://github.com/Frank-678/yuketang-helper-auto/actions?query=branch%3Afeat%2Fdynamic-qr-checkin)。测试版可从分支中的 [单文件 userscript](https://raw.githubusercontent.com/Frank-678/yuketang-helper-auto/feat/dynamic-qr-checkin/release/ykt-helper-dynamic-qr.user.js) 安装。当前仍为功能分支，未创建 PR，未合并 main。
