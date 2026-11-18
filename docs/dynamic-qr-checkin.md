# 动态码课堂免扫码签到：实施与验证

日期：2026-11-18（北京时间）  
分支：`feat/dynamic-qr-checkin`  
基线：`fba66658669ce75a0a1c920fa1c09d0474bb6f1c`，main 1.22.1  
测试版：`1.22.2-beta.5`

## 最新现场状态与下一项验证

2026-11-18 16:06（北京时间）导出的 beta.5 日志已确认：列表两次成功返回 1 个课堂；5 次客户端签到均在 GM 请求和网页重试后返回 50000，没有成功事件。本人资料可读取，会话桥接已取得 sessionid、CSRF 和适用的 Cookie 快照，网页 Authorization 也已附加。这证明列表修正生效，但尚未证明客户端通道接受了当前会话。配置了特殊请求头也不等于 Android 脚本管理器实际发送了这些头。

本次记录中的所有签到均为 `channel=app`。网页重试仍使用 source=21，不是普通 source=9 的独立对照。`signedSessionAvailable=false` 仅说明未取得该名称的 Cookie，不能据此断定服务端需要缺失的签名。当前也没有取得“已通过登录校验，随后因动态码返回 50070”的响应证据。

用户提出另一假设：**同一登录账号使用旁听或邀请入口入班，服务端根据已有课程名单将其归为在册学生，并记录正式签到。** 入口选择和最终身份归类应分别验证；此前的失败没有检验这条路径。

| 路径 | 已确认的请求 | 当前证据边界 |
| --- | --- | --- |
| 现有客户端通道 | `/api/v3/lesson/checkin`，source=21，lessonId，joinIfNotIn=true | beta.5 实测返回 50000；不能证明已使用旁听入口 |
| 普通通道 | 同一接口，source=9 | 脚本已实现；最新日志没有该通道的对照 |
| 课堂暗号入口 | `/api/v3/lesson/notkn/checkin`，source=14，inviteCode | 公开实现中存在；需要有效课堂暗号，当前脚本尚未实现 |
| 在册身份与考勤 | 需要服务端身份信息及正式签到记录 | 不能由接口名称、source 值、joinIfNotIn 或拿到 lessonToken 单独推出 |

课堂暗号入口的依据是 [thuhollow2/yuketang 的 join_classroom 实现](https://github.com/thuhollow2/yuketang/blob/b5da7837dc187c9b7a960623e4d196727637aa3d/yuketang.py)。该实现将 5 位课堂暗号与 6 位班级邀请码分别提交到不同接口；它没有展示“旁听自动转在册”的服务端实现，其 README 也未宣称支持动态码签到。因此这里只据此确认入口及请求字段，不能将其作为动态码已解决的证据，也不能把 lessonId 当作 inviteCode。

下一项有判别力的验证，需要同一在册账号、同一课堂的有效邀请信息，依次核对入班响应、服务端返回的成员身份，以及老师端或本人考勤记录中的签到状态。若只有课堂访问成功、没有正式考勤确认，结果仍应记为待核实。邀请码或二维码签名的来源也需确定，不能由课堂编号推测生成。

另一个独立差异是会话来源：已检查的工小湖 3.0 iOS 包先调用 `/api/v3/user/login/pre-info` 获取账号登录票据，再通过 `/api/v3/user/login` 长轮询取得客户端会话，之后才用该会话签到。现有脚本复用网页登录会话，二者是否可用于同一客户端通道尚未证实。账号登录二维码与老师的课堂动态码不同；该 iOS 包也不能代表原文所述微信小程序的全部实现。当前没有证据证明工小湖实际使用了上述课堂暗号入口。

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

## beta.3：网页登录有效，但签到通道鉴权失败

后续现场日志中，重新登录前后均出现：网页 `/v/course_meta/user_info` 返回 HTTP 200 且识别本人账号成功，随后 GM 签到请求返回 HTTP 200、业务码 50000。已确认请求进入了签到接口的鉴权处理；仅凭这个错误码，不能断言网页登录已经失效。此前统一提示重新登录的判断不准确。

公开原生客户端同时发送 Cookie 和 sessionid 请求头。beta.3 增加当前站点的只读会话桥接：脚本管理器提供 `GM_cookie` / `GM.cookie` 时，尝试读取适用于该站点和签到路径的 sessionid / csrftoken；补齐请求头，并用 GM 请求的 cookie 合并选项携带这些值。域名、路径、有效期、分区和字段内容均做筛选，其他 Cookie 不转发，凭据不写入日志或本地存储。接口不可用、被拒绝或超时时继续使用已有可读会话和 Cookie jar，不要求用户导出凭据。

只有首次请求明确返回 50000、401 或 HTTP 401/403，才再用网页自身 Cookie jar 重试一次。重试仍是 `source=21`、`x-client=app`，没有切换为普通 source=9；浏览器禁止或不支持的特殊头不硬写入 fetch。超时、网络中断、无明确结果和动态码拒绝 50070 均不自动重发。两种请求都鉴权失败时保留实际错误码，若刚刚成功读取本人资料，则说明“网页账号读取正常，但签到鉴权失败”，不再反复要求网页登录。

新增诊断只记录请求使用 GM 或 browser、是否有 sessionid / CSRF 请求头、Cookie API 能力及重试触发码，不包含 Cookie 值。还将本人资料中 id 与 uid 同时存在时的优先级对齐公开客户端。现场日志目前未记录具体 Cookie 与特殊头能力，所以会话凭据不完整仍是待实测的原因，不能把本地模拟恢复当成服务器已接受。

兼容依据：[Tampermonkey GM 请求说明](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_xmlhttpRequest)注明 Android 对部分特殊头的限制、Cookie 合并和分区选项；[Cookie API 说明](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_cookie)列出读取接口，其 HttpOnly 限制注记需要结合维护者后续说明阅读。维护者在 [官方 issue #465](https://github.com/Tampermonkey/tampermonkey/issues/465) 中确认，正式版默认只返回非 HttpOnly Cookie，可通过 Advanced / Security 设置开放读取。脚本按实际可用能力处理，不假定所有移动端环境都能读取 HttpOnly Cookie。

## beta.3 实测后的环境检查

新一轮现场日志中，两次本人资料读取均成功；两次会话准备均为 `source=jar-only`、`cookieApi=available`、`sessionHeaderAvailable=false`、`csrfHeaderAvailable=true`。随后 GM 请求和网页会话重试均返回业务码 50000。已确认桥接没有取得 sessionid，且网页重试也没有恢复签到。尚未确认的是读取缺失由权限、Cookie 查询路径、分区还是其他环境差异造成，不能把 Cookie API available 当成凭据完整。

若使用 Tampermonkey，先在管理面板打开设置，将 `Config Mode` 设为 `Advanced`，再将 `Security` → `Allow scripts to access cookies` 设为 `All`，保存后用现有 beta.3 刷新课堂页并手动签到。该设置允许已获得 Cookie 权限的脚本读取 HttpOnly Cookie；不需要用户导出或提供凭据值。设置依据为上述官方 issue 中维护者 2024-11-15 的说明，正式版也有此配置入口，并非必须换用 Beta 扩展。

验收分两步：先确认新日志的 `sessionHeaderAvailable=true`，再确认签到业务码与课堂凭据。前者不是签到成功证明。如果该设置不存在或已经开放仍缺少 sessionid，下一步需要脚本管理器名称/版本及查询范围信息；继续改错误提示或重复登录不能代替这项核查。该轮只补充了说明，未声称实机问题已解决。

## beta.4：已取得 sessionid 后的凭据封装修正

用户随后提供的日志显示，开放 Cookie 权限之后，两次均已得到 `source=gm-cookie`、`sessionHeaderAvailable=true`、`csrfHeaderAvailable=true`；GM 请求和网页重试仍然返回 50000。因此“没有取得 sessionid”已不再是这轮失败的解释，权限调整只解决了前一个缺项。

代码比对确认，beta.3 显式传递的 Cookie 只有 sessionid / csrftoken；公开原生客户端发送当前登录态的完整 Cookie。现有答题客户端和上游桌面端也会使用当前站点的 Authorization。beta.4 修正这些可见差异：

1. Cookie API 查询 URL 改为实际 `/api/v3/lesson/checkin`，按目标路径选取 Cookie；新增该精确 URL 的 metadata 匹配，以满足读取权限检查。直接打开这个 JSON 地址时不会启动课堂界面或网络拦截器。
2. 保留适用于当前域名、路径、有效期及分区的 Cookie 快照，包括 sessionid_sign 和其他配套字段。只有从管理器快照取得 sessionid 才显式附加 Cookie 头及 GM cookie 参数；仅有 document.cookie 时仍使用原 Cookie jar，避免用可见的部分覆盖 HttpOnly 凭据。
3. 在 GM 及网页请求中携带当前站点 localStorage 中已有的 Authorization，规范为一个 Bearer 前缀，拒绝无效头值。没有这个值时不生成或猜测凭据；也不将新课堂的 Set-Auth 写回全局存储。
4. 增加 `signedSessionAvailable`、`authorizationAvailable`、Cookie 数量和查询目标类别等诊断，不记录 Cookie、Bearer 或课堂 Token 的值；管理器初始化错误也不会将带凭据的原始异常写入日志。

GM 和网页请求都使用拒绝重定向的模式，避免带凭据的请求跟随到其他地址；保留独立超时计时器，不依赖管理器具体网络实现的 timeout 行为。

依据：上述公开原生客户端的 Cookie 请求结构；现有 `tsm/answer.js` 的站点 Authorization 使用方式；上游 [会话请求头实现](https://github.com/ZaytsevZY/yuketang-helper-auto/blob/6eaf8b4e3ff68beeb3b1007c1515535c1dfed2fd/ykt-helper-desktop/packages/routing/src/active/session-manager.ts) 和 [网页凭据读取](https://github.com/ZaytsevZY/yuketang-helper-auto/blob/6eaf8b4e3ff68beeb3b1007c1515535c1dfed2fd/ykt-helper-desktop/apps/desktop/main/electron-session-credentials.ts)。这些实现差异可由代码确认，但当前用户日志没有包含服务器实际所需的全部字段，所以不能断言它们就是 50000 的唯一原因。

本轮浏览器连接未提供来源上下文，无法直接读取用户一侧的实时请求。新增回归验证凭据的完整传递、同站限制、重试和日志脱敏；模拟服务器接受完整凭据仅证明转发逻辑正确，beta.4 仍需同一环境的真实签到响应确认。

## beta.5：刷新课堂列表为空的独立问题

用户追问旧版刷新上课课堂没有结果。检查发现该功能没有复用签到请求：原 `getOnLesson()` 只带浏览器 Cookie，没有补带网页已有 Authorization；HTTP 失败、业务码错误、无效 JSON 或解析失败最终均返回空数组。面板随后把这些结果统一显示成“没有正在上课的课堂”，缺少可导出的列表请求日志，因此无法从此前的空白判断当时究竟是接口失败还是确实无课。

另一个可见缺陷是重复筛选。公开原生客户端对 `/api/v3/classroom/on-lesson` 成功返回的 `onLessonClassrooms` 直接展示及处理；该专用列表本身就代表正在上课。旧版面板和自动进入又要求每一项满足 status=1，导致不含此字段的有效记录被丢掉。

beta.5 将列表读取拆为独立的协议解析和网络模块：

1. 仅认可明确成功且结构可识别的列表响应。HTTP / 业务错误、无效结构、无法识别课堂编号均显示失败；明确成功的空数组才代表“当前没有正在上课的课堂”。仅 404/405 才尝试原有兼容路径。
2. 使用当前站点浏览器登录态及已有 Authorization，拒绝重定向，整个读取过程有独立超时和取消，并丢弃旧账号的延迟结果。
3. 专用列表统一规范课堂编号和进行中标记，保留长 ID，不依赖每项另带 status 字段；供面板、自动进入与跳转统一使用。课程显示兼容原生客户端的 name 字段。
4. 刷新按钮显示忙碌并阻止重复请求；读取失败和成功无课分别显示，失败后可重试。账号变化会取消旧面板请求并恢复按钮。
5. 新诊断只记录列表请求路径、HTTP / 业务状态、失败类别和有效课堂数量，移除旧控制台响应正文片段，不记录课程名称、教师信息或凭据。

这些是代码中确认的缺陷；用户此前未提供旧版课堂列表原始响应，不能据此还原当时实际的响应。后续 beta.5 现场日志已确认列表两次读到 1 个课堂。beta.5 继承 beta.4 的签到凭据修正，但签到仍返回 50000，两条请求的结果继续分别记录。

## 改动

1. `core/checkin-protocol.js`：构造请求并验证响应，只允许精确匹配的雨课堂 HTTPS 站点；长 ID 保留字符串；HTTP 错误、业务错误、缺少 Token、错误课堂 ID 和显式否定签到状态均不会确认成功。
2. `net/checkin-client.js`：App 通道优先使用 GM_xmlhttpRequest，仅在明确鉴权拒绝后允许一次网页会话重试；普通通道使用 fetch。同一账号/课堂请求去重，整体时间预算、独立超时与取消；30 秒短缓存；未知结果等待 30 秒，明确失败等待 60 秒，手动重试可跳过等待。
3. 签到状态区分 idle / identifying / preparing / signing / confirmed / refused / unknown / failed。按账号和课堂保存本次状态与内存凭据；账号变化后丢弃旧响应。无 user_id 时也使用可读会话标记隔离账号。
4. 自动进入统一调用新签到服务。一堂课失败后继续处理其他正在上课的课堂；开关关闭或账号变化后不再处理旧列表。
5. `Set-Auth` 按课堂传给后续答案提交；不写入全局 Authorization、草稿或诊断日志。自动进入标记也按账号隔离。
6. 新增工具栏二维码图标及“课堂签到”面板，提供客户端通道开关、自动签到开关、立即签到、真实错误码和连接状态。设置面板同步对应选项。
7. WebSocket 的 cookie 用户 ID 保持字符串，避免超过 JavaScript 安全整数范围时变号。
8. 测试版采用独立输出文件及分支更新地址，保留 main 的稳定发布副本。
9. 上课列表独立校验业务成功与响应结构，失败不再伪装为空；面板增加刷新进度、错误和重试状态，并处理账号切换。

## 使用

在脚本管理器中导入 `release/ykt-helper-dynamic-qr.user.js`，刷新雨课堂网页。保持已登录状态，点击工具栏二维码图标：

1. “动态码课堂免扫码签到”保持开启，使用客户端通道。
2. 需要自动运行时，开启“开课后自动签到并进入课堂”；目前沿用约 5 秒的开课检测间隔。
3. 也可在当前课堂点击“立即签到”，查看服务器确认或实际错误码。
4. 关闭动态码选项会使用普通签到通道。

脚本管理器需要提供 GM_xmlhttpRequest，并允许其携带当前站点登录态与客户端请求头。自行配置的 AI 接口仍使用原有配置；签到凭据仅发往当前雨课堂区域。

## 验证

- beta.5 本地完整测试：269 项通过，0 失败。beta.1 至 beta.4 覆盖签到协议、账号识别、会话桥接、凭据与日志边界；beta.5 新增 18 项，覆盖无 status 字段、长课堂 ID、成功空列表与失败的区分、鉴权、兼容路径、超时 / 取消、账号隔离、面板进度与重试、自动进入及诊断脱敏。
- Node userscript 语法检查通过。
- 构建文件与两个测试版发布副本逐字节一致。
- main 的稳定发布文件没有修改。
- beta.5 实测已确认课堂列表恢复；sessionid、CSRF、网页 Authorization 与 Cookie 快照均可取得，但 GM 请求及网页重试仍返回 50000。助手未代用用户真实凭据发请求；签到仍未通过现场验收，269 项隔离测试通过不等于实际服务端已接受当前协议。

## 分支与交付

2026-11-18 重试 GitHub 上传成功。完整源码、测试、构建产物及说明已发布到独立分支 [feat/dynamic-qr-checkin](https://github.com/Frank-678/yuketang-helper-auto/tree/feat/dynamic-qr-checkin)，远端文件树与本地交付内容一致。此前 GitHub App 的 403 写入错误已恢复。

该分支的推送会触发 Stability Audit，运行完整回归测试和构建产物语法检查；最新状态与日志见 [GitHub Actions](https://github.com/Frank-678/yuketang-helper-auto/actions?query=branch%3Afeat%2Fdynamic-qr-checkin)。测试版可从分支中的 [单文件 userscript](https://raw.githubusercontent.com/Frank-678/yuketang-helper-auto/feat/dynamic-qr-checkin/release/ykt-helper-dynamic-qr.user.js) 安装。当前仍为功能分支，未创建 PR，未合并 main。
