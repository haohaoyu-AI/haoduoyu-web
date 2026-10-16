# 单次纯文字独立审稿流程

本增量仅作用于 `2026-10-05-stepwise-text-pair` 的已保存初稿。每个作者一个独立修订 scope，服务端生成 flow ID，不允许改日期、授权键、次数或重置。旧 daily/manual/test/rewrite 的额度、模型包装和记录不变，不创建 articles，不调用事件、图片、平台、Word 或 Library 上传。

## 实际提示词

有效提示词保留原完整重写要求、固定三项资料、范文及排版参数，追加四条最新规则：自然交代出处；判断融入分析、避免突兀第一人称宣告；娱乐号口语和有根据的调侃幽默；短句为主、通常一两句一段、避免硬切语义。最新表达规则优先于旧默认文风，手机段落节奏明确优先于旧的避免短句/单句段规则。版本为 `表达补充·20261005-06`，新写作请求实际携带补充。旧冻结快照和正文不会回填。

## 五个短 MCP 操作

1. `create_text_revision`：用户确认后，用 `run_id/writer` 读取已保存初稿。传入初稿作者 `writer_actor_id/writer_execution_id` 与 `participants.review/rewrite/verify`（各含 `actor_id/model`）、当前 `expected_provider_model/expected_prompt_version`。三个完整阶段 system prompt、事实材料、canonical 框架、初稿正文/hash、参与者及预算一次冻结。
2. `read_text_revision`：只读 `flow_id`。返回当前阶段、原稿版本1、问题清单、改稿版本2、变更、独立复核、下一阶段完整输入及预算；不返回认领 token。
3. `claim_text_revision_stage`：明确 `confirm:true`，指定 flow、`review/rewrite/verify`、预期输入版本、冻结模型标识与提示词版本。首次原子认领才返回一次 token、item ID、完整输入及输入 hash；重放不返回 token。有效期两小时，不续期、不重新认领。
4. `save_text_revision_stage`：明确确认后，提交 claim 的 token/item、actor、独立 `execution_id`、输入 hash/版本/模型/提示词版本及精确 `raw_result` JSON。正文/问题/变更/复核来自真正独立执行的 agent，不能用同一次生成中的自我描述替代。格式见 claim 的阶段提示词。保存与复用执行 ID 检查原子完成，原样重放零写入，变更拒绝。
5. `confirm_text_revision`：只有独立复核 `passed:true`、所有问题 resolved 且无遗留问题时，才能以版本2和正文 hash 接受用户明确确认。只记确认，不自动制作 Word 或继续投递。

阶段为 `review_pending/claimed -> rewrite_pending/claimed -> verify_pending/claimed -> awaiting_user_confirmation -> user_confirmed`。任一执行/材料失败、格式错误、凭证回显、引用不在相应段落、复核未通过，都保留结果并停止。过期仅可读取。输入/model/owner/版本绑定错误拒绝。问题引用绑定原稿，变更与复核引用绑定改稿，来源只允许冻结 URL。改稿严格2000–3000字，每个问题必须有变更和复核记录。原稿从不覆盖，两个作者从不共用结果或预算。

## 来源与调用预算

该版本是**外部独立 agent 结果登记流程**，没有新增模型请求入口。身份、模型与执行 ID 是所有者提供的执行来源声明；服务端检查绑定、角色独立性和每个 owner 的 execution ID 唯一性，无法证明外部执行本身。父线程须实际取得独立 agent 结果再保存。审稿者、复核者必须不同于初稿作者和重写者；可同为一个独立审稿 agent，但须有不同执行 ID。

初稿仍保留其原 `agent_text/provider_text` 来源；修订结果标记 `owner_attested_agent_result`，改稿正文标 `agent_text`，即使处理 Claude 名下初稿，也不冒称该改稿由 Claude API 生成。Claude 等待期间不会通过此流程调用它。

若四个阶段全部使用付费模型，每篇总4次，已保存初稿之外潜在新增3次。新 scope 单独冻结 `potential_additional_calls:3 / approved_calls:0 / used_calls:0 / provider_enabled:false`，无自动收费入口，不占用或复用原一次性 Claude 请求。日后若用户批准付费阶段，需另行实现明确授权入口；本增量不会将批准字段改为非零。

精确安全 raw JSON 与解析报告共同保留；含凭证的返回只保留绑定、结果 hash 和固定失败原因，不保存 raw。通用密钥、当前配置的 opaque key、所有本流程及原测试 token、嵌套字符串/键和多层 Unicode 转义都在保存前检查。公共错误固定白名单，不回显参数、原稿或凭证。长连接断开不影响旧初稿只读恢复；修订阶段只登记已有 agent 结果，不能自动重试。

## 离线验证

`node tests/text-revision.mjs` 使用内存 SQLite、离线合成资料与禁用网络 mock。覆盖完整阶段、并发创建/认领/保存、版本和模型绑定、独立执行、问题与引用、失败停止、凭证安全、不可变版本、只读重放、两个作者隔离和 MCP 身份/same-origin。所有 provider/articles/events/platform/objects 计数为零。相关旧 stepwise、框架与 MCP 回归另行保留日志。
