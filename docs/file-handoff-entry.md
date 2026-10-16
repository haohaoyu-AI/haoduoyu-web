# 同一执行者完成 Word 交接和一次导入

用户入口仍为上传后点击一次“求助小鱼”。执行者优先 `read_article_handoff(article_id)`：一次返回最终配图 Word 的文件名、字节数、SHA、本人网站下载路径、冻结正文/图片契约、两平台实际进度和 continuation。它不认领、不消费、不重传，也不是一个原子状态快照；后续写工具仍核对实时状态。
网站默认方法固定为头条 Codex 法、知乎坐标法，见 [固定方法](private-draft-methods.md)。头条在选择器等待注册前完成页面和控件检查；注册 waiter 后立即点击实际文件控件，不在等待预算内追加异步预查，避免工具延迟先耗尽 15 秒。知乎默认由当前截图与真实鼠标开原生窗口，不注册 browser filechooser waiter。

本源码 runtime 8／contract 7 的默认入口是 `createPrivateDraftExecutor`，完整独立源码在 `scripts/browser-upload/private-draft-executor.mjs`，生产版本和发布状态以实际 handoff 及交付回执为准。最终 Word 文件交接与执行源码加载是不同事实：正常 handoff 的模块分页只读源码与摘要，`standalone_js` 和完整 SHA 均不证明 CUA 接受执行。新版本的完整独立程序和同版 bridge 须分别正常完整加载，不能复用旧 runtime 闭包或许可。V152／runtime 7 已真实整对加载，runtime 8 的新鲜接受与 preflight 仍由父线程测试；满足预算不保证批准或平台成功。旧大 runner 被拒后不拆分、编码或换工具绕过；没有任意 local-file 模块支持证据，不使用此类 loader。具体加载边界见 [执行器接入](browser-upload-runner.md#加载和接入父执行者)。

不要把 `read_article_file_chunk` 当作配图 Word，它读取的是原上传文件。使用准备执行导入的同一官方浏览器、同一执行者，通过本站实际下载控件与 `waitForEvent('download')` / `download.path()` 获取最终文件。保留实际返回的路径，原样制作具名 `.docx`，核对字节/SHA/会话。下载信息和 Content-Disposition 共用安全文件名；下载需要本站本人认证，没有公开直链。文件在另一执行者存在、网站存储存在或本地路径存在，都不能单独证明浏览器可见。

已有受支持的文件可见性证据时，省去强制原生“打开—取消”预查。不要重复尝试已经报 AT-SPI 不可用的输入方式。`preflight()` 先完成真实账号、同一空编辑页和历史检查，再按平台准备真实选择器。头条 Codex 法只在真实文件控件注册 waiter 并点击；知乎坐标法依当前截图真实鼠标单击“导入”→“导入文档”→弹窗实际文件控件，步骤间等待稳定，最后才打开原生窗口。工具栏只打开菜单时不能把它当文件选择控件；知乎不等待 browser filechooser。正确选择器取得后保持句柄，随后桥接 reserve / consume / saving，最后头条同一 chooser 一次 setFiles，知乎同一原生窗口单击准确 Word 行、确认选中后单击 Open 一次。不默认双击，不使用 TinyFish；窗口位置／尺寸改变重新截图定位。选择器故障发生在 reserve/consume 前，不消耗许可；两个 session 不能同时占有选择器。

`file-ready.mjs` 的 Node stat／SHA／复制只证明该读取端的字节，返回 `visible_in_browser:false`；runner 与服务端的 `visible_in_browser:true` 是执行者声明，不能反过来作为浏览器证明。官方 chooser 仅规定路径必须对浏览器可见，未公开 REPL／shell／浏览器宿主的解析关系。交接证据应分别注明实际 download.path、各文件系统检查与已有浏览器选择证据；具名副本校验成功不自动升级可见性声明。已有单次提交后受支持的只读 `input.files` 元数据可补充已选择文件线索，仍不证明 SHA 或成功导入。证据缺口应如实记录，不重复打开／取消或试传来补证。

当前 SDK 没有上传前的独立路径检查。对同一 browser 的真实 download.path，允许在同一 Cua 执行者完整读取原件与不覆盖的具名副本，SHA/size 均匹配冻结 Word 后，使用明确的 `same_browser_download` 交接类型。它保留 `visible_in_browser:false / visibility_unproven:true`，只证明该执行者核过两份字节；不能称为 browser 已读取或确认文件空间相同。runner 实际准备 chooser 后才 reserve/consume，父 bridge 冻结原下载路径、具名路径/名称、会话、执行者和全部字节身份；只有唯一正常 consume 后的本平台一次 setFiles 或原生 Open 才尝试实际访问。错误保留未知记录，验收仍需保存提示和完整独立回读。准确字段及加载顺序见 [官方 Cua 执行器](browser-upload-runner.md)。没有真实同 browser 下载及两份 Cua 字节核验时，新类型也不能使用。

真实连接器在 V115 的 reserve 参数校验中，把 `fileSchema.oneOf` 只声明 `visible_in_browser` 的局部分支当作封闭对象，拒绝其余全部已声明文件字段；当次尚无 attempt、consume 或文件提交。兼容修复将文件工具参数改为一个完整封闭对象，显式声明所有旧字段和可选新交接字段，不使用局部 oneOf 对象。服务端仍按真实 visible true/false 分支验证来源、字节、时间及选择器，不能因工具参数可表达就认定合法。此修复不改变 V115 的 runner/bridge 定义或提交规则。

完整预约和执行结束参数也保持平铺声明。离线核对发现，旧 `allOf / if / then` 的局部对象若被连接器封闭，会在预约根、preflight 或 existing_drafts 层错误拒绝正常字段；只测 file 子对象不足以覆盖整份请求。移除这些参数广告中的局部条件对象后，各模式所需的本人授权、历史身份、结束证明和空草稿检查仍由服务端严格验证。本篇后续一次预约仅保留了 INVALID_ARGUMENT 错误码，详细原因缺失，不能把这次实际错误断言为该条件对象问题。正常后续调用应保留服务端已脱敏的错误码和具体固定错误摘要，成功响应中的凭据仍只留易失内存，不在聊天、日志或文件中输出。

`checkpoint` 分开记录消费进度和真实 `submission_started_at / submission_returned_at`；消费不是实际提交证据。重启从不恢复 grant 或 chooser。picker 超时、setFiles 后断线和平台页面明确导入失败分别为 `picker_failure / submission_unknown / platform_import_failure`。只有平台真实错误文案才归为平台导入失败；审批拒绝和浏览器连接断开属于执行工具问题。

失败后通过 `diagnosticRequest(session,{operation_id,executor_id})` 取得非凭证诊断请求，交给原 authenticated bridge 执行 `record_article_upload_diagnostic`。两个 ID 是新生成的非凭证 UUID，不是 claim、delivery 或 consume token。相同 observation 的 operation ID 重试幂等，改变内容必须使用新 ID。工具仅追加枚举、时间和对应 attempt；不改租约、上传状态、许可或平台终态。可以在尚无 attempt、reserved 或 consumed 时记录，也可在租约结束后由原 owner 授权工具记录。checkpoint 恢复后保留受枚举限制的故障信息，未知旧 checkpoint 继续只读恢复。该日志是执行者报告，不是服务器证明平台收到了/没收到文件。

已有授权持续有效：同一人工任务的 `duplicate_tolerant_task` 授权不重复确认。服务端关联恢复协议仍须准确旧记录、Word、账号、实际执行停止及原有授权，不能复用旧许可。当前新默认执行器只支持正常首次私人导入，未知、重导、checkpoint 续传或未支持恢复分支阻断继续执行，保留旧草稿和记录并报告具体缺口，不为了完成任务改历史状态。下列历史未消费补丁说明不能替代当前执行能力。

2026-10-08 实际执行记录：兰香头条已单次导入、保存并重开，账本为 draft_observed，未做全量机器验收；知乎仍 reserved/未消费，页面检查被工具审批拒绝后连接断开，未提交。这不能称为知乎平台上传失败。正常求助排队无需再点击；恢复操作仅用于具体中断。

本站无法修复云端 AT-SPI 服务、浏览器传输或审批后端。遇到审批拒绝，停止原动作并保留 Word/草稿；不换路径规避审批。本文没有承诺网站服务器直接向头条/知乎上传，也不增加公开发布或定时发布。

V98 历史后续补丁的明确步骤绑定、授权 bridge 和恢复约束见 [V98 上传诊断与恢复补丁](upload-recovery-v98.md)。知乎 ui.importStages 必须区分 menu／dialog／file；当前默认坐标法只在 file 步开原生窗口，不等待 browser chooser。历史候选与当时尚未部署的描述不取代当前 handoff 的源码和方法。


V117 未消费许可缺口的历史复核契约见 [精确未消费恢复与回执交接](upload-unconsumed-continuation.md)。其中未部署描述对应当时补丁；当前生产状态以实际 handoff 为准，该历史文档不授予对真实记录执行恢复的权限，也不证明新默认执行器支持该分支。
