# Windows 独立工作台阶段保全

独立分支：`desktop/native-workbench-20261104`。只新增 Windows 客户端、合成测试、交付文档与独立构建工作流，不合并或覆盖网站、生产数据库、Android 或旧 Windows 安装。

## 阶段 0：基线与远端写入

`4bf2e19f9b8a453a3bc8b766c207303fb943e58c` 已正常推送，并以 `git ls-remote` 精确回读。详见 [基线核查](windows-desktop-baseline-20261104.md)。当前生产精确 Git SHA、旧 Windows 安装身份与数据路径尚未核实；不能进行覆盖升级。

## 阶段 1：持久化与同步核心

`desktop/windows/Haoduoyu.Core` 使用明确服务源和身份的独立分区；密文原子替换、写盘刷新、上一份备份与损坏原件保留。持久层只调用加密接口，Windows 层将使用当前用户 DPAPI；Linux 核心测试使用合成保护器，不把它当 Windows DPAPI 运行证明。

请求在发送前保全原方法、路径、正文、版本与保存 ID；崩溃中的 InFlight 恢复为 Unknown。未知结果不自动重放，409 保留原稿与响应，原请求不可变。磁盘保存失败阻止网络发送；明确的发送前检查拒绝标为 Blocked。读取和使用快照均不直接修改引擎状态。

2026-11-04 云端使用微软官方 SDK **10.0.403**，按官方 release metadata 的 SHA512 核验归档后运行最终阶段 1 合成测试，**14/14 通过**：落盘先于请求、落盘失败、崩溃恢复、超时、409 明确新 CAS、发送前拒绝与未分类异常、精确回执确认保留后续稿、身份分区和进程锁、原子备份、损坏恢复、未知 schema、同资源并发、同步期间写草稿、401/503 与后续队列暂停。测试均为临时合成数据，不访问生产记录。

复跑：`dotnet run --project desktop/windows/Haoduoyu.Core.Tests/Haoduoyu.Core.Tests.csproj --configuration Release`。SDK 版本在 `desktop/windows/global.json` 固定；`bin/obj/artifacts` 不提交。云端沙箱首次 NuGet 命名互斥初始化失败，经正常工具自动审核授权执行官方 SDK 后测试通过，未修改安全设置或 SDK。

此阶段只证明上述核心测试，不证明 Windows 交互、DPAPI、真实 API、旧版迁移、性能或正式发布通过。后续界面与 API 文件在通过各自定向检查后分阶段提交并回读远端；未提交文件不属于已可靠远端保存的成果。
