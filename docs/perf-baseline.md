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


# 阶段 3 C2：凭据使用时间节流

基线 `ed9458154675ada68cd54a56ed362062f92d0ca1`。沿用真实本地 D1 执行计数器和合成凭据，不增加查询。认证的既有 key 行只在内部 actor 新增 lastUsedAt，不新增 API 字段；一致读成功后，使用最后成功轮 actor 和同一个时间点生成 usedAt/cutoff。仅 NULL 或严格早于 cutoff 才发 UPDATE，SQL 以同一 cutoff、id/token_hash、未撤销状态再次约束。恰好五分钟和未来时间均跳过；不改变业务 revision、读取/更新失败的响应、同步更新时机。

| 场景 | 元数据写语句 前→后 | changes 前→后 | D1 rows_written 前→后 | 值变化 前→后 | 总 SQL 前→后 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 首次 NULL | 1→1 | 1→1 | 1→1 | 1→1 | 5→5 |
| 4分59.999秒 | 1→0 | 1→0 | 1→0 | 1→0 | 5→4 |
| 恰5分钟 | 1→0 | 1→0 | 1→0 | 1→0 | 5→4 |
| 5分00.001秒 | 1→1 | 1→1 | 1→1 | 1→1 | 5→5 |
| 未来1秒 | 1→0 | 1→0 | 1→0 | 1→0 | 5→4 |

原始合成计数见 perf-c2-counts.json。固定 Node 请求时钟用于精确边界；D1 仍为真实 Miniflare，未模拟认证。计数前后读元数据和设置年龄属于测试准备，不计入请求 SQL。每种情况控制查询仍为2，控制/业务写0。首次/过期允许一条元数据写，不是所有 GET 绝对零写。

两个过期请求在认证后屏障同步：修前两条 UPDATE、changes/rows_written合计2；修后仍两条已发出 UPDATE，但只有1行更新，另一条0行仍计写。两个请求的值快照窗口重叠，不能把其各自 value_changed_rows 相加；只验证全局最终时间等于同一请求时刻。撤销发生在一致读完成与 UPDATE 之间时，仍发一条 UPDATE、0行，且不修改已撤销凭据。

红灯：同一测试在基线构建上 `C2_CAPTURE_PHASE=before node --test tests/key-usage.test.mjs`，10项（含嵌套父项）7通过/3失败。三项失败分别来自未到期SQL仍为5而目标4、并发更新实际2行而目标1、最终认证年龄未到期仍更新。负路径与真实D1触发器拒绝更新的500在旧版已通过，不伪造为原有安全缺陷。修后10/10通过。触发器只存在合成临时测试库，不是迁移或生产旁路；实际失败UPDATE已发出，但无receipt时rows_written记null，非假0。

最终 actor 测试双向改变 last_used_at 并通过真实业务写推进 revision：先新后旧应更新、先旧后新应跳过；均两次认证，控制查询4。无权限403、未知接口404、非法或撤销401、读取异常500均无元数据UPDATE。更新失败仍同步返回既有500，last_used_at/revision不变。

旧客户端差分测试没有新增 last_used_at 规范化或忽略字段。它仍验证既有30读/12写配对；其固定时钟和读路径不单独证明新粒度，粒度变化由本节真实D1前后计数锁定。C1历史表是当时版本，C1回归中第二次同时间AI读取预期已随C2改为0写。未改public、OpenAPI、数据库结构、配置、授权与写提交机制；未做C3及部署。


# 阶段 3 C3：静态条件请求

基线 `d4f0dad1f92af8a86d184cf544d4593f2942afa9`。构建对8个内嵌资源的实际UTF-8响应字节生成SHA256强ETag和字节长度；仅原始URL路径 `/app.js`、`/style.css`、`/favicon.svg`、`/openapi.json` 对GET/HEAD使用no-cache并暴露ETag。资源正文、名称、UI与API未改变。HTML（/、/index.html、/api-docs）、robots/llms、编码别名、未知路径和错误继续no-store；既有 /api-docs.html 仍404。API（含认证响应）与health不参与条件缓存。

If-None-Match完整校验列表语法，按弱比较处理W/，支持独立*、逗号内嵌于opaque tag、合理空列表成员；非法混合*、未闭合引号、非法后缀/小写w/不命中，不用简单split逗号。依据 [RFC9110 13.1.2](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2) 与8.8.3.2。POST与API不返回304；命中304正文为0、无Content-Length/Set-Cookie，保留ETag/no-cache和既有安全头；200/HEAD的Content-Length为真实完整资源字节数。

| 本地真实HTTP | 修前首次GET | 修前二次条件GET | 修后二次条件GET | 条件HEAD 前→后 |
| --- | --- | --- | --- | --- |
| app.js | 200 / 91049字节 | 200 / 91049字节 | 304 / 0字节 | 200/0 → 304/0 |
| style.css | 200 / 27950字节 | 200 / 27950字节 | 304 / 0字节 | 200/0 → 304/0 |

每次均真实调用curl（HEAD用-I，含If-None-Match），记录http_code与size_download。这里是响应正文传输字节，不含请求/响应头、连接成本或生产CDN压缩收益。原始合成计数见perf-c3-counts.json。未部署，因此不宣称线上ETag或CDN缓存已生效。

红灯：基线构建执行 `C3_CAPTURE_PHASE=before node --test tests/static-etags.test.mjs`，9项（含父项）1通过/8失败；四资源缺ETag、列表请求200而非304、构建缺hash，以及真实curl二次仍传完整正文。HTML/API no-store保障原本通过。环境曾响应迟缓，未将无输出等待当红灯；最终红灯来自明确断言与HTTP200。修后同组9/9通过。

隔离源码副本连续两次构建验证8个资源元数据与内容一致；仅在临时副本追加合成CSS注释后，只有该文件ETag改变。原public未改，8项资产pin独立复算并核对生成metadata/Worker正文。旧客户端差分的历史build固定读取已审查pre-C3提交脚本，锁文件仍与当前一致；仅/openapi.json对本次明确新增ETag、准确Content-Length与no-cache做精确验证后投影到旧头，API头与所有旧字段继续原样对比。不笼统删除响应头或掩盖接口差异。

C1/C2与全部既有回归继续运行。无数据库/安全配置/依赖/鉴权变更，无生产写入、部署或C5缓存。
