# 分支清理结果

执行日期：2026-10-22。结果：完成。

长期分支只有 main（产品）和 ANALYSIS（记录）。main 未强推，ANALYSIS 未合并到 main。

删除了 26 个分支引用；按 SHA 去重的 21 个分支头均已先建 archive/2026-10-22/<SHA前12位> tag，再与删除操作一起原子推送。GitHub CI 在删除前核对开放 PR、保护状态和 expected SHA，之后再次验证远端分支列表和每个归档 ref。

| 删除的分支 | 原完整 SHA | 可恢复 tag |
|---|---|---|
| `audit/full-regression-20260917` | `b38daf939d4d03ae6b9f9a5aa21143f5060a3ce9` | `archive/2026-10-22/b38daf939d4d` |
| `audit/independent-blackbox-20260917` | `8e123ae913e48156950dd94d0cf9bdb5b1bc6f37` | `archive/2026-10-22/8e123ae913e4` |
| `audit/runtime-bootstrap-real` | `8f5ae400338ace1f5d1302686d81a04e17b65331` | `archive/2026-10-22/8f5ae400338a` |
| `audit/runtime-bootstrap-scenario` | `8f5ae400338ace1f5d1302686d81a04e17b65331` | `archive/2026-10-22/8f5ae400338a` |
| `audit/runtime-bootstrap-scratch` | `8f5ae400338ace1f5d1302686d81a04e17b65331` | `archive/2026-10-22/8f5ae400338a` |
| `audit/runtime-bootstrap-scratch-2` | `8f5ae400338ace1f5d1302686d81a04e17b65331` | `archive/2026-10-22/8f5ae400338a` |
| `audit/runtime-bootstrap-validation` | `4b78acbc4ae420fa21410f430c4203e41eae3214` | `archive/2026-10-22/4b78acbc4ae4` |
| `backup-before-b85ca499` | `b2fa1f5fe5d56f672e5d2049e257b8ae009c2d2f` | `archive/2026-10-22/b2fa1f5fe5d5` |
| `backup/pre-core-rebuild-20260917` | `0af2f7fa5ab13eb2c9283a741c8586d3d3c4f25b` | `archive/2026-10-22/0af2f7fa5ab1` |
| `backup/pre-final-consolidation-20260917` | `6504f74c6922dcce024b63746436533ee7f48297` | `archive/2026-10-22/6504f74c6922` |
| `backup/pre-independent-blackbox-20260917` | `b38daf939d4d03ae6b9f9a5aa21143f5060a3ce9` | `archive/2026-10-22/b38daf939d4d` |
| `backup/pre-restore-20260916` | `bbc690a758bb346ece9be45e07a3301b73c89999` | `archive/2026-10-22/bbc690a758bb` |
| `backup/pre-restore-before-revert-20260916` | `bbc690a758bb346ece9be45e07a3301b73c89999` | `archive/2026-10-22/bbc690a758bb` |
| `backup/pre-stability-fix-20260916` | `ed823033fcc64f65be955935bdb9419332e82bf8` | `archive/2026-10-22/ed823033fcc6` |
| `chrome141` | `8075578d5902afa563cc579dbb8d116bc1208e54` | `archive/2026-10-22/8075578d5902` |
| `dev-2.0` | `799f26a4f11b18a9cd799a7e0a80a2c8d9b06022` | `archive/2026-10-22/799f26a4f11b` |
| `feat/dev3.0` | `ab0268b8e223af59e76944b2f4d10774df9480b3` | `archive/2026-10-22/ab0268b8e223` |
| `feat/recover-auto-answer-1215` | `dd4b0bb3b43ed4b2bacd4791d92299bfe15e129e` | `archive/2026-10-22/dd4b0bb3b43e` |
| `fix/independent-audit-remediation-20260917` | `af37eb9ac6341f384f6ad7fc9be082b50270341a` | `archive/2026-10-22/af37eb9ac634` |
| `fix/pr5-verification-and-save-feedback-20260920` | `9112debfc089f903a985f545199d2c748d4b18e9` | `archive/2026-10-22/9112debfc089` |
| `fix/stability-auto-answer-20260916` | `35c5affb86f4be2a2c4c49b236a1c36049ab9bb6` | `archive/2026-10-22/35c5affb86f4` |
| `rebuild/1.21.7-from-1.21.4` | `f8dea761fc77193e8b2c1b813e1a041ae84329cc` | `archive/2026-10-22/f8dea761fc77` |
| `restore/pre-revert-ed823033` | `b5f51f47e6ca5b8fb632cdc32922a9f6448969a7` | `archive/2026-10-22/b5f51f47e6ca` |
| `revert-1-feat/recover-auto-answer-1215` | `922330ddb759224617fa59b8e2e47a20c1cf55a7` | `archive/2026-10-22/922330ddb759` |
| `zy-dev` | `9c869e119b721ae9dd8dd5d11ec7aebfefb6f9c7` | `archive/2026-10-22/9c869e119b72` |
| `fix/unified-answer-flow` | `6e88985c7fe3c28bc33a666c21cdaf9983514438` | `archive/2026-10-22/6e88985c7fe3` |

额外标签：

- `archive/2026-10-22/main-before-repair` → 0a5edb799629e71b92140b4a21f90105b31710ff。
- `archive/2026-10-22/runtime-1.21.7` → 4fe7c0382a00d84e2db2d6288c18d3aa2392fd86。
- `v1.22.0` → 6e88985c7fe3c28bc33a666c21cdaf9983514438。
- 既有 `auto-answer-current` 标签仍指向历史 main；不要把它当作新版本，当前版本以 v1.22.0 为准。

例如恢复旧分支，可先获取 tags，再使用 `git switch -c <原分支名> <表中tag>` 在本地恢复；是否重新推送由后续任务决定。

执行证据：https://github.com/Frank-678/yuketang-helper-auto/actions/runs/39753439763 。
