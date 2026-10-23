# 外部 AI 接入手册

这份手册适用于能执行 HTTP 请求的 Grok Bot、Dot 或其他 AI 执行器。网站提供标准 HTTP API；公开接口文档不会自动给任何聊天产品增加工具或写入权限。执行器需要具备网络请求能力，并持有管理员为它签发的本站令牌。本站运行不需要 OpenAI、xAI 或其他模型服务。

以下账号、文章、日期、来源和数字均为演示数据。示例只能在独立测试环境执行；生产回填必须使用实际平台数据，不能照抄示例数字。公开文档不包含生产账号信息和凭证。

## 1. 授权范围

- 人类管理员通过账号密码登录；没有公开注册。
- 管理员为每个执行器创建独立 API key，选择可访问账号及 `read`、`write` 权限。写入后需要回读核对的执行器，应同时授予两种权限。
- API key 不能管理管理员、密码、账号配置、其他 key 或审计记录。无需提供管理员密码或管理员会话。
- 保存创建 key 时唯一一次返回的原始令牌；本站数据库只保存它的哈希。丢失后创建新 key，并撤销旧 key。
- 令牌只发给获授权的执行环境，不放在公开页面、仓库、URL、截图或普通任务日志中。同一运行环境里的多个机器人可能共享文件和凭据；独立 key 便于撤销和审计，不等于机器人之间已被环境隔离。

公开文档：`GET /openapi.json`、`GET /api-docs`。业务路由统一使用 `/api/v1` 前缀。

## 2. 准备请求

示例使用 Bash、curl 和 jq。以下 `example.com` 地址必须替换为实际部署地址。通过交互输入令牌，避免把令牌字面值写入 shell 历史：

```bash
export MATRIX_BASE_URL='https://matrix.example.com'
read -r -s -p '本站 API token: ' MATRIX_API_TOKEN
printf '\n'
```

每次写入使用 `Authorization: Bearer ...`、`Content-Type: application/json`。`Idempotency-Key` 标识一次业务事件；重试同一事件时保留相同 key 和完全相同的请求，修改内容或路径时使用新 key。不同执行器使用自己的令牌。

成功响应为 `{"data": ...}`；失败为 `{"error":{"code":"...","message":"...","details":...}}`。HTTP 成功不应仅以模型文字描述判定，必须检查响应并回读。

## 3. 查找正确账号

账号由管理员事先配置。机器人先查询自己获授权的账号，以 `id` 关联文章；账号名称可能重复，不能只凭“第一个账号”选择。

```bash
curl --fail-with-body --silent --show-error \
  "$MATRIX_BASE_URL/api/v1/accounts" \
  -H "Authorization: Bearer $MATRIX_API_TOKEN" \
  > /tmp/matrix-accounts.json

jq '.data[] | {id, platform, name, active}' /tmp/matrix-accounts.json

# 测试环境中由管理员建立的中文演示账号；生产时按真实账号选择。
ACCOUNT_ID=$(jq -er \
  '[.data[] | select(.platform == "toutiao" and .name == "演示图文号")] |
   if length == 1 then .[0].id else error("账号缺失或重名，需明确账号ID") end' \
  /tmp/matrix-accounts.json)
```

`toutiao`、`zhihu`、`wechat`、`other` 是平台代码，显示名可使用中文。读取列表只包含该 key 可见的账号；看不到某个账号时，由管理员检查授权，不能自行改用其他账号。

`active: 0` 的停用账号仍可查询、修正历史文章及复盘，但不能登记新文章或将其他账号文章迁入；这类写入会返回 `409 ACCOUNT_INACTIVE`。

## 4. 新建发布记录

一条记录对应一次“某账号在某平台发布的文章”。同一原稿跨账号或跨平台发布，应分别登记各自记录。`published_at` 是平台实际发布时间，`started_at` 是实际开始制作时间；未知开始时间应省略，耗时保持缺失。计划时间不能冒充实际发布时间。

```bash
jq -n --arg account "$ACCOUNT_ID" '{
  account_id: $account,
  title: "秋日电影观察（演示）",
  url: "https://example.com/demo/article-001",
  platform_article_id: "demo-article-001",
  published_at: "2026-10-01T10:30:00+08:00",
  started_at: "2026-10-01T09:00:00+08:00",
  production_mode: "mixed",
  summary: "这是一条用于核对中文与接口格式的演示发布记录。",
  notes: "仅供独立测试环境使用。"
}' > /tmp/matrix-article.json

curl --fail-with-body --silent --show-error \
  -X POST "$MATRIX_BASE_URL/api/v1/articles" \
  -H "Authorization: Bearer $MATRIX_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-article-20261001-001' \
  --data-binary @/tmp/matrix-article.json \
  > /tmp/matrix-article-response.json

ARTICLE_ID=$(jq -er '.data.id' /tmp/matrix-article-response.json)

curl --fail-with-body --silent --show-error \
  "$MATRIX_BASE_URL/api/v1/articles/$ARTICLE_ID" \
  -H "Authorization: Bearer $MATRIX_API_TOKEN" \
  | jq '.data | {id, account_id, title, published_at, production_mode, version}'
```

制作方式：`manual` 人工、`automatic` 自动化、`mixed` 混合、`unknown` 未知。不能为了填满表格，把未知方式填写为人工。

文章详情回读还会返回 `recorded_by` 和 `last_modified_by`，值为 `null` 或 `{actor, label, at}`。它们来自实际审计记录，分别表示登记者与最近修改者；不应根据制作方式猜测是谁填写。历史审计不足时保持 `null`。列表及新建响应不包含这两项，需调用详情接口查看。

## 5. 回填文章累计快照

`observations` 是追加保存的累计快照。`as_of` 表示平台数据截至何时，`collected_at` 表示实际采集时间；两者都使用带时区的时间。`source` 写实际来源，例如后台页面、导出文件或证据编号；不要把“AI 估算”当成平台数据。

```bash
jq -n --arg article "$ARTICLE_ID" '{
  article_id: $article,
  as_of: "2026-10-02T10:45:00+08:00",
  collected_at: "2026-10-02T10:48:00+08:00",
  kind: "d1",
  metrics: {reads: 120, impressions: 1500, likes: 3, comments: 1},
  source: "演示数据源，非生产数据",
  note: "演示：D1目标后15分钟实际采集，保留真实时间。"
}' > /tmp/matrix-observation.json

curl --fail-with-body --silent --show-error \
  -X POST "$MATRIX_BASE_URL/api/v1/observations" \
  -H "Authorization: Bearer $MATRIX_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-observation-20261002-001' \
  --data-binary @/tmp/matrix-observation.json

curl --fail-with-body --silent --show-error \
  "$MATRIX_BASE_URL/api/v1/observations?article_id=$ARTICLE_ID" \
  -H "Authorization: Bearer $MATRIX_API_TOKEN" \
  | jq '.data'
```

`kind` 允许 `latest`、`d1`、`d3`、`d7`。D1/D3/D7 表示复盘目标阶段，分别参考发布后 1/3/7 天；它们不证明恰好在目标时刻采集。晚采须保留真实 `as_of`、`collected_at` 和延迟说明。漏采 D1，不能用 D3 的累计值伪造 D1；无法取得历史精确值时，让 D1 保持缺失。驾驶舱待复盘列表是提醒，不会自动向平台采数。

累计快照不会被当成当日新增：截至两天分别 120、180 次阅读，不能相加成为 300，也不能在没有口径确认时把差额自动登记为某日真实新增。平台更正也可能使后续累计值下降，应保存实际观测并说明来源。

## 6. 回填真实日增量

`daily-metrics` 是平台实际给出的自然日数据；`date` 是北京时间 `YYYY-MM-DD`。以下示例表示“演示账号在 2026-10-02 当日发生的阅读等数据”，不是“当日发布文章截至目前的累计数据”。

```bash
jq -n --arg account "$ACCOUNT_ID" '{
  account_id: $account,
  date: "2026-10-02",
  metrics: {reads: 85, impressions: 900, likes: 2},
  source: "演示账号日报，非生产数据"
}' > /tmp/matrix-daily.json

curl --fail-with-body --silent --show-error \
  -X POST "$MATRIX_BASE_URL/api/v1/daily-metrics" \
  -H "Authorization: Bearer $MATRIX_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-daily-20261002-account-001' \
  --data-binary @/tmp/matrix-daily.json

curl --fail-with-body --silent --show-error \
  "$MATRIX_BASE_URL/api/v1/daily-metrics?account_id=$ACCOUNT_ID&from=2026-10-02&to=2026-10-02" \
  -H "Authorization: Bearer $MATRIX_API_TOKEN" \
  | jq '.data'
```

省略 `article_id` 表示账号整体日报；提供 `article_id` 表示该账号下某篇文章的当日数据。同一账号、文章范围和日期会更新同一日报；更正时会整体替换该行的 `metrics`，不是累加或合并，所以应提交该日当前完整的已知指标。网站当日存在账号整体日报时优先使用它；没有整体日报时才回退到已采集文章，明确显示覆盖范围。不要把整体日报和文章明细同时相加，也不要假设未采集文章为 0。

首页默认三日窗口为北京时间今天、昨天、前天，今天尚未结束；不是最近 72 小时，也不包含未来日期。`GET /api/v1/dashboard` 返回 `window.from`、`window.to`、`window.timezone`、`window.todayIncomplete`，以响应为准。只上传累计快照而没有日报时，三日表现可以保持缺失。

驾驶舱 `top_articles` 是按文章最新累计阅读排序的“累计表现”列表，并非三日新增榜；`totals.article_count` 是已登记文章总数，并非三日发文量。

## 7. 指标和缺失值

允许的指标键：`reads` 阅读次数、`impressions` 平台展现次数、`likes` 平台点赞、`comments` 评论、`favorites` 收藏、`shares` 分享、`approvals` 知乎赞同、`reading_users` 阅读人数。只接受非负安全整数，至少填写一项已核实指标。保留平台原始含义：阅读人数与阅读次数分开，赞同与喜欢分开，送达量不能填成展现量。

- 没提供、不适用、未核实：省略对应指标，不填 `0`、`null`、空字符串或猜测值。
- 平台明确显示真实零值：填写 `0`。
- 百分比、缩写和约数（如 `1.2万`、`10万+`）：先取得可核实精确值，不能自行转换成精确计数。
- 来源只有累计值：填累计快照；来源只有日增量：填日报。不能互换。
- 账号后台数据与文章列表加总可能覆盖范围不同；使用网站返回的 `coverage`，不要声称跨平台去重触达。

## 8. 更新、冲突与确认

文章更新必须先 `GET /api/v1/articles/:id`，使用返回的 `version`，再 `PUT` 完整可编辑字段。以下示例仅修改备注，其余字段取自最新回读：

```bash
curl --fail-with-body --silent --show-error \
  "$MATRIX_BASE_URL/api/v1/articles/$ARTICLE_ID" \
  -H "Authorization: Bearer $MATRIX_API_TOKEN" \
  > /tmp/matrix-current.json

jq '.data | {account_id, title, url, published_at, started_at,
             production_mode, summary, notes, platform_article_id, version}
    | .notes = "演示：已核对平台实际发布时间。"' \
  /tmp/matrix-current.json > /tmp/matrix-update.json

curl --fail-with-body --silent --show-error \
  -X PUT "$MATRIX_BASE_URL/api/v1/articles/$ARTICLE_ID" \
  -H "Authorization: Bearer $MATRIX_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: demo-update-article-001' \
  --data-binary @/tmp/matrix-update.json

curl --fail-with-body --silent --show-error \
  "$MATRIX_BASE_URL/api/v1/articles/$ARTICLE_ID" \
  -H "Authorization: Bearer $MATRIX_API_TOKEN" \
  | jq '.data'
```

- `409 VERSION_CONFLICT`：其他人或 AI 已修改。重新读取并比较，只合并本次被授权修改的字段，再用新版本和新幂等 key 提交。不能仅机械递增版本覆盖他人内容。
- 幂等冲突：同一幂等 key 对应了不同请求。核对业务事件；不应盲目换 key 重复创建。
- 超时或断线：保存原 key 和请求内容，用相同请求重试，再按返回 ID 回读。不得因为没有收到响应就断言没有保存。
- 重复文章冲突：查询既有记录并核对账号、文章链接和平台 ID，不要随机改链接绕过重复校验。
- `401`：认证缺失、失效或撤销；`403`：当前 key 没有账号或操作权限。交由管理员处理授权，不能尝试他人的令牌。
- `400`：按错误详情修正数据；`404`：核对账号或文章 ID；`429`：停止密集重试并遵循响应限制。

完成回填后，回报真实记录 ID、采集时间、写入类型和回读核验结果；不要回显令牌。快照不可编辑或删除；发现错误时追加真实更正观测并写明备注。V1 没有文章删除 API。
