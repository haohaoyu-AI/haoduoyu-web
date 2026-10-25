# 原子日快照：STEP1 只读接口

新增 `GET /api/v1/snapshot?date=YYYY-MM-DD` 与 `GET /api/v1/snapshot/index`，由 Worker 直接读取现有 D1。日快照是当前数据库对指定业务日期的投影，`projection` 固定为 `current`；历史日期的返回内容也会随当前数据修改而变化。它不保存历史版本，不是历史时点备份。

这两个 GET 不写业务数据库或 Notion。此步骤不新增数据表、API key 权限、凭据、调度或前端操作，也不改变现有 Notion 手动快照通路。

## 请求与权限

日快照必须且只能提供一个有效的 `date=YYYY-MM-DD`，不推断今天或昨天，不接受重复 date、无效日历日期或其他参数。索引不接受任何查询参数。

权限规则仅针对新增端点：

| 入口 | 数据范围与结果 |
| --- | --- |
| 有效所有者 `matrix_session` | 会话用户必须等于明确配置的 `PUBLIC_BUSINESS_USER_ID`；保留既有所有者会话的全部账号可见性，不收窄到匿名账号列表。 |
| 匿名公开读取 | 仅 `PUBLIC_BUSINESS_MODE=1` 时允许；账号范围为既有 `PUBLIC_BUSINESS_ACCOUNT_IDS` 加本公开 owner 创建、减公开删除的账号，逐项核实实际存在。 |
| 其他已登录用户 | `403 FORBIDDEN`；不会把这个身份改绑成公开 owner。 |
| 任何 `Authorization` 头 | `403 SNAPSHOT_SESSION_REQUIRED`，包括 Bearer/API key 和空值；不能通过 key 获得组合快照能力。 |
| 私有模式无有效会话 | `401 UNAUTHORIZED`。 |

`PUBLIC_BUSINESS_USER_ID` 和既有 `DAILY_NOTES_OWNER_ID` 必须是明确配置且真实存在的用户 UUID，私有模式也不例外。配置缺失、格式错误或无法核实返回 `503 SNAPSHOT_CONFIG`；不选择首个数据库用户。匿名读取还要求有效的显式公开账号配置。两个 owner 可以不同：待办和模板使用业务 owner，日记沿用既有公开日记 owner，不因为登录者身份而换成另一份日记。

已经以会话身份开始的读取，会在返回前以及一致读重试时重新鉴权；撤销或过期不回退到匿名范围。匿名读取复用既有公开入口的限流桶；它是进程内保护，不是新的全局配额。成功响应使用 `Cache-Control: private, no-store` 和 `Vary: Cookie, Authorization`。

OpenAPI 为两个端点单独声明 `AdminSession` 或 `{}`，空对象只代表满足上述配置条件的公开模式，不能解释为始终匿名可读。两个端点都不声明 `ApiToken`。

## 日快照结构与日期归属

成功响应外层是 `{ "data": <snapshot> }`。`snapshot` 包含：

| 字段 | 含义 |
| --- | --- |
| `snapshot_format` | 固定 `haoduoyu-daily-snapshot-v1`。 |
| `projection` | 固定 `current`。 |
| `date` / `timezone` | 明确请求的业务日期；固定 `Asia/Shanghai`。 |
| `scope_id` | 授权模式、业务 owner、日记 owner、实际账号集合的稳定标识；同一账号集合的排序不影响它。 |
| `data` | 下表八个业务分区，始终完整提供。 |
| `generated_at` | 本次请求生成时间，不代表业务更新时间，不参与内容哈希。 |
| `content_hash` | 完整规范化业务投影的 SHA-256，包含 `scope_id`。 |

`snapshot.data` 的分区如下；所有软删除过滤按当前数据库状态执行：

| 分区 | 口径 |
| --- | --- |
| `todos` | 业务 owner 在目标日未软删除的待办；输出 `id,date,text,completed,version,created_at,updated_at`。当前有效模板关联额外输出 `template_id,template_version,template_active=true`。 |
| `templates` | 当前未软删除模板的 `id,text,version,created_at,updated_at`，并非目标日曾经存在的模板集合。 |
| `notes` | `DAILY_NOTES_OWNER_ID` 的目标日未软删除日记，只输出 `date,text,version,created_at,updated_at`；不含 memo。 |
| `accounts` | 当前可见账号的 `id,platform,name,active,created_at`，不因目标日变化而回溯历史账号框架。 |
| `articles` | `run_date` 等于目标日、`published_at` 落在目标北京日，或被目标日观察/日指标引用的文章；按文章 ID 去重，全部受账号范围约束。包含草稿和其他生命周期状态，保留 null。 |
| `observations` | `as_of` 落在目标北京日的累计观察；`collected_at` 原样保留，不替代日期归属。 |
| `daily_metrics` | `date` 等于目标日的账号或文章发生量。 |
| `habit30days` | 目标日截至的30天模板完成窗口，见下文。 |

文章显式输出基础字段 `id,account_id,title,url,platform_article_id,published_at,started_at,production_mode,summary,notes,version,created_at,updated_at`，以及当前全部流水线字段：`status,slot,run_dir,run_date,series_no,writer,illustrator,sample,char_count,subheading_count,image_count,cover_desc,draft_ref,timings,reruns,blockers,verify_items`。逻辑 JSON 字段返回解码后的对象/数组或 null，保留合法未知子键及业务数组顺序，不泄漏 `*_json` 存储字段；不添加文章列表的 warnings、verify_state 等计算字段。

观察输出 `id,article_id,as_of,collected_at,kind,metrics,source,note,created_at`；日指标输出 `id,account_id,article_id,date,metrics,source,updated_at`。`metrics` 为解码对象，真实零保留，缺失不补零。快照不包含会话、凭据、用户认证信息、审计正文或原始数据库备份。鉴权和公开账号范围核实所需的内部读取不成为业务输出。

`habit30days` 固定输出 `window_start=D-29`、`window_end=D`、`threshold=21` 和 `templates`。对每个当前未删除模板，统计这30个北京自然日内关联未删除且 `completed=1` 待办的不同日期数 `completed_days`；同日多条完成只计一天。`completed_days >= 21` 时 `habit_status=habit`，否则为 `todo`。它不表示连续打卡、不使用 `updated_at` 猜测完成时间。

无该日业务记录时，接口仍返回完整快照：`todos,notes,articles,observations,daily_metrics` 为空数组；当前账号、模板和习惯窗口仍在。不会以空日代替权限或读取失败。

## 完整索引、哈希与客户端核对

索引成功响应也是 `data` 包装，内部字段为 `snapshot_format=haoduoyu-daily-snapshot-index-v1`、`projection=current`、`scope_id`、`timezone=Asia/Shanghai`、`complete=true`、`dates`、`generated_at`、`index_hash`。`dates` 按升序列出全部真实业务日期，每项为 `{ "date": "YYYY-MM-DD", "content_hash": "…" }`；不是最近N天窗口，也不分页或静默截断。

真实日期来自当前可见的未删除待办/日记、文章 `run_date` 与北京时间 `published_at`、观察 `as_of`、日指标 `date`。只有账号或模板框架不产生索引日期；清空最后一条带日期业务记录后，该日期可能从新索引消失。习惯窗口本身不会制造额外日期。

日哈希输入是除 `generated_at,content_hash` 外的完整日快照。索引哈希输入是除 `generated_at,index_hash` 外的完整索引。两者使用稳定对象键、稳定实体集合顺序及 SHA-256；嵌套业务数组保留原顺序，因此它们的有意义顺序变化仍会改变哈希。哈希不含请求 ID。相同修订、相同 `scope_id` 下，索引某日的哈希必须等于该日详情哈希。

账号和模板是每日日快照的当前依赖，因此账号名称、模板文字等变化会改变已索引日的哈希；模板完成情况也会传播到受其30天窗口影响的日期。`scope_id` 区分匿名与所有者会话、owner 和账号集合；即使数据恰好相同，也不能把不同 scope 的哈希当成同一同步基线。

客户端应保存 scope、上次完整日期集合和逐日哈希，并按以下顺序核对：

1. 读取完整索引；只接受成功且 `complete=true` 的结果。若 `scope_id` 改变，先重建基线，不把可见范围减少解释为业务删除。
2. 在相同 scope 内比较「当前索引日期 ∪ 已保存日期」。读取新增、哈希变化和已经从索引消失的日期；这样才能发现很早的修改、删除最后一条记录，以及从旧日期迁移到新日期。
3. 当前索引中的日期，详情 `scope_id` 和 `content_hash` 必须与索引对应；不一致时重读索引及受影响详情。对已消失日期也要读回当前空日投影，不能仅凭缺少索引条目直接删除保存内容。
4. 应用这批核对结果前再次读取索引；范围或索引变化时重新核对。任何错误、限流或预算失败都不能充当完整清单或删除证明。

每个索引/详情请求各自原子，但它们之间没有跨请求事务，写入可能发生在两次请求之间。上述重读用于发现竞争并重试，不承诺多个 HTTP 响应共享同一个历史时点；客户端若需要历史版本，应自行保存已成功取得的完整版本。

## 一致读取、预算与错误

入口在一个 `consistentRead` 内完成数据库就绪检查、鉴权、范围解析、全部业务读取、分区构建、哈希和会话复查。既有全局修订号在读前/读后核对；并发变化会重试整个读取，不把不同修订的分区拼接为成功结果。最多重试5轮，但所有轮次共用下面的预算，不每轮重置。

| 预算 | 当前上限及计数范围 |
| --- | --- |
| SQL 次数 | 45；含控制表、鉴权、范围查询、每次分页、修订号前后检查和所有重试。 |
| 投影行数 | 4000；累计物化业务分页行，含用于模板关联的内部链接行。 |
| 源投影 JSON 字节 | 1,048,576；累计上述分页的 UTF-8 JSON 大小。 |
| 账号 | 50；身份和范围查询另行有界，也计入全局 SQL 与 `rows_read`。 |
| 索引日期 | 1000；超过则整体失败，无截断列表。 |
| 哈希输入 | 累计8,388,608字节；包含索引计算所有逐日哈希的展开输入。 |
| 最终响应 | 1,048,576字节；包含最外层 `data` 包装。 |
| `rows_read` | 累计100,000；包含每次数据库结果报告的实际读取行。 |

业务读取每页200行并稳定排序，超过一页继续完整读取。预算跨一致读重试累计。`rows_read` 是 SQL 执行后的观察值，并非查询执行前的扫描上限，无法据此宣称硬性 CPU 保护。没有可信 `rows_read` 回执时拒绝返回成功。线上边缘 CPU、实际扫描成本和可容纳业务规模尚未由本地结果证明。

| 状态/代码 | 含义 |
| --- | --- |
| `400 VALIDATION_ERROR` | 查询形状或日期不合法。 |
| `401 UNAUTHORIZED` | 私有模式无会话，或读取期间认证失效。 |
| `403 SNAPSHOT_SESSION_REQUIRED` / `FORBIDDEN` | 使用 Authorization 头，或登录者不是明确所有者。 |
| `409 SNAPSHOT_SCOPE_CHANGED` | 一致读重试时 scope 改变，需要重新核对基线。 |
| `413 SNAPSHOT_LIMIT` | 任一完整读取预算超限；未返回部分数据。 |
| `429 RATE_LIMITED` | 既有匿名入口限流。 |
| `503 SNAPSHOT_CONFIG` | 业务/日记 owner 或公开账号范围配置无法核实。 |
| `503 SNAPSHOT_DATA` | 日期、关联或业务 JSON 无法完整投影。 |
| `503 SNAPSHOT_BUDGET` | 无法核实数据库 `rows_read` 回执。 |
| `503 SETUP_REQUIRED` / `BUSY` | 数据库未就绪，或一致读取未能在重试预算内稳定完成。 |

所有失败沿用既有 `error` 包装。限额是拒绝完整响应的边界，不是返回一部分内容的依据。

## 代码与验证证据

契约来源为 [snapshot.mjs](../src/snapshot.mjs)、[snapshot-access.mjs](../src/snapshot-access.mjs)、[snapshot-projection.mjs](../src/snapshot-projection.mjs)、[snapshot-budget.mjs](../src/snapshot-budget.mjs)；一致性机制沿用 [storage.mjs](../src/storage.mjs)。公开入口说明位于 [OpenAPI](../public/openapi.json)、[API 文档](../public/api-docs.html) 和 [llms.txt](../public/llms.txt)。

本地回归入口 [snapshot-api.test.mjs](../tests/snapshot-api.test.mjs) 覆盖权限、所有者/公开范围、日记归属、草稿与北京时间归属、旧日期修改/删除/迁移、哈希依赖、30天习惯窗口、并发重读、会话撤销、范围变化、超过200行分页及预算失败。文档新增端点/区段需由精确文档投影固定，再继续验证旧文档基线未变。

测试文件和预算存在不等于验证通过；实际命令、结果及剩余问题应以本分支验证记录为准。本步骤没有生产部署、生产调用或真实边缘 CPU 验证结果。

## 本分支收尾验证记录

- 已完成核心定向测试 8/8、真实 Worker/D1 API 测试 11/11（其中一次无效测试夹具修正后仅重跑失败用例）、文档契约及既有投影测试 13/13。
- 最终 `npm run build`、`npm run check:artifacts`、`npm run package`、`git diff --check` 均通过；8 个公共资产与内嵌 Worker 字节一致，前端 app/style 保持基线内容。
- 本地交付包：`artifacts/haoduoyu-matrix-new.tar`，SHA-256 `7e0c4750bb8d7aa04a15e05afde274ce49be75a00944b0efcab21853798519b2`。包的默认 hosting/migration 配置仅供独立环境核验；父级整合现有站点时应重新构建，不能把它直接用于生产迁移。
- 待 push 后由本分支最终 CI 确认完整回归、预览和全历史密钥扫描；精确 CI 结果随交付消息提供。
- 共享合并触点仅为 `src/worker.mjs` 的 import/两条路由分发、`src/lib/request-trace.mjs` 的静态路由标签，以及公共接口文档和 `.ci/public-assets.json` 对应哈希。备忘录与视觉分支需保留各自新增内容后重新生成资产哈希；不需要本功能数据库迁移。
