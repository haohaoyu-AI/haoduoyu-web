# 私人草稿投递：两平台原生坐标法

本次从正式 V155 commit `28e37238ffd0fad524629b7f47fed9e8e514085a` 修改本地源码，将正常首次头条、知乎投递统一为 `host_transfer` 的 coordinate/native 主合同：最终 Word → 真实截图与单击 → 同一原生文件窗口 ready → 父级一次许可与 saving → 单次 Open → 完整独立验收。准确源码版本和摘要以本次 handoff 为准，详见 [配图与草稿衔接](private-draft-host-transfer.md) 和 [原宿主验收步骤](native-coordinate-host-validation.md)。父级桥仅在原父级内存调用网站工具，凭据不进入 CUA；新完整程序仍须当前正常官方宿主审批，不重放被拒操作。

本次正常首次投递两平台均为坐标法/native，这是显式合同修改；没有相应官方宿主能力就停止，不自动切回 browser、filechooser/setFiles 或旧 runner。旧 browser 和仅显式 picker_mode 的独立入口只保留其既有兼容授权，不作为新默认，也不因本次修改扩大恢复/重导、旧稿修复或 checkpoint 权限。以下历史 runtime 和真实测试记录保留，仅说明原路径，不批准新程序。

历史方法修改最初核对已发布 V148 commit `257437477e3c8f6557e7c5da987bd885c179e556`；历史兼容独立执行器 runtime 为 `2026-10-10-private-draft-executor-8`／contract 7、入口 createPrivateDraftExecutor。本次主合同改为双平台 host_transfer；生产版本及部署结果仍以实际 handoff 和交付回执为准。

V150 实联曾因完整旧 runner 109108 字节超过当次 64000 严格自动审核限制而拒绝；这个拒绝不是平台导入失败。新实现是完整、可读、独立的首次私人导入状态机，不拆分、编码、压缩或动态加载被拒的旧源码。源码分页只用于读取与摘要核验，不授权分块执行；满足预算仍不保证批准或平台成功。V152／runtime 7 已在原官方 CUA 真实整对批准加载，SHA／入口匹配，头条真实账号 query 检查通过；只读 preflight 随后把实际空编辑器的占位 decorator 计为正文而阻断，已 cancel／settled，未 claim、开选择器、申请许可或提交。runtime 8 只修正准确实见占位及观察 `chrome_css` 的只读过滤，保留同词真实正文、其他非空内容及重复稿保护；本版本真实加载和保存／图文验收仍待父线程继续测试。没有任意本地文件模块加载的官方支持证据，不提供 local-file loader 方案。

| 平台 | 固定名称 | 默认模式 | 实际提交动作 |
| --- | --- | --- | --- |
| 头条 | 坐标法 | `native` | 当前真实截图识别语义明确、无遮挡的控件，动态坐标映射后真实鼠标单击；在本次 prepare 的同一原生窗口核对准确 Word，再单击 Open 一次。 |
| 知乎 | 坐标法 | `native` | 用当前页面截图定位，真实鼠标单击导入菜单和文件控件；在原生文件窗口单击准确 Word 文件行，确认选中该 Word 后单击 `Open` 一次。每步等待页面或窗口稳定。 |

正常首次主合同两平台为 `upload_method:'coordinate'`、`picker_mode:'native'`，native channel 显式为 `native_file_dialog`；错误账号、平台或不匹配模式在创建会话前拒绝。历史 `upload_method:'codex'`/browser 仅适用于明确选择且已有授权的兼容路径，不从宿主能力猜默认方法，不在失败后自动选择。

原来只显式指定 `picker_mode`、不指定 `upload_method` 的独立测试入口仍兼容其既有 `browser` 和 `native` 模式，沿用原 Word 身份和一次许可保护，不借新默认扩大测试范围。用户此前独立附件测试的豁免不扩大为网站守卫豁免。兼容入口不自动按能力选模式，不在超时、未知或审批拒绝后切换或追加提交；旧 VM/runner/侧栏拒绝也不能用本次新坐标法规避。

新默认 host_transfer 只支持正常首次私人导入，保留完整原文 Word、账号、原生窗口、一次许可、保存和独立完整回读门禁。重导、正文修复、旧 checkpoint 续传和浏览器恢复不借本实现继续，保留真实已有记录并报告未支持分支；现有服务端恢复协议和独立测试权限不因此扩大。旧 createDraftUploadRuntime/createPrivateDraftExecutor 不成为自动回退或规避拒绝的入口。

两平台坐标法要求当前官方宿主实际提供截图、截图与真实鼠标坐标映射、单击、scene 当前性、原生窗口身份与活动状态、文件名输入、精确窗口关闭及每类操作的完成语义。项目 createNativeCoordinateAdapter 等 callback 及 coordinate_contract/source 字符串不是官方 API，也不是窗口证据；不能补声明冒充已接入。网站不会自行创建能力，缺项停止，不虚构控件、文件选择或成功回执，不使用 TinyFish。

两平台均不双击，不 force 点击、不隐藏侧栏。窗口位置、尺寸或页面布局变化后重新截图定位，不能盲点固定位置。只打开菜单或文档弹层不代表真实原生窗口 ready；默认路径不注册 browser filechooser。准备与检查只打开、观察原窗口，不选文件或提交；准确 Word 的选择/文件名输入和唯一 Open 仅在本次父级正常消费许可及 saving 真实回执通过后执行。

正常流程沿用已有授权：读一次 read_article_handoff，复用同宿主最终 Word，核对实际 SHA256/大小；真实 prepare 同一原生窗口之后，父级按平台正式 claim/reserve/consume，进行 parent-only attempt 绑定，只有本次 execute_import=true 且本平台 saving 实际写回成功才提交一次。全部真实官方动作与 native 适配共享同一新实例 ledger。真实保存后独立重开同一私人草稿，核对完整原标题、全文、逐图身份/顺序/前后锚点/原始及显示比例/加载，知乎还验收真实已加载封面。已完成的平台保持只读，另一平台保留独立 claim、attempt 和状态。上传阶段不重新生成 Word 或配图，不公开或定时发布，不改删用户稿，不扩大权限，不批量重传旧完成稿。

保存、明确失败和未知结果分别保留真实状态。超时、连接中断、响应丢失或空编辑器不能证明失败；已消费许可不能重放，也不能自动切换方法再提交。正常首次历史不能确认为 never_attempted 时，在窗口和许可前只读阻断，不自动走旧 verify_existing 分支。成功正式 completed/saved 已按后端规则结束租约，不再 finish 冒称额外释放。未完成/未知时，取消后续动作并 await 已发动作结束，专用只读 settlement 分支获取同 ledger 与精确窗口关闭证据，不触发普通 inspect 的账号导航、保存或重开动作；native prepared=null 时不补造关联，不凭无弹窗推断安全。已消费的准确 attempt 按原正式流程记 executor end，再 finish 仍有效的本平台执行；缺 settlement 证据不能假称释放。只按真实响应及回读报告结果，保留 Word、旧 attempt 和全部真实 URL。详见 [两平台衔接合同](private-draft-host-transfer.md)，原 [上传 SOP](article-upload-sop.md)、[执行器接入](browser-upload-runner.md) 与 [原生续接](browser-upload-native-continuation.md) 仍按各自准确合同适用，不作为自动回退路径。

## 已提供的真实测试与本轮验证边界

用户提供的前次云电脑实测使用同一份《无双》Word，三份私人草稿均真实保存并独立重开：

| 前次实测方法 | 总耗时（秒） | 提交至保存（秒） |
| --- | ---: | ---: |
| 头条 Codex 法 | 65.753 | 39.045 |
| 头条坐标法 | 117.066 | 34.517 |
| 知乎坐标法 | 111.096 | 24.071 |

坐标法总耗时包含误点恢复，不能作为本次速度或稳定性承诺；这些是历史对照，不证明新双平台 native 合同获准。当时标题栏为空，原标题在正文，完整图文质量尚未验收，因此“真实保存并重开”不等于网站完整 verified/completed/saved 验收已通过。

源码/离线检查及父级实机报告、独立复审已放行，用户明确授权正式部署；此文档为部署前review snapshot，父级正走原官方流程，保持私有访问/权限，部署结果由真实回执确定。当前禁止平台操作，后续由父级唯一原宿主单链复用固定Word验收，编码环境不操作平台。合成检查不证明平台保存或稳定性。

native-only actor与认证parent业务core分工遵守 [步骤协议](native-coordinate-step-protocol.md)：validate前gate auth，readonly dispatch_ready后使用真实observed_at≤15秒同步检查/烧ready/立即单次物理commit，无前置await；取消不收回已发动作，原Word真实natural dims和display比例双核。最终套件900/900、actor130、parentbridge17、core129、集成35（56 synthetic提交）、reader17/HTTP1/MCP2、budget26通过；tsc/build exit0。标准lint仍V155既有5条any错误，未全通过；旧711/98/29/791及失败历史保留。

父级报告本次完整定义+真实adapter正常CUA加载code31886、params32381，isError=false，host-3/awaiting_live_editor_binding/actor_createdfalse/ui0/credentialsfalse，无预约、消费或上传。该确切入口和完整预算已通过，来源parent-reported非编码环境独立实机验收；静态source descriptor false仅不授予运行许可。实际actor/transport绑定、真实窗口/关闭、私人保存及完整正文逐图/封面验收待实测，不作稳定性承诺。
