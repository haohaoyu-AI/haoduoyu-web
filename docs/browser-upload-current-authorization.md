# 当前已消费上传链的只读核验

本变更供审阅，尚未部署。它不恢复平台访问审批，不建立浏览器执行实例，不代表私人草稿已保存或验收。

## 正常接口与父级接线

新工具 `read_article_upload_authorization` 使用现有 authenticated-owner 工具入口；owner 来自认证上下文，不能由调用参数指定。旧 preview/read/claim/reserve/consume/record/finish 的输入、响应与权限规则不变。实现位于 `lib/article-upload-attempts.ts`，通过既有 `articleUploadTools` 自动登记与 owner-scoped `articleCall` 分派。

必填字段：`article_id`、`platform`、`execution_claim`、`attempt_id`、`target_account`、`word_sha256`、`word_size`、`consumed_at`、`expected_attempt_revision`。`platform` 仅头条或知乎；固定账号分别是 `61556093362` 与 `ren-zhe-ai-chi-yu-52`。所有 scope、Word、时间、revision 均使用原真实工具回执，不从预览 fingerprint 推断。

`execution_claim` 只留在唯一原父级易失内存，直接输入正常工具；不进入 CUA、公开观察文件、日志或文档。普通 `new_word` 没有独立 `consume_token`，必须省略；已存在 token hash 的旧 continuation/reimport 必须输入原父级仍保留的原易失 token。丢失该 token时停止，不能重发、恢复或换 token。

运行时拒绝未知 own key、symbol、隐藏字段、访问器和缺少必需字段；在异步 hash 前复制经过类型检查的标量。服务端只执行 SELECT，不写 credential hash、attempt、lease、Word 或诊断，不续租、不再次消费。

同一条 SELECT 从当前行核对 owner/article/platform、固定账号、原 attempt ID 与 revision、原 claim token 与 attempt claim hash、条件 consume-token hash、原 `consumed_at`、当前最终 Word SHA/size、有效 metadata/output_id、原 attempt 仍是 latest 且无 child/end、未删除、当前 destination 为 saving。头条核主 lease，知乎独立核 delivery lease。仅 `outcome_unknown`、空 URL、无 readback 的原链可匹配；已观察或已验收的稿不能获得新的提交路径。`new_word` 要求 guard=1；已授权旧模式仅接受既有 guard 0/1。

`consumed_at` 必须逐字匹配数据库原值，服务端时间须满足 `consumed_at <= now <= consumed_at + 60000ms`；lease expiry 必须严格晚于 now。SQL 前取实际服务端 `checked_at`；返回后再次检查实际时间和两个原截止点。查询迟到不延长窗口，时钟倒退拒绝。`observed_at = checked_at` 是查询开始的保守服务端时刻，`verified_at` 是查询返回后的截止核对时刻。它证明同一快照，不锁租约，不保证之后行永不变化。

成功业务响应字段为：

```json
{
  "read_only": true, "current": true, "matches": true,
  "execute_import": false, "submission_permission_issued": false,
  "article_id": "<原 article>", "platform": "toutiao",
  "attempt_id": "<原 consumed attempt>", "target_account": "61556093362",
  "word_sha256": "<原 Word SHA>", "word_size": 11947179,
  "revision": 1, "consumed_at": "<原真实消费时刻>",
  "observed_at": "<服务端读开始>", "checked_at": "<同读开始>",
  "verified_at": "<服务端返回后核对>",
  "lease_expires": "<原 lease 到期>",
  "valid_until": "<min(原 lease expiry, 原 consumed_at+60s)>"
}
```

上面的占位符与 revision/size 展示仅解释结构，不能作为可调用证据。拒绝或内部读取异常只返回 `read_only:true,current:false,matches:false,execute_import:false,submission_permission_issued:false,reason:'current_upload_authorization_not_confirmed'`，不反射输入或数据库错误。

唯一原父级在 gate `issue` 和 `authorizeSubmission` 的真实 `authenticateCurrentChain` 回调中直接调用本工具；以本次 `current/matches` 的真实回执确认 claim/current，继续绑定原 prepared 对象和原顺序。gate 的 `execute_import=true` 只能来自保留的原成功 consume 回执，不能来自本接口。原 `claimed_at/reserved_at/consumed_at/saving_at` 不改；当前读时间不得替代原消费时间。父级动作账本仍须证明没有已经发出的 Open，保持同一原生窗口、原账号、同宿主 Word SHA/size；服务端无法认证鼠标、截图或 OS 窗口。

当前 V156 没有此新工具；未部署或入口不能正常调用时继续 fail closed。一次未知响应不重放 consume/Open，不切通道，也不重建原 grant。

## 正式停止与成功响应

未知/未完成停止前，唯一原父级须同步执行 `core.cancel`/`bridge.cancel` 建立 fence，停止 controller、join 全部真实 reader（包括已启动的 OS 进程/工具 session）；await 全部已发动作，显式调用并核对 `bridge.flushCancel`，再取得独立 settlement 与同窗真实关闭证据。`core.cancel` 必须同步返回，flushCancel 回执也不能代替真实结算。所有已发浏览器、文件、状态写必须 settled，同窗已真实关闭且无在途。缺少这些真实证据不能填写 stopped=true。当前没有任何实际 actor/claim/chooser/permit/提交，本代码不推定执行已停止。

已 claim、无 attempt 或仅 reserved：真实停止后只调用 `finish_article_upload_execution`。已 consumed：先只读 `read_article_upload`，取其 `attempt.revision` 为 `expected_attempt_revision`；同一最新 attempt 的正常 `consume_article_upload`/`record_article_upload` 返回 `attempt.revision` 也是真实来源。不得使用文章 guard、另一 attempt、preview fingerprint 或计数猜 revision。

然后调用 `record_article_upload_executor_end`，必填 `article_id,platform,execution_claim,attempt_id,target_account,word_sha256,word_size,expected_attempt_revision,prior_executor_stopped:true,prior_executor_end_reference`。known identity 提供该 attempt 已保留的真实 `existing_editor_url`；unknown identity 填 `prior_draft_identity:'unknown_without_editor_url'` 并省略 URL，只在 unchanged unknown/无 URL/readback 下成立。旧 `existing_editor_url:''` 的正式兼容仍保留。

end reference 没有规定 prefix/UUID 格式：源码 `short()` 要求非空且 trim 后非空、长度不超过 180 字符、无 ASCII 控制字符/DEL，并通过既有 credential 检查。由原父级生成稳定的非敏感事件引用并与真实 stopped 证据关联，同一 acknowledgement 保持完全相同。reference 自身不能证明浏览器已停。

end 首次/竞争成功返回 `recorded:true,cached:boolean,execute_import:false,attempt:<publicAttempt>,executor_end_reference:<exact reference>,limitation:'Executor acknowledgement, not server proof of browser termination. This attempt is now immutable.'`。已有完全相同 end 的早期缓存分支返回同样的前五字段、`cached:true`，没有 `limitation`。必须核对 `recorded===true`、boolean cached、原 reference、exact attempt ID/revision/account/Word/consumed_at；不能猜 `finished` 字段。cached end 不证明当前 live lease。

再调用 `finish_article_upload_execution`，输入仅 `article_id,platform,execution_claim,executor_stopped:true`。确切成功字段：

```json
{
  "article_id": "<同 article>", "platform": "toutiao",
  "state": "toutiao_saving", "released": true,
  "execute_import": false, "new_upload_allowed": false,
  "unconsumed_permits_fenced": true, "history_preserved": true,
  "evidence": "current_executor_acknowledgement_not_server_termination_proof",
  "instruction": "This execution is finished. Existing Word, attempts and diagnostics are unchanged. A successor must claim normally and follow the existing separate import/reimport authorization; never reuse this claim or an old permit."
}
```

`state` 是原本平台状态，不是新的 finished 状态。必须核对上述成功标志、原 article/platform/state/evidence，再经正常只读接口回读 lease 已清和历史/Word 不变。普通 draft preview 的 `claim_present:false,claim_expires:null` 能说明回读 lease 已清，但其 fingerprint 不当作原 token 的稳定 identity。

finish 要求自己的当前 live claim，并拒任何同平台历史 consumed attempt 没有 exact executor-end（包括旧版和 verified）。它仅清 lease，保留平台状态/Word/历史，不发新许可。TT completed/ZH saved 不接受 finish；成功 `verified -> completed/saved` 原正式状态入口本身结束 lease，不盲调 finish，不伪称另有 released/end 回执。

未知流程若先写 needs_login/needs_verification/failed，旧状态入口会立即到期，可能阻断后续 end/finish；先 end 又会冻结状态写。本变更不修改该契约：按现有 SOP 在仍 live/saving 时先真实 settle，再 end/finish，保留状态与诊断。自然到期、丢失 token、工具拒绝或动作未 settled 都不自动恢复/重认领。

## 离线验证

`tests/article-upload-current-authorization.mjs` 使用当前真实 TypeScript handler、完整迁移的合成内存 SQLite、合成 OOXML 与真实 reserve/consume/status 链；检查全数据库/存储快照不变，禁止所有 writes 与网络。覆盖双平台、错凭据/Word/账号/revision/时间、旧 attempt/end/child、当前 token 与原 hash 不一致、删除、坏 metadata、真实查询前 race、查询 await 期间截止和时钟倒退、token-bearing 旧模式、schema/runtime strict input。它不接触原 22 图 Word、CUA、生产平台或生产 SQL。
