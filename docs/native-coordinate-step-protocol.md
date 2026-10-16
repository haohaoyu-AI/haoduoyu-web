# 原生坐标分步协议：待原宿主核对的接线方案

当前完整 native-only CUA 定义为 **25,567 bytes**，SHA-256 **`7a48a202a29b0dc6381d577a6cb02e14968a4351071ff6611713eb2e887e5d5f`**，actor/core/bridge源码摘要未改变；公开ready报告保留 `observed_at: dispatchReady.observed_at`。新actor **130/130**、parent bridge **17/17** 通过，桥为 **17,245 bytes**、SHA-256 `c93d9010be8bdc9d5fe9753d426a830167c463a2182c1e20d5ba3f2af50d113b`。定义内部24k→28k调整保留旧101bytes超限失败及回归。此文档是**部署前审阅快照**：父级实机报告及独立复审已放行，用户明确授权正式部署，父级已启动原官方流程前校验；是否部署、版本及URL以随后真实deployment回执为准，不在此快照假称未发生或已发布。当前不操作平台。

**职责和预算。** CUA 通过正常入口一次接受完整、普通可读的 **native-only** 定义，仅含每动作 epoch/tickets、scope/同宿主 Word/原生窗口约束和同步步骤机；无 VM、eval、动态 loader 或旧程序执行片段。业务 `createPrivateDraftTransfer`、MCP、网站状态、冻结完整正文/22 图 baseline、封面 verified 与父级鉴权全部留认证 parent；parent 源码不传入 CUA，不让 CUA 回调 parent 函数，也不以 `true` 或跨宿主 closure 代替许可。

| 实际调用组成 | 设计预算目标（尚非已测结果或审批） |
| --- | --- |
| 新 native-only 完整定义 | ≤28,000 bytes |
| 当前官方能力适配 | ≤20,000 bytes |
| 本次初始化 | ≤8,000 bytes |
| 包装、严格 JSON source 编码增量及其他 transport 参数合计 | 8,000 bytes计划预留，**非额外硬上限** |
| **整条实际工具 payload 的 UTF-8** | **≤64,000 bytes** |

每次实际调用必须测完整序列化payload，含源码JSON转义、包装及全部参数；8k transport仅计划预留，总硬限64k，变更须重测。**父级报告**本次原CUA正常加载完整定义+真实adapter：code **31,886 bytes**、actual params **32,381 bytes**、参数SHA-256 **`2bfeefdfe0b24dc3ca9ccd97096ddc8b0a9461854cfcf6ea3b75e123f15bc6ee`**，`isError=false`。该次完整实际调用预算与正常入口加载已通过，来源为parent-reported原宿主证据，编码环境未独立实机验收。静态source descriptors的`complete_call_budget_verified=false`仍表示只读源码不授予运行批准，也不能用定义量测覆盖未来调用；不能把它误述为该次真实调用未通过。

**最终步骤接口。** actor 的 `step` 仅允许 `observe / validate / read_windows / click_prepare / click_filename / type_filename / click_open`。`observe` 顺序读取真实文件/tab/window并 capture，返回实际图；模型在程序外识别，提交 `source=model_visual_observation`，绑定本图、scope、window/frame、语义和无遮挡证据。项目 screenshot/scene/prepared IDs 只作 correlation，不证明真实性。`observe` 与 `validate` 可顺序执行多个只读实际调用，每条分别登记/await落定，不能用一张复合票据替代；变化就返回新图重新识别，不盲点旧坐标。

**validate 与物理 commit 分开。** 父级 real gate auth 在 `validate` **之前**完成；随后 validate 仅实读真实 tab/window/frame等当前上下文，成功返回真实 `dispatch_ready` 及其原始 `observed_at`。父级只做本地同步检查：没有取消、ready来自当前原会话且匹配指定动作、scope/窗口/Word/attempt，且真实 `ready.observed_at` 不在未来并距当前≤15秒；不得用父级本地now替换或刷新该时刻。然后烧掉 ready，**立即用原 transport 发送指定一次物理动作**。`click_prepare/click_filename/click_open` 各只有一次实际 click，`type_filename` 只有一次实际 type；commit 内没有任何前置 await，不再 await auth、截图或读取，直接登记并发出该动作再 await 其结束。不能用“commit前再鉴权”引入第二个取消竞态窗口。不保留后台 Promise、队列或连续点击；每步返回 native_pending/实际图。

知乎 prepare 的 `menu → import modal → choose local` **三个语义动作分别 capture/识别/resume/登记**；头条每步按当前真实截图识义，不猜 SVG、固定位置或立即文本。新原生窗口真实出现才返回未选文件/未提交的 prepared 公开报告。文件名输入后必须返回原生截图，让模型核对实际固定路径；下一次 Open 派发前锁死一次资格，重新核对范围/许可/窗口后单击 Open 一次。路径输入不得按 Enter 提交；异常、取消、失联或未知不解锁、不重放、不切路、不 force 或隐藏侧栏。

**跨宿主许可。** 原宿主公开 prepared 报告 → parent 校验其 genuine host session proxy、canonical prepared report 和直接 tool-call 记录来源 → 按原 scope/Word/attempt 真实 `claim → reserve → consume → saving` + gate auth → 严格非秘密 handoff → CUA 本地复核 scope/Word/prepared/attempt/时效/one-shot。credentials 始终原 parent 内存；公共许可不带 claim/token，也不执行父级源码。跨进程不把 `object === object` 当 same 证据；canonical 绑定要由实际获准会话和原始调用链验证，不能凭可复制的项目 ID 自签。头条与知乎各自真实 saving/completed 或 saving/saved，不虚构 `zhihu_saving`。

**Sky 的实际约束。** 当前 `list_windows` 为 `{id, app, focused, modal, geometry}`，title 可能缺失，**没有 owner_tab_id**。关联须记录点击前/后的真实前台 tab/context、逐条真实 click 和新 window diff，绑定确切 window；正式说明哪些已观测 baseline 无关 X11 IDs 不属于本次关联范围及理由，不补 title、不猜名字、不凭几何胡筛。`Sky.click` 返回 void 时，只能保留项目中的实际 awaited-call record 和当前官方完成语义；不能造官方详细回执、命中证明或窗口 owner 字段。缺精确关联或关闭观察则准备/结清阻断。

**取消和验收。** cancel 即使 busy 也同步立 fence；validate等待期间取消必须阻断后续 commit，尚未派发 Open 时实际 Open 数必须为 0。所有已 issued 物理动作保留票据并 await 真实 settlement，取消不声称收回已发 click/type。只读 settlement 不导航、读账号菜单、输入、保存、重开或关闭；缺完整结束/精确窗口关闭证据、native prepared 为 null 且创建未知时不假释放。独立重开后的全正文、22 图身份/顺序/前后锚点/加载、知乎封面验证在 parent 执行；每图 `natural_width/natural_height` 来自同一原 Word 的真实图像字节，冻结进 **业务 core baseline**，实际 natural 与 display 尺寸/比例分别核对；缺 dims 返回 baseline_invalid，不能猜尺寸，helper-only 检查无效。保留固定 Word、旧失败/未知、旧实例和真实 URL。

**最终检查与实机边界。** 本地套件900/900、core129、SQLite/Word/schema集成35组（56 synthetic submissions）、reader17、HTTP1组、MCP2组、budget26均通过，tsc/build exit0；标准lint仍有V155既有5条no-explicit-any错误，不称全lint通过。证据见 [最终套件](../evidence/native-coordinate-offline/native-step-v3/native-reviewed-test-summary.final-v3.json)、[reader/budget记录](../evidence/native-coordinate-offline/native-step-v3/audit-runtime-budget.final-v3.json)。父级报告runtime `2026-10-11-native-step-host-3`、phase=`awaiting_live_editor_binding`、actor_created=false、ui_calls=0、credentials=false，无reservation/consume/upload。入口定义加载不等于actor创建或平台验收；实际actor/transport绑定、窗口语义/关闭、私人保存及全正文逐图/知乎封面验收仍待原宿主实测，不作稳定性承诺。

**当前代码。** 业务留认证parent的 [`private-draft-transfer.mjs`](../scripts/browser-upload/private-draft-transfer.mjs)；CUA为 [`native-step-session.js`](../scripts/browser-upload/coordinate/src/native-step-session.js)+[`native-action-ledger.js`](../scripts/browser-upload/coordinate/src/native-action-ledger.js)，父级调度 [`parent-step-bridge.js`](../scripts/browser-upload/coordinate/src/parent-step-bridge.js)，完整请求量测 [`complete-call-budget.js`](../scripts/browser-upload/coordinate/src/complete-call-budget.js)。[`host-program.mjs`](../scripts/browser-upload/coordinate/host-program.mjs)、[`parent-program.mjs`](../scripts/browser-upload/coordinate/parent-program.mjs)、[`article-draft-transfer.ts`](../lib/article-draft-transfer.ts)提供各自源码边界；父业务源码不进入CUA，旧adapter/bridge不作回退。加载与尺寸证据限于本次确切调用，不能放宽后续scope、Word、窗口、权限或一次提交门禁。
