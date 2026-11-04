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

## 阶段 2：受控 API 与原生界面候选

阶段 1 核心源码已远端保存为 `0fcf3c817b3069401a6187df1354d9bc0a93e79d`，正常 `git ls-remote` 精确回读一致。

API adapter 的最终定向合成套件 **108 项断言通过**，包括固定服务源、路由白名单、拒绝重定向、Cookie/CSRF、scope 变化发送前停止、标签协议、正文和成功响应核对、哈希 CAS 内容复盘、超限/网络失败及保存回执。没有访问生产业务 API。

Windows WPF 产品与 13 项 Windows 合成测试工程已由 Linux 官方 SDK 交叉编译成功，**0 警告、0 错误**。13 项 Windows 检查尚未在 Windows 运行，不计入已通过测试。原生每日待办、生活/工作记录、备忘录、工作提醒、文章表单、离线草稿/同步中心、未安排待办、标签及内容复盘页面为真实 C# 控件与受控请求；内容复盘报告/规则库/对标资料/健康目前只读，不能称全功能写入。具体完整性与剩余限制见 [Windows README](../desktop/windows/README.md)。没有启动或安装到用户电脑。

独立 Windows 构建工作流另行保存并尝试正常写入；先可靠推送产品代码再验证工作流权限。若 GitHub 拒绝工作流写入或运行，不改权限、不换隐蔽发布路径，已推送代码仍保留，明天按正常路径恢复。

## 阶段 3：Windows 首轮与实际 Worker 契约

独立工作流写入已正常成功；`f23d69a1ecfe6e0ae4f726a63f4a62ca120d5f96` 的 Windows 运行 [41868873363](https://github.com/haohaoyu-AI/haoduoyu-web/actions/runs/41868873363) 成功，强制 Core/API/13 项 Windows 原生合成检查、编译和自包含打包全部通过。这仍不是交互、真实关机或生产写入验收。

额外隔离实测发现初轮模拟没有捕捉的挂载问题，已修为 `/api/v1/note-entries/labels` 与 `/api/v1/note-entries/month`；标签集合排序/NFC、`timings.finished_at` 的服务器规范化也有明确核对。非北京时间当天只读/编辑既有碎碎念，不新增或自动挪动历史新稿。

`c30a8a9` 独立已知源的真实临时 Miniflare D1 + 编译 Worker 共 **53 请求**：40 成功写响应、3 个真实 CAS 409、10 次读取，全部通过 C# 桌面契约校验；另 2 次真实收据/实体哈希确认通过。临时数据全为新建合成记录、外联尝试 0、MF/D1 已销毁。常规 API 合成套件修正后 **112 项断言通过**。详情与精确源码哈希见[净化报告](../desktop/windows/Haoduoyu.Api.Tests/Fixtures/worker-contract-report.json)和[复跑说明](../desktop/windows/Haoduoyu.Api.Tests/Fixtures/README.md)。首轮历史包不作为最终使用包，修正后将走同一正常 Windows 工作流重建。

首轮 artifact 正常下载回本环境被存储端点 **403 Forbidden** 拒绝，已停止该步骤，不换工具/路由，不重试。源码和远端 artifact 仍保留；没有成功的本地 ZIP、独立下载摘要核验或 Library 上传。具体状态与明天操作见[交接说明](windows-desktop-handoff-20261104.md)。

## 最终来源

产品源 `5a7f89149d28c9d3eca4974db2f3b78fd729a89d` 已正常推送并回读；Windows [41872223894](https://github.com/haohaoyu-AI/haoduoyu-web/actions/runs/41872223894) 成功。Core 14/14、常规 API 112 断言、Windows 原生 13/13、实际 Worker 53 请求及 2 回执/哈希回放、WPF 编译、自包含打包全部通过。最终 artifact `13344852388` 已由 GitHub 元数据确认存在；未尝试再次下载，Library 仍无副本。精确来源与边界见[最终交付证据](windows-desktop-evidence-20261104.json)。正式安装、生产发布、旧版覆盖升级和完整产品验收均未执行。
