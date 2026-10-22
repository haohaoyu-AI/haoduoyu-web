# 性能基线：阶段 3 C1

基线提交 `653dd5ba1c9bdd1bcf0bac05c02a86ce72c46c73`，仅比较普通请求控制表初始化/一致读的固定开销。本地 Node 24、Miniflare 4.20260730，临时合成 D1：3 个默认账号、1 个合成用户、1 个只读凭据，文章/快照/每日数据均为空。不是生产测量，也不是后续 5000/20000/50000 规模或延迟收益证明。

## 方法与计数含义

`tests/counting-d1.mjs` 包装真实 D1 prepare/bind/执行与 batch，只在实际执行入口计 SQL，不把排队 prepare 当作发出。first 使用同一 SQL 的 all 来取得真实 D1 receipt，再返回首行；不改变产品代码。请求外的值快照及并发写入者 SQL 不计入 reader 请求。原始无敏感计数见 [JSON](perf-c1-counts.json)。

- 写语句：已发出的 INSERT/UPDATE/DELETE/REPLACE，0 行也算 1 条。
- `matched_changes`：写语句的 D1 meta.changes，不能当作字段值一定发生变化。
- `d1_rows_written`：真实 D1 receipt 的 rows_written，不推断为计费或磁盘物理写入。
- `value_changed_rows`：请求前后 control 行与 API key 的 last_used_at 值快照差异数。这里只衡量这两类既有 GET 写入，不把 SQLite matched 行数当作值变化。
- 无 receipt 时是未知 null，不填写假 0；校准覆盖真实 UPDATE 0 行仍算 1 条写，以及无 receipt 的失败。
- 控制查询含控制表维护与状态/revision 查询，不含必要的鉴权/业务 SELECT。总 SQL 另列，不隐藏鉴权成本。

## 实测前后

| 请求 | 总 SQL 前→后 | 控制查询 前→后 | 总写语句 前→后 | 控制/业务写 前→后 | 元数据写 前→后 | changes 前→后 | D1 rows_written 前→后 | 值变化 前→后 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 会话 auth/me | 5→3 | 4→2 | 1→0 | 1→0 | 0→0 | 0→0 | 0→0 | 0→0 |
| 会话 accounts | 6→4 | 4→2 | 1→0 | 1→0 | 0→0 | 0→0 | 0→0 | 0→0 |
| 会话 articles | 7→5 | 4→2 | 1→0 | 1→0 | 0→0 | 0→0 | 0→0 | 0→0 |
| 会话 overview | 9→7 | 4→2 | 1→0 | 1→0 | 0→0 | 0→0 | 0→0 | 0→0 |
| 会话 backup（嵌套） | 15→13 | 6→4 | 1→0 | 1→0 | 0→0 | 0→0 | 0→0 | 0→0 |
| AI articles 首次 | 8→6 | 4→2 | 2→1 | 1→0 | 1→1 | 1→1 | 1→1 | 1→1 |
| AI articles 相同时间重复 | 8→6 | 4→2 | 2→1 | 1→0 | 1→1 | 1→1 | 1→1 | 0→0 |

AI 两次读取使用固定 Node 请求时钟，第二次 last_used_at 值相同，仍发出 UPDATE，changes 和 rows_written 仍为 1。不能据“值没变化”声称零写。另有真实 0 匹配行 UPDATE 校准：写语句 1、changes 0、rows_written 0。

## 本轮验收与保留边界

- 普通管理员会话 GET：0 条 D1 写语句，正常额外控制查询 2。
- AI GET：控制/业务写 0，但每次仍有 1 条 last_used_at 元数据写。本轮不改 C2，不能把“所有 GET 总写零”原样打勾。
- backup 保留内层一致读，控制查询 4，单独列出，不冒充普通路径的 2。
- 争用单独计：首次 before 后发生真实并发写，旧版控制查询为 6，C1 为 4；重试均重新鉴权。撤销/过期与读异常改变 revision 的场景不套用正常路径 ≤2 的预算。
- 缺控制行、initialized 0 或恢复隔离 2 均为 503 SETUP_REQUIRED；读取不创建控制行，revision 0 作为有效 before。
- 首次 before 只供 consistentRead 的第一次尝试使用；重试重新读 revision、重新执行含鉴权的 operation，成功与异常出口的 revision 检查保留。mutate/commit/CAS/提交授权/幂等不变。
- bootstrap 与 restore 仍可在空库建立控制行；恢复默认禁止、仅空库、旧会话不恢复等保障不变。故障/过期注入仅在测试层合成库。

定向 C1 回归 15/15 通过；完整回归 130/130 通过（原 115 + 本轮 15，含嵌套父项计数），耗时 244655 ms。构建、8 项资产一致性与双预览均通过；PR #11 初始实现提交 dce5674 的 CI 已成功。最终文档提交对应 CI 在交付时另报。复现：先 npm run build，再 `node --test tests/read-control.test.mjs`；修前计数在基线代码上以 `C1_CAPTURE_PHASE=before` 运行同一测试（零写目标应红）。

本轮未做 C2、缓存、ETag、新接口、SQL 列表快路径、数据库变更或生产写入；没有生产延迟/成本收益结论。

## 红灯证据与覆盖口径

在上述基线源码构建后执行 `C1_CAPTURE_PHASE=before node --test tests/read-control.test.mjs`，Node 报告 15 项中 5 通过、10 失败（包含失败父项，不是 10 个独立产品缺陷）。auth/me 已成功返回 200，但发出了 1 条控制写，目标为 0；revision 0 路径控制开销实际 4、目标 2；真实并发重试控制开销实际 6、目标 4。撤销与过期的 401 和重新鉴权原本正确，其红灯来自旧控制写仍为 1，并非伪造原鉴权失效。读异常重试与 bootstrap/restore 保障在旧版已通过，继续作为不退步检查。后加的无 receipt 校准和诊断输出不冒称已在旧版执行。

C1 修后真实并发重试、撤销及过期均为控制查询 4、鉴权 2；异常且 revision 变化为 4/2，稳定异常为 2/1。这里的额外写由独立并发请求产生，不计入 reader，也没有隐藏总库写入。原写接口与完整旧客户端差分回归另测，不以这些 reader 计数代替。

最终源码相对基线未修改 public/、资源 pin、OpenAPI、依赖锁、安全配置、迁移或 schema。双预览分别为回环 HTTP 200 与预期未初始化 503 / 合成预览未登录 401；不连接生产。补取当前全部远端分支和标签后，全可达历史扫描 62 个内容提交、无未豁免命中，既有 147 条精确豁免不变；这不是原始零命中。工作树扫描两个既有资源摘要命中由 8 项资产独立重算核实，没有新增豁免。
