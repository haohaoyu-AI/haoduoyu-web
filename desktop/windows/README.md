# 好多鱼 Windows 独立工作台

当前为 **0.20.0 源码开发候选**，使用 .NET 10 / WPF 原生控件、HttpClient 和 Windows 当前用户 DPAPI。本地程序不嵌入浏览器，不下载并运行远程界面。现有网站、Worker、数据库迁移、Android 和旧 Windows 安装均未改动。

## 已实现的核心路径

- 北京时间跨日保护：每30秒及窗口重新激活时只检查日期。跨日、长时间休眠后或时钟回拨会显示原生提示，保留所选日期、原页面、草稿及队列，不自动跳到今天、刷新或同步。可选择继续原日期；明确点击“打开今天待办”才先保存原草稿再切换，落盘失败则留在原页。真实休眠/系统改时钟仍待实机验证。
- 统一纯文本导出使用严格UTF-8无BOM，同目录临时文件完整写入并flush到磁盘后才原子提交；64MiB按实际字节限额，超限或不完整Unicode不会被静默替换。失败或提交前取消保留旧目标并清理临时纯文本，清理失败明确报告可能残留。最终文件链接、只读文件和目录不接受；发现普通并发改动会停止，首次新建不因竞争文件出现而改成覆盖。导出不依赖工作区成功落盘，也不清除本机dirty标志，可用于本机保存受阻时抢救文字；导出文件仍是未加密纯文本。文件选择器及真实断电尚未验收，属性检查不提供跨进程inode级CAS。
- 每日待办、日期历史、完成显示偏好、软删恢复、常用事项。
- 私有待办备注：原生原文编辑、独立加密草稿、自动保存、离线续编、清空前输入恢复及只读导出；日期历史和本机检索显示备注及实际来源。备注与创建稿分开，仍共用原待办的请求围栏，正文、日期、完成状态和模板关联不随备注输入改写。
- 常用事项的活动/归档列表、显式归档/恢复、原生详情与本机来源。归档保留历史待办和关联，归档模板不用于新待办；两张列表独立缓存与投影，不把普通快照中的缺席当作删除。旧软删除操作及其原请求不改成归档。
- 待办周/月历史：自然周跨月、月份导航、北京时间今天、完成状态筛选、每日预览、范围及已知条目统计，点击日期复用单日操作。缺日显示未知；未决删除与 Queued/Unknown 仍标本机意图，不冒充服务端已确认，也不受日常隐藏完成项偏好影响。
- 未安排待办、安排到指定日、今天完成、软删恢复。
- 生活与工作多条碎碎念、旧日期日页独立保留、标签选择及创建/归档/恢复。
- 碎碎念月历史：原生月历、来源/标签/正文筛选、按日阅读及只读副本导出。完整空日、未读取日期与本机未决删除分开，草稿单独标识；月摘要缺少版本，须读取独立完整记录后才能编辑，仍使用原草稿和请求围栏。
- 备忘录分组与笔记、正文编辑、回收站恢复。列表和分组详情分别标明本机已知活动笔记数及服务端副本数，不把未决创建/取消或局部已知资料当作实时服务端总数。批量软删除继续使用原服务端计数和版本，缺失时先拒绝确认与排队，不猜0；取消本机新分组保留子稿与等待中的依赖。既有笔记所属组仍按正式合同保持不可变。
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
- 历史分区只读恢复单独按需发现清单，最多1000个目录项；密文及明文各限32MiB，实际流读取也有界，核对分区scope及根/分区/最终文件的链接状态。主工作区无法打开时仍可预览原始JSON，保留未知字段而不加载坏队列；预览最多256Ki字符，明确标注不完整，完整原文可显式确认后导出。仅支持Windows及Linux检查环境；Windows短路径别名、祖先junction或重定向AppData可能被保守拒绝，尚未实测兼容，不会因此改写原文件。
- 可审阅的加密历史归档：只移出从未发送、已替代且不再被引用的旧历史，保留当前稿和请求证据；先写档读回核验，再提交活动状态。支持当前分区内只读发现未登记档案、查看与导出，不导回可执行队列。

界面编译通过不等于以上路径均已完成实机或生产 API 验收。默认缓存已访问页面；“准备完整离线资料”会读取已确认工作区的日期索引、所有分页及详情，核对 hash、scope 和全局读取版本后一次性保存。取消、资料变化、坏响应或超过 24MiB/1000 日期等有界预算会整批停止并保留旧缓存，不能把局部页面称为完整。所有生产联网业务测试仍未执行。

发布对账接口不接受查询参数，完整库存最多 4000 条/rows JSON 1MiB；含聚合的完整响应另限 4MiB。刷新全程成功后才缓存当次核实的账户集合、服务 scope 及本机观察时间；离线显示为已保存快照。完整资料准备同样纳入该库存及未知状态文章详情，前后对账不同则整批停止；读回一致不能消除无服务端事务修订号的 ABA/并发窗口。对账筛选仅作用于已核实快照；编辑待核清单须打开单独完整文章详情，摘要不能作为写入实体。

台账关键词按源 SQLite ASCII 大小写规则及字面通配符处理，日期使用北京时间自然日或明确时区，指标 null 不补0、排序缺失恒末。服务端原始页不混本机意图；本机投影含 Queued/Unknown 并明确来源，只有带完整标记的全库存可称完整已准备基线，零散页/索引不冒充全量或完整编辑实体。派生警告、待核、题材与快照状态只读重算，不写回文章。仅 GET/articles 的有界 URI 容纳完整合法筛选，其他路线与写入预算保持。

视图和列配置单独保存在当前身份哈希目录的 `ledger-views.bin`，使用同一 Windows 用户 DPAPI、原子替换和 `.bak`；不改工作区 Schema1/2 或身份配置 Schema2。设置只含白名单查询和布局，不含业务快照或凭证；普通保存和布局调整不联网、不改缓存、草稿、队列或服务端总量。损坏、未知版本、错分区或主文件缺失而备份存在时保留原件并停止保存，可显式仅恢复视图配置备份；完整私有目录备份应包含此文件及备份。旧候选会忽略这些独立配置，不负责呈现新表格布局。

待办日历只显式刷新当前周/月范围，逐日 GET 后核对全局应用修订号与 service scope，全部通过才一次保存。最多31日、8MiB网络JSON、12MiB本机编码缓存和5000行；单日网络1MiB保持，本机解析4MiB仅容纳缓存Unicode转义。取消、429、坏日或期间变化保留整批旧缓存；缺失日期不自动补零。不同日期可能来自多次读取，统计标为本机视图。外部owner配置缺逐请求原子scope前提的既有竞态仍未消除。

碎碎念月历只显式刷新当前月的 `note-entries/month`，保持服务端完整读取2000行/1MiB上限和标签版本3；413、坏响应、取消或身份变化都不替换旧缓存。本机编码读取另限8MiB/10000行以容纳合法Unicode转义和未决意图，不扩大网络预算。没有准确完整月副本时仅显示已知记录，未知日期不算空日；草稿与基线数量分开，不把Queued/Unknown当服务器保存。月原文没有版本/hash，月份点击先只读，完整详情与已有草稿均保持原键和原版本。旧日页摘要也不会被猜为版本0。

数据复盘各页面单独读取精确查询，切页先查看当前身份的本机副本，显式应用/刷新才联网；不借其他查询或账号的资料补齐。总览平台筛选只影响累计榜，已录文章总数不是本期产量。源日数据的整体账号优先规则和关注判断沿用服务端结果，不在本机重算业务聚合。四类GET仍限单响应1MiB，不为无分页接口虚构分页；坏响应、取消、超限或归属变化保全旧缓存。快照响应不含账号字段，账号筛选依赖正式服务端查询与工作区校验；四次独立读取不称跨页面事务快照。条目只读导出带来源；打开原文章必须独立取得完整版本并保留原草稿与Unknown围栏。旧统计接口没有CAS/精确收据，不新增猜测写表单。

模板归档依据另行核实的固定候选源34bff302；当前生产Worker精确SHA与迁移状态仍未知。新操作仅POST UUID/archive或restore，正文严格只有正安全整数version且小于MAX_SAFE_INTEGER，使用原模板资源键；同状态幂等可返回同版本或下一版本，归档恢复的archived_at:null不作为软删除恢复。写入超时仍保留Unknown，不凭两张列表的当前状态确认、重放或换键。同步中心提供两列表只读核对及原请求导出；归档没有精确保存收据，Unknown/恢复请求及归档冲突仍保守阻止进一步写入，不能宣称已自动解决。列表联网仍限单响应1MiB，坏响应/取消/归属变化保全原副本。

待办备注也依据固定候选34bff302，只允许原登录管理会话写入，公开身份只读；客户端在任何备注请求或scope读取前拦截公开/失效会话，服务端授权仍独立执行。正式正文仅note/version，原日期单独保存在本机TodoNoteDate；保持原空白、CR/LF和Unicode，不自动整理。4000个UTF-16单位是发送上限，超长未完成稿可先存本机；不静默截断粘贴。旧副本缺备注字段保持未取得，只有已核验清空响应可证明明确空串。合法清空响应省略note，客户端不会补回旧备注；条件重放可带回其他端最新完成状态，客户端采用已核验的当前记录。

备注没有精确保存收据，Unknown、冲突和备份恢复仍保留原ID、正文、版本和日期，不能据相同当前文字确认或重发。明确未发出的Blocked且无远端响应、非恢复请求，可在原账号重新登录、只读核对原日期并明确确认后，保持同一请求重排；不自动发送，也不放开Unknown。工作区Schema1/2不变，新增日期字段仅用于新备注请求；含新备注请求或独立备注稿时使用0.14.0或后续兼容候选继续，切换旧版前先保全整个私有目录。旧版不会理解新动作，元数据缺失时新版拒绝发送而不猜日期。

“准备完整离线资料”现分别读取并保存活动和归档常用事项，末尾再次读取比较业务资料后才随整批原子保存。两列表使用独立查询、完整性及本机/服务scope来源，记录各自UTC读取时间；归档仍不属于原business snapshot的manifest/hash，不能从活动列表缺席推断为空。单响应1MiB、两表合计10000项、总缓存24MiB及原请求/行数预算保持；缺表、坏数据、取消或读取期间变化均保全旧缓存、草稿和Unknown。首尾变化检测不是跨请求事务，也不消除ABA或外部配置竞态。旧候选不识别新的归档动作和状态；有新归档未决请求时应使用0.13.0或后续兼容候选继续，先保全整个私有目录再切换版本。

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

微软官方 SDK `10.0.403` 由 `global.json` 固定，客户端无额外 NuGet 产品依赖。MSI构建另从官方NuGet私有工具目录恢复固定WiX 4.0.6，仅在云端Windows构建机使用。Linux 可交叉编译；实际运行 WPF 和 DPAPI 必须 Windows。

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
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --template-archive-contract Haoduoyu.Api.Tests/Fixtures/template-archive-contract-34bff302.json
dotnet run --project Haoduoyu.Api.Tests --configuration Release -- --todo-note-contract Haoduoyu.Api.Tests/Fixtures/todo-note-contract-34bff302.json
dotnet run --project Haoduoyu.Profile.Tests --configuration Release
dotnet run --project Haoduoyu.Offline.Tests --configuration Release
dotnet run --project Haoduoyu.History.Tests --configuration Release
dotnet run --project Haoduoyu.Notes.Tests --configuration Release
dotnet run --project Haoduoyu.Media.Tests --configuration Release
dotnet run --project Haoduoyu.Template.Tests --configuration Release
dotnet run --project Haoduoyu.TodoNotes.Tests --configuration Release
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

便携打包脚本要求精确已提交源码，输出 `win-x64` 自包含便携候选 ZIP、逐文件 SHA256、源提交、独立包 manifest 与测试日志。便携脚本不安装、不签名、不建 GitHub Release、不推送生产。签名/正式分发、真实旧版升级、实机中文输入法、真实断电恢复和重要资料规模验收仍待核实。现有无 CAS 的旧统计写接口不增加猜测表单，使用现代复盘的受保护原生表单；没有静默永久删除或自动更新。

## 每用户安装器候选路径

0.19.0增加独立MSI源码和云端Windows构建/合成验收步骤，保留原便携ZIP。0.19精确源e4bb78d的云端Windows CI42445325659及job已success，通过配置的临时托管安装验收整流程。相关来源和限制见[阶段19终态](../../docs/windows-desktop-stage19-20261108.md)。0.20的新离线功能本机回归及交叉编译另记阶段20，尚不能用旧版CI代替新版验证。

安装目标固定为 `%LOCALAPPDATA%\Programs\Haoduoyu\NativeWorkbench`，开始菜单及系统应用列表可卸载。私有数据仍在 `%LOCALAPPDATA%\Haoduoyu\NativeWorkbench\v1`，不由MSI接管、迁移或删除。安装器无提权、后台更新、自动启动客户端或自动关闭编辑器，请自行关闭客户端后维护。候选未签名，Windows信任与正式分发仍待验收。

实际MSI嵌入只读原生安全门，独立核对当前用户已登记的同族安装及固定位置；首次遇到既有便携目录或菜单目录拒绝接管，检查路径链、子目录链接与硬链接，在文件变动前再次检查。它不删除旧目录，也不宣称消除恶意并发换路径竞态。重定向AppData、短路径别名、锁文件和真实旧载荷升级尚未验收。

云端验收脚本仅允许GitHub托管的临时Windows runner；不在用户电脑运行。验收检查真实MSI安装、明确取消、升级/降级/同版本维护、卸载、文件哈希及私有数据/非owned额外文件保留，并对旧便携目录、junction及硬链接作拒绝检查。旧版/同版本夹具复用候选载荷，只改变MSI版本/身份，不代表真实旧客户端或数据迁移，也未覆盖新版本新增文件名与非owned文件同名碰撞。升级中取消和完整用户交互仍待验收。

0.19已取得正常Windows CI整流程success；未下载包或独立验内部字节，成功job的逐步骤摘要有陈旧局限。用户真机、签名、真实旧载荷/数据迁移与生产账号验收另行进行。

继续工作应检出独立分支 `desktop/native-workbench-20261104`，先核对远端 SHA 和本地未提交改动。发布受阻时保留该分支及交付包，不修改网站生产发布门禁或安全设置。
