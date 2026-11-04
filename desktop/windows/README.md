# 好多鱼 Windows 独立工作台

当前为 **0.1.0 开发候选**，使用 .NET 10 / WPF 原生控件、HttpClient 和 Windows 当前用户 DPAPI。本地程序不嵌入浏览器，不下载并运行远程界面。现有网站、Worker、数据库迁移、Android 和旧 Windows 安装均未改动。

## 已实现的核心路径

- 每日待办、日期历史、完成显示偏好、软删恢复、常用事项。
- 未安排待办、安排到指定日、今天完成、软删恢复。
- 生活与工作多条碎碎念、旧日期日页独立保留、标签选择及创建/归档/恢复。
- 备忘录分组与笔记、正文编辑、回收站恢复。
- 工作提醒、文章台账表单、现有自媒体数据读取。
- 内容复盘总览与趋势，九类复盘资源的分页阅读/详情/导出；复盘文章与指标快照的原生录入及哈希 CAS 编辑。报告、规则库、对标资料、复盘笔记和账号健康目前只读。
- 本机草稿、已读取页面的离线缓存、持久队列、版本冲突核对、保存回执确认、只读历史分区导出、显式本机备份恢复。

界面编译通过不等于以上路径均已完成 Windows 交互或真实 API 验收。当前仅缓存已访问页面，不声称完整服务端资料已下载到本机；数据复盘的精确功能边界见交付说明。所有生产联网测试仍未执行。

## 本机数据与同步

新目录为 `%LOCALAPPDATA%\Haoduoyu\NativeWorkbench\v1`，不猜测或迁移旧客户端路径。每个服务源、身份及服务端 scope 单独分区；公开与登录账户不共用队列。首次离线未绑定草稿和历史分区可在“本机与恢复”只读查看/导出，不自动迁移到新身份。

草稿停止输入约 350ms 后先加密保存到本机，切页/正常退出前等待保存完成。Ctrl+S 仅保存本机草稿；“保存并同步”先落盘原请求，再发送。中文组合输入没有自动远端提交。当前整个状态采用加密快照，容量上限 32MiB；超限停止并保留原件，尚无自动归档或大量数据性能保证。

Unknown 不等于失败：不自动重发。notes/memos 可按原 `save_id` 只读核验回执、当前版本与内容 hash。其他未知结果需保守核对；服务端生成 ID 的新文章与无 CAS 的标签操作保持资源围栏，不能用新保存 ID 解除后再次创建/覆盖。409 的本地稿与远端稿分别保留，只在明确选择后创建新 CAS 操作。

每次发送前核对 scope；现服务端没有写入原子 expected-scope 前提，配置在预检和实际写入间变化的窗口仍存在。登录会话/CSRF 和原有服务器授权仍逐请求执行。快照身份服务不可用或超限会暂停发送，不能用旧身份猜测归属。

本候选版不持久化密码或会话 Cookie；账户退出程序后需重新登录，账户加密文件保留。DPAPI 通常绑定同一 Windows 用户，复制密文目录不是跨电脑可读导出。离开电脑前应显式导出需要迁移的纯文本，导出文件本身不加密。

## 构建与定向检查

微软官方 SDK `10.0.403` 由 `global.json` 固定，无额外 NuGet 产品依赖。Linux 可交叉编译；实际运行 WPF 和 DPAPI 必须 Windows。

```powershell
dotnet run --project Haoduoyu.Core.Tests --configuration Release
dotnet run --project Haoduoyu.Api.Tests --configuration Release
dotnet build Haoduoyu.Windows --configuration Release
dotnet run --project Haoduoyu.Windows.Tests --configuration Release
./scripts/package-windows.ps1
```

Core/API 测试只使用临时合成数据与 fake HTTP handler。Windows.Tests 仅检查当前 runner 的 DPAPI、合成文件、编译资源及未显示的控件树，不启动用户工作区、不联网、不等同实体 Windows 交互验收。静态 `node scripts/verify-boundaries.mjs` 仅验证源码隔离等模式，不替代动态检查。

打包脚本要求精确已提交源码，输出 `win-x64` 自包含便携候选 ZIP、逐文件 SHA256、源提交、独立包 manifest 与测试日志。不安装、不签名、不建 GitHub Release、不推送生产。签名/正式分发、旧版覆盖升级、中文输入法、真实断电恢复、完整离线数据范围及大量资料流畅度仍待验证。

继续工作应检出独立分支 `desktop/native-workbench-20261104`，先核对远端 SHA 和本地未提交改动。发布受阻时保留该分支及交付包，不修改网站生产发布门禁或安全设置。
