# 好多鱼图文

原生 JavaScript 工作台与 Cloudflare Worker/D1 API。阶段 1、阶段 2 B1～B5、阶段 3 C1～C6 和阶段 4a/4b 已验收合并。当前阶段 4c 草稿仅将图表内联样式改为受控 CSSOM 变量并收紧 style CSP，尚待独立验收；后端整理、安全方案及最终验收尚未完成。

生产仍为经单独确认发布的 Sites v7（源码 f21c9ed3），仅包含本轮 C1～C3；开发分支不会自动上线。后续部署必须再次明确确认。数据库结构、界面样式和数据语义保持不变。

## 安装、检查与构建

使用 Node.js 24 与 npm：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check:web
node scripts/frontend-build.mjs --check
npm test
npm run check:artifacts
npm run check:previews
```

修改前端时编辑 web/，运行 npm run build，并提交生成的 public/app.js。产物保持单一、UTF-8、ESM、不压缩；CI 在任何构建覆盖前检查源码与已提交产物一致，并核对八个公开资源与 Worker 的字节。源码检查覆盖所有模块、物理行和函数，不忽略目录或长模板。当前可读 bundle 超出 100,000 B 目标，当前 115637 B，准确验证边界见 [阶段 4c 记录](docs/strict-style-csp.md)。

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
- src、shared：Worker、聚合及安全逻辑；db、drizzle 保持一份初始迁移与 11 张表。
- scripts、tests：本地工具和审查后的合成用例；.github 为最小只读 CI，没有部署步骤或生产秘密。
- docs：当前架构、变更、性能及逐阶段证据；历史记录不代表当前已全部验收。

[阶段 2 契约](docs/phase2-summary.md)、[C4 轻量读取](docs/reviews-light-reads.md)、[C5 缓存](docs/overview-cache-validation.md)、[C6 分页](docs/article-sql-page.md)、[4a 机械拆分](docs/frontend-modules.md)分别保留当时测试数量及限制。当前总数以精确提交的 npm test / CI 输出为准，不能把多个阶段计数相加。

全历史扫描保留 151 条已审阅的精确历史指纹；原始扫描并非零命中，不排除整个目录或自动追加例外，见[扫描说明](docs/security/secret-scan-exceptions.md)。阶段 PR 经 CI 和独立验收后才能 squash 合并；CI 尚未设置为 GitHub 必要合并检查。v5-ui-refactor 只是 Git 基线标签，不是生产版本。
