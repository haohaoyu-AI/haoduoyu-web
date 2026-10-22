# 好多鱼图文

原生 JavaScript 单页工作台与 Cloudflare Worker/D1 API。当前产品基线是 Sites v6；本分支恢复工程工具，不改变 UI、运行代码、API 或数据库结构。GitHub 备份基线为 f8050c88b413990bcfa4ae2db2b4ed1d25198ef7。

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

- public：当前前端源码和接入文档。app.js 仍为单文件原生 JS，尚未拆到 web。
- src、shared：Worker、聚合与安全逻辑。
- db、drizzle：已有的一份初始迁移、11 张表；本阶段不改结构。
- scripts：本地构建、打包、显式初始化与预览工具。
- tests：逐文件审查后的合成测试，不包含原生产派生夹具或证据数据。
- .github：只读 CI，无部署步骤或生产秘密。
- docs：当前架构、运维和变更；history 仅为历史背景，不能当作当前验收。

当前资产检查比对已审阅 public 哈希、生成资源和构建 Worker 返回字节，不冒充尚不存在的 web 构建一致性检查；出现模块入口时会要求阶段4升级，见 [架构](docs/ARCHITECTURE.md)。

全历史扫描保留阶段0的139个历史误报及本阶段2个资源哈希误报的精确指纹，不排除整个目录。原始扫描不是零命中，见[例外说明](docs/security/secret-scan-exceptions.md)。

发布必须另行确认并走正式 Sites 流程。本阶段不合并 main、不打标签、不部署，不修改访问范围、安全配置或分支保护。
