# 两平台 native 坐标法的原宿主真实验收

本文件给小鱼及唯一原官方CUA宿主执行。Codex负责代码与离线证据；父级已报告确切完整程序/真实adapter正常加载，编码环境未独立实机验收。本文是部署前review snapshot，不凭本地结果报告平台成功或旧实例释放；当前禁止平台操作。

父级实机报告和独立复审已放行，用户明确授权正式部署，父级正走原官方流程前校验，保持现有私有访问和权限。具体是否部署、正式版本/URL与成功结果由随后deployment回执确定；本文不假称仍未发生或已完成。后续原Word实测由父级唯一原宿主单执行链安排，编码环境不操作平台。

## 已取得的正式源和固定材料

部署前只读基线为V155/source `28e37238ffd0fad524629b7f47fed9e8e514085a`，当时latest155、deployment成功、域名 `https://haoduoyu.xyz`。正常source open取得源时HEAD匹配；12个原样官方helper核验，短期源凭据同exec内存/原helper隐藏stdin，不落盘/转交，不使用archivePath/publish_on_push。本文记录部署前来源，当前部署进展只由正式回执确认。

| 材料 | 固定身份 |
| --- | --- |
| 文章 | 陈楚生；article_id `d29d424a-c09d-4db2-af4d-213ec41716d2` |
| 原最终 Word | 11,947,179 bytes；SHA-256 `1166925f3585033cf77741d1de594b2681d36260763c7ecc7e8aa35087b296e0`；22 图 |
| 原 V155 独立核心 | 20,954 bytes；SHA-256 `ee63ca55f457f283156131d2a783f284b66716a74ab770537acfdd6cd2f4bdc2`；已从恢复的原宿主文件前 185 行核验 |
| 原完整宿主文件 | `chen155-complete-code.js`；45,651 bytes；SHA-256 `20973044e1c1b1c343d0bdb7759ff05167e10bcb2e25858bf4e2e65922a04e8f`；原完整文件含私有冻结正文，不进入交付 |
| 头条账号 | `61556093362` |
| 知乎账号 | `ren-zhe-ai-chi-yu-52` |

本次双平台 core 修改须按完整 diff 审查；旧核心摘要、旧完整 JS 审批和当前构建 hash 不能批准新适配。保留原 Word、旧取消实例、旧失败/unknown、旧 claim/attempt 和真实 URL，不重制 Word，不改订阅或权限。私有冻结全文及 22 图基准留在原父级/原宿主内存，仅回传必要验收结果和非秘密关联身份。

## 接入前的小鱼审查

- 核对正式源 diff、当前 handoff 的完整源码版本/SHA/size、双平台 coordinate/native 和 `native_file_dialog` 显式合同；旧 browser/独立 runner 只保留已有显式兼容，不自动切路。
- 核对当前 native-only actor/createNativeActionLedger/createParentNativeStepBridge 与 parent业务core/gate 的职责边界，见 [步骤协议](native-coordinate-step-protocol.md)。这些是项目 factory/callback，不是官方方法；parent源码、MCP、全正文22图baseline/封面verified、鉴权和秘密留原父级内存，CUA仅非秘密白名单数据。
- 使用当前官方文档或实际工具形状逐项证明截图及坐标映射、真实单击、scene 当前性、活动原生窗口身份、文件名输入、精确关闭观察、每种动作真实完成语义，以及独立全文逐图读取能力。缺项就写清停止点，不能填 mock 或常量回执。
- 同一个真正新实例、同一个 ledger 覆盖 prepare、native submit、inspect、title、reopen 和所有内部官方动作。每条命令/等待独立票据，外来 epoch、复制/重复票据拒绝；取消/null 不删历史。只包住复合回调不能替代其内部动作登记。
- 当前完整普通 JS 与适配/初始化作为正常入口的一次可读审批，保留原调用、UTF-8 字节数、SHA 和非秘密响应；不把源码分页当分段执行。旧 VM 加载、旧侧栏点击拒绝不得重试、换工具、编码或拆分规避。

## 每个平台的实际顺序

1. **只读核对准确范围。** 观察登录本人的账号、实际编辑器 URL、文章、历史及已有稿件。绑定 article_id/platform/target_account/browser_session/executor_id/tab_id，shared 适配同时绑定 host_id。同导入宿主重新核对固定 Word 路径、SHA/size；缺历史不能填 never_attempted。两平台串行，不同平台不共用 attempt、window、permit 或 URL。
2. **截图识别后逐次单击。** 每击前当前真实截图，明确控件语义、唯一、可见、启用、无遮挡，再由官方截图坐标映射定位。layout/scene/窗口变化后重新观察；不用固定盲点、双击、force 或隐藏侧栏。头条先前无 aria/title/text 的 SVG 候选不能仅因唯一就继续点。
3. **真实 prepare。** 逐击观察实际文档界面和本次原生文件窗口。ready 绑定准确 scope、真实 URL、fresh checked_at、窗口身份、创建轮次与 prepared identity；files_selected=false、submitted=false。prepare 不选文件、不 Open，不把业务弹层、无错误返回或预期窗口当成功。
4. **父级 claim/reserve/consume。** 只在真实 prepare 成功后，父级通过准确平台正式 MCP 取得 claim，再 reserve，再 consume。parent-only attempt bind 关联同一 scope、prepare、ledger、Word、窗口及真实 attempt；不能由 CUA 自签。头条用 claim_article，知乎用 claim_article_delivery；所有凭据只原父级内存，不进入 CUA、代码、截图说明、Library 或日志。
5. **真实 saving 门禁。** 确认同一 attempt 的 execute_import=true、许可仍新鲜；头条 record_article_status(toutiao_saving)，知乎 record_article_delivery(saving)。鉴权回调应验证各平台真实响应，不能伪造 zhihu_saving。只有网站实际成功 saving 后才能提交。
6. **validate后一次物理派发。** 父级真实gate auth先于validate，validate仅读当前tab/window/frame/Word等并逐调用登记await；返回dispatch_ready后父级本地同步核对取消、真实ready及≤15秒，烧ready立即原transport发送指定一次click或type，commit无任何前置await。文件名输入后须返回真实图，由模型核对完整路径，再验证/派发一次Open，不按Enter。取消validate阻断后续commit，不声称撤回已发动作；错误/unknown不恢复资格或切路。
7. **同稿观察及空标题补填。** 读取实际导入、保存状态和真实草稿 URL，记同一 attempt 的 draft_observed。仅本次新稿且独立 title 确实为空，填完整原标题；非空正确标题跳过，其他标题阻断，不覆盖旧稿、不缩题或改正文。waiting 只读同稿，不重新预约或上传。原页真实保存和补题后新保存分别观察。
8. **parent独立全部验收。** 真实保存后独立标签打开同一真实草稿URL。parent业务core中22图natural_width/natural_height须来自同一原Word真实图像字节；缺dims baseline_invalid，不猜、不仅helper校验。完整原标题/逐段全文及逐图身份、顺序、前后锚点、加载、实际自然和显示尺寸/比例分别核对。少一段/图、锚点错、比例失真或未加载不通过；知乎真实已加载封面对应固定Word图，本次Word Open不授权追加文件提交。
9. **正式 verified 与 completed/saved。** 父级先按准确 attempt 写 verified，成功后头条正式 completed，知乎正式 saved。仅实际服务器响应能报告 done，不能将保存提示、重开、验收候选结果或旧平台状态当完成。成功正式流程已经结束租约时不重复 finish。
10. **失败/未知正式收尾。** 取消后续动作，保留原 Word、旧记录和 URL，不能重放或切路。purpose=settlement 只读专用分支读取 ledger 与官方当前窗口，不调用普通 inspect 内账号导航、输入、保存或重开。全部实际动作结束及精确匹配窗口关闭证据齐备才返回 settled/closed。再按原正式 executor end/finish/release 流程及实际回读报告结果，缺证据就保留阻塞，不能假称释放或清空 claim。

最近头条 `document_dialog_unconfirmed` 是业务未确认，isError=false，不是审批拒绝；当时无 chooser/预约/消费/提交，旧实例已 cancel，主 claim 已正式 release 且回读为空。最新真实截图证明创作助手挡住候选中心并命中侧栏。该旧实例和目标证据不复用，本次方案也不重做此前被拒的侧栏动作。

## 只读 settlement 的保守限制

actions_settled 需要真正新实例完整 ledger 的所有命令均有当前官方合同确认的终结证据。窗口读取前后状态必须同一不可变 ledger；读取期间新动作或回调变更使结果过期。保存业务 unknown 不等于动作仍在运行，动作 fulfilled 也不保证结束；完成分类器须逐 API 判断。

chooser_closed/native_dialog_closed 必须是当前官方支持的实际窗口关闭观察，关联同实例、同 cycle、同 window 和 prepared identity。Open/setFiles 返回、submitted、cancel、null、无 modal 或本地清空变量都不替代关闭证据。Sky 部分窗口缺 title 时保守 false，不补 title=''、猜名字或按几何排除。

native prepared=null 不能补造 prepared_id/window_id/cycle，不能把陌生窗口或“没看到弹窗”当本次窗口已关。创建可能开始却无匹配对象时保持未知与所有权，settleClosed 阻断；完整新 ledger 的确从未开始创建也须走明确支持的只读分支。旧 browser helper 的 never_created 只描述 browser 对象事件链，不能自动证明 native 未创建。任何缺口不得拿新 ledger、旧 checkpoint 或重置实例消除。

## 回传证据与待验证事项

| 阶段 | 应回传证据 |
| --- | --- |
| 本地与审批 | V155 HEAD、完整 diff；本次源码/完整调用 bytes+SHA；当前正常入口审批原请求及真实结果；能力缺项 |
| scope/prepare | 本人账号、历史、真实 URL、同宿主 Word SHA/size；每击前截图和语义/遮挡/scene 证据；prepare 未选/未提交及精确窗口/轮次 |
| 父级门禁 | prepare 后真实 claim/reserve/consume 与 parent-only attempt 绑定关联；execute_import=true；准确平台 saving；非秘密许可及单执行链 |
| 提交/保存 | 同窗口固定路径及一次 Open 动作记录；真实完成回执；实际同稿 URL、保存时间、空标题证据和完整标题 |
| 独立验收 | 独立 tab 与 reopened/read 时间；完整正文对照；22 图逐张身份/顺序/前后锚点/比例/加载；知乎封面；私人稿状态 |
| 正式结束 | verified、completed/saved 或真实失败/unknown；只读 settlement 原始窗口/完整 ledger；正式 end/release 及网站回读；剩余阻塞 |

最终离线套件900/900、actor130、parentbridge17/17、core129、SQLite/Word/schema35组（56 synthetic提交）、reader17/HTTP1/MCP2、budget26通过，tsc/build exit0；标准lint有V155既有5条any错误，不报全lintpass。见 [最终套件](../evidence/native-coordinate-offline/native-step-v3/native-reviewed-test-summary.final-v3.json)、[reader/budget](../evidence/native-coordinate-offline/native-step-v3/audit-runtime-budget.final-v3.json)。合成宿主测试真实CUA/platform/prodwrite0，mock不进入真实证据栏。旧101bytes预算失败、711/98/29/791历史和旧源SHA保留。

父级报告原CUA正常加载完整定义+真实adapter：code31886 bytes、actual params32381 bytes、参数SHA `2bfeefdfe0b24dc3ca9ccd97096ddc8b0a9461854cfcf6ea3b75e123f15bc6ee`，isError=false，runtime host-3、phase awaiting_live_editor_binding、actor_created=false、ui_calls=0、credentials=false；无reservation/consume/upload。来源parent-reported，编码环境未独立实机验收。该次完整预算和入口已通过，静态source descriptors仍false只表示不授予运行许可。ready仍用原observed_at≤15秒；实际actor/transport接线、窗口语义/关闭、平台私人保存和全文逐图/知乎封面验收待实测，当前禁止平台操作，不作稳定性承诺。
