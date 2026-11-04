# 好多鱼 Windows 独立工作台

当前为 **0.3.0 开发候选**，使用 .NET 10 / WPF 原生控件、HttpClient 和 Windows 当前用户 DPAPI。本地程序不嵌入浏览器，不下载并运行远程界面。现有网站、Worker、数据库迁移、Android 和旧 Windows 安装均未改动。

## 已实现的核心路径

- 每日待办、日期历史、完成显示偏好、软删恢复、常用事项。
- 未安排待办、安排到指定日、今天完成、软删恢复。
- 生活与工作多条碎碎念、旧日期日页独立保留、标签选择及创建/归档/恢复。
- 备忘录分组与笔记、正文编辑、回收站恢复。
- 工作提醒、文章台账表单、现有自媒体数据读取。
- 内容复盘总览与趋势、八类持久复盘资源的原生创建与哈希 CAS 编辑，包括指标、报告、规则库及结构化子项、对标资料、笔记和账号健康。
- AI 汇报完整分页历史、按实际日期筛选、原文阅读/导出与人工补充。稳定 UUID 追加保存，署名必填；已尝试或确认的原记录只读，不调用模型，也不自动生成完成报告。
- 本机草稿、离线业务清单与详情投影、完整资料准备、持久队列、版本冲突核对、保存回执确认、只读历史分区导出、显式本机备份恢复。
- 当前身份的跨模块本机检索：缓存、草稿、原请求、实际冻结请求和远端响应证据分别标注，可预览、导出、回原模块或恢复本机稿。不会联网搜索或把缓存摘要作为完整正文。

界面编译通过不等于以上路径均已完成实机或生产 API 验收。默认缓存已访问页面；“准备完整离线资料”会读取已确认工作区的日期索引、所有分页及详情，核对 hash、scope 和全局读取版本后一次性保存。取消、资料变化、坏响应或超过 24MiB/1000 日期等有界预算会整批停止并保留旧缓存，不能把局部页面称为完整。所有生产联网业务测试仍未执行。

## 本机数据与同步

新目录为 `%LOCALAPPDATA%\Haoduoyu\NativeWorkbench\v1`，不猜测或迁移旧客户端路径。每个服务源、身份及服务端 scope 单独分区；公开与登录账户不共用队列。首次离线未绑定草稿和历史分区可在“本机与恢复”只读查看/导出，不自动迁移到新身份。

草稿停止输入约 350ms 后先加密保存到本机，切页/正常退出前等待保存完成。Ctrl+S 仅保存本机草稿；“保存并同步”先落盘原请求，再发送。中文组合输入没有自动远端提交。当前整个状态采用加密快照，容量上限 32MiB；超限停止并保留原件，尚无自动归档或大量数据性能保证。

Unknown 不等于失败：不自动重发。notes/memos 可按原 `save_id` 只读核验回执、当前版本与内容 hash。其他未知结果需保守核对；服务端生成 ID 的新文章与无 CAS 的标签操作保持资源围栏，不能用新保存 ID 解除后再次创建/覆盖。409 的本地稿与远端稿分别保留，只在明确选择后创建新 CAS 操作。

显式回退备份会把恢复的 Queued/InFlight 全部持久标为 Unknown：旧备份无法证明请求之后没有发送。恢复时保留损坏主文件、备份原件和草稿来源；来源标记不会被后续自动保存洗掉。恢复的新建文章稿仍可编辑与导出，但须先从台账核对服务器记录，不能直接再次 POST 创建；稳定 ID 的已有记录继续按原版本/hash 校验。

每次发送前核对 scope，在线读取在替换本机缓存前也重核 scope；归属变化时保留原分区且停止替换。现服务端没有原子 expected-scope 前提，配置在多个请求之间变化的窗口仍存在。登录会话/CSRF 和原有服务器授权仍逐请求执行。快照身份服务不可用或超限会暂停发送，不能用旧身份猜测归属。

本候选版不持久化密码或会话 Cookie；账户退出程序后需重新登录，账户加密文件保留。DPAPI 通常绑定同一 Windows 用户，复制密文目录不是跨电脑可读导出。离开电脑前应显式导出需要迁移的纯文本，导出文件本身不加密。

成功核对过的私有账号可在下次完全离线启动时继续原工作区编辑；“本机工作区”可切换已确认身份。身份配置同样使用 DPAPI，配置中不保存密码或 Cookie。联网发送仍必须重新登录原账号并核对 scope。新建父子记录按依赖顺序发送，子操作的 CAS 版本只从真实父回执获取；未发送请求可替换/取消并保留历史，已尝试请求不能借此换 ID 重放。

## 构建与定向检查

微软官方 SDK `10.0.403` 由 `global.json` 固定，无额外 NuGet 产品依赖。Linux 可交叉编译；实际运行 WPF 和 DPAPI 必须 Windows。

```powershell
dotnet run --project Haoduoyu.Core.Tests --configuration Release
dotnet run --project Haoduoyu.Api.Tests --configuration Release
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --worker-contract Haoduoyu.Api.Tests/Fixtures/worker-contract-c30a8a9.json
dotnet run --project Haoduoyu.Profile.Tests --configuration Release
dotnet run --project Haoduoyu.Offline.Tests --configuration Release
dotnet run --project Haoduoyu.Search.Tests --configuration Release
dotnet build Haoduoyu.Windows --configuration Release
dotnet run --project Haoduoyu.Windows.Tests --configuration Release
./scripts/package-windows.ps1
```

Core/API/profile/download 测试只使用临时合成数据与 fake HTTP handler。共享原生表单逻辑另与已知 c30 Worker 源及临时合成 D1 回放。Windows.Tests 检查当前 runner 的 DPAPI、合成文件、编译资源和实际 Show/Dispatcher 窗口流程；窗口注入临时目录与假 HTTP，不启动默认用户工作区、不实际联网，不等同实体中文输入法与关机验收。静态 `node scripts/verify-boundaries.mjs` 仅验证源码隔离等模式，不替代动态检查。

打包脚本要求精确已提交源码，输出 `win-x64` 自包含便携候选 ZIP、逐文件 SHA256、源提交、独立包 manifest 与测试日志。不安装、不签名、不建 GitHub Release、不推送生产。签名/正式分发、旧版覆盖升级、实机中文输入法、真实断电恢复和重要资料规模验收仍待核实。现有无 CAS 的旧统计写接口不增加猜测表单，使用现代复盘的受保护原生表单；没有静默永久删除或自动更新。

继续工作应检出独立分支 `desktop/native-workbench-20261104`，先核对远端 SHA 和本地未提交改动。发布受阻时保留该分支及交付包，不修改网站生产发布门禁或安全设置。
