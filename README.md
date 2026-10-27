# 雨课堂助手：审查、设计与实施记录

此 ANALYSIS 分支按 Frank 于 2026-10-22 的要求建立，当前文件树仅保存项目需求、证据、设计决策和实施过程，不承载产品源码、安装包、依赖或工作流。产品修复在 fix/unified-answer-flow 开发，经验证后更新 main。此分支不用于安装，也不合并进产品主线。

- AUDIT.md：2026-10-21 完整审查与复现场景。
- REQUIREMENTS.md：本轮需求与验收范围。
- DECISIONS.md：可审阅的技术决策和依据。
- IMPLEMENTATION.md：实施进度、验证结果和限制。
- BRANCHES.json：清理前的分支名、提交、覆盖关系和保留候选。
- FINDINGS.md：53 项审查事项的逐项进展。
- BRANCH-CLEANUP.md：已删除分支与可恢复归档标签的对应关系。
- VALIDATION.md：回归记录、远端 CI 与尚未实机验证的范围。
- BUILD.json：发布版本、提交、产物校验值和最终状态。

记录设计依据与结果，不保存模型私有推理、用户密钥、登录凭据或原始私人会话。

## 2026-10-22 完成状态

产品版本 1.22.0 已在 main 发布；136 项回归通过，远端 CI 成功。现在仅保留 main 与 ANALYSIS；恢复映射见 BRANCH-CLEANUP.md，完整验证记录见 VALIDATION.md，安装产物校验值见 BUILD.json。


## 2026-10-27：1.22.1

main 已发布 1.22.1，修复课件采集空列表，并新增官方 PPT 与助手查看器的“输入答案并强制提交”。完整 180 项回归和远端 CI 40425345821 通过；发布校验值见 BUILD.json。

详见 [课件回归与手动强制提交记录](PPT-AND-MANUAL-ANSWER-1.22.1.md)。其中也保留了首次 CI 发布文件字节不一致的原因与修正记录。分支仍只有 main 与 ANALYSIS。
