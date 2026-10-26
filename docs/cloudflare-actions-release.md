# GitHub Actions 手动发布：haoduoyu-prod

代码准备基线为第六轮 `947bc782ea70e7808f6e7de523e5977818b292df`。本变更只加入发布控制、模拟测试和文档，不改网站、数据库、权限或运行时绑定。现有 `.github/workflows/ci.yml` 继续只做 CI。

## 一次性配置与权限

由已获用户批准的配置任务在官方后台完成；本分支不生成 token、不复制本机 OAuth、不写 GitHub secret，也不把任何凭据放进仓库。

- Cloudflare API token 仅授予既有 **haoduoyu-prod / Individual Workers Editor**；不授予全账户 Workers、D1 查询/迁移、DNS/Routes、账户或用户管理权限。官方说明，部署使用既有 D1 绑定只需该 Worker 的 Editor，未修改域名连接时无需 Zone Routes 权限。
- GitHub 仓库 `haohaoyu-AI/haoduoyu-web` 的环境 **cloudflare-production** 只保存 secret **CLOUDFLARE_API_TOKEN**；非敏感环境变量 **CLOUDFLARE_ACCOUNT_ID**、**CLOUDFLARE_WORKER_NAME=haoduoyu-prod**。账户 ID 必须由已有生产资源核实，不使用模板值。
- 环境部署分支限定 **main**。人工 `workflow_dispatch` 是发布动作，不开启 push 自动部署；额外 required reviewers 可按既有政策选择，不强制增加每次用户在线审批，也不购买升级。官方文档说明，当前 GitHub 计划的公开仓库支持环境、secret 与环境保护规则。
- Worker Editor 能替换生产代码，代码仍可使用现有 DB 绑定，这是令牌的实际影响；仓库写权限和环境 main 分支限制需要保留。API token 期限/撤销由授权配置任务记录，不扩大权限。

只读核查时，仓库只有 CI 和旧 Sites 发布文档，没有已接通的 GitHub→Cloudflare 发布步骤。secret 名称 API 查询被云端网络代理 CONNECT 403 阻断，不能据此判断 secret 不存在。后台配置是否完成以配置任务回读的名称、环境及资源范围为准；不读或输出 secret 值。

## 工作流控制

`cloudflare-manual-release.yml` 仅手动触发。工作流文件须先进入默认分支 main，才可在 Actions 中运行。仓库 token 权限仅 `contents:read`、`actions:read`，所有 action 固定提交，checkout 不保留凭据。

输入只允许：

| 目标 | 固定源提交 | Worker 字节 | SHA-256 |
| --- | --- | ---: | --- |
| 第六轮 | 947bc782ea70e7808f6e7de523e5977818b292df | 1244002 | 3c106a1a3bbd570d72f3784970a09af09caec653ffa9869550649d1144e43de0 |
| 第五轮回退 | 16ff80ef2d857676d81b7c219110c820de5af72b | 1269372 | 61e30101b744f56bfe10418cb536b661e9bac5ca8270041b510f6222434c4149 |

先复核上述精确提交既有 Foundation CI 成功，再按 lockfile 安装并重建同一 Worker，逐字节长度与 SHA-256 不符即停止。构建阶段没有 Cloudflare token，不重新跑无关测试、不应用迁移。令牌只注入最终发布步骤，不上传为 artifact，不输出运行时变量值。

发布前要求输入刚回读的生产 `expected_current_version`，并勾选本地上传已停止、未知结果已回读。GitHub concurrency 禁止两个云端发布重叠且不强行取消正在进行的发布；它不能代替与本机或其他发布工具的人工互斥交接。

Cloudflare 版本继承以 latest uploaded 版本为来源，不保证是当前部署版本。因此发布控制必须验证 latest、唯一 100% 在用版本及明确输入的当前版本一致，使用严格逐名继承现有绑定，保留 D1、普通变量、secret 和兼容设置。还必须从 Worker 元数据确认该 Worker 的 `has_assets=false`，否则阻止只上传代码，避免剥离原生静态文件。任何不支持的配置、不一致或不确定结果都停止；上传和切换各最多一次，不盲重发 POST。日志只含摘要、版本/部署 ID 与固定状态，不输出 API 响应体、token 或绑定值。

## 本次发布与回退

父线程于 **2026-10-26 11:27:39 UTC** 回读：部署 `33fbea88-b27c-49c0-b695-7798bc400dd8`，版本 `83512373-c500-47c3-a451-7dde59d2174b`，100%。这是当时证据，不能跳过执行前的新回读。

1. 等配置任务确认环境 secret 名称和单 Worker 范围，再核对本地路线已停止，回读最新生产版本及 latest uploaded；不得并发上传。
2. 将仅发布控制的分支按既有授权合入 main，选择手动工作流、main、第六轮精确提交与新回读的当前版本，确认本地已停止后触发。任何设备只需触发，无需运行家机 Wrangler、OAuth 或保活电脑。
3. 由 GitHub runner 构建、验证并发布，等工作流终态和 Cloudflare 部署读回确认一致，随后只读检查网站。本次没有数据库迁移、数据补录或配置更新。
4. 回退也使用同一手动工作流，选择第五轮源提交并填写回退前刚回读的当前版本。保留数据库，不恢复旧备份、不删除新表或记录。

目前本分支的模拟测试与推送不代表生产已更新；真实发布只能在凭据配置和互斥交接都确认后执行。

官方依据：[Cloudflare GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)、[Worker 细分角色与绑定权限](https://developers.cloudflare.com/workers/authorization/workers/)、[严格绑定继承与版本上传](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/)、[GitHub 环境能力](https://docs.github.com/actions/deployment/targeting-different-environments/using-environments-for-deployment)、[手动工作流](https://docs.github.com/actions/managing-workflow-runs/manually-running-a-workflow)。
