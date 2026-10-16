# 私人草稿执行器与官方工具接入

当前正常first-import两平台统一coordinate/native步骤新入口：CUA完整native-only createNativeStepSession，parent用createParentNativeStepBridge保留业务core/MCP/全baseline与真实权限，参见 [步骤协议](native-coordinate-step-protocol.md) 和 [衔接合同](private-draft-host-transfer.md)。observe/validate只读逐调用登记await；父级validate前gate auth，真实dispatch_ready后本地同步cancel/原observed_at≤15秒检查、burn并立即派发指定一次click/type，commit无前置await。父级报告确切完整定义+真实adapter正常加载code31886、actual params32381、isError=false；该次入口与完整预算已通过，来源parent-reported而非编码环境独立实机验收，actor_created=false/ui0/credentialsfalse，无预约消费上传，实际actor/transport和平台验收待实测。静态source descriptors仍false仅不授运行许可。下方executor8/browser/旧runner仅历史显式兼容，非当前默认，不回退或重放拒绝。本文为部署前review snapshot，用户已授权正式部署，具体状态以deployment回执为准；当前禁止平台操作。

历史兼容执行器在其原授权工具会话中连接一次许可与真实文件提交，当时分流头条Codex/browser、知乎coordinate/native；这个历史分流不作为新默认。以下保留原操作说明和失败记录，不按可用能力切换。两条旧路径仍须真实选择器、reserve/consume、execute_import=true和saving，随后独立完整验收。当前两平台步骤与前次实测边界见 [方法说明](private-draft-methods.md)。网站后台不能自行启动或修复小鱼云电脑。

下文历史runtime为 `2026-10-10-private-draft-executor-8`／contract7、入口createPrivateDraftExecutor，原createDraftUploadRuntime也为历史兼容，均不是当前步骤主合同默认入口。准确生产版本及发布状态以实际handoff/交付回执为准；不借新实现恢复重导、旧checkpoint、浏览器恢复或正文修复资格。

头条、知乎共享的服务端消费 SQL 已采用平衡分组，避免 D1 表达式深度超限。Word 成稿时完整严格核验正文和嵌入图片一次，保留原有五字段服务器回执；后续上传检查每次仍实际读取存储文件并核对完整 SHA256/大小。只有完整冻结原文摘要、完整图片清单摘要、Word 摘要、图片数量及服务器回执全部匹配时，才复用已核验的文字和图片基线，不重复解压同一份 Word。无完整契约、回执缺失或不匹配、原文已清理时，仍走完整解析与图片检查。没有跨请求的内存验证缓存；平台接收和保存仍由执行者实证验收。

正常流程是一次 `read_article_handoff` → 同一执行者取得最终 Word 并一次核对实际文件指纹 → 准备真实选择器 → reserve/consume → 一次 Open 或 setFiles → 私人保存 → 独立重开并完整核对标题、正文、图片及知乎封面。正常进展不额外调用恢复或诊断，也不逐步要求用户确认；沿用当前任务已有授权。出现明确异常才读取具体诊断或按对应恢复协议处理。

平台单纯提示“标题超过 30 字”或发布标题过长时，只读观察该提醒，保留完整原标题，继续私人草稿保存与独立验收，不自动缩题或发布；新执行器不生成 `title_length_warning_observed` 事件。长度提醒本身不能证明保存失败，也不能证明保存成功；仍须真实保存提示和完整独立回读。明确出现“保存失败”“未能保存”“无法保存草稿/文档”、`Save failed` 或 `Failed to save` 时按 `platform_import_failure` 保持未完成，保留现有稿并报告，不能继续写入或验收；原标题或正文与冻结内容不同仍拒绝验收。历史 checkpoint 中的标题超限失败仍只读，不因这项修复恢复旧许可。

## 文件和可调用入口

- `scripts/browser-upload/file-ready.mjs`：`prepareNamedWord` 只复制已经合法取得的文件，核 SHA/size，具名 `.docx`，禁止覆盖。它不证明浏览器能看到路径。
- `scripts/browser-upload/private-draft-executor.mjs`：`createPrivateDraftExecutor` 和 `createZhihuAccountReader`，默认完整独立状态机，保留文件、账号、许可、真实选择器、保存和独立完整回读门禁。
- `scripts/browser-upload/cua-draft-runner.mjs`：历史 `createDraftUploadRuntime`，保留兼容与离线回归；不因当前工具输入限制而拆分加载它。
- `scripts/browser-upload/bridge.mjs`：`createArticleUploadBridge`，真正 MCP 与浏览器之间的明确桥接。支持既有账本／平台状态、只读预览与明确本人授权的正常恢复工具。claim 和新关联 attempt 的单次 consume token 永远只留在调用工具的内存，向 Cua 返回前移除。
- `scripts/browser-upload/emit-cua-module.mjs`：输出完整执行源供摘要与预算检查。输出成功、JS 格式合法或大小低于限额，均不证明当前 CUA 会接受执行。
- `scripts/browser-upload/observed-profiles.mjs`：真实观察过的头条账号/标题/正文结构，未观察的菜单/输入器/保存提示/正文图筛选明确留空。缺项必停，不能拿示例假冒生产 locator。
- `read_article_upload_runtime`：通过本人网站连接只读取得源码或 `metadata_only` 摘要，不依赖浏览器下载。`read_article_handoff.upload_runtime.modules` 已直接提供两份源码的完整 UTF-8 SHA256/大小；已有下载可立即用它核对。
- `/api/articles/upload-runtime?module=runner` 和 `?module=bridge`：本人网站正常鉴权下的附件下载备选入口，须按当前工具文档的下载事件流程取得真实下载，不能仅当普通页面打开。每次从 `read_article_handoff` 取得最新描述；健康工具会话已加载同版 runner/bridge 时直接复用，不逐篇重下载。缺失或版本不同时才下载，核对版本并校验源码与响应头摘要；下载不认领、不恢复、不消费，也不操作平台。

## 加载和接入（父执行者）

1. 每次先读准确文章的 `read_article_handoff`，核对最终 Word、两平台进度和最新 runtime 描述。按官方工具初次调用规则取得/复用当前授权 `browser`，读完整 browser 文档；已有会话不要 reset、重连 CDP 或改网络。已保存头条草稿保持只读，知乎继续使用独立 delivery claim 和 attempt。
2. 先核对 handoff 默认 runner 入口确为 `createPrivateDraftExecutor`，并取得 runner／bridge 的准确 `runtimeVersion`、完整 SHA256 和大小。正常源码工具的 offset／next_offset 分页只用于读取：首块传准确 `article_id/module/expected_version/offset:0`，后续携带首块 `sha256` 作为 `expected_sha256`，按顺序连接 `source_text`，核对每块及整份 UTF-8 摘要。已有真实下载缺少响应头时可用 handoff 摘要核对，不必重下载。`standalone_js` 只描述源码格式，不授予执行权限。

   完整独立程序须通过当前官方 CUA `js` 正常单次程序执行及自动审核；bridge 则在对应 authenticated 工具宿主正常完整加载。升级到本版本时，runner 和 bridge 均须核对新版本及新 SHA，在新的健康对应会话正常加载，不复用旧 runtime（包括已加载的 runtime 7）闭包、旧窗口或旧许可。之后只有已经正常接受、仍健康且版本／完整 SHA 均匹配的定义才能复用。所有实际动作在本次工具调用内 await 到结束；需要下轮截图判断时按明确 `native_pending` 续接，不能假设未等待 Promise 会跨工具调用继续。

   V150 实联曾因完整旧 runner 109108 字节超过当次 64000 严格自动审核限制而拒绝。不得拆分执行、编码、压缩、换工具或动态加载该被拒源码绕过限制。新入口是完整独立实现，不是被拒模块的分块包装；符合预算不等于获得批准，更不等于平台成功。没有任意本地文件模块加载的官方支持证据，因此本说明不提供 local-file import／loader 方案；官方 `@oai/sky` 示例不能推导任意模块支持。普通 Node 进程也不能据此连接用户浏览器。源码读回和摘要核验都是只读，不能代替正常宿主接受测试；拒绝或支持不明时停止并报告具体 blocker。网站部署不热替换活动闭包，旧 checkpoint 只留审计。
3. 在同一个官方 Cua 会话执行：

```js
// 知乎菜单型账号：核验页必须属于同一 browser/executor，独立于编辑页和列表页。
// verificationTab、avatarMenu、ownProfileLink 来自本次官方工具的真实页面观察。
let accountReader = platform === 'zhihu'
  ? createZhihuAccountReader({verificationTab, menu: avatarMenu, accountLink: ownProfileLink})
  : undefined;
let draftRuntime = createPrivateDraftExecutor({browser, nativeFilePicker, accountReader});
let draftSession = draftRuntime.createSession({
  article_id, platform, target_account,
  word_sha256, word_size, browser_session, executor_id,
  upload_method: platform === 'toutiao' ? 'codex' : 'coordinate',
  baseline: {title, paragraphs, images},
  ui, owned_new_draft: true,
});
```

`baseline.paragraphs` 不含 Word 原题，`images` 为 `[{sha256,after_paragraph}]`。图锚点仍使用 Word 原题=0。`ui` 各 binding 是本次实际 DOM 观察得到的 `{css}`、`{role,name}`、`{text}` 或 `{placeholder}`，外加 `observed_url/observed_at`；所有会点击的控件额外有实读 `identity:{tag,type,aria_label,title}`（至少一个身份字段），不接受空身份或没有名称的普通按钮；账号 href 用已实读的 encoding。`body.image_css` 必须是实际正文图片 selector，排除 toolbar/resize 图标，不可默认全 `img`。每个 binding 必须唯一且可见，点击前检查真实文字，发布/定时/删除控件一律阻断。

头条 `encoding:'toutiao_profile_href'` 仅增加允许完整本人主页路径上的精确单项 query `?enter_from=mp_profile`；真实 protocol-relative href 仍按 HTTPS 解析。HTTPS、无凭据／端口、准确 `www.toutiao.com`、完整 `/c/user/{target_account}/` 路径和目标 ID 继续核对，其他 query 和非空 fragment 继续拒绝。知乎账号 URL 规则不放宽。

空编辑器读回只过滤同时匹配本次观察绑定 `chrome_css` 和受支持结构的 UI 占位／装饰控件；头条实见 `span.syl-placeholder.ProseMirror-widget[ignoreel=true][contenteditable=false]` 还须无子元素、文本准确为“请输入正文”。真实同词正文、其他非空内容和重复稿仍阻断首次导入，不改 DOM 或全局删字符串。

历史executor8的 `upload_method` 平台绑定为：codex对应头条/browser，coordinate对应知乎/native；下述省略字段/默认模式说明只属于该旧显式兼容路径，不是当前正常first-import默认。旧方法指定错平台/不匹配模式仍拒绝，不借本次修改扩大旧测试。当前两平台native-only步骤必须真实官方能力及审批，项目声明不是实际能力；不伪造适配器，也不等待browser chooser兜底。

原仅显式 `picker_mode`、不带 `upload_method` 的独立测试入口继续兼容 `browser`／`native`，内部不赋固定方法名称，沿用其既有独立测试授权和单次提交保护。不能借网站默认规则取得新测试授权，也不能把非默认平台／模式称为两个固定方法名称。原显式 `native` 测试仍须真实宿主接好既有 `prepare/inspect/submit` 契约；知乎原显式路径保留原 DOM 菜单步骤，不被自动改为网站截图三步动作。独立附件直传豁免只适用于先前明确授权的测试，不扩大网站守卫豁免。模式在会话创建时固定，不自动按能力选路。任何等待超时后先停止旧路径，读取现有记录和许可状态，再按协议处理，不能继续在同一失败会话换通道。

### 知乎头像菜单中的账号读取（native-fast-2）

知乎头像菜单关闭后，自己的 `/people/{账号ID}` 链接可能删除或隐藏。当前页仍唯一可见的账号元素继续直接校验；账号不符、定位歧义不允许用另一页覆盖结果。链接删除或隐藏时才调用 `accountReader.inspect(context)`，不可删掉账号检查或只传以前核对过的 ID。

源码自带 `createZhihuAccountReader`，无需另找私有接口。宿主用受支持 browser 方法在同一浏览器创建专用核验标签页，在 `https://www.zhihu.com/` 实际观察头像菜单入口和菜单内“自己的主页”链接，记录两份 binding。入口需要实际 `identity`；链接定位必须限定真实登录头像菜单内，不能使用页面中任意用户主页链接或直接访问预期账号主页来证明登录。把这三项交给 helper，再把返回的 `accountReader` 与已有真实 `nativeFilePicker` 一起交给运行器。每次以当前 `read_article_handoff` 的 `runtimeVersion` 和源码摘要为准，不沿用历史版本号。

helper 每次需要时重新正常导航该专用页、展开头像菜单、读取真实 href；不点击编辑页的头像，不关闭导入弹窗或系统窗口，不写平台内容。只复用标签页和观察到的定位方式，不缓存账号回执。每个回执绑定本次 article/platform/target/browser/executor/tab/editor URL/purpose、唯一 request_id 和请求时间，实际读开始时间不能早于请求，完成时间最多60秒且不能来自未来；窗口检查、文件检查与单次许可门禁继续保留。保存后独立重开的编辑页也用同一规则核验当前账号。账户切换、核验页登录/验证/权限阻塞或不支持后台核验工具时停止，不能刷新旧证据时间、猜 API、读 cookie、重放旧响应或禁用校验。

升级前停止旧运行器的 UI 操作并保留记录；网站更新不会替换已加载闭包。当前无预约且租约已正式释放时，正常取得新租约即可，不再恢复已释放的旧租约。先加载并核对新版、接好两个适配器，再进入实际导入菜单；不要把新版加载或适配当成逐步索取确认的理由，沿用本稿知乎私人草稿任务的既有授权。

4. 在负责导入的同一官方浏览器/执行器中，使用已读取的最终 Word 描述和本人网站真实下载入口及 `download.path()` 取得文件，原样具名并核对 SHA/size、当前 browser_session 的真实可见性。已有受支持可见性证据时，不再强制原生选择器打开/取消。文件存在或网站存储存在不能单独证明浏览器可见。不要用原文 `read_article_file_chunk` 代替配图 Word。
5. `draftRuntime.preflight(session,{editorTab,listTab,fileEvidence,history})` 真实读账号/空编辑页/草稿列表。正常首次导入要求 `history.prior_submission='never_attempted'` 且有原执行历史 `evidence_reference`；缺记录、未知历史、空页或一次列表0均不能证明从未提交。新执行器对未知历史在准备选择器或请求许可前返回 `blocked/result_unknown` 并保持只读，不自动请求 `verify_existing` 或重导。通过当前正常首次检查后，头条 Codex 法在实际文件控件处先注册 filechooser waiter，再立即点击真实控件，取得同一 chooser；知乎坐标法由当前截图定位、宿主真实鼠标逐步单击开窗，不注册浏览器 filechooser waiter。步骤间等待页面或窗口稳定，位置／尺寸／布局改变时重新定位。准备失败不请求 reserve/consume；保留同一选择器到唯一提交，不反复 Open/Cancel。

   知乎必须本次观察并提供 `ui.importStages` 三步 `menu,dialog,file`：工具栏“导入”→菜单“导入文档”→弹窗“点击选择本地文档（或拖动文件到窗口上传）”。每一步绑定本次 `tab_id` 和 `browser_session`；坐标法只在第三步真正打开系统选择器，不等待 browser filechooser。“导入文档”只打开弹窗，不能把它当作文件窗口触发按钮。

   官方 SDK 只有 `filechooser.setFiles`，没有“不提交文件的路径可见性检查”。没有这类证据时不能虚填 `visible_in_browser:true`。新增明确的同浏览器下载交接：原下载必须确实来自当前官方 browser 的真实 `download.path()`，同一 Cua 执行者分别读取原下载和不覆盖的具名副本，核对两份 SHA/size 与冻结 Word。一并提供 `visible_in_browser:false`、`visibility_unproven:true` 和下述 `handoff`；`checked_at` 是两份本次字节核验完成时间。文件系统检查及选择器准备都不证明浏览器已读取该路径。

   `handoff` 字段为 `{kind:'same_browser_download',download_path,download_browser_session,executor_id,source_sha256,source_size,verified_in_cua:true,copied_in_same_executor:true}`。`createSession` 另传本执行真实的非凭证 `executor_id`；会话必须相同，source SHA/size 必须等于具名副本及冻结 Word。runner 实际取得当前原生窗口或 SDK chooser 后才添加 `chooser_prepared:true`、`chooser_prepared_at`，随后请求 reserve。不能将历史 chooser 或外部提供的 prepared 标志当作此事实。旧 `visible_in_browser:true` 路径保留原校验，不能混入新交接。

   父 bridge 的 `approvedScope.file_handoff[platform]` 冻结完整具名文件名称、绝对路径、browser_session、SHA/size、false/unproven 状态、真实字节检查时间 `checked_at` 及 handoff 的全部来源字段；仅选择器时间由 runner 的本次实际准备产生。reserve、服务端首个许可回执及 consume 必须匹配这一准确范围，服务端记录仍为 false/unproven。检查过期时必须重新读取字节并由宿主更新准确范围，浏览器请求不能自行改检查时间。正常 consume 之后只通过本会话固定的选择器方式提交一次；访问错误保留真实未知记录，不能补试、升成 true 或重放。已存在的同一具名副本可沿用，但必须重新读取两份完整字节核验；复制始终禁止覆盖。这不是声明 SDK、shell、browser 的路径解析相同。

   新执行器只执行正常首次导入。历史未知、已提交或已有稿不能改称 `never_attempted`；相应重导模式在新入口阻断，保留旧 attempt 和稿件，报告当前执行能力缺口。服务端既有本人授权重导协议仍保留为独立范围，见 [本人授权重导](owner-confirmed-reimport.md#legacy-manual-word-with-no-recorded-attempt)，不能因为协议存在就声称新执行器已支持。
6. 返回 `bridge_required` 时用 `nodeRepl.write(result)` 将明确 operation/args 输出给父执行者。父在工具环境加载 `createArticleUploadBridge`：

```js
const bridge = createArticleUploadBridge({
  approvedScope: {article_id, platforms: ['toutiao','zhihu']},
  currentClaim: async platform => currentInMemoryClaimFor(platform),
  call: async (operation,args) => {
    // 用当前真实连接的 Site MCP 函数调用该 operation，并解析其结构结果。
    // 此函数由工具宿主提供；不是网站 fetch，也不是浏览器页面函数。
    return await authenticatedSiteOperation(operation,args);
  },
});
const response = await bridge(request);
```

这是受工具宿主限制的显式桥接位置；不要假设 Cua 可以调用 MCP。Site MCP 函数名从当前工具目录取得，不构造平台上传 HTTP。credential 不粘贴到 Cua，不写审计或 checkpoint。

   bridge 保留服务器既有准确重导范围和许可围栏，但当前新执行器不调用该分支。runner／bridge 均须匹配本次 handoff 的版本及各自完整摘要；不能只更新网站或重用旧版本、旧授权范围的闭包。

7. 在原工具会话顺序接收响应：`acceptReserve` → `acceptConsume` → 父确实成功 `record_article_status(toutiao_saving)` 或 `record_article_delivery(saving)` → `submitAfterSaving(session,{state:actualResponse.state})`。后者内部先烧掉内存许可，复核同一账号、空编辑页、冻结文件及当前选择器；原生路径通过宿主对原窗口单次 `Open`，SDK 路径对原 chooser 单次 `setFiles`。`execute_import=false` 或消费报错时不提交；错误/取消/重启都没有第二次提交路线，不连续调用两种方式。
8. `observe` 返回真实 URL 后先通过 bridge 记录 `draft_observed`，`acceptObserved` 才进入全段 inspect。导入 pending 或未知保留 fence，只有同会话同页只读观察。浏览器异常时保留未知结果；新执行器不执行 `recoverBrowser`、换页重试或重导。
9. `repairParagraph` 与 `repairMissingImage` 当前**明确禁用自动写入**并 fail closed：原有 Home/End 选区以及单文本节点末尾推断无法可靠保护当前用户稿，执行实现已删除。它们只报告需要人工修复，绝不 Backspace、Return、输入字符、切换列表或补传图片。保留 `acceptObserved` 的重复原题、编号、缺图分析；发现差异保留成果并报告，不依据旧版自动补图条款修改正文。恢复、旧稿、用户编辑稿始终只读。
10. 知乎 `setZhihuCover` 先核对已有封面，正确、已加载且有新鲜独立图片检查证据时直接沿用，不打开封面选择器。需要设置时只走已观察的私人稿独立封面控件和本会话固定的文件选择器方式；每一步前必须仍为inspect阶段、同一唯一已记录真实URL、未崩溃/未恢复、账号正确，正文文字、图片数量和各图锚点仍与冻结内容一致；结构正确的懒加载图片不因此被拒。图注、textarea值及任何未分类可见文字均被检查；当前冻结契约不包含图注，非空图注阻断验收和封面写入。若入口要求发布，禁止点击并保留私人稿。`loadImages` 先读取当前图片状态，全图已加载时直接返回，不滚动；只在确有懒加载图片时通过官方 PageDown 继续观察。数量不足/加载未完成只观察同稿，不重新导入。
11. 用独立图片检查证据 `{observed_url,reference_sha256,reference_width,reference_height,checked_at,inspected:true}` 调用 `verify`。不能按图序自动赋 SHA 冒充图片身份检查。同时核对原图/平台图比例（2%内，允许正常等比例压缩）。它先在原页真见保存，记录首次 `saved_at`，正常新开同一真实 URL，独立重开再读完整原标题/正文/图片/知乎封面。时序必须 consume≤saved≤reopened≤read。
12. `verify` 请求 full `record_article_upload(verified)`；`acceptVerified` 再请求正式 completed/saved 入口；`acceptCompleted` 核对真实状态之后才 done。成功 `record_article_status(completed)`／`record_article_delivery(saved)` 已按后端终态规则结束对应租约，不再盲调 `finish_article_upload_execution`，也不伪称取得额外 `released=true` 回执。头条与知乎 session/attempt/状态独立。

## 原生文件窗口宿主接口

`nativeFilePicker` 必须由当前受支持的工具宿主实际实现 `prepare(context)`、`inspect(context)`、`submit(context)`。网站知乎坐标法还须在实际适配器上声明 `coordinate_contract:'screenshot-single-click-open-v1'`；缺任一方法或该坐标合同声明即停止默认知乎路径。原显式 `picker_mode:'native'` 的独立测试沿用其既有宿主契约。此字符串是本项目宿主行为合同，不是官方原生 API，也不证明已有真实截图、鼠标能力或窗口观察。不能为了通过检查临时补声明。网站只提供执行规则，不虚构鼠标、窗口或系统 API。

`context` 包含准确的 `article_id/platform/target_account/browser_session/executor_id/tab_id/editor_url/purpose` 和本次实际控件 `binding`，`purpose` 为 `document` 或 `zhihu_cover`。网站默认或明确具名知乎坐标法的文档 `prepare` 中，`coordinate_actions.document_stages` 是三步 `menu/dialog/file` 观察 bindings，由真实宿主依当前截图逐步单击并等待稳定；runner 不先用 DOM click 打开菜单。`coordinate_actions` 同时明确 `file_selection:'single_click_exact_word'`、`confirmation:'single_click_open'`、`settle_after_each_action:true` 和 `relocate_on_window_change:true`，这些是动作规则，不是截图或窗口证据；原仅显式 `picker_mode` 的路径保留原宿主参数和 DOM 菜单步骤。`prepare` 只实际打开窗口，不收到文件路径、不选择或提交文件。`prepare` 和 `inspect` 回执须逐项匹配上述八个范围字段，并包含 `ready:true`、`window_count:1`、当前唯一 `window_handle`、真实 `checked_at`、`files_selected:false`、`submitted:false`。窗口观察须在最近 60 秒内，且不得来自未来；文件和 DOM 证据仍遵循原有新鲜度校验。`window_handle` 是宿主为本次窗口建立的唯一非凭证标识，不能从历史恢复。窗口歧义、身份变化或失联均停止。

文档 reserve/consume 前完成 `prepare`。只有新鲜消费响应明确允许导入且真实 saving 写回通过后，才 `inspect` 原窗口、复核账号/空编辑器/已冻结文件，调用一次 `submit(context + window_handle + 冻结文件)`；坐标宿主用当前截图单击准确 Word 文件行，等待稳定并确认选中同一批准文件后，再单击原生 `Open` 一次。菜单、文件行与 Open 均不默认双击；窗口位置／尺寸变化重新截图定位，不复用旧坐标，不使用 TinyFish。宿主在实际按 Open 前须再确认仍是同一窗口、同一准确范围和已批准文件。窗口句柄和许可仅在本会话内存，checkpoint 不保留。知乎独立封面仍受完整正文、本人新稿和已核验图片门禁限制，不能把正文上传许可当成另一篇文档的许可。原生路径不注册 SDK chooser waiter，也不在失败后调用 SDK 兜底提交。

## 断点、取消与恢复

`checkpoint(session)` 只含非凭证审计、attempt/平台/Word/真实URLs/保存时间；不含内存 `grant`、lease、原DOM或工具原始错误。父可正常保存本任务证据，旧 checkpoint 不能恢复执行许可或选择器。新执行器对 checkpoint 恢复、`bindRecovery`、`reconcileExisting`、`recoverBrowser` 与重导保持只读阻断，不调用宿主动作。未知多URL只报告，不擅删或选择。租约失联仅按既有准确协议处理，不能 reset ledger、改账号安全或把恢复协议当新执行器已支持的分支。

本节用于异常，不是正常导入的必经步骤。正常链路不反复预览恢复、重下载或重做文件检查；文件、会话、范围发生变化或证据过期时，按实际变化重新检查，不能刷新时间冒充新证据。提速只合并重复工作和未使用的页面快照，不省略账号/空编辑器/真实窗口检查、文件指纹、单次许可或保存后独立完整回读。

导入pending、结果unknown与done等阶段不能写封面；控件触发filechooser也核对live文字、aria-label、title与实读身份，禁止CSS漂移到发布按钮。pending/unknown 是未完成状态，不是 failure、更不是重传许可。取消只停止后续动作；已发生上传不可撤回。工具权限拒绝停止原动作，不切换执行器或私连 CDP。未完成／未知的停止流程是：保留实际诊断，取消后续动作，await 已发动作完成，取得真实窗口关闭／settled 证据；若已有消费，按准确 attempt 记录 executor end，然后用正常 finish 接口结束仍有效的本平台执行。只有真实正常响应确认才称释放成功；不清历史、不伪造动作结束，不对已成功终态再调用 finish。

## 验证证据与实联边界

V152／runtime 7 的 runner 与 bridge 已在原官方 CUA 真实整对正常批准加载，源码 SHA 和入口匹配；头条真实账号 query 检查通过。随后空编辑器的 `<p><span class="syl-placeholder ProseMirror-widget" ignoreel="true" contenteditable="false">请输入正文</span><br></p>` 被 generic reader 计为正文，返回 `blocked/duplicate_draft`；当时 `submitted=false`、`attempt=null`、`editor_urls=[]`，已正常 cancel／settled，未 claim、开选择器、reserve、consume 或提交。这不证明私人草稿保存或完整图文验收。

本次 runtime 8 仅修正上述准确观察占位与 chrome 的只读过滤；新版本及新 SHA 的正常宿主接受和 preflight 由父线程继续本请求内实测，不能继承 runtime 7 的通过结论。完整程序满足审核预算仍须取得本版本的真实正常接受结果；本轮平台图文／保存验收尚未完成。正常生产构建及私有发布沿用本次授权，以真实发布回执确认结果，不预称发布或平台成功。

历史 `node tests/cua-draft-runner.mjs` 使用 mock官方 browser方法；真实 SQLite/MCP账本 `tests/upload-attempt-guards.mjs`、`tests/article-claim-recovery.mjs`、`tests/upload-readback-schema.mjs` 和 `tests/browser-upload-integration.mjs` 均为离线证据，其中模拟导入不能当真实平台保存。新独立执行器的确切测试结果以本次交付报告为准。

2026-10-06 的历史只读平台诊断取到了头条账号href、标题placeholder、ProseMirror正文和编号 h1，未编辑该稿。全体 `.ProseMirror img` 数36，不能当作真实正文图数；历史回执王心凌是55正文段/22图，用户可在平台编辑，数量差异不能自动修复。当时知乎读取触发 `Emulation.setFocusEmulationEnabled` timeout，随后头条只读 `Page.getFrameTree` timeout；没有改安全/timeout/网络，没有猜生产选择器。初版完整模块定义曾通过官方Cua无副作用校验（loaded=true，platformActions=0），该历史结果不证明当前原生适配器已在真实两平台执行。

## 历史独审加固

历史 `tests/cua-draft-runner-negative.mjs` 使用独审同类遍历输入，覆盖6项阻断及图注/输入value/裸文本、ARIA发布图标、pending/unknown/done扩展负例。新独立实现仍不自动修正文；正常私人稿首次导入和受守卫的封面设置以当前源码及新回归为准。历史离线证据不能替代当前私人草稿的真实保存验收。

V98 的历史 importStages、关联重导与 approvedScope 输入、正确自动封面跳过、保存退出和边界见 [上传诊断与恢复补丁](upload-recovery-v98.md)。历史报告中的“候选/尚未部署”描述对应当时版本；当前执行以每次 `read_article_handoff` 的 runtime 描述和本说明为准。


精确未消费恢复的原始契约见 [未消费恢复与回执交接](upload-unconsumed-continuation.md)。恢复仍须准确预约、最新预览指纹及真实旧执行结束，不恢复已消费许可。离线验证不证明知乎真实平台接收成功；每篇仍须一次真实导入和独立完整验收。

源码读取和已下载摘要核验都只读，不认领、恢复租约或取得上传许可。附件导航的 `net::ERR_BLOCKED_BY_CLIENT` 本身不证明下载未发生，应检查真实下载事件和文件；不关闭客户端保护、不重置浏览器、不改 CDP。只读源码通道缺失时正常刷新网站工具目录；已有下载时只需 handoff 摘要，不依赖新工具可见性。
