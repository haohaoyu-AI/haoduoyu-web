# Windows 独立工作台：2026-11-04 基线核查

本文件保留任务启动时的历史观察；后续已配置官方 .NET SDK、独立 Windows CI 并完成原生候选验证。当前成果与接续以[第四阶段交接](windows-desktop-stage4-20261104.md)为准。

本记录只保存代码和公开静态资源的核查结果。未读取生产业务记录、登录态、密钥、数据库或用户电脑；未执行生产发布、迁移、安装、卸载或清除数据。新桌面实现使用独立 `desktop/native-workbench-20261104` 分支与新增目录，不覆盖并行 Android 工程或既有网站/后端。

## 仓库与正常远端保存

- 选定仓库：`https://github.com/haohaoyu-AI/haoduoyu-web`。
- 初始本地提交与远端 `main`：`6e2e445e8a3e9f7a4af055f4cf75046cf6e5cd6c`。该提交的旧网页源码不能直接视为当前生产源码。
- 根代理已通过正常 Git 路径创建并推送独立 `desktop/native-workbench-20261104`。本次独立只读 `git ls-remote` 于 **2026-11-04 16:13:50 UTC** 后确认远端分支精确指向上述提交。它证明分支可写并已远端保存，不代表后续尚未推送的工作区内容已备份。
- 现有 Foundation CI 只对 `main`、`opt/**` 的 push 和面向 `main` 的 PR 运行；其步骤不发布产品。现有 Cloudflare 发布工作流仅 `workflow_dispatch`，且只接受固定的历史第六轮/第五轮源提交。独立桌面分支保存不调用这些发布步骤，也不表示 Windows 安装包或网站已经上线。不能仅凭仓库工作流排除未知的平台端连接。
- 每个可用阶段须再次提交、正常推送并回读远端精确提交；只存在临时云工作区的文件不能称为可靠远端保全。

## 生产公开静态资源

通过环境正常 HTTPS 代理、保持 TLS 验证进行匿名 GET。访问窗口为 **2026-11-04 16:12:18–16:13:25 UTC**。首页、JavaScript、Service Worker、OpenAPI 文档均为静态公开资源；没有访问返回业务记录的 API。

| 路径 | 字节数 | SHA-256 |
| --- | ---: | --- |
| `https://haoduoyu.xyz/` | 2334 | `a412e98fffbaaec484cc7fff8807942e3f4303acc7284c732276ac89d48c8232` |
| `https://haoduoyu.xyz/app.js` | 840488 | `7886640de4fc2cef911fe92f1851b06b07dac1c120ee850492670d09fac0505e` |
| `https://haoduoyu.xyz/sw.js` | 11281 | `ae24ab2f018b78c430a613d730990c74e14576c3f0bfa9859b6193f0f1c01495` |
| `https://haoduoyu.xyz/openapi.json` | 836155 | `db16b231b41c6012c1cf7b1c2c2f8bdcf447924a791b2ce5766f0263e3ce698d` |

首页 HTTP 200，`Cache-Control: no-store`；CSP 限制脚本、样式和连接为本站，禁止对象与框架嵌入。首页及 Service Worker 共同声明 shell 版本 `afe74f7613bfb7f8f7f45bed3065caf1b631263a34c3fb9554b370667cc65d54`，Service Worker 的静态清单中首页和 app.js 摘要与实际下载一致。它是内容版本标识，**不是 Git 提交或服务端业务数据版本证明**。

生产包含 `offline.css`、`review.css`、`mobile.css`、`sw-update.css` 与完整离线模块，已经明显超出当前 `main` 的旧网页模型。生产 OpenAPI 与远端 `fix/notes-draft-cleanup-20261104` 的 `c30a8a956715b6ea809db4b87c0f4fcddf8f61de` 文档逐字节一致；生产 app.js 与该提交仍不一致，增加了保留草稿处理等后续变化。公开静态资源目前未给出可独立核实的精确源码提交，因此**当前生产精确 Git SHA 尚未证明**，不得将 c30a8a9 或旧 README 的 Sites v8 直接标为当前生产源。

新客户端契约核查应以当前公开 OpenAPI 和已验证的真实源码行为为依据，不能只按旧 `main` 推断。源码中的公开业务身份、`note-entries`、未安排待办、标签、备忘录、完整工作台快照、复盘资源等能力必须逐项确认；本记录不声称全部业务已在桌面实现或验证。

## Android 历史与隔离

只读 fetch 使用独立 `refs/audit/*`，没有检出或修改 Android 工作树。核查时远端：

- `android/unified-v3`：`0d1268428e9ce860fae83b999e7dc1932a4f3a61`，Android 目录树 `eb2e14e388a889e54756ad2d0a7694474aac85af`。
- `android/personal-v1`：`d5e417384fc66870e810cd14626f770a1be88d0e`，其 2.0.1 原生离线实现由 v3 文档保留并在固定基线检查。
- v3 资料位于该分支 `android/README.md`、`android/OFFLINE.md`、`android/UNIFIED-V3.md`；Java 原生离线源码在 `android/app/src/main/java/xyz/haoduoyu/personal/offline/`。

重要区分：当前 Android v3 候选启动同一网站薄壳，保留旧原生库的只读恢复与授权排队处理；历史 2.0.1 才是独立原生离线工作台。不能将薄壳称为原生业务功能完整，也不能把旧 Android 分支整枝合并覆盖当前网站。Windows 本轮从独立新增目录实现，不修改上述 Android 工程、发布证书或现有数据。

Android 文档记载的旧本地库名为 `haoduoyu-offline.db`，schema 1，包含队列、草稿与冲突；这不是 Windows 旧数据路径。正式 Android 签名留在原授权机器，本轮不复制、不替换，也不构建 Android 正式升级。

## 历史 Windows 客户端与升级缺口

当前选定仓库、已读的相关远端分支和历史中未找到既有 Windows 工作台客户端工程、Electron/Tauri/.NET 打包定义或安装身份。历史 `cloud-web/app/desktop-word-only` 是网页中的桌面 Word 任务入口，不能当作独立 Windows 客户端源码。这个结论限于已检查的仓库，不证明其他私有仓库或家机不存在源码。

旧 Windows 产品名/安装器身份、签名、更新地址、用户数据目录、数据库格式与存量离线队列位置尚未取得证据。新开发不得猜测旧路径、自动导入、覆盖、卸载或清库。旧版兼容升级与迁移测试保持“未验证”，正式覆盖升级前须先核实实际旧客户端与数据保全方式。

## 本轮交付能力与剩余门槛

云端现有 Node.js `v24.19.0`、npm `11.9.0` 和系统 Chromium，可运行核心业务/同步合成测试与浏览器本地检查。当前没有已观察到的 `dotnet`、`cargo`、`wine` 或 `pwsh`，现有 CI 也没有 Windows runner、Windows 安装包/签名流程。因此本地 Linux 测试通过不能替代 Windows 打包、中文输入法、凭据存储、文件系统持久性、关机恢复或真实覆盖升级验收。

后续阶段保全源码、合成测试与恢复说明；可用的正常 Windows 构建路径应独立验证。缺少权限、工具链、正式签名或发布入口时停在该步骤，报告已完成和未验证项，明天用户电脑可用后再按已核实路径继续。不得绕过访问控制、改变安全设置、接入收费服务、接受新法律协议或操作真实用户记录。

相关现有资料：[`RUNBOOK.md`](RUNBOOK.md)、[`cloudflare-actions-release.md`](cloudflare-actions-release.md)、[`cloudflare-free-migration.md`](cloudflare-free-migration.md)、[`.github/workflows/ci.yml`](../.github/workflows/ci.yml)、[`.github/workflows/cloudflare-manual-release.yml`](../.github/workflows/cloudflare-manual-release.yml)。历史发布记录各自只证明其指定版本，不能替代当次线上回读。
