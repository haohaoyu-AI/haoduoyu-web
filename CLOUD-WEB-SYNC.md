# 云端网站源码同步

本工作分支在现有 GitHub 提交 `4c61f3c265a3998c7971241a4b4e64df65afebd3` 基础上，将已验收的云端网站放入 `cloud-web/`。仓库根目录原有 Python 工具、平台助手及历史保持原样。

网站来源提交：`69f4e4f3d7afd75a4b16e1be059b6fa58e72cf24`（原工作分支 `codex/offline-next-followup-20261014`）。GitHub 导入提交有独立 SHA；这是保留现有仓库历史的源码快照导入，没有把 Sites Git 的私有历史一起上传。

941 个源码文件逐一与来源提交及交付包 SHA256 核对。文件清单和权限见 `CLOUD-WEB-SOURCE-MANIFEST.json`。原始私人草稿台账、真实平台浏览器证据、凭据、依赖缓存、运行数据库、生成的执行器 ZIP 和原始审核日志不在本次同步中。

在 `cloud-web/` 中执行网站的安装、构建及测试；操作说明见该目录的 README。验收范围及已知限制见 [最新验收记录](cloud-web/docs/next-followup-20261014.md)：组合检查 34 项完成，独立实际源码回归 20/20，独立实际 App/Chromium 场景 34/34，typecheck/build 通过；测试使用合成数据，不代表真实平台联通。941 个文件保持来源字节，本次同步只新增导入说明和清单，没有重跑整套业务验收。

本分支没有新增 GitHub Actions 或部署配置，也没有合并 main、部署生产、执行生产迁移、改动定时任务或提交平台稿件。远端 Actions 查询为 0；现有 webhook 列表因集成权限返回 403，未扩大权限。生产 V160 曾返回 `incomplete input: SQLITE_ERROR`，迁移执行明细仍缺失；源码同步不代表该部署问题已经解决。
