# V120 未消费恢复固定拒绝定位

正式源码基线为 `6c8096639134d5a7210aa4c30362289a70e4247f`。正常 Sites 版本和 succeeded 部署已核验；本候选只新增 owner-only 只读诊断及离线测试，不改恢复、消费、CAS、旧审计、迁移或 Word。

## 同一摘要的三条来源

V120 原 `lib/article-upload-attempts.ts` 的 `Unconsumed recovery snapshot or scope changed` 有三处抛出：

| 基线位置 | 拒绝条件 | 正常只读证据及限制 |
| --- | --- | --- |
| 385 | parent ID/revision、恢复 fingerprint、授权固定账号、父账号、Word SHA/size 任一不等 | `read_article_upload` 和 `preview_article_unconsumed_upload_recovery` 可核当前值；调用前后相等不证明中间没有瞬时变化 |
| 418 | `db.batch([insert,rotate])` 抛异常，且同 authorization_key 回读不到同 request_sha 的 continuation child | 可包含 trigger ABORT、SQL/约束/binding/存储异常、事务或响应丢失；存在同请求 child 时只返回 cached，无许可重发。原始错误已被丢弃，不能追溯具体异常 |
| 421 | batch 正常返回，但 insert changes=0，当前行也不是同 request_sha continuation child | parent 全列、article artifact/guard/state/readback、lease 全列、manual source、无 newer child/删除记录等 SELECT 条件或 OR IGNORE 的唯一约束没有通过；既有只读可看当前 parent/child，但不能回推哪个瞬时 predicate 变化 |

rotate changes=0 或当前 attempt ID 不符会产生另一固定摘要 `Unconsumed recovery rotation was not confirmed`。不能把本次共同摘要简单等同于 fingerprint 过期、过期 lease、迁移缺失或平台风控。

## 精确状态组合的实际复现

`tests/article-upload-recovery-refusal.mjs` 使用正式服务、真实 migrated SQLite、合成 Word/R2/账号 lease，在相同时间点建立 legacy 根许可：2026-10-08 18:28:16.105Z reserved，lease 到 2026-10-09 00:28:16.105Z，调用时为 02:54:10.514Z。article needs_verification、guard1、draft_url=null；parent revision0/version1/reserved/未消费/URLs=[]/readback=null、owner_confirmed_legacy_reimport、previous_attempt_id=null。保留 manual intake、legacy 未知历史、原 task 和 false/unproven same-browser 文件证据。

- 0037 已应用：owner 恢复正常分配一个 child；父行逐字段不变；同请求回放 cached，不重发凭据。
- 只保留 0026→0036 的旧 child trigger：同一状态进入 db.batch，旧 consumed-only 分支不接受未消费父行，RAISE(ABORT) 导致整批回滚，最终正是共同固定摘要；没有 child 或 lease/父行改写。INSERT OR IGNORE 不能绕过这个 trigger ABORT。
- 改错误 fingerprint：相同摘要，但没有进入 batch。
- 在 insert 前改变 retained readback：batch 正常返回 allocation changes=0，仍是相同摘要。

因此，过期 lease + needs_verification + guard1/legacy reserved 的组合与新 SQL/0037 兼容；旧 trigger 可以复现本次拒绝，但这不证明生产正处于旧 trigger。fixture 是小型合成 Word，未读取或重做真实 Word；真实 Word 校验仍以执行者已有证据为准。

## 0037 的部署边界

Sites 的正式 persistence 指南规定：保存 Drizzle SQL 与 metadata，部署在 Worker upload 前逐项应用并记录迁移，失败部署也可能已应用部分迁移。正式源码含完整 0037 SQL、journal idx37 和 snapshot；journal 时间递增。真实离线 workerd/D1 + 当前 Drizzle migrator 测试证明从0036升级到0037后 trigger 生效，重复迁移不改历史。

但源码包含文件、部署 succeeded、版本 archive 元数据都不能独立证明生产有效 trigger 或原始打包确实携带该迁移。现有 Sites DB overview 只提供用户表名，不返回 sqlite_master/内部迁移记录；本执行器没有官方 archive 字节下载入口，bundled site-workflow 在当前 skill 源亦不可读，不能把本地替代打包或本地 Drizzle 测试当官方生产流水线证据。也没有读取 Worker raw 日志、猜表查询、直接改生产 SQL、重写0037或重试原 mutation。

## 最小只读接口

新增 `read_article_unconsumed_upload_diagnostics({article_id,platform})`，经原 authenticated MCP → articleCall → owner-scoped article 查找，再走读取分支。annotations 为 readOnlyHint=true、destructiveHint=false、openWorldHint=false，flat schema 只允许两个既有身份字段。

它只执行 SELECT，报告：

- child_lineage：`unconsumed_v0037` / `consumed_only_v0026` / `missing` / `unrecognized` / `unavailable`。对已知 trigger 实际定义做固定 SHA256 比较，原始 SQL 和实际 digest 不返回、不记录；同名多个对象或未知定义不能当成匹配。
- 12 个既有 upload 唯一索引/不可变与留存 trigger 的固定匹配状态。schema_checks_match_expected 仅表示这些已知对象匹配，不代表完整 schema、业务 guard 或恢复许可。
- 已知 `__drizzle_migrations` 的0037完整 SQL hash + journal timestamp是否有精确记录。缺失该已知 journal 不代表迁移未应用，Sites 可能使用其他记录机制；记录存在也不能覆盖实际 trigger 不匹配。
- 当前 destination phase、guard0/1、lease 是否存在及 live/expired/absent/invalid、父状态/授权类型/untouched reserved/固定目标账号匹配。仅固定枚举、布尔和guard整数；不返回 claim、consume token、其 hash、expiry原文、授权正文、baseline或 raw DB error。

这个新读取不重新跑 Word/lineage/preflight，不计算新许可，不诊断历史失败分支；现有精确 preview/readback继续承担当前 Word/lineage/fingerprint核验。`execute_import=false` 和 `does_not_identify_past_failure_branch=true` 明示边界。原恢复源码三处共同摘要和所有 CAS/许可语义不变。

父任务独审并正常发布后，先用这个读取核有效 schema，再结合既有正常 read/preview。若 child_lineage 是旧版/缺失/未知，先核正常部署 archive 的 drizzle SQL/journal/迁移条目及官方应用记录；不能手工放松 trigger 或重新消费。若有效 schema 匹配，共同历史摘要仍无法区分 batch 异常与零插入，应保留这一未知，不盲重试。

## 验证范围

新增 SQLite/D1 测试覆盖三条拒绝、精确过期 legacy 状态、正常 owner 读取/foreign owner 拒绝、SELECT-only、schema与迁移记录不变、旧/新/缺失/未知/同名 schema、记录精确/错误/缺失/不支持、异常及凭据污染。既有消费并发、回放、历史保护、chooser/文件证据、runner 和 MCP 回归另列于交付报告。

本执行器未调用真实恢复、consume、setFiles、平台、收费模型或生产写接口；未调用尚未发布的新读取接口，未推送或部署。
