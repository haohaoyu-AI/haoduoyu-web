# 快速发布

日常小改默认不等待完整功能测试。`Manual Cloudflare production release` 的 `run_regression_tests` 默认为 `false`，跳过发布任务里的 `node --test` 功能回归与离线自测。需要完整发布回归时显式设为 `true`；测试失败仍会停止这次回归发布，不使用 `continue-on-error`。

## 已有权限的 AI 使用同一条发布通道

Claude、Grokbot 或其他已获用户授权且已经拥有该仓库访问能力的助手，使用同一个 GitHub 手动发布工作流。它们不需要持有、复制或相互转交 Cloudflare 密钥。流程为：

1. 完成改动并固定远端源提交。按现有 `release-policy.mjs` 登记精确 commit/tree、Worker 字节和 SHA-256，保留可回退的生产基线。
2. 只读回读当前生产版本，确认没有并发本地上传和未核清的提交结果。
3. 在 main 上触发该工作流，填入已经登记的 `target_commit`、刚回读的 `expected_current_version` 和真实的 `local_upload_stopped: true`。省略 `run_regression_tests` 或设为 `false`。
4. 等这一次发布的结果，核对生产版本及页面可访问。只有失败或未确认时报告对应阻塞；未知上传结果先只读核查，不能重放提交。

新式固定 tree 候选不额外等待另一个控制提交的 Foundation CI。历史 round5/round6 仍按原策略检查固定成功 CI。本文件不改变源登记要求，也不授权未登记代码、动态 main 产物或任何 AI 自动获得新权限。

## 一直执行的实际保护

保留全历史密钥扫描、固定 action 和 lockfile、构建前前端一致性、构建与产物字节校验、仓库/main/manual 校验、当前 100% 生产版本检查、现有绑定继承、生产互斥、单次上传与回读确认。Cloudflare token 只在最后发布步骤注入。没有数据库迁移、数据删除、DNS/路由或安全设置变更。

跳过离线测试不会跳过 `release-policy.mjs` 或 `cloudflare-publish.mjs` 在真正发布时执行的保护。源码和产物校验失败仍不能发布。

## 权限边界

本改动不新增或扩大任何 AI/账号的仓库、GitHub 环境或 Cloudflare 访问权，不创建、复制或共享 token。若另一个 AI 尚无授权通道，需要分别确认该具体 AI/账号、目标仓库、所需写入/工作流权限和持续访问范围；不能以“所有 AI”替代具体的新增持续访问确认。

最近两次实际发布分别为 45 秒和 71 秒，Cloudflare 上传步骤均为 3 秒。完整 Foundation CI 的串行测试约 12–14 分钟，不应作为新式已登记候选的额外人工发布等待。此模式省去实际发布里的回归步骤；准确耗时以首次使用快速模式的 Actions 运行结果为准。
