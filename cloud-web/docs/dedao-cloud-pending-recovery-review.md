# 云成文 pending 恢复与只读投射

基线：`ab35236c37d015cd0ec40e5dae3545eb30307da4`。pending 修复独立提交：`164e106191b40c0c546b3603643135209208f7bc`。本轮仅修改 `lib/dedao-cloud.ts`、两份专用测试与本说明；原 0000–0053 共54个迁移及109个 drizzle 文件逐字节保持。

## 修复行为

原实现写入 queued/pending 任务后，如果取回 chosen 任务失败，同 request_key 或新 key 重试都会直接只读返回活动任务，永远不派发。聚焦基线的 chosen 读取前/后故障及真实 SQLite 派发前 ABORT 共6案，全部复现失败。

重试复用原 id/request_key/created。只有 queued、claim_hash NULL、pending 的候选任务重新核验 `dedao.cloud_requested` 和 `article.submitted` 两项正常连接，然后进入原 `notify` 的 pending→sending CAS。连接断开或连接读取异常时保留 pending；sending/unknown/accepted、已认领、writing/processing/completed 不补派、不重置。原 notify、events、claim/reserve/consume、私稿完成和 finish 门禁未修改。

## 只读响应字段

- 顶层 `owner_scope`：SHA256(`dedao-cloud-owner:` + 本人 owner)，所有正常读取响应均返回，包括没有任务时；不返回原 owner。
- `task.article_state`、`task.article_error`：同本人已绑定文章的真实状态与脱敏错误。
- `task.deliveries`：最多两个平台（toutiao/zhihu），各取当前最新持久记录，只返回 platform/state/message。
- `task.downstream_status`：`not_bound` / `available` / `unavailable`。可选元数据读取异常返回 unavailable，不泄露 SQL 错误或改变原认领响应。

错误文本最多600字符，超长信息返回固定查看原任务提示。既有 editorial 编码凭据检查与 Word 历史/已知认领脱敏共同执行；百分号和 JSON 转义的 provider/字段凭据也隐藏。未知状态返回 unknown。投射不返回正文、文件/草稿地址或凭据；不把 saved/completed 标签当作真实 Word 或双平台完成证据。

## 离线验证

```sh
node --test --test-reporter=tap tests/dedao-cloud-pending-recovery.mjs tests/dedao-cloud-read-projection.mjs
node tests/tonight-eight-d1.mjs
node tests/upload-attempt-guards.mjs
node tests/article-word-settlement.mjs
node tests/mcp-contract.mjs
./node_modules/.bin/tsc --noEmit --incremental false
./node_modules/.bin/eslint lib/dedao-cloud.ts tests/dedao-cloud-pending-recovery.mjs tests/dedao-cloud-read-projection.mjs
git diff --check
```

以上均通过。专项共48案：恢复35案、投射13案。恢复测试载入实际 cloud/events TypeScript，全部原迁移在隔离真实内存 SQLite 执行；chosen/insert/收据故障和 SQLite ABORT、16路同/新key并发、签名/固定事件身份、owner隔离、双连接断开、保护状态只读、无关表不变均覆盖。`freshCloud()` 只验证模块重载，不能称为文件数据库或进程重启验证。

只读独审发现首版投射遗漏百分号编码 provider key，独立红测试复现后改用既有编码检查，最终48案全部通过。既有上传门禁21组、Word结清67组及正常云私稿完成测试通过。未执行整站历史套件或真实云执行者验收；未执行生产迁移、push、部署、计划/订阅变更、得到动作或平台写入。
