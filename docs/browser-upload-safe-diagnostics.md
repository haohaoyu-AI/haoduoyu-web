# 上传工具的固定错误诊断

本轮候选基于正常 Sites 源码读取核验的正式 V119 `3acddc3fdd236c7c969c2fd71ab55a620901d356`，只修改工具宿主错误诊断、合成测试和本文档。服务端、bridge、授权、schema、迁移和一次性许可没有变更。本执行器没有调用真实恢复、消费、上传、attempt/租约读写或平台 API，没有发布。

## 已复现的诊断根因与未知事实

V118 的 JSON text、error_code 和字符串 error 提取缺口已在 V119 修复；V119 也保留了 structuredContent 为 null/undefined 时读取 content 的修正。本轮复现的是另一处遮蔽：isError=true 且非空 structuredContent 只有 `{error_code:'INVALID_ARGUMENT'}` 时，单个 content text 内的固定摘要被忽略。例如合成 content 为 `{error:'Unconsumed recovery snapshot or scope changed'}`，旧宿主输出通用摘要。修后只在错误分支读取两种来源，保留各自识别出的固定值；不会留存原始对象。

执行者报告的最新真实错误轨迹包含 tool_call_returned、tool_result_error(shape=structured_content, fields=[error_code]) 和 bridge_call_failed。真实 raw 已丢失，不能断言 content 实际存在固定摘要，也不能判定哪个 guard 拒绝，或是否进入了服务端。原正式 schema 对调用者请求的独立离线校验据执行者报告为零错误；它不证明连接器规范化或业务 guard 已通过。合成复现证明的是诊断缺口，不能将其宣称为真实恢复拒绝的已知原因，更不能据此重试真实 mutation 或从日志回找 raw/token。

## 严格解包与脱敏

- 支持正常 CallToolResult 的 structuredContent 或单个 JSON text。成功分支仍以 structuredContent 为准，其 companion text 不解析为错误或记录正文。只接受对象业务结果；坏 JSON、数组、多个 text 或嵌套的未解包 tool/RPC envelope 失败关闭。
- isError 的 JSON text、structuredContent、字符串 error、error_code 和有界嵌套 error/message 可提取固定清单值。没有 isError 标记但携带正式 error/error_code 的返回也作为错误处理，不进入成功回执。
- 显式 JSON-RPC envelope 的 error 保持失败；只映射五个标准 RPC 错误码。未知码、任意异常/stack/body/URL、动态字段名和值均丢弃，不做子串匹配或推断服务端原因。
- 固定上传摘要清单仍与服务端逐项一致；另保留少量已有 bridge 固定 guard 文本。传给正常工具的已知 claim/consume token 若污染固定摘要或码，同样降为通用错误。没有 token 持久化或重发。
- 错误分支的非空 structuredContent 和恰好一个 text 分别提取白名单值。嵌套 JSON 仍限深三层、单段 JSON text 限 16,384 字符；多个 text 不拼接。冲突码产生通用码和通用摘要；仅摘要冲突时保留一致码、使用通用摘要。来源中的固定候选值保留并标记冲突；未知值不参与选择，不拼接摘要，不据此改变业务行为。

## 调用边界标记

每个 host 回执的 diagnostics 只保存固定枚举、白名单字段名/错误码/摘要和布尔标志。可选 `emitDiagnostic` 在同一活 cell 中收到实时副本；回执 journal 保存自己的副本。观察者修改副本、同步抛错或 Promise 拒绝都不会改变调用、触发重试或授予导入。它不接收 args、响应正文、原始异常或凭据。

tool_call_returned 记录顶层 envelope_keys 的白名单交集（包括 id 的名称，不含值），other_keys_present 仅表明有其他键，不保存未知键名；未知键名也可能夹带凭据。structured_kind、text_kind、is_error 只记录固定形态枚举。JSON-RPC 成功封装时，形态检查对象是 result 内的 CallToolResult；顶层键名仍来自实际外层返回。成功 structuredContent 的 companion text 标为 uninspected。

错误阶段的 error_sources 分别保存 source、白名单字段名、固定 codes 和 summaries。错误 envelope 本身的 code/message 等字段固定标为 envelope，与 structured_content 和 content_json/content_text 区分，返回和抛出路径一致。code_source / summary_source 表示识别到的候选值来源（无、单来源、多来源或冲突），code_conflict / summary_conflict 表示候选值分歧；最终摘要在码冲突时仍强制通用，即使摘要候选一致。它们不是服务端归因。返回错误、抛出的 CallToolResult、connector/RPC 错误都经过相同过滤；已知工具输入凭据与固定候选值碰撞时，诊断候选值也被移除。

| 标记 | 实际观测含义 |
| --- | --- |
| bridge_guard_start / bridge_guard_failed | 本地 bridge 核验开始；失败且未进入 call |
| bridge_call_before | 将要调用已配置的 call，不等于服务端已收到请求 |
| tool_mapping_missing | 正常工具函数映射缺失；未调用它 |
| tool_call_before / tool_call_returned / tool_call_threw | 实际正常工具函数调用前、Promise 返回或抛错；抛错可能来自审批、连接器、RPC/网络或服务端，不能仅凭此定位原因 |
| tool_result_error | 收到 isError 的 CallToolResult，可区分 structured/content JSON/纯文本形态 |
| tool_connector_error / tool_rpc_error | 实际返回包含 error/error_code，或显式 JSON-RPC error；字段名和固定码来自该形态 |
| tool_result_invalid / tool_result_decoded | 返回无法安全解包，或已解包为业务对象 |
| bridge_call_returned / bridge_response_rejected / bridge_response_validated | call 已解包返回；后续安全核验拒绝，或已核验并脱敏 |
| bridge_call_failed | call 未正常解包返回；看前面的实际边界标记定位范围 |

这些是客户端观测，不是服务器签名、RPC 投递证明、guard 执行证明或安全审批证明。即使识别出服务端固定文本，也不能排除连接器返回同一固定文本。成功 result 本身未加入诊断字段，response_sha256 仍仅绑定真实脱敏 result；私有 journal 递归冻结，execute/read/emit/deliver 每次使用独立副本。错误回执仍不转交 CUA 接收者，不回显未核验的 request 身份字段，不自动重试。

示例接线延续原正常官方工具映射和已授权 scope，仅增加非秘密观察者：

```js
const call = createUploadToolCall(normalOfficialToolFunctions);
const bridge = createArticleUploadBridge({
  call, approvedScope, currentClaim, priorExecutionStopped,
  summarizeToolError: summarizeUploadToolError,
});
const host = createArticleUploadHost({
  bridge,
  emit: actualSanitizedReceipt => emitActualReceipt(actualSanitizedReceipt),
  emitDiagnostic: safeMarker => emitNonSecretMarker(safeMarker),
});
```

没有增加 HTTP/替代工具/传输，也没有修改服务端授权、guard、CAS 或一次消费规则。旧 chooser/grant 不迁移；false/unproven 文件证据、chooser 在前、consume execute_import=true 后唯一提交、保存并独立重开全文与全部图片验收均保留。journal 仍只存在于同一活 cell；诊断不能恢复失效许可，也未验证真实 CUA 审批纠正或平台成功。

离线测试 `tests/browser-upload-tool-diagnostics.mjs` 保留正式错误形态、成功封装优先级、未知/畸形形态、凭据污染、实时标记时序、观察者失败、同 request 幂等和私有结果/诊断隔离检查。新增 `tests/browser-upload-error-sources.mjs` 覆盖本轮双来源遮蔽、码/摘要冲突、plain/JSON/超长/多个 text、错误与成功污染、返回及抛错路径、源诊断副本隔离，以及实际 emitter 在缺少 structuredClone 的宿主中执行。其工具返回值全为合成；实际 SQLite/本地 D1/runner 回归另列在交付 report 中，不能当真实平台验收。
