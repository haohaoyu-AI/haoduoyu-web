# 未消费上传许可的精确恢复与回执交接

本历史补丁来自官方 Sites 正式 V117 `158c6ac38f6ee4feb4343f12695026e872967974`。当时 Sites 读取确认版本 117、部署成功，私有域名为 haoduoyu.xyz；该次研发只生成独立复核候选，没有部署或更改真实 attempt/租约/账号/订阅，没有调用平台或收费模型。当时云环境没有 Sites bundled site-workflow 脚本，使用 Sites 正常 get_site/list_site_versions/get_deployment_status 与该项目正常源码凭据，仅 clone 官方返回的源仓库；HEAD 与正式提交完全一致，未使用工作区旧 Python/GitHub main。当前源码和私有发布状态以实际 handoff 及交付回执为准；本历史记录不增加当前恢复权限。

## 使用边界

`preview_article_unconsumed_upload_recovery` 是无凭据、无写入的精确预览。仅接受该本人/文章/平台的最新 `reserved`、`consumed_at=null`、无本次 editor URL/readback 的人工 Word 预约。`verify_existing`、未消费但已为 outcome_unknown、已消费、draft_observed、verified 和终态均拒绝。generic recover_article_claim 会把 reserved 标为 outcome_unknown，因此不能先走这个恢复工具再套本模式。

标准恢复使用新的 `recover_article_unconsumed_upload` 正常 authenticated-owner 接口，不要求重建已丢失的 bearer。它按 preview 中完整旧 lease（包括 live、expired、正常 released/null）和父快照执行原子轮换。既有 `reserve_article_upload` 的独立 `mode=continue_unconsumed` 也可供仍拥有当前 live claim 的 holder 使用，普通 reserve/consume 的凭据要求没有改变。新增输入为 expected_recovery_fingerprint、expected_attempt_revision、confirm_unconsumed_recovery=true；并绑定 previous_attempt_id、target_account、原 word_sha256/word_size、current_task_id、新的 authorization_key、明确本人恢复 confirmation_message_id、真实 prior_executor_end_reference、prior_executor_stopped=true、confirm_new_draft=true、preserve_existing_draft=true 和本次新鲜 preflight。工具参数仍是完整平铺 schema；必需的模式条件由服务端强制。

**新增的精确恢复授权与原执行停止声明必须真实存在。** 原授权接受重复私人草稿，可保留为原导入范围；它不自动证明原执行已停，也不自动授权更换 lease/一次性许可。confirmation_message_id 和停止引用是 authenticated owner 的审计声明，不是平台签名或服务器进程终止证明。不得由执行者自行制造本人授权。本轮没有执行生产恢复的授权，不能拿研发请求调用真实新接口。新接口需要父任务独立复核、按正规流程发布后，正常刷新工具目录才可使用；若实际正常工具仍不可调用，报告阻塞，不改用 HTTP/其它工具。

同一次恢复 request 精确包含授权、父 revision/fingerprint 和 preflight。相同 request 的重放只读回原子预约，不重发 claim/consume token；同 key 换内容拒绝，换 key 也无法夺取同一父的唯一 child。若新的成功回执又丢失，必须重新核对该新父、原执行已停止和新的精确恢复授权，不能重复旧 request 索取 token。

## 原子状态与审计

preview fingerprint 包含 owner、完整父快照、当前原 Word output 元数据/正文/manifest/guard/source、目的地状态/旧 URL/readback 和当前 lease 哈希/到期时间。文件源经当前人工 intake 与 R2 原件核验，最终 Word 实际字节/SHA、正文和全部冻结图片基线均核验。原任务 ID（若原预约有该 ID）不可更换。终态、改变 guard、用户正文/回读更改、其它 owner/账号/Word 及旧快照均拒绝。

0037 只替换 child-lineage trigger，保留已消费重导分支与全部唯一索引/不可变/禁删触发器。新子 `authorization_kind=unconsumed_continuation`，version+1，previous_attempt_id 精确指向父，parent_snapshot、原批准与未知历史、retained_editor_urls、准确停止引用均追加保留。子 confirmation_message_id 列为空，真实新授权在子 audit 中；不会冒占原精确批准的唯一索引，也不把 legacy 未知历史写成 never_attempted。不写 consumed-only executor-end，不修改父行、不补造消费、不清围栏。

插入子预约与轮换当前 lease 使用同一 D1 batch 事务。SQL 再次核所有父字段、正文/Word/guard/源、准确目的地状态/URL/readback、live claim 和无后继。旧消费若先赢，父 consumed 状态令恢复失败；恢复若先赢，新 live claim 和唯一 child 使旧许可失效。父保留原 hash/token hash，父之后不可改；token 不恢复、不隐藏重放。成功仅返回 execute_import=false；只有新子正常 consume 的一次 CAS execute_import=true 才允许一次提交。consume 再核父 lineage、Word、guard/source/正文、旧目的地证据、空私人编辑器和本次文件证据。

## 正常 runner 与宿主

以下是历史完整 runner 的恢复接线，服务端准确授权与一次许可约束仍保留。当前默认 `createPrivateDraftExecutor` 仅支持正常首次私人导入，不执行 `continue_unconsumed`、重导或 checkpoint 续传；它会保留记录并报告未支持分支。不能为启用此历史恢复段拆分加载被拒的旧大 runner，或假设任意 local-file 模块加载得到官方支持。当前默认的正常完整源码接入与宿主接受边界见 [执行器文档](browser-upload-runner.md#加载和接入父执行者)。

加载当前完整 runner，以 import_mode=continue_unconsumed 创建**新** session。reimport 对象携带上述准确恢复字段，另携带 preview 的 prior_submission 与 retained_editor_urls。不能迁移旧 session chooser/grant/checkpoint。真实新 chooser 必须先于 reserve/consume；false/unproven same_browser_download 仍须同 browser 实际下载、同 CUA 原件和具名副本完整核验，时间由当前 chooser 生成。网站恢复默认仍为头条 Codex 法、知乎坐标法，不因恢复自动切换；原显式模式的独立测试沿用其原授权及路径。文件访问仍到本会话唯一 setFiles 或原生 Open 才被尝试；保存、退出、独立重开全文和所有图验收规则不变。

bridge 的 approvedScope.unconsumed_recovery[platform] 冻结精确恢复输入。priorExecutionStopped({platform,attempt_id,recovery_fingerprint}) 必须是宿主根据原执行所有 browser/file/status 写入已取消并 settle 的**同步准确事实**。返回 Promise、false、缺失或异常均拒绝；不允许将当前新 chooser 状态当作旧执行停止证明。新恢复接口的 authority 来自 authenticated owner 的精确批准与实际停止声明，SQL 比较当前完整 lease 快照，允许彻底丢失/过期/正常释放的 claim；没有 bearer 被猜测或重发。持有者兼容 mode 仍要求当前 live claim。不能先运行会将 reserved 改为 unknown 的通用 recover_article_claim，也不能将新接口作为无本人批准的通用清锁。

新增 tool-host.mjs 只包装调用者提供的正常官方工具映射，没有 HTTP/替代传输/自动重试。createUploadToolCall 正常解包 structuredContent 或单个真实 JSON text，isError 固定摘要保留。public-errors.mjs 与服务端固定上传错误清单由离线测试逐项校验；未知 raw message、stack、body 一律不保存。创建 bridge 时传 summarizeToolError:summarizeUploadToolError；老独立 bridge 未传此项时继续固定通用错误，不引入 import/structuredClone 要求。

`node scripts/browser-upload/emit-tool-host-module.mjs` 输出可在正规工具宿主活 cell 加载的完整定义（固定错误、包装器、journal、bridge）；只输出源码，不连接 browser、不执行工具、不带凭据。示例接线：

```js
const call = createUploadToolCall({
  // 从当前工具目录选择真实函数。不能猜地址/改为 HTTP。
  recover_article_unconsumed_upload: args => tools.mcp__codex_apps__app_recover_article_unconsumed_upload(args),
  reserve_article_upload: args => tools.mcp__codex_apps__app_reserve_article_upload(args),
  consume_article_upload: args => tools.mcp__codex_apps__app_consume_article_upload(args),
  // 其它当前流程使用的正常官方 read/status/diagnostic 映射按需提供。
});
const bridge = createArticleUploadBridge({
  call, currentClaim, approvedScope, priorExecutionStopped,
  summarizeToolError: summarizeUploadToolError,
});
const host = createArticleUploadHost({bridge, emit: safeReceipt => emitActualReceipt(safeReceipt)});
const receipt = await host.execute(nonSecretOperationUuid, actualBrowserRequest);
// 先输出实际已脱敏 receipt，再调用实际正规接收工具。
// receipt.result 原样传递；不得重写为 fabricated 的假回执。
const next = await host.deliver(nonSecretOperationUuid, (result, provenance) =>
  actualOfficialReceivingTool(result, provenance));
```

journal 将实际 bridge 返回值先冻结在**该活宿主的易失内存**，记录非秘密 operation_id、operation、article/platform、请求与脱敏回应 SHA、接收时间和结果来源。响应 SHA 是客户端可追溯性线索，**不是服务器/审批系统签名**，不承诺审批系统一定接受。只有实际 bridge 响应才标 actual_authenticated_bridge_response；错误标 actual_bridge_error。成功和错误都不保存 claim、consume token、cookie、Authorization，也不保存原始 MCP envelope。emit/接收工具异常不会丢失已脱敏回执；同 operation_id 不再调用 mutation。接收异常按 delivery_unknown 处理，禁止自动重复交付（接收端可能已执行）；用正规只读 runtime/server 状态判定下一步。host.read 只能读非秘密 receipt。

这不建立 durable host。闭包结束、exec isolate 结束或工具宿主崩溃后，token/permit 不可恢复；旧 receipt 只供核对，不能授予导入。当前环境没有可实测的原官方 CUA 审批/交互等待能力；未验证“同一活 cell 等待审批修正”。不能凭这套离线模块承诺这种宿主持久性，不长时间保持许可等待，不尝试替代工具绕审批。审批拒绝继续报告并停止原动作。

## 本次真实对象的后续边界

研发输入报告文章 `5b486b33-2175-4e60-92ff-cc527a40b6cd`、attempt `eee61dd7-8091-4072-be43-b89cb94168c3` 为真实 reserved、未消费，原执行正常取消。本轮没有读取/改写该真实对象，也没有追索失效 token，不能把研发说明当新的服务端状态或独立验收。父任务实际续作时先用正规 read/preview 重新确认；任何 consumed/unknown/终态/Word/owner/account 变化都停止本模式。原停止消息需真实保留为 audit，原“接受重复草稿”许可要原样引用；新的精确恢复是否已有明确本人授权由主会话如实核对，不能自行补造。

## 离线验收

- article-upload-unconsumed-continuation.mjs：当前所有真实 SQLite 迁移/索引，人工 Word/R2 合成，两平台、guard 0/1、普通首次/legacy、finish→claim、整闭包/claim 丢失/live/expired/released 快照、新子 batch 回执在 commit 后丢失、连续中断、批准缺失、并发、迟到旧 consume、父/lease/Word/用户改动 CAS、审计不变、唯一消费、完整重开验收。
- article-upload-unconsumed-concurrency.mjs：捕获实际服务函数 SQL，两独立 SQLite WAL 连接并发，恢复、消费、旧 consume vs 恢复均单赢；只含合成值。
- article-upload-unconsumed-migration.mjs：真实本地 workerd/D1/Drizzle 从0036到0037，重复 migrate，无关 schema 与所有旧记录不变。
- browser-upload-host.mjs：官方 envelope 的合成应答、固定错误、脱敏回执来源、emit/审批交接异常与并发 operation_id 幂等；不是一次真实审批调用。
- browser-upload-integration.mjs：真实 SQLite articleCall + 模拟 browser runner + bridge/host，成功 reserve 后接收拒绝、实际模拟 runtime cancel、准确新授权子许可、false/unproven、新 chooser、一次模拟 setFiles、保存独立重开全文与全部图。

全仓测试、基线对照、typecheck/build/lint 结果见 evidence/unconsumed-recovery/report.json；失败/未做应分别列明，不能把离线通过表述为真实平台或宿主已恢复。
