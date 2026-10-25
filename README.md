# 好多鱼图文

原生 JavaScript 工作台与 Cloudflare Worker/D1 API。阶段1～5及阶段6的条件式登录防护代码已验收合并；生产 IP 信任未启用，真实来源隔离仍未证实，整轮尚未全部通过。当前状态与全部未通过/未验证项见[验收入口](docs/ACCEPTANCE.md)，各阶段报告按固定提交保留历史语境。

生产已于 2026-10-23 03:45 UTC 经明确批准发布为 **Sites v8**：[haoduoyu.xyz](https://haoduoyu.xyz)。批准的 GitHub 产品输入为 `ce18a7b7a09f8acbfb9fe7c397b97e5d87a20ac6`，Sites 正式源为 `e7765af3c6d4b87ed39de7831db2962db9c826d9`；两者内容树相同，精确来源 CI 为 256/256。发布、回滚与分来源验收边界见[上线记录](docs/RELEASE_REQUEST.md)和[机器可读证据](docs/releases/2026-10-23-v8.json)。这次具体发布不表示体积、严格 PNG、完整 isolate 峰值或主分支保护全部达标，也不授权后续版本自动上线。

## 安装、检查与构建

独立托管的免费 Workers+D1 路线仅在准备中，旧站保持运行。新增本地构建与全用户备份校验的使用方法、免费限制及失败退出条件见[迁移准备](docs/cloudflare-free-migration.md)；这不表示已迁移、已取得生产备份或已获 DNS 切换授权。

使用 Node.js 24 与 npm：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check:web
node scripts/frontend-build.mjs --check
npm test
npm run check:artifacts
npm run check:previews
```

修改前端时编辑 web/，运行 npm run build，并提交生成的 public/app.js。产物保持单一、UTF-8、ESM、不压缩；CI 在任何构建覆盖前检查源码与已提交产物一致，并核对九个公开资源与 Worker 的字节。源码检查覆盖所有模块、物理行和函数，不忽略目录或长模板。当前可读 bundle 超出 100,000 B 目标，当前 115637 B，准确验证边界见 [阶段 4c 记录](docs/strict-style-csp.md)。

测试在临时 Miniflare D1 创建合成记录，禁止 Worker 外联，不读取生产数据库或备份。测试账号及口令均为 tests/harness.mjs 中明确的本地假值，不可用于部署；截图不保存口令或一次性凭据。

## 本地预览与浏览器验收

npm run dev 仅监听 127.0.0.1:8787，使用忽略的 .preview/d1；默认未初始化时 API 返回 503 SETUP_REQUIRED。PORT 和 PREVIEW_D1_DIRECTORY 可选择专用本地目录。初始化、备份、恢复和正式部署见 [RUNBOOK](docs/RUNBOOK.md)。

npm run preview:analytics 仅监听 127.0.0.1:8788，使用临时合成库，结束后销毁。

环境已有 Python Playwright、Pillow 和 /usr/bin/chromium 时，可运行以下阶段 4b 比较。它创建两个独立回环合成库，采用真实 Cookie/CSRF，比较固定 main 基线和当前已提交 bundle；没有生产绑定。完成后停止服务器再重新运行，避免表单测试修改的合成口令或记录影响下一轮。

```sh
npm run build
node tests/frontend-lifecycle-browser-server.mjs
# 另一个终端
python3 tests/browser-frontend-lifecycle-regression.py --part all
```

测试专用请求探针为 tests/browser-request-lifecycle.py，不进入产品资源。报告及截图保存在忽略的 artifacts/frontend-lifecycle；预期未登录 401、断网/409 注入与页面取消分别记录，不宣称所有流程控制台零错误。

## 目录与证据

- web：原生 ES 模块、单一 state/runtime、action 注册表、页面和 UI；不含框架或运行时依赖。
- public：已提交的 app.js 构建产物、单一 CSS、HTML 和接入文档。
- src、shared：Worker、聚合及安全逻辑；db、drizzle 保留初始迁移，追加每日待办、常用模板及恢复/偏好迁移，共 4 份迁移、15 张表。
- scripts、tests：本地工具和审查后的合成用例；.github 为最小只读 CI，没有部署步骤或生产秘密。
- docs：当前架构、变更、性能及逐阶段证据；历史记录不代表当前已全部验收。

[阶段 2 契约](docs/phase2-summary.md)、[C4 轻量读取](docs/reviews-light-reads.md)、[C5 缓存](docs/overview-cache-validation.md)、[C6 分页](docs/article-sql-page.md)、[4a 机械拆分](docs/frontend-modules.md)分别保留当时测试数量及限制。当前总数以精确提交的 npm test / CI 输出为准，不能把多个阶段计数相加。

全历史扫描保留 155 条已审阅的精确历史指纹；原始扫描并非零命中，不排除整个目录或自动追加例外，见[扫描说明](docs/security/secret-scan-exceptions.md)。阶段 PR 经 CI 和独立验收后才能 squash 合并；CI 尚未设置为 GitHub 必要合并检查。v5-ui-refactor 只是 Git 基线标签，不是生产版本。

## 每日待办

首页可直接填写今日计划，完成后划线或隐藏，长按菜单可删除并撤销；按北京时间跨日自然归档，并可按日期查看历史。实现、权限、增量迁移及旧备份兼容见[每日待办说明](docs/daily-todos.md)。生产状态仍以明确的发布记录为准。

## 长期备忘录

独立的“分组 → 笔记”模块，不按日归档，公开可读，仅明确 owner 的真实登录会话可编辑。包含纯文本自动保存、版本冲突保护、本机未确认草稿、保存收据及可恢复删除。新增 `0006_long_term_memos` 和 v7 备份，兼容旧 v1–v6；发布者必须配置 `MEMOS_OWNER_ID`。边界、API、并行合并注意事项见[长期备忘录说明](docs/long-term-memos.md)。此分支尚未部署。

与生产文章 UI `fe8efa4` 的整合、共享触点及只追加 `0006` 的交付包说明见[整合交接 README](docs/memos-integration/README.md)。后续视觉改版应以该整合分支的最终提交为起点。

当前权限调整分支基于生产 `701db4f`，支持公开业务模式下碎碎念和备忘录免登录编辑、可恢复删除；管理与备份仍受保护。该调整待父级发布，见[权限及视觉交接说明](docs/public-notes-memos-access.md)。
