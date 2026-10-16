# 本次逐步确认的无图文字测试

这是一项严格一次性授权，固定键 `2026-10-05-stepwise-text-pair`，每个 owner 最多一批；小鱼与 Claude 各一份，Claude 最多一次请求。独立于已使用的 daily、workflow_test、旧 manual 和 rewrite 额度。使用现有表和唯一索引，不需要迁移。

父线程按用户逐步确认执行以下短操作，每项写操作都必须 `confirm: true`：

1. `create_stepwise_text_test`：传入 `expected_model`、`expected_prompt_version`，以及 `xiaoyu`、`claude` 各自的 `{topic, materials, outline, sources}`。先冻结当前完整三项固定提示词、canonical 框架、公开来源、模型与输入哈希；不认领或生成。与预览提示词相同的本轮覆盖句附加于 `providerSystemPrompt(currentPrompt)` 后。
2. `claim_stepwise_text_writer`：只传 `run_id`、`writer: xiaoyu|claude`、`confirm`。只有首次原子认领赢家获得一次 token、item_id、有效期及完整冻结 `system_prompt`、`user_prompt`。重放不返回 token；不续租、不重认领、不创建文章。请保留首次成功返回的凭证，不写入日志或 URL。
3. 等待用户确认写作阶段后，小鱼由父线程按冻结提示词写出文章，再用 `save_stepwise_xiaoyu_text` 传 `run_id/item_id/token/title/paragraphs/confirm`，保存正文2000–3000字，标为 `agent_text`。完整同文重放只读，即使保存后认领过期也不能覆盖或再次收费。
4. Claude 在私有 `/writing/stepwise-text-run` 页面正常填写首次认领返回的批次、原稿标识、token 和冻结模型，勾选独立确认，点击唯一执行按钮。页面通过 `POST /api/claude/stepwise-text-run` 读取 NDJSON 长连接。入口只接受 `run_id/item_id/token/expected_model/confirm`，身份、same-origin 与专用 header 缺失均拒绝。当前配置的同一 YYLX 接收方和模型保持原状；输出最多14000 tokens，300秒，不重试。
5. `read_stepwise_text_test` 或页面“只刷新本次状态”读取两位作者的原稿与状态；不返回 token。Claude 的精确实际返回、解析正文、原始用量与失败诊断在 `claude_attempts.response.stepwise_text` 命名空间中保存，标为 `provider_text`。小鱼独立命名空间条目没有 provider 用量。请求预占后的失败、超时、截断、未知或断线均只能只读恢复，禁止新请求。结果未知时不得假定失败并重试。

这条通道不创建 `articles` 行，不写对象存储，不触发 `events.dispatch`，不调用旧 save/submit/claim_article、配图、平台投递或私稿队列。`writing_runs` 使用 `stepwise_text:<server run_id>` 与专用状态。原稿确认后由父线程制作无图 Word 并保存 Library；本增量没有开发 Site 的 Word 上传功能。

所有原稿与凭证均不进入 URL、浏览器持久存储或日志；凭证输入使用 password，仅在提交请求内存中短暂保留。页面刷新不会返回已发出的 token。一个新页面只能操作这次固定授权；客户端不能自定义日期、授权键、额度、输出限制或重试。

离线验证：`node tests/stepwise-text.mjs`；相关回归为 `writing-outline-guidance.mjs`、`manual-writing.mjs`、`claude.mjs`、`writing.mjs`、`daily-stream.mjs`、`mcp-contract.mjs`。类型检查使用 `node node_modules/typescript/bin/tsc --noEmit --incremental false`，限定 lint 新增文件。全部模型、存储和事件边界为本地 mock，不调用真实模型。
