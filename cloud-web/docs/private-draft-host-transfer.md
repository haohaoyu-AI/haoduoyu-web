# 最终 Word 与两平台原生坐标私人草稿的衔接

本地实现从实际生产 V155 source commit `28e37238ffd0fad524629b7f47fed9e8e514085a` 修改。正常首次头条和知乎导入统一使用当前真实截图、动态坐标、真实鼠标单击，以及本次 prepare 的同一个原生文件窗口一次 Open。头条账号固定 `61556093362`，知乎固定 `ren-zhe-ai-chi-yu-52`；同一最终 Word 的字节、SHA/size、账号、历史及网站服务端 claim/attempt/CAS/单次消费/完整验收门禁保持不变。

`read_article_handoff.host_transfer` 与 `read_article_delivery_executor` 提供本次完整独立合同和可读源码；准确版本、SHA、大小及入口以本次真实 handoff 为准。主合同为两平台 coordinate/native，显式使用 `native_file_dialog`；本次增加 native 是正式源码中的合同修改，不能把 browser chooser 名义下的动作偷偷换成原生 Open。旧 browser/独立 runtime 仅保留已有显式兼容入口，不再是正常首次默认路径；不得自动回退、同时加载两套路径，或在任何审批拒绝、未知结果后切路重试。恢复、重导、旧 checkpoint 和被取消实例不能借本次正常首次 native 实现重获提交资格。

本次正常Sites源open成功，取得源时HEAD精确为V155基线；父级提供并校验12个原样官方helper，短期源凭据仅同执行器内存、原helper隐藏stdin，不落盘/转交，不使用archivePath/publish_on_push。父级实机报告与独立复审已放行并取得正式部署授权，本文是部署前review snapshot；具体部署结果以随后真实deployment回执为准，不凭取得源或构建声称已发布。当前禁止平台操作。

## 正常源码读取和审批

先读准确文章 handoff，再用本人连接的 `read_article_delivery_executor({article_id,expected_version,expected_sha256})` 读取完整普通 JavaScript。`metadata_only:true` 只核对已有完整源码；读源码不认领、不准备窗口、不消费许可。工具目录缺接口时使用正常目录刷新，不用原始数据库、私有 HTTP 或其他通道绕过授权。

CUA仅正常入口加载native-only完整普通定义及真实adapter；业务core/MCP/状态/全正文22图baseline/封面验收和父级桥仍认证parent内存，parent源码/closure/凭据不进入CUA。定义25567 bytes、SHA `7a48a202a29b0dc6381d577a6cb02e14968a4351071ff6611713eb2e887e5d5f` 未改；28k/20k/8k与8k transport计划预留、总64k硬限仍每call全量测。父级报告本次code31886、actual params32381、参数SHA `2bfeefdfe0b24dc3ca9ccd97096ddc8b0a9461854cfcf6ea3b75e123f15bc6ee`、isError=false，确切完整调用预算及正常加载已通过。来源parent-reported，编码环境未独立实机验收；静态源码descriptor的false不授予运行批准，也不否定该次加载。旧66291及101bytes超限失败保留。

不使用 node:vm、eval、源码字符串执行、未经官方支持的文件模块 loader、编码、压缩或拆分来绕过拒绝。旧 VM 加载和侧栏点击的审批拒绝继续生效，不重放原操作，也不借本次动态坐标变更重做被拒的侧栏动作。源码解析、字节预算、离线测试和构建结果都不保证真实宿主接受或平台成功。

## 输入、官方能力与同实例动作账本

认证 parent 保留 createPrivateDraftTransfer、业务状态和全 baseline；唯一原官方 CUA 宿主保留 native-only actor。通过 genuine 当前会话 proxy、canonical prepared 公开报告及真实直接工具记录绑定两端，不用跨进程 object=== 证明同一对象，也不让 CUA 调 parent closure。scope 绑定 article_id/platform/target_account/browser_session/executor_id/tab_id/host_id；两平台各自窗口与 attempt，串行，不共用已消费许可。

最终 Word 必须在该导入宿主只读核对 output_id、固定路径、SHA-256 与 size。parent 的业务 core baseline 冻结完整原标题、全部 paragraphs（不含原标题）、按序图像身份/锚点和每图 natural_width/natural_height；自然尺寸来自同一原 Word 的真实图像字节。缺尺寸返回 baseline_invalid，不猜、不由导入结果反向生成，也不靠 helper-only 检查。私有冻结正文不复制到 CUA 源码、交付、diff 或诊断日志。now 使用真实当前时间，不能重盖缓存 checked_at。

`inspect`、`preparePicker`、`writeTitle`、`reopenAndInspect` 和 native 单次提交方法均为项目回调，不是官方 API 名称。真正适配须来自当前官方文档与真实工具返回：截图、截图到鼠标坐标映射、实际鼠标单击、原生窗口身份/活动状态、文件名输入、命令完成语义、精确窗口关闭和独立重开读取。缺能力就在相应门禁前停止，不能填常量回执。

当前 native-only 项目实现为 createNativeStepSession、createNativeActionLedger、createParentNativeStepBridge 及父级 createParentImportGate，见 [分步协议](native-coordinate-step-protocol.md)。它们的 factory、callback 和 correlation IDs 都不是官方 API 或真实证据；旧 native adapter/bridge 不能自动回退。

actor step 仅 observe/validate/read_windows/click_prepare/click_filename/type_filename/click_open。observe 与 validate 可顺序多个只读实际调用，每条用同实例 epoch/ticket 登记、await落定；物理 commit 则只一实际 click或type，无前置await。parent观察和网站工具也保留其实际调用记录，不能以复合回调票据代替内部命令。不得 finally 无条件 settled；超时/失联/无法确认结束的取消保持 unknown。新 ledger 不接旧实例，不删记录或重盖 epoch。

## 当前页面和 prepare

`host.inspect(context)` 返回本次真实读取的准确 scope、editor_url、source=documented_host_observation、checked_at、实际登录本人账号证据、private_draft/pending/save_failed、真实独立标题字段和全部正文及逐图观察。缺失字段不能当正常。检查现有稿件和历史时，实际账号、current_editor_url、editor_checked/editor_empty、draft_list_checked、matching_editor_urls、prior_submission、checked_at 与 evidence_reference 必须真实；没有 attempt、空编辑器或空草稿列表不证明历史从未提交。

每次会改变页面或窗口的动作前，取得当前真实截图，以可见文字、上下文及明确语义定位唯一、启用且无遮挡的控件，再由本次官方坐标映射计算点击位置。截图必须对应当前视口、缩放、scene 与活动窗口；滚动、窗口或布局变化后重新观察，不能复用固定盲点坐标、双击、force 点击或隐藏侧栏。SVG 唯一、没有 aria/title/text 的候选和预期入口位置都不能证明导入语义。最近头条创作助手遮挡候选中心的真实失败保留；没有可证目标时停止。

`host.preparePicker(context)` 仅逐击打开并观察实际导入界面和本次原生文件窗口。每击后等待实际结果，不能把固定文本的立即检查或业务弹层当窗口。返回准确 scope、真实编辑器 URL、checked_at、ready=true、files_selected=false、submitted=false，并关联本次 native 窗口身份、创建轮次及 prepare 身份。prepare 不选文件、不 Open、不后台保存未 await Promise。窗口事实留在宿主内存，不打印对象或写 checkpoint。

## 父级桥与一次提交

`createParentNativeStepBridge` 与 `createParentImportGate` 留在父级，只调用当前本人网站 MCP，不向 CUA 提供 MCP 能力或凭据。真实 prepare 成功后才按顺序 claim、reserve、consume；头条使用 `claim_article`，知乎使用 `claim_article_delivery`。claim_token、delivery_token、execution_claim 和任何一次性秘密只留原父级内存。传给鼠标侧的仅是本次真实回执验证后的非秘密白名单许可，不是一个把请求随意转发到任意工具的加载桥。实际父级鉴权回调只验证当前同平台原始回执及权属；公共状态归一化不得虚构 `zhihu_saving` 或把头条 saving 响应套到知乎。

1. `transfer.prepare()` 在真实窗口和账号/文件/历史核对通过后返回 new_import 的 reserve 请求。
2. 父级保留准确 execution_claim，正常 reserve，只将真实非秘密结果传入 `acceptReserved`。本次 attempt 绑定由 parent-only 桥执行，关联原 prepare、同实例 ledger、Word、账号、窗口身份与创建轮次；CUA 不能自签 attempt 或凭空拼一个成功绑定。
3. 父级正常 consume，验证真实 `execute_import=true`、准确同一 attempt 和消费时间，再传入 `acceptConsumed`。不得重放消费或给丢失响应补一份成功常量。
4. 父级按平台正式写 saving：头条 `record_article_status(toutiao_saving)`，知乎 `record_article_delivery(saving)`。只有实际成功回执可进入 `acceptSaving`，不能以本地 phase 代替网站 saving。
5. 父级真实 gate auth 在 validate 前完成；validate 仅读取账号/tab/window/frame/Word等当前上下文，返回真实 dispatch_ready。父级本地同步核对取消、ready关联、指定动作和≤15秒时效，烧掉 ready并立即经原 transport派发一次物理click/type；commit前不再await auth或读取。文件路径输入后独立返回真实截图，经模型核实实际完整路径再对Open验证/一次派发；不按Enter。prepare/消费/saving/window/attempt/ledger不匹配即停；异常/取消/unknown不恢复资格，不再Open或切路。
6. `observe()` 只读观察同一页，实际 URL 关联同一 attempt 后由父级记录 draft_observed，再传入真实 `acceptObserved`。waiting 只允许继续观察同稿，不新预约或提交。
7. `fillTitle()` 仅向已证明为本次新稿、同一真实 URL 的空独立标题字段写完整原标题；非空正确标题跳过，其他标题不覆盖。写前后保留全文和图片身份，不缩题、不改正文或图注、不改旧稿、不公开发布。
8. `verify()` 观察实际保存，独立重开同一真实草稿，完整验收后提出 verified 请求。父级 `record_article_upload(verified)` 成功后，再按平台正式 completed/saved；`acceptCompleted` 只接受真实成功响应。服务端已结束成功租约时不重复 finish。

dispatch_ready必须带actor原始observed_at；父级检查该真实ready时刻不在未来且≤15秒，不能以本地now替换/刷新。上述operation/args/status是项目合同数据，不是公开发布许可；父级只分发准确对应操作。头条正式record_article_status(completed)，知乎record_article_delivery(saved)，不能混用状态。

## 保存、独立验收及只读结清

真实草稿 URL 须来自平台当前观察并通过正式 URL 合同：头条带准确 pgc_id 的 publish URL，知乎为 zhuanlan.zhihu.com 的准确 /p/<id>/edit；不能由预期 ID 猜 URL。保存回执须来自原页实际保存提示及首次保存时间；填标题后观察新的保存，不复用之前提示。保存、重开、最新读取应符合真实时间链。

`reopenAndInspect(context)` 独立打开同一真实草稿 URL，返回不同 tab_id、实际首次 reopened_at 与最新 checked_at。只读等待复用同一独立标签时保留原 reopened_at，不重新导航或重开。验收覆盖完整原标题、逐段全文、全部图片的真实身份、顺序、前后正文锚点、原始及显示比例、实际加载；图片 count、占位符、URL、首尾样本和保存提示不构成完整验收。逐图 SHA 是实际识别与冻结基准的关联，不能按序抄写冒充识别。知乎还须按原服务端合同验收已加载、对应冻结 Word 图的封面；本次一次 Word Open 许可不授权追加封面文件上传。

取消只阻止未来动作，不证明已发动作撤回。结清通过 purpose=settlement 的专用只读分支：仅读取同实例动作账本和官方真实窗口观察，不执行账号菜单、导航、保存、输入、关闭或重开动作。窗口读开始后 ledger 变化使观察过期。只有完整账本所有命令有真实结束证据，且当前官方能力精确证明本次窗口关闭，才能返回 actions_settled=true、chooser_closed=true 和准确关联字段。

Open/setFiles 返回、submitted=true、null 指针、cancel、本地变量清空或没有 modal 都不能证明关闭；部分窗口缺 title 时保守 false，不补空 title、不猜名字、不按几何过滤。native prepared 为 null 时不能猜 prepared_id/window_id/cycle、把另一个窗口补上或宣称关闭；若创建可能已经开始但没有可关联对象，保留未知与所有权，阻断 settleClosed。从未开始创建的事实也须来自新实例完整账本，不能借旧 helper 的 browser never_created 推断 native 安全。

settleClosed 的真实结果只处理宿主所有权，不替代网站 executor end/finish/release。未知不重放、不切路，保留原 Word、旧失败记录和全部真实 URL；有已消费 attempt 时按其准确 scope 正常记 executor end，再走原正式结束流程。缺 settlement 证据不能假称释放或清空 claim。正式结束后回读网站状态，按真实响应报告完成或剩余阻塞。

## 验证结果与真实接入边界

最终本地结果：套件900/900、actor130/130、parent step bridge17/17（17245 bytes，SHA `c93d9010be8bdc9d5fe9753d426a830167c463a2182c1e20d5ba3f2af50d113b`）、core129、真实SQLite/Word/schema集成35组、reader17/HTTP1/MCP2、budget26；tsc/build exit0。标准lint仍5条V155既有no-explicit-any，不称全lint通过。集成56次提交全部synthetic，真实CUA/platform/prodwrite为0；证据见 [最终套件](../evidence/native-coordinate-offline/native-step-v3/native-reviewed-test-summary.final-v3.json)、[reader/budget](../evidence/native-coordinate-offline/native-step-v3/audit-runtime-budget.final-v3.json)、[集成日志](../evidence/native-coordinate-offline/native-step-v3/private-draft-transfer-integration.mjs.final-v3.log)。旧候选及旧源SHA/失败记录不覆盖当前身份。

父级报告原CUA加载runtime `2026-10-11-native-step-host-3`，phase=`awaiting_live_editor_binding`，actor_created=false、ui_calls=0、credentials=false，无reservation/consume/upload。该parent-reported入口加载与完整预算已经通过，编码环境未独立实机验收。缺口是实际actor/transport接线、窗口语义/关闭、私人保存、独立全文逐图及知乎封面验收；仍按 [原宿主真实验证](native-coordinate-host-validation.md) 执行，不声称稳定或平台成功，不释放旧未知实例。

此为部署前审阅快照：父级实机报告及独立复审通过，用户已明确授权正式部署，父级已开始原官方流程前校验并保持私有访问/权限；最终部署状态以随后deployment回执为准。当前禁止平台操作，后续固定陈楚生Word实测由父级原宿主单链执行，编码环境不上传。
