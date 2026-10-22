> Historical record only. Current setup and validation are documented in the root README and docs/RUNBOOK.md.

# 好多鱼图文 · 独立新站

复用已有账号矩阵 Worker、UI 和独立密码登录。该项目使用全新的 D1 数据库，只创建 11 张 `matrix_*` 表；不连接旧站数据库或 R2，也不迁移旧文章、文件和旧迁移历史。

Node.js 24：`npm ci --ignore-scripts --no-audit --no-fund`，`npm test`，`npm run build`，`npm run package`。

`npm test` 在隔离 Miniflare D1 上执行 27 项合成回归，禁止 Worker 外部请求。`dist/` 为自包含 Worker 与正式 Drizzle 生成的初始迁移。根 `.openai/hosting.json` 的新项目 ID 由 Sites 注册流程写入，构建不覆盖它。

生产需要精确 `SITE_ORIGIN`。一次性 `MATRIX_BOOTSTRAP_SECRET` 仅经受支持秘密通道设置；管理员用户名和密码通过 `scripts/initialize.mjs` 的 stdin JSON 初始化，用后清除秘密。没有默认管理员、默认密码、演示文章或生产种子数据。仅首个管理员及三个运营账号配置会在受权初始化时创建。

`npm run dev` 仅用于本地回环预览。备份接口仅覆盖本项目矩阵业务；恢复工具只接受显式允许的空隔离目标。生产部署、独立登录及真实域名验证需要单独记录实际结果。

来源：私有仓库 `haohaoyu-AI/haoduoyu-web` 的 `23664ee1ae36b998856a5f42a4636292e02cd294`，加本地 Windows 路径与测试清理修复。`shared/auth.mjs`、公共 UI 和 API 帮助内容按原实现复用。


## P0/P1 增量验收（未上线）

开发分支 `codex/matrix-p0-p1-20261018` 基于 Sites 正式源仓 `main` 的
`d06c0f4fb10b2504f25e5c3b1fb1ea01fc3528d6`（已发布 v4）。
保留原有 UI、录入、账号、AI 授权、审计、CSV、原文入口和保存视图。
无 schema、迁移、绑定或生产数据变更。

- 累计首屏、平台比较与 Top N 使用每篇最近的一份累计快照；未采集、单项缺失和真实零分开。
- 文章列表支持全库稳定排序、平台/日期/推断题材/数据状态筛选和分页；旧版无分页调用的 `data` 数组保持兼容，新增 `meta`。
- `period=30d` 增加完整自然日窗口。发布量与阅读/互动日新增分开显示；累计快照不补日数据。
- 详情增加最新摘要、节点状态和按截至时间排序的相邻快照差值。零分母不算百分比，负增长保留。
- 题材由已知运营账号推断；日期待核实由现有备注中的明确标记派生。均不写回记录。

### 本地隔离预览与测试

使用 Node.js 24：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run preview:analytics
```

预览默认仅监听 `127.0.0.1:8788`，使用临时 Miniflare D1 和合成数据；
测试管理员见 `tests/harness.mjs`。这不是生产登录信息，不连接线上库。
可用 `PORT=8788` 指定本机端口。运行 `python3 tests/browser-regression.py`
可在已安装 Python Playwright 和 `/usr/bin/chromium` 的环境重现四宽度回归，
截图与报告保存在忽略的 `artifacts/browser/`。浏览器测试对比值来自隔离样本，
业务代码不包含线上采样验收数字。

接口细节见 `public/openapi.json` 和 `/api-docs`。

### 发布与回滚边界

本分支不自动推送、保存 Sites 版本或发布；Sites 的 deploy 是正式发布。
先审查差异、隔离测试和截图/本地预览，经用户确认后才走正式 Sites 流程。
发布前重新核实当前源仓与线上版本，发现更新先保留本分支并报告差异。
本次无数据库结构或数据迁移：若后续获准发布出现问题，可重新部署已保存的 v4
（版本 `appgprj_6ad231e97f4c8191b3a376ed2d0fa4e4~appgver_9c2a47c9b54c81918b13db8d34238adb`），
不回滚或覆盖期间新增的文章和快照。回滚同属正式部署，须在获准后执行。
