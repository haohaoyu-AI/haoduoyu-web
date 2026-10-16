# 配图任务在成品保存前的恢复

当前候选基线为正式 V136 / `7ccd3547e91d35cf14a4b318dc787dfd1ff8252e`，通过正常 Sites 源码凭据取得。原 V136 使用 `0045_article_word_executor_recovery`；本轮新增 `0046_word_serial_attempts`，0000–0045 原文件不改。本接口只续接同一篇文章的配图、Word 阶段，不创建文章，不派发执行者，不发通知，不授予平台导入或修改账号、订阅、访问权限。严格得到来源与串行尝试详见 [dedao-word-serial-attempt-contract.md](dedao-word-serial-attempt-contract.md)。

## 适用范围

本人文章必须为 canonical source、`processing`、保留原主 claim、没有 final result、upload guard 为 0。冻结 paragraphs/hash 必须与已有 manifest、control 一致。来源为普通原文上传，或经本轮完整实证核验的得到外部定稿导入；不能仅因有 dedao_items 或原稿路径就恢复。网站自动写稿及 writing/editorial/outline/真实热文生成关联、删除中的文章、真实上传尝试、平台 delivery、draft URL/readback 不适用。V121 无 attempt 的 file_handoff/chooser_wait diagnostic 保留且可兼容；submission/import/readback diagnostic 即使报告失败也表示平台结果不确定，拒绝本 Word-only 恢复。diagnostic 本身仍是自报观察，不证明平台收到文件。

普通 `claim_article` 和旧 `recover_article_claim` 在读取及最终 SQL 更新中都拒绝替换未保存成品的 canonical 旧 processing claim，包括未核实来源。静态来源不足时返回等待来源核验，不把无效来源引向必失败的恢复工具。来源候选指引不证明 R2 实际字节已核验。首次未认领 queued 任务、已保存 Word 的原平台恢复政策保留。

## 四个正常 MCP 工具

| 工具 | 输入 | 结果 |
| --- | --- | --- |
| `preview_article_word_recovery` | article_id | 冻结输入 hash、完整 expected_fingerprint、已有输出身份和真实持久记录数量；不返回凭据、正文或存储路径 |
| `end_article_word_execution` | 原 claim；原 execution_id；已采用时须原 execution_token/epoch；input_sha256、稳定 request_key、停止确认及引用 | 原持有者停止确认的不可变回执，并原子过期主 claim、fence Word token/epoch、清本任务队列；不发新执行 grant |
| `recover_article_word_execution` | article_id、稳定 request_key、客户端内存中的全新 next_claim_token、fresh fingerprint/input hash、同文章/既有成果/原执行确认、termination | 原子替换同一文章主 claim，登记不可变回执，保留成果和 desired 意图，进入 await_executor；无执行 lease 或平台许可 |
| `read_article_word_recovery_receipt` | 同 article_id/request_key | 是否记录、当前是否仍适用、已确认版本；永不返回 token 或重新 grant |

恢复的 termination 是以下两种之一，服务端严格验证字段和禁用额外参数：

1. `holder_end_receipt` + `end_request_key`，绑定原主 claim hash、输入及原执行。停止确认由当前原持有者提交；过期凭据只可结束自身，不能写 Word。
2. `codex_terminal_observation`：精确 execution_id/thread_id/turn_id、completed/interrupted/failed/ended 终态、准确 UTC ended_at/observed_at、实际正常工具的终态引用及原领取至执行映射引用，并须 `confirm_all_actions_settled:true` 和实际 `settled_reference`。已授予执行须有同当前主 claim、input、execution_id 的不可变 Word grant；旧无执行记录须原 help acquisition request_key/claim hash 和原 handoff/event 关联。未知直接执行者拒绝。

外部 Codex 记录是 `authenticated_owner_attested_codex_tool_observation` / server_verified=false：本站验证身份、绑定、时序与 CAS，不直接认证 Codex 的远端进程。调用执行者必须先通过真正可调用的正常 Codex 工具取得精确原回合终态及映射，不可伪造引用或 UUID。expired、idle、失联、网络断开、`report_word_interruption(executor_ended)` 均不等于这个证明。

## 并发、断线与成果

完整 fingerprint 覆盖原 article/source/input/claim/output/manifest、control、ordered checkpoints/parts/verification、candidates/progress、队列与不可变 grant/history、help/handoff/restart、diagnostics、end/recovery 及范围排除条件。最终 D1 batch 重新比较全部快照，用数据库当前时间检查租约，只有一个旧 claim 可产生一个 successor。先前 async 检查不授予晚到写权限。

请求键和参数包括客户端新 token 的 hash。响应未知时保留同一 request_key 和同一内存 token，先回读，再按原参数重试；不能换键再领。相同键不同参数拒绝。审计表拒绝 UPDATE/DELETE。历史领取回执不被覆盖，也不能通过旧 key 取到新 claim。新 token 不能复用历史 article/local Word/execution 凭据。

终态日期不能早于已记录真实授予、心跳和成果写入；用户后续暂停/取消的控制更新时间不冒充执行者仍在活动。旧分块没有历史时间字段时不补造时间；其全部身份/内容仍由当前快照 CAS 绑定。严格 0/0、未授予 lease、同 queue/history 的初次容量等待记录可按原人工领取映射恢复；带 token/grant 的不一致 0/0 控制拒绝。

既有原生部分 Word 的 output_id、SHA、size、chunk 数和已接受 prefix 原样保存，并建立原有 legacy output binding；恢复不重建文件，不补造像素、搜索或逐页检查历史。已暂停/取消的任务保留该意图。恢复后仍需正常 `acquire_word_execution`，保留 7 个总资源位/2 个 heavy 位，叠加每 owner 一个实际配图执行占用；已登记结束的 execution_id 不能凭新 key/token 重新领取。

恢复后尚未领取 subordinate lease 的新主 claim 不能套用先前执行的终态再次恢复。当前协议不会猜测它的新执行身份；须有实际新执行绑定和结束证据才可进一步续接。原结束和恢复记录仅作审计。

最终保存仍以本站 finalize 和独立 read 为准。cloud Word ready 与桌面落盘证据保持分开。最终成品和不适用任务在新工具保持只读/拒绝，不改变既有清空、热文、V115–V120 guard/host/bridge 或 Windows 代码。
