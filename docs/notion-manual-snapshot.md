# 手动云端业务快照 → Notion（未部署，未启用调度）

基线为生产 `00f9e730f3f0f5aa1812b16054a21563c34d1a32`，不包含后续 e442 维护/迁移工具增量。本轮新增独立模块、共享 Worker 路由与配置适配；不修改待办专用源码、表、接口、界面或 storage 并发机制。保留现有匿名业务读写。

## Phase 0 源码证据与边界

| 项目 | 00f9 源码事实 |
| --- | --- |
| 待办 | src/todos.mjs:68 仅接受单 date，不分页；专用服务为 todos/todo-templates/todo-preferences |
| 匿名身份 | src/worker.mjs:238 返回固定 public-business；不是登录会话或真实用户 UUID |
| 匿名写入 | src/public-business.mjs:44、:65 保留有效原身份，并对匿名写校验 Origin、显式业务头和范围；用户已授权，不关闭 |
| PATCH | src/todos.mjs:43 仅 completed/version；模板和偏好各有契约。文章现有更新为 PUT（worker:200） |
| 草稿 | db/schema.ts:8 与 records.mjs:321 要求 url/published_at；本轮不改文章模型 |
| 分页/备份 | analytics.mjs:73 支持 page/page_size，默认20、最大200；线上消费沿已验证此契约。backup.mjs:8 已为 v4、12持久表，另3表按恢复政策重置 |

源码另有 limit/offset 兼容分支，但不据此覆盖已验证线上分页契约。本轮不执行生产 POST 探针。

不改边界：src/{todos,todo-templates,todo-preferences}.mjs；web/pages/{todos,todo-actions,todo-templates,todo-preferences}.mjs；web/core/{todos-state,todo-templates-state}.mjs；web/ui/todo-gestures.mjs；既有 db/schema.ts、drizzle、public 资源与 src/storage.mjs。共享 worker 仅接入新管理路由和新限流响应头，配置生成器仅接入显式非秘密变量。

## 接口与权限

`POST /api/v1/integrations/notion/snapshot`，JSON 必须且只能为 `{"date":"YYYY-MM-DD"}`。不推断当天/昨天，不接受 owner、账号、父页、令牌或任意 URL 请求参数。

必须具备：有效原管理会话、写权限、该会话的 CSRF、精确 SITE_ORIGIN，以及会话用户等于明确配置的 NOTION_SNAPSHOT_OWNER_ID。Bearer 和匿名业务头均不授予此能力。该路由没有加入 publicBusinessRoute 白名单；原匿名待办操作继续可用。

每次调用从 Worker 内 D1 读取、由 Worker 写入和回读 Notion；调用电脑不是数据中转。此阶段没有 scheduled、cron、公开快照导出端点、UI、文章草稿字段或新 API key 权限。

## 配置

必须由授权运维流程核实以下非秘密值，构建器仅在三项全部明确时输出：

- NOTION_SNAPSHOT_OWNER_ID：真实业务用户 UUID，也限定谁能手动触发；不得使用匿名 auth/me 的 public-business 或测试 UUID。
- NOTION_SNAPSHOT_ACCOUNT_IDS：显式 JSON 账号 ID 数组，最多50个；允许 []，不会自动发送其他账号，也不会因匿名新增账号自动扩大快照范围。需要新增账号时由授权方明确更新范围。
- NOTION_SNAPSHOT_PARENT_ID：明确 Notion 父页 UUID。本轮预期目标为用户授权的 AI 页。

NOTION_SNAPSHOT_TOKEN 必须是 Cloudflare Secret，绝不进入 vars、代码、D1 回执或日志。未配置或配置错误时返回安全 503 NOTION_CONFIG，不假报成功。配置生成器不创建连接、凭据、Secret、云资源或调度。

后续发布须保留生产现有 SITE_ORIGIN、PUBLIC_BUSINESS_MODE/USER_ID/ACCOUNT_IDS、DB绑定及根域路由；新增三项配置不能覆盖这些既有值。构建模板默认关闭公开模式和临时入口，不能把未核实的模板整体覆盖当前生产配置。无需为了该通路改DNS、登录规则或待办数据。

专用 Notion Internal connection 仅需 Read content、Insert content；页面授权仅限目标父页及其继承子页。不得把已连接 MCP 的凭据搬入 Worker，不自动增加 Update、评论或用户信息权限。固定 API 主机 api.notion.com，固定 Notion-Version 2026-03-11，不跟随重定向。

注意：普通 wrangler secret put 会立即部署新版本；本轮未执行。未来秘密写入和精确版本发布由拥有账号权限的线程协调，令牌不经聊天/截图/仓库交接。

## 数据与日期口径

快照是**当前数据库对明确日期的业务投影**，不是某个历史时刻的数据库备份：

- todos：该 owner、该日、未软删除的记录；不包含其他用户或 user_id。
- templates：采集时未软删除模板，completed_days 为截至目标日的30个北京自然日内不同完成日期数；不虚构新建/完成率、优先级或独立完成时间。
- accounts：仅明确账号范围的当前账号框架。
- observations：as_of 落在目标北京日，collected_at 仅原样展示，不用它替代 as_of。
- daily_metrics：业务 date 等于目标日。
- articles：该日发布或被该日 observations/daily_metrics 引用的文章，后者可为早期发布文章。不读取未授权账号。

采用显式字段投影，不读 users、sessions、api_keys、audit 或原始 backup；不输出密码/凭据/会话/安全配置。没有取得的指标不补零，真实零保留。

仅账号/模板框架不构成该日有业务；没有该日待办/文章/观察/每日指标时返回 skipped_empty，notion_written=false、verified=false，不建空页。

源读取在 consistentRead 内完成，200行分页、稳定排序；最多2000投影行、128KB业务数据、24次分页查询预算。超过任一预算明确拒绝，不把部分集合当完整快照。额外鉴权/CAS及一致读重试仍消耗 D1 查询预算。

content_hash 仅包含格式、日期、时区及六类规范化业务数组；对象键和数组按稳定内容排序，不包含 generated_at、请求ID或推送回执。Notion正文也按相同稳定规则输出；时间变化或行顺序变化不会强造新版本。

## 完整性、防重和失败边界

Notion 页面只追加新版本，不覆盖、删除旧页。只使用读取、新建页面、为本次新页插入子块。完整分页读回并逐块核对日期、hash、数量、业务内容及末尾完整性封印后才 verified=true。无变化 skipped，实际内容变化才 versioned。

若同日已有手工业务快照但没有本协议标记/版本，安全返回 NOTION_LEGACY_CONFLICT，不忽略旧页再建v1，不猜测或覆盖它。后续实测须选择无冲突日期，或先明确旧页处理；不会自动迁移手工快照。

复用既有 matrix_idempotency 保存每个父页/日期的运行回执，通过原 mutate/CAS 和会话提交再鉴权互斥。不改 schema 或 storage；回执只存 hash、页面ID、结果/运行标记，不存令牌或快照正文。保存的成功页面ID用于再次直接核验，不能因标题改名或列表暂缺而重复新建。

102 表示正在运行，202 表示结果未确认，两者均拒绝再次触发创建。Notion 创建/追加响应丢失时只读回核对，绝不盲目重发。若不能确认完整结果，保留 pending；需要授权运维私下检查 Notion 和回执后决定处理，没有自动清锁或自动修复不完整页面的入口。进程终止或回执写入结果不明也可能留下102，不能据此猜成成功或失败后重发。

已确认任何写入前的限流/读取失败允许安全失败后手动再试；写入后的错误维持不确定状态。旧成功页面证据跨后续失败保留。不得只以页面标题、存在hash文本或一次200响应宣告成功。

Notion调用总预算40次，每次15秒超时；请求≤400KB、响应流≤512KB；分页游标错误、预算/大小超限均停止。429/529尊重有界 Retry-After，不自动重发写请求。错误不回显上游正文、令牌、私有参数或原始异常。

## 验证与未通过事项

本地使用真实 Miniflare D1 和模拟 Notion HTTP。覆盖范围包括身份/范围、匿名待办不退步、跨北京日、超过200篇文章、软删/敏感排除、hash稳定、空日跳过、分页/限流、完整回读、v2、防重并发、未知提交及回执失败边界。

**没有真实 Worker→Notion 闭环结果**。模拟通过不证明真实 Notion权限/API行为、Cloudflare免费CPU或额度通过。Workers Free每次CPU10ms、外部子请求50；本实现的预算不是线上CPU/完整查询成本证明。大量数据、已有版本和竞争可能超限，必须在后续经批准云端验证，不能自动升级付费。

部署和配置后，先在无本机数据中转的手动通路验证：完整推送/回读、相同内容跳过、隔离合成真实变更产生v2、失败可观察。不得为测试v2改正式待办或用采集时间制造变化。通过前不启用每日调度；定时日期口径仍未决定。

本阶段手动 HTTP 调用应等待结果；发起电脑中途关闭导致响应丢失不能视为任务已成功，可能留下待核对回执。没有调度就不能宣称已实现关机后的每日自动运行。

官方依据：[Notion Internal connections](https://developers.notion.com/guides/get-started/internal-connections)、[Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)。
