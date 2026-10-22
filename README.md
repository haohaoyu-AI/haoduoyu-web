# 好多鱼图文

原生 JavaScript 单页工作台与 Cloudflare Worker/D1 API。本期从已核验的 Sites v6 源码及 GitHub 备份基线 f8050c88b413990bcfa4ae2db2b4ed1d25198ef7 续接。阶段 1、阶段 2 B1～B5、阶段 3 C1～C5 和大数据基准已合并；经单独确认发布的版本为 Sites v7（源码 f21c9ed3），尚未包含 C4/C5。C6 文章 SQL 分页已合并；当前阶段 4a 在独立草稿分支进行前端机械拆分，后续整理等优化尚未完成。数据库结构与 UI 外观保持，接口新增及唯一错误码例外见 [阶段 2 汇总](docs/phase2-summary.md)。

## 安装、测试、构建

需要 Node.js 24 与 npm：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
npm run check:artifacts
npm run check:previews
```

测试在临时 Miniflare D1 创建合成记录，Worker 外联被拒绝，不读取生产数据库或备份。测试管理员为 synthetic-admin，密码仅为 tests/harness.mjs 中明确的本地假值，不可用于实际部署。生产派生总览夹具已换成等价独立合成值，预览标题明确虚构。

## 本地预览

运行 `npm run dev`，仅监听 127.0.0.1:8787，使用忽略的 .preview/d1。默认不创建管理员或业务记录，未初始化时 API 的 503 SETUP_REQUIRED 是预期状态。初始化步骤见 [RUNBOOK](docs/RUNBOOK.md)。PORT 可指定本地端口，PREVIEW_D1_DIRECTORY 可指定专用本地目录。

运行 `npm run preview:analytics`，仅监听 127.0.0.1:8788，使用临时合成数据和假测试管理员，进程结束后销毁数据。

可选浏览器回归需要环境已有 Python Playwright 和 /usr/bin/chromium：`python3 tests/browser-regression.py`。脚本拒绝非回环地址，输出至忽略的 artifacts/browser。截图不含密码输入或一次性凭据；未登录启动的 auth/me 401 诊断保留，不宣称全流程控制台零错误。

## 目录与检查范围

- web：原生 ES 模块源码，main 连接事件注册与初始化，状态与页面模块单向依赖。
- public：已提交的未压缩 app.js 构建产物、单一 CSS、HTML 和接入文档。
- src、shared：Worker、聚合与安全逻辑。
- db、drizzle：已有的一份初始迁移、11 张表；本阶段不改结构。
- scripts：本地构建、打包、显式初始化与预览工具。
- tests：逐文件审查后的合成测试，不包含原生产派生夹具或证据数据。
- .github：只读 CI，无部署步骤或生产秘密。
- docs：当前架构、运维和变更；history 仅为历史背景，不能当作当前验收。

修改前端时编辑 web/，运行 npm run build，并提交生成的 public/app.js。CI 在任何构建覆盖前执行 node scripts/frontend-build.mjs --check；资产检查另比对已审 public 哈希、生成资源与 Worker 返回字节。4a 的体积及大函数目标缺口见 [拆分记录](docs/frontend-modules.md)。

全历史扫描当前保留 150 条已审阅的精确历史指纹，不排除整个目录，不自动追加例外。原始扫描不是零命中，见[例外说明](docs/security/secret-scan-exceptions.md)。

工程与修复通过独立分支、CI 和验收后合并 main；Git 标签 v5-ui-refactor 是基线标识，不代表生产部署版本。后续变更不会随 PR 自动发布。部署必须另行明确确认并走正式 Sites 流程，不修改访问范围、安全配置或分支保护。CI 已自动运行，但尚未设置为 GitHub 必要合并检查。

阶段 2 的接口投影、错误例外、真实会话、截图及未测范围见 [兼容性证据](docs/phase2-summary.md)。阶段 2 当时完整回归为 115 项；C4 计数与证据见 [轻量读取验证](docs/reviews-light-reads.md)，C5 边界见 [缓存验证](docs/overview-cache-validation.md)，当前 C6 见 [SQL 分页验证](docs/article-sql-page.md)。以同一提交的 npm test / CI 输出为准，不能把多个阶段计数相加。
