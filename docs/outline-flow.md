# Claude 框架审核后写正文（新批次）

这条生产路径与旧 daily、manual、stepwise、rewrite 请求及额度隔离。新建批次不清空、重试或复活旧记录。每个独立 owner / authorization_key 对应唯一不可变 run；每阶段只有一次模型请求。旧历史和已完成结果保持可读。

## 最小使用顺序

1. 小鱼先核实公开材料。调用 `read_writing_brief` 获取新完整 `effectiveWritingPrompt` 和版本，再调用 `create_outline_flow`。参数是 `authorization_key`（本次明确授权的稳定唯一键）、`expected_model`、`expected_prompt_version`、`topic`、`materials`、2–12 条 `sources`、`evidence` 和 `confirm:true`。`sources` 按顺序对应 `S1`、`S2`…；每条 evidence 使用唯一 `id`、事实 `text`、`source_ids`。不能放账号密钥或私密背景。
2. 创建只读取已配置 YYLX 的模型目录，不调用生成。完整提示词、材料、来源、证据、模型、协议上界及来源冻结到 snapshot / SHA256。实际返回模型标识若与冻结型号不同，会保留真实返回但阻止进入审核/后续正文，不把别的型号结果套入批准绑定。若同一授权键重放，返回同一批次；改材料或模型会拒绝，不能拿新键当自动重试。
3. `claim_outline_stage({run_id,stage:"outline",expected_snapshot_sha256,confirm:true})` 原子认领。只有获胜者得到一次性 token、`input_sha256`、完整阶段输入和24小时有效期。立即安全保留 token，不写 URL、日志、正文或浏览器持久存储。
4. 在私有 `/writing/outline-run` 填 run_id，只读读取本人的状态，选择“只生成框架”，填一次性凭证并执行。使用同源 `POST /api/claude/outline-run` / NDJSON。请求只接受 run_id、stage、token、expected_model、expected_input_sha256、confirm；资料不能由执行表单重新注入。服务端先预占，再一次请求，最多300秒，不自动重试。每次请求都是自包含的完整提示词和证据。
5. `read_outline_flow` 返回真实 Claude 框架、用量及确切 hash，停在 `outline_review_pending`。框架包括核心判断、开头事实、3–5个推进节点（解决什么、新增什么、evidence IDs）、结尾、事实缺口。没有正文，也没有“模型已经替小鱼审核”的假状态。
6. 小鱼必须实际阅读框架与原始来源后，独立调用 `review_outline_flow` 保存 actor_id、execution_id、reviewer_model、decision、reason、issues、minimal_changes，以及确切 snapshot/outline hash、version1。`pass` 只在没有开放问题/事实缺口时成立；`revise` / `blocked` 停止本次，不自动发新请求。审核写入本身不调用 provider。该记录是可追溯的真实独立 agent 执行证明，由调用方如实提供，不是服务端声称亲自验证了外部 agent。
7. 只有 `pass` 后能 `claim_outline_stage(... stage:"body" ...)`。正文输入自动包含批准框架、审批hash、完整固定提示词、原材料与来源/证据；客户端不能替换其中任一项。再次用同一 helper 选择正文，提交正文阶段的一次性 token。
8. 真实正文返回先持久化完整原始结果和用量，之后解析保存初稿到 `daily_editorial_drafts`。新 `writing_runs.run_kind=outline_flow:<run_id>`，不占 daily 槽。此时没有文章对象、图文事件或草稿投递。
9. `create_outline_text_revision` 接收 run_id、真实写作者 actor/execution、独立 review/rewrite/verify 参与者和 prompt version。随后复用 `claim_text_revision_stage` / `save_text_revision_stage`，分别实际执行独立审稿、问题清单、改稿、独立复核。审稿及复核者必须独立于写作者和改稿者；凭证、输入hash、版本与执行ID绑定，付费调用为0。不能由一次 Claude 结果伪造三阶段。
10. 独立复核 `passed:true` 后，用 `finalize_verified_daily_revision({flow_id,expected_body_sha256,confirm:true})`。它接受服务器已存的最终稿hash，不接受任意正文。保留初稿、批准框架与所有审改记录，才创建原定 article_id 的成稿并走既有图文/Word/私人草稿链，绝不公开发布。失败的连接交接保留为 final_saved / pipeline_state=needs_connection，不能声称已交接；只有 writing_runs submitted 后才记为 finalized。可在相同成稿上再次调用同一 finalizer 恢复，不重新生成。

## 上界与失败恢复

- 新流程没有人为14000输出限制。Messages 协议仍需 `max_tokens`，不能填写“无限”。读取模型目录明确能力；精确 `claude-opus-5-5` 缺少能力字段时采用有官方证据的128000上游请求上界，保存 `relay_limit_verified:false`，不能说中转已经单独验证。其他未知型号无依据则停止。详情见 `claude-output-contract.md`。
- 完整用量一出现就尝试保存，最终实际返回再次保存。持久化失败有诊断；不知道结果不代表没有消费。
- `failed`、超时、断线、截断、未知结果均只读恢复，不能重新认领或发第二次。HTTP400明确为参数/输出上界可能不支持，不说额度用尽。
- 已完整返回但中间保存失败时，`recover_outline_stage` 仅从同一个 completed 缓存核对和继续保存，不调用模型；失败/未知请求不能用它重试。
- 新旧 pending、请求 ID、审批、正文存储、唯一索引均隔离。旧14000只保留在历史任务/协议中，不给新流程设置14000。
- helper 的 sessionStorage 仅可存本人的安全 run_id 作为写作台焦点，不存 token、正文或模型返回。网页刷新不会重新发请求。

## 本地验证

`node tests/outline-flow.mjs` 使用真实内存SQLite及完整模块、mock provider、mock对象存储和事件，覆盖完整两阶段+三阶段审改+finalizer、owner隔离、并发每阶段一次、未审/拒绝/过期/hash变化/绕过零正文请求、旧daily失败与14000快照不动、凭证安全、真实同源NDJSON和只读列表。

`node tests/claude-outline-provider.mjs` 验证协议元数据、精确fallback、动态max_tokens、300秒、无重试、安全错误、部分用量和凭证隐藏。其余旧daily、stepwise、legacy、MCP、Word/图片回归保持独立。以上测试没有真实provider调用或线上写入。

## 正常网页操作入口

当连接器工具目录尚未显示新工具时，同一个 `/writing/outline-run` 页面也提供正常授权表单，不需要断开插件、改变权限或冒充 MCP 身份。表单默认不写入，必须明确勾选确认：

- 创建批次：填写与 create_outline_flow 一致的完整 JSON 参数。
- 认领阶段：当前 run 与 stage 原子认领一次。只有认领赢家返回 token；页面先把它存入 run+stage 绑定的易失内存/密码框，再刷新状态。token 不进入 URL、浏览器持久存储、日志或 JSON 预览；刷新丢失后不能重新认领。
- 独立审核：先实际阅读真实框架及来源，再提交真实 actor/execution/model 和审核报告；pass 不会调用模型。页面不能代造执行身份或预先批准。
- 创建独立三审：正文已保存后填写真实三审参与者；页面只显示安全 flow_id。后续现有 claim/save/finalize 工具可继续使用。
- 恢复已存结果：只对账原 completed 缓存并按需补存阶段，可能更新保存状态，但绝不重试模型。失败/未知结果仍只能查看。

这些按钮使用 `POST /api/writing/outline-flow`，要求本人身份、完全相同的 Origin、自定义 `x-xiaoyu-outline-flow: 1`、application/json、最多120000 UTF8字节，以及 `{action,arguments}` 严格包裹。action 只允许 create / claim_stage / review / create_revision / recover_completed；全部复用现有服务门控。返回仅最小安全状态；只有成功 claim 的一次性响应含 token。

生成模型仍只在独立 `/api/claude/outline-run` 长连接按钮执行，框架未通过不能正文，每阶段一次、不自动重试的约束不变。网页正常入口不放宽原授权，也不增加收费操作。

## 一次明确退回后的框架修订

`create_outline_revision` 仅接受根批次 `revise`，必须绑定其 snapshot、outline、完整已保存 review 的确切 SHA256，并追加经实际核验的新来源、新证据和材料。服务端复用完整父审核，不能提交替代审核，不能替换原材料、模型能力或完整固定写作提示词。来源/证据只追加，原 ID 保持不变。新增材料独立保存，审核真实性仍由实际执行者如实提供；服务器的结构/hash校验不等于事实核验。

新增 migration `0013_outline_revision.sql` 为 `outline_flows` 添加可空 `parent_run_id` 与 `UNIQUE(owner,parent_run_id)`。稳定授权键由服务端生成为 `outline-revision:<parent>:1`；单条条件 INSERT 同时检查父状态/绑定、无正文认领、无初稿或最终文章。并发/相同参数重放返回同一子批次，改变补证或父绑定拒绝。子批次不能创建孙批次，父批次永久保持 revise，不改原 prompt、receipt、hash、审核和 state。子批次复用父 article_id，后续初稿的 owner/article 唯一约束与最终 articles 主键共同保证同链只交付一篇。父子链在读取及阶段准备时再次验证。

创建不调用模型。修订框架由现有独立认领、独立执行确认启动，页面明确提示“生成修订框架会新增一次模型请求”；子批次最多框架一次、审核通过后的正文一次，算上已停止父批次的框架，全链至多三个 provider 请求。失败/未知不重发，完整 completed 缓存只允许恢复。独立审稿、改稿、复核仍走原流程，无自动付费调用、无修改 daily/manual 历史额度。

子批次继承父过期时间，不能通过修订延长授权。追加来源后总数继续受原 2–12 条限制，证据总数不超过 80；来源不足、已满、真实缺口未解决或再次审核退回时停止。fact_gaps 只记录修订版拟写论点缺少的必要事实，明确不写的外部信息保留为材料边界，不用强制空数组绕过门禁。

## 带独立编辑修订的明确通过

`review_outline_flow` 保留原来的无修改 pass 接口；原框架存在事实缺口时，旧 pass 仍拒绝。可选的 `approved_outline`、`gap_resolutions`、`edit_notes` 必须作为完整一组提交，只用于实际独立审核后的 pass。批准稿必须保留原节点数量、符合原框架结构和现有 evidence ID、没有实际事实缺口，issues/minimal_changes 不得留未解决项。

每个原 fact_gaps 都必须用零基 `gap_index` 和原文 `gap` 精确对应，action 为 resolved 或 excluded，给出 reason；resolved 必须引用至少一个现有 evidence ID，excluded 应如实说明该未核实内容如何排除于拟写论点之外。不能把“删了缺口数组”当作事实解决；解释及修订的真实性由独立审核执行者负责，结构校验不替代事实核验。

服务器在原不可变 review_json 内保存 `approved_outline_artifact`：source=independent_editor_revision、版本2、原outline hash、修订后hash、精确批准框架、逐缺口处置、修改说明及自动计算的before/after差异。原Claude outline、原fact_gaps、原receipt和hash保持不变。正文只冻结批准版本；只读展示原版与批准版及各自hash。read/claim/prepare/recover 和下游正文独立审改/定稿读取均复核批准版本与输入绑定。审核写入/读取零provider；正文仍需单独认领、确认执行，不自动生成，不追加来源或替换完整固定prompt。

## Reversible archive and pause fences

`archive_outline_flow({run_id,reason?,confirm:true})` (or the normal page's archive form) archives exactly the owner's root and its revision child in one transaction. A child ID resolves to that same family. A separate control row hides it from default lists and blocks claims, approvals, cached recovery, revision creation, finalization and dispatch. `include_archived=true` retains the owner-only audit view. This never overwrites `body_failed`, text, provider usage, diagnostics or payment receipts.

`restore_outline_flow` only restores visibility. It does not regenerate, dispatch, rebuild a token or clear a prior pause. An already in-flight provider response may still arrive and is preserved for accounting; archive fences prevent it from advancing the content workflow. Any subsequently permitted recovery is separately confirmed and consumes only a completed stored receipt, with zero provider calls. SQL fences also cover legacy review-stage transactions and exact-final artifact/dispatch claims to prevent archive-after-read races. No schedule or subscription is changed.
