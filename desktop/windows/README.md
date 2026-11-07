# 好多鱼 Windows 独立工作台

当前为 **0.12.0 开发候选**，使用 .NET 10 / WPF 原生控件、HttpClient 和 Windows 当前用户 DPAPI。本地程序不嵌入浏览器，不下载并运行远程界面。现有网站、Worker、数据库迁移、Android 和旧 Windows 安装均未改动。

## 已实现的核心路径

- 每日待办、日期历史、完成显示偏好、软删恢复、常用事项。
- 待办周/月历史：自然周跨月、月份导航、北京时间今天、完成状态筛选、每日预览、范围及已知条目统计，点击日期复用单日操作。缺日显示未知；未决删除与 Queued/Unknown 仍标本机意图，不冒充服务端已确认，也不受日常隐藏完成项偏好影响。
- 未安排待办、安排到指定日、今天完成、软删恢复。
- 生活与工作多条碎碎念、旧日期日页独立保留、标签选择及创建/归档/恢复。
- 碎碎念月历史：原生月历、来源/标签/正文筛选、按日阅读及只读副本导出。完整空日、未读取日期与本机未决删除分开，草稿单独标识；月摘要缺少版本，须读取独立完整记录后才能编辑，仍使用原草稿和请求围栏。
- 备忘录分组与笔记、正文编辑、回收站恢复。
- 工作提醒、文章台账及流水线原生表单、现有自媒体数据读取。文章可录入槽位、作者/配图者、存稿日期、系列号、字数/小标题/图数、生产标识、封面描述、草稿凭证和带时区的完成时间；未知数字保留 null，真实零值保留 0。完整生产资料只读详情区分原读取基线与本机稿，保留未知嵌套证据，不执行目录或链接。
- 完整台账接口筛选：账号、平台、五种状态、关键词、发布起止、生产方式、推断题材、数据状态、槽位、作者、警告、明确待核与编号区间，以及指标/时间/耗时排序和分页。服务端模式保留原始分页与统计；本机模式重算投影派生信息，区分完整已准备基线与局部已知资料。未识别状态仍从只读发布对账查看。
- 台账原生表格：可配置可见列、顺序和列宽，标题列保留；支持当前筛选页按账号分组，组内保留原页顺序，组数不冒充全库存统计。最多20个命名视图保存已应用筛选、状态、排序、每页条数和布局；显式应用才回到第一页，不切换当前读取来源。
- 待核清单处理状态：在原文章编辑页选择已有条目，明确设为已处理或待处理，与标题、正文和流水线改动保存到同一草稿，使用同一原始版本与幂等请求。未知状态和条目来源保留；无清单时不猜测、创建或核销条目。已尝试请求继续受原 Unknown 围栏保护。
- 完整只读发布对账：校验服务可见范围全部库存、状态/日期分组、公众号显式编号重复与已观察内部间隔；支持快照内的账号、日期、槽位、作者、状态、标题、警告及待核三态筛选和本地分页。排期、编号起点/目标未配置，不推断漏产。本机未决修改与服务快照分开，摘要不作为写入实体。
- 内容复盘总览与趋势、八类持久复盘资源的原生创建与哈希 CAS 编辑，包括指标、报告、规则库及结构化子项、对标资料、笔记和账号健康。
- 数据复盘四个原生页面：按账号和昨天/近7日/近30个完整自然日读取总览，累计榜 Top N/平台筛选、到期D1/D3/D7节点、文章累计快照、每日数据起止筛选。累计快照、本期新增、指标覆盖、上期比较、关注原因和真实逐日表分别显示；来源未取得、空值和真实零保留，账号整体日数据不与文章明细相加。
- AI 汇报完整分页历史、按实际日期筛选、原文阅读/导出与人工补充。稳定 UUID 追加保存，署名必填；已尝试或确认的原记录只读，不调用模型，也不自动生成完成报告。
- 本机草稿、离线业务清单与详情投影、完整资料准备、持久队列、版本冲突核对、保存回执确认、只读历史分区导出、显式本机备份恢复。
- 当前身份的跨模块本机检索：缓存、草稿、原请求、实际冻结请求和远端响应证据分别标注，可预览、导出、回原模块或恢复本机稿。不会联网搜索或把缓存摘要作为完整正文。
- 可审阅的加密历史归档：只移出从未发送、已替代且不再被引用的旧历史，保留当前稿和请求证据；先写档读回核验，再提交活动状态。支持当前分区内只读发现未登记档案、查看与导出，不导回可执行队列。

界面编译通过不等于以上路径均已完成实机或生产 API 验收。默认缓存已访问页面；“准备完整离线资料”会读取已确认工作区的日期索引、所有分页及详情，核对 hash、scope 和全局读取版本后一次性保存。取消、资料变化、坏响应或超过 24MiB/1000 日期等有界预算会整批停止并保留旧缓存，不能把局部页面称为完整。所有生产联网业务测试仍未执行。

发布对账接口不接受查询参数，完整库存最多 4000 条/rows JSON 1MiB；含聚合的完整响应另限 4MiB。刷新全程成功后才缓存当次核实的账户集合、服务 scope 及本机观察时间；离线显示为已保存快照。完整资料准备同样纳入该库存及未知状态文章详情，前后对账不同则整批停止；读回一致不能消除无服务端事务修订号的 ABA/并发窗口。对账筛选仅作用于已核实快照；编辑待核清单须打开单独完整文章详情，摘要不能作为写入实体。

台账关键词按源 SQLite ASCII 大小写规则及字面通配符处理，日期使用北京时间自然日或明确时区，指标 null 不补0、排序缺失恒末。服务端原始页不混本机意图；本机投影含 Queued/Unknown 并明确来源，只有带完整标记的全库存可称完整已准备基线，零散页/索引不冒充全量或完整编辑实体。派生警告、待核、题材与快照状态只读重算，不写回文章。仅 GET/articles 的有界 URI 容纳完整合法筛选，其他路线与写入预算保持。

视图和列配置单独保存在当前身份哈希目录的 `ledger-views.bin`，使用同一 Windows 用户 DPAPI、原子替换和 `.bak`；不改工作区 Schema1/2 或身份配置 Schema2。设置只含白名单查询和布局，不含业务快照或凭证；普通保存和布局调整不联网、不改缓存、草稿、队列或服务端总量。损坏、未知版本、错分区或主文件缺失而备份存在时保留原件并停止保存，可显式仅恢复视图配置备份；完整私有目录备份应包含此文件及备份。旧候选会忽略这些独立配置，不负责呈现新表格布局。

待办日历只显式刷新当前周/月范围，逐日 GET 后核对全局应用修订号与 service scope，全部通过才一次保存。最多31日、8MiB网络JSON、12MiB本机编码缓存和5000行；单日网络1MiB保持，本机解析4MiB仅容纳缓存Unicode转义。取消、429、坏日或期间变化保留整批旧缓存；缺失日期不自动补零。不同日期可能来自多次读取，统计标为本机视图。外部owner配置缺逐请求原子scope前提的既有竞态仍未消除。

碎碎念月历只显式刷新当前月的 `note-entries/month`，保持服务端完整读取2000行/1MiB上限和标签版本3；413、坏响应、取消或身份变化都不替换旧缓存。本机编码读取另限8MiB/10000行以容纳合法Unicode转义和未决意图，不扩大网络预算。没有准确完整月副本时仅显示已知记录，未知日期不算空日；草稿与基线数量分开，不把Queued/Unknown当服务器保存。月原文没有版本/hash，月份点击先只读，完整详情与已有草稿均保持原键和原版本。旧日页摘要也不会被猜为版本0。

数据复盘各页面单独读取精确查询，切页先查看当前身份的本机副本，显式应用/刷新才联网；不借其他查询或账号的资料补齐。总览平台筛选只影响累计榜，已录文章总数不是本期产量。源日数据的整体账号优先规则和关注判断沿用服务端结果，不在本机重算业务聚合。四类GET仍限单响应1MiB，不为无分页接口虚构分页；坏响应、取消、超限或归属变化保全旧缓存。快照响应不含账号字段，账号筛选依赖正式服务端查询与工作区校验；四次独立读取不称跨页面事务快照。条目只读导出带来源；打开原文章必须独立取得完整版本并保留原草稿与Unknown围栏。旧统计接口没有CAS/精确收据，不新增猜测写表单。

## 本机数据与同步

新目录为 `%LOCALAPPDATA%\Haoduoyu\NativeWorkbench\v1`，不猜测或迁移旧客户端路径。每个服务源、身份及服务端 scope 单独分区；公开与登录账户不共用队列。首次离线未绑定草稿和历史分区可在“本机与恢复”只读查看/导出，不自动迁移到新身份。

草稿停止输入约 350ms 后先加密保存到本机，切页/正常退出前等待保存完成。Ctrl+S 仅保存本机草稿；“保存并同步”先落盘原请求，再发送。中文组合输入没有自动远端提交。当前整个状态采用加密快照，容量上限 32MiB；超限停止并保留原件。历史归档需用户显式预览确认，仍不自动归档，也不处理已尝试/确认或必须保留的证据；不承诺无限规模。

首次归档将工作区数据升级到 Schema2，新版可读取 Schema1/2，旧候选会拒绝新格式以免丢失归档 ID 索引。原主文件按原子备份保留，档案在当前身份目录的 history 子目录，备份应包含整个目录。归档缩减活动文件正文，磁盘总占用可能增加。每批最多 1000 条/4MiB 编码历史，单档最多 8MiB；超限/损坏/取消不提前移除活动原文。已有档案不参与活动检索，可从“历史档案”只读打开。

Unknown 不等于失败：不自动重发。notes/memos 可按原 `save_id` 只读核验回执、当前版本与内容 hash。其他未知结果需保守核对；服务端生成 ID 的新文章与无 CAS 的标签操作保持资源围栏，不能用新保存 ID 解除后再次创建/覆盖。409 的本地稿与远端稿分别保留，只在明确选择后创建新 CAS 操作。

显式回退备份会把恢复的全部非终态请求持久标为 Unknown，并标记恢复来源：旧备份无法证明之后没有发送或重试，连当时已受阻/冲突的请求也须只读核对，不能直接重排。恢复时保留损坏主文件、备份原件和草稿来源；来源标记不会被后续自动保存洗掉。恢复的新建文章稿仍可编辑与导出，但须先从台账核对服务器记录，不能直接再次 POST 创建；稳定 ID 的已有记录继续按原版本/hash 校验。

每次发送前核对 scope，在线读取在替换本机缓存前也重核 scope；归属变化时保留原分区且停止替换。现服务端没有原子 expected-scope 前提，配置在多个请求之间变化的窗口仍存在。登录会话/CSRF 和原有服务器授权仍逐请求执行。快照身份服务不可用或超限会暂停发送，不能用旧身份猜测归属。

本候选版不持久化密码或会话 Cookie；账户退出程序后需重新登录，账户加密文件保留。DPAPI 通常绑定同一 Windows 用户，复制密文目录不是跨电脑可读导出。离开电脑前应显式导出需要迁移的纯文本，导出文件本身不加密。

流水线字段修改沿用原文章 key、版本 CAS 和稳定持久请求，已尝试/Unknown 的请求不能借改稿换 ID 重放。日期必须真实有效，时间明确填写 Z 或 +08:00 等时区并按服务端毫秒精度保存；缺少版本号不会猜成新建。未完成输入仍可保存在加密草稿，非法或超出 256KiB 实际请求预算的内容不能进入队列。待核清单仅允许显式修改已有条目的 done 布尔值，不增删、重排或改来源；六类 JSON 合计仍限 64KiB，公开写入还有服务端 16KiB 正文限制。样文、重跑和阻塞证据仍只读。条目的本机选择不等于服务器保存；文章没有精确收据接口，超时后 GET 到相同内容仍保留 Unknown，不自动确认或重发。新待核草稿须使用 0.9.0 或后续兼容版本继续编辑，旧候选不会采纳这些选择；工作区仍读取 Schema1/2。

成功核对过的私有账号可在下次完全离线启动时继续原工作区编辑；“本机工作区”可切换已确认身份。身份配置同样使用 DPAPI，配置中不保存密码或 Cookie。联网发送仍必须重新登录原账号并核对 scope。新建父子记录按依赖顺序发送，子操作的 CAS 版本只从真实父回执获取；未发送请求可替换/取消并保留历史，已尝试请求不能借此换 ID 重放。

## 构建与定向检查

微软官方 SDK `10.0.403` 由 `global.json` 固定，无额外 NuGet 产品依赖。Linux 可交叉编译；实际运行 WPF 和 DPAPI 必须 Windows。

```powershell
dotnet run --project Haoduoyu.Core.Tests --configuration Release
dotnet run --project Haoduoyu.Api.Tests --configuration Release
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --worker-contract Haoduoyu.Api.Tests/Fixtures/worker-contract-c30a8a9.json
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --article-pipeline-form-contract Haoduoyu.Api.Tests/Fixtures/article-pipeline-form-contract-c30a8a9.json
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --article-reconciliation-contract Haoduoyu.Api.Tests/Fixtures/article-reconciliation-contract-c30a8a9.json
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --todo-history-contract Haoduoyu.Api.Tests/Fixtures/todo-history-contract-c30a8a9.json
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --article-ledger-contract Haoduoyu.Api.Tests/Fixtures/article-ledger-contract-c30a8a9.json
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --article-verification-contract Haoduoyu.Api.Tests/Fixtures/article-verification-contract-c30a8a9.json
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --note-history-contract Haoduoyu.Api.Tests/Fixtures/note-history-contract-c30a8a9.json
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --media-review-contract Haoduoyu.Api.Tests/Fixtures/media-review-contract-c30a8a9.json
dotnet run --project Haoduoyu.Profile.Tests --configuration Release
dotnet run --project Haoduoyu.Offline.Tests --configuration Release
dotnet run --project Haoduoyu.History.Tests --configuration Release
dotnet run --project Haoduoyu.Notes.Tests --configuration Release
dotnet run --project Haoduoyu.Media.Tests --configuration Release
dotnet run --project Haoduoyu.Ledger.Tests --configuration Release
dotnet run --project Haoduoyu.Verification.Tests --configuration Release
dotnet run --project Haoduoyu.View.Tests --configuration Release
dotnet run --project Haoduoyu.Search.Tests --configuration Release
dotnet run --project Haoduoyu.Archive.Tests --configuration Release
dotnet build Haoduoyu.Windows --configuration Release
dotnet run --project Haoduoyu.Windows.Tests --configuration Release
./scripts/package-windows.ps1
```

Core/API/profile/download 测试只使用临时合成数据与 fake HTTP handler。共享原生表单逻辑另与已知 c30 Worker 源及临时合成 D1 回放。Windows.Tests 检查当前 runner 的 DPAPI、合成文件、编译资源和实际 Show/Dispatcher 窗口流程；窗口注入临时目录与假 HTTP，不启动默认用户工作区、不实际联网，不等同实体中文输入法与关机验收。静态 `node scripts/verify-boundaries.mjs` 仅验证源码隔离等模式，不替代动态检查。

打包脚本要求精确已提交源码，输出 `win-x64` 自包含便携候选 ZIP、逐文件 SHA256、源提交、独立包 manifest 与测试日志。不安装、不签名、不建 GitHub Release、不推送生产。签名/正式分发、旧版覆盖升级、实机中文输入法、真实断电恢复和重要资料规模验收仍待核实。现有无 CAS 的旧统计写接口不增加猜测表单，使用现代复盘的受保护原生表单；没有静默永久删除或自动更新。

继续工作应检出独立分支 `desktop/native-workbench-20261104`，先核对远端 SHA 和本地未提交改动。发布受阻时保留该分支及交付包，不修改网站生产发布门禁或安全设置。
