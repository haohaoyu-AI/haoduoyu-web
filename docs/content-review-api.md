# 内容复盘公开 API

内容复盘使用独立的 `/api/v1/review` 命名空间；一期入口为 `?page=review&account=V字`，页面固定展示 V字 / 头条。API 的 account 缺省为 V字，也接受其他合法账号字符串；platform 仅允许 toutiao。本模块存储从零开始，旧图文 API、后台旧文章/观察/每日指标均不迁入。页面提供读取展示，写入由 API 调用者完成，没有页面编辑表单。业务结论、快照指标和法典正文留给 Grok BOT 填写，本次不初始化示例业务数据。

## 公开访问与边界

当 `PUBLIC_BUSINESS_MODE=1` 时，所有访客均可读取、创建、修改和永久删除四类复盘资源，无身份认证。署名、source_chat 和内容中的作者均为自述，不是已验证身份。记录归属沿用明确配置的日记 owner；有效 owner 会话也可访问。显式无效凭证不会回退到匿名公开访问，Bearer key 不授予这些资源的权限。此约定仅覆盖新复盘命名空间，不扩大密码、密钥、后台、备份或其他 API 的权限。

公开写入要求 Origin 与站点源完全一致、`X-Public-Business: 1`、`Content-Type: application/json`；owner 会话写入改用同源 Origin 与 X-CSRF-Token。每个 JSON 请求最多256KiB。公开写入按 owner 和复盘模块在每个进程内限流60次/分钟、2000次/UTC日，含拒绝请求和重试，不能当作全局计数。批量请求也受相同入口约束，每个HTTP写请求计1次，batch内最多200项仍计1次。所有例子只是文档，本次未对生产或其他服务发起请求。

## 全部21个操作

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /api/v1/review/articles | 列表；固定100条及has_more/read_revision |
| GET | /api/v1/review/articles/{uuid} | 当前单项及content_hash |
| PUT | /api/v1/review/articles/{uuid} | 创建201；相同重放200；不同内容409 |
| PATCH | /api/v1/review/articles/{uuid} | 当前expected_hash及至少一个可写字段 |
| DELETE | /api/v1/review/articles/{uuid} | expected_hash + save_id；永久删除 |
| GET | /api/v1/review/snapshots | 列表；固定100条及has_more/read_revision |
| GET | /api/v1/review/snapshots/{uuid} | 当前单项及content_hash |
| PUT | /api/v1/review/snapshots/{uuid} | 创建201；相同重放200；不同内容409 |
| PATCH | /api/v1/review/snapshots/{uuid} | 当前expected_hash及至少一个可写字段 |
| DELETE | /api/v1/review/snapshots/{uuid} | expected_hash + save_id；永久删除 |
| GET | /api/v1/review/reports | 列表；固定100条及has_more/read_revision |
| GET | /api/v1/review/reports/{uuid} | 当前单项及content_hash |
| PUT | /api/v1/review/reports/{uuid} | 创建201；相同重放200；不同内容409 |
| PATCH | /api/v1/review/reports/{uuid} | 当前expected_hash及至少一个可写字段 |
| DELETE | /api/v1/review/reports/{uuid} | expected_hash + save_id；永久删除 |
| GET | /api/v1/review/playbooks | 列表；固定100条及has_more/read_revision |
| GET | /api/v1/review/playbooks/{uuid} | 当前单项及content_hash |
| PUT | /api/v1/review/playbooks/{uuid} | 创建201；相同重放200；不同内容409 |
| PATCH | /api/v1/review/playbooks/{uuid} | 当前expected_hash及至少一个可写字段 |
| DELETE | /api/v1/review/playbooks/{uuid} | expected_hash + save_id；永久删除 |
| PUT | /api/v1/review/snapshots:batch | 1–200条；逐条UUID与独立结果 |

UUID 均为小写 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`。PUT 单项的 id 来自路径，请求体不放 id；快照 batch 的每项必须包含 id。单项GET返回 `{"data":{...实体字段,"content_hash":"64位小写SHA-256"}}`。成功及错误响应有 X-Request-Id，错误顶层 request_id 可用于排查。

## 字段与 JSON 示例

所有输入拒绝未知顶层字段，服务端 created_at、updated_at 及 content_hash 只读。普通文本规范化换行并 trim；单行字段不允许换行/制表符；Markdown正文、结论reason及规则text允许换行/制表符，拒绝无效 Unicode 和控制字符。长度上限均以 UTF-8 字节计算。nullable字段的未知数据保留 null，真实零保留0；不补造缺失指标。所有数值有限且非负，计数为安全整数（不超过9007199254740991）。

JSON 字段必须直接提交对象/数组，不接受字符串化 JSON；单字段最多64KiB、深度12、值节点10000，拒绝 __proto__、prototype、constructor 键。PATCH 对一个JSON字段整体替换；未传的字段保留，允许null的字段可用null清空；没有递归合并。

### articles — 复盘文章

| 字段 | 类型 | 约束与缺省 |
| --- | --- | --- |
| account | string | 默认 V字；120字节 |
| platform | "toutiao" | 默认 toutiao；唯一平台 |
| platform_article_id | string \| null | 默认null；非空时最多240字节，按账号唯一 |
| title | string | 必填，1–2000字节 |
| url / sample_url | HTTP(S) URL \| null | 默认null；每个最多4096字节，不含凭据 |
| published_at | date / ISO timestamp \| null | 默认null；ISO带时区并规范为UTC |
| topic_category | string \| null | 默认null；240字节 |
| title_pattern | string \| null | 默认null；1000字节 |
| sample_title | string \| null | 默认null；2000字节 |
| image_count | integer \| null | 默认null；非负安全整数 |
| source_chat | string \| null | 默认null；4096字节，仅记录来源，不证明身份 |

读取额外返回 id、created_at、updated_at、content_hash。非null的 (account, platform_article_id) 唯一；没有平台文章ID时保留null。账号名称不是旧图文 account_id。

创建体示例（只有title必填，其余展示缺省值）：

```json
{
  "title": "示例文章标题",
  "account": "V字",
  "platform": "toutiao",
  "platform_article_id": null,
  "url": null,
  "published_at": null,
  "topic_category": null,
  "title_pattern": null,
  "sample_title": null,
  "sample_url": null,
  "image_count": null,
  "source_chat": null
}
```

### snapshots — 累计快照

| 字段 | 类型 | 约束与缺省 |
| --- | --- | --- |
| article_id | lowercase UUID | 必填；指向新复盘文章 |
| snapshot_date | YYYY-MM-DD | 必填；与article_id组合唯一 |
| impressions / fan_impressions / reads / fan_reads | integer \| null | 展现、粉丝展现、阅读、粉丝阅读；默认null |
| likes / comments / reposts / shares / favorites | integer \| null | 赞、评、转发、分享、收藏；默认null，各项独立 |
| ctr / completion_rate | number \| null | 点击率、完读率；百分数0–100，默认null |
| avg_read_seconds | number \| null | 非负平均秒数，默认null |
| revenue | number \| null | 非负收益；默认null，不填未知币种或值 |
| traffic_sources / audience | object \| null | 来源及受众JSON，默认null |
| completion_curve | object / array \| null | 完读曲线JSON，默认null |

(article_id, snapshot_date) 唯一。article_id必须引用活动的新复盘文章，不能使用旧图文文章ID。读取额外返回id和content_hash；本资源没有服务端created_at/updated_at字段。快照保留平台累计原值，不推导每日新增；reposts、shares、favorites不互相填补。

```json
{
  "article_id": "123e4567-e89b-42d3-a456-426614174000",
  "snapshot_date": "2026-10-30",
  "impressions": null,
  "fan_impressions": null,
  "reads": null,
  "fan_reads": null,
  "ctr": null,
  "completion_rate": null,
  "avg_read_seconds": null,
  "likes": null,
  "comments": null,
  "reposts": null,
  "shares": null,
  "favorites": null,
  "revenue": null,
  "traffic_sources": null,
  "completion_curve": null,
  "audience": null
}
```

### reports — 日/三日/周复盘

| 字段 | 类型 | 约束与缺省 |
| --- | --- | --- |
| account | string | 默认V字；120字节 |
| period_type | daily / three_day / weekly | 必填 |
| period_start / period_end | YYYY-MM-DD | 均必填，start ≤ end；不自动推断天数 |
| verdicts | object | 默认{}；文章UUID → {verdict:"爆"\|"中"\|"扑",reason:非空文本}，reason≤8192字节 |
| findings | object | 默认{"verified":[],"overturned":[]}；只允许这两个数组，每项含rule_id（≤120字节）且可有合法证据JSON |
| summary_md | string | 默认空字符串，非空最多128KiB |
| metrics | object | 默认{}，可保存本次复盘指标JSON |
| playbook_version | positive integer \| null | 默认null；正安全整数，版本号不是UUID |

(account, period_type, period_start) 唯一。读取额外返回id、created_at、content_hash。verdicts示意结构为 `{"文章UUID":{"verdict":"爆","reason":"由调用者填写证据理由"}}`；示例正文留空，不代表系统已有结论。findings每项的rule_id关联被验证/推翻的规则ID，扩展证据字段原样保留。

```json
{
  "account": "V字",
  "period_type": "daily",
  "period_start": "2026-10-30",
  "period_end": "2026-10-30",
  "verdicts": {},
  "findings": {
    "verified": [],
    "overturned": []
  },
  "summary_md": "",
  "metrics": {},
  "playbook_version": null
}
```

### playbooks — 版本化法典

| 字段 | 类型 | 约束与缺省 |
| --- | --- | --- |
| account | string | 默认V字；120字节 |
| version | positive integer | 必填；与account组合唯一 |
| published_on | YYYY-MM-DD | 必填 |
| content_md / changelog_md | string | 默认空字符串，非空各最多128KiB |
| rules | array | 默认[]；每项恰好rule_id、section、text；rule_id≤120字节且数组内唯一，text≤16KiB |
| rules[].section | enum | keep_topic / drop_topic / title / body / audience / checklist |
| sent_to_gemini_at | date / ISO timestamp \| null | 默认null；仅记录时间，不触发发送 |

(account, version) 唯一。读取额外返回id、created_at、content_hash。规则示意结构为 `{"rule_id":"title-001","section":"title","text":"由调用者填写规则"}`；不自动发布或向 Gemini 发送内容。

```json
{
  "account": "V字",
  "version": 1,
  "published_on": "2026-10-30",
  "content_md": "",
  "rules": [],
  "changelog_md": "",
  "sent_to_gemini_at": null
}
```

## 列表、筛选与一致读取

列表统一返回 `{"data":{"items":[],"has_more":false,"read_revision":123}}`，每条含content_hash。offset缺省0，每页固定最多100条，has_more为true时offset增加100；offset只接受0或无前导零的正十进制整数，最大9007199254740991。不得用结果不足100条代替has_more判断。

| 资源 | 支持的额外筛选 | 排序 |
| --- | --- | --- |
| articles | account, from, to | published_at DESC, created_at DESC, id DESC |
| snapshots | account, article_id | snapshot_date DESC, id DESC |
| reports | account, period_type, from, to | period_start DESC, created_at DESC, id DESC |
| playbooks | account | version DESC, created_at DESC, id DESC |

from/to为含边界的有效日期，articles按published_at日期筛选，reports按period_start筛选；两者同传时from≤to。account精确匹配，省略则不过滤。快照account筛选通过关联的新复盘文章生效，可与article_id组合。所有列表可传read_revision（非负安全整数），未知/重复参数被拒绝。

首次读取保存read_revision，后续每页带回相同修订号；若全局数据变更则409 READ_REVISION_CHANGED，重新从offset=0开始。它用于发现跨页竞争，不提供历史时点快照；不带它的offset分页可能在并发写入时移位。hash只代表当前实体，对象键稳定排序、业务数组顺序保留，客户端使用服务端返回值。

## 创建幂等与修改并发

1. 首次创建前生成一次资源UUID并保存规范化完整请求。首次PUT返回201；同UUID与相同完整字段（含缺省值）返回200；不同内容409 IDEMPOTENCY_CONFLICT。PUT不是更新，不能用旧创建体覆盖PATCH后的新状态。
2. 业务键重复返回409 REVIEW_UNIQUE_CONFLICT，包含 `error.existing_id`；先GET该UUID核对，不能换UUID盲目重试。同UUID错误和业务键错误不是同一概念。
3. 修改前GET当前项，PATCH体包含expected_hash及至少一个可写字段。例如 `{"expected_hash":"从GET取得的64位哈希","image_count":0}`。hash过期返回409 VERSION_CONFLICT，先重读并解决内容冲突。未发生实际变化的PATCH返回当前项且哈希不变。
4. PATCH不是save_id收据机制；如果写入结果未知，先GET核对。若PATCH确已改变实体，原旧hash重试会冲突，不能把冲突当作未保存或换hash自动覆盖。

## 永久删除与防复活

四类资源均允许公开访客永久删除，无法恢复，没有restore接口。DELETE请求体恰好包含expected_hash、save_id；文章另允许cascade_snapshots。expected_hash必须来自最新GET，save_id是本次删除的小写UUID。

`delete.json` 示例：

`{"expected_hash":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","save_id":"123e4567-e89b-42d3-a456-426614174001"}`

同一身份以相同save_id、路径和请求体重试成功删除返回200；save_id改用于其他请求返回409 IDEMPOTENCY_CONFLICT。没有现存记录且没有这次成功收据时404；旧hash为409 VERSION_CONFLICT。删除会持久保存墓碑，后续同UUID的PUT被409 REVIEW_DELETED拒绝，防止延迟重试重新创建。创建全新资源必须使用新UUID，不能假装恢复。

有快照的文章默认拒绝删除（409 ARTICLE_HAS_SNAPSHOTS），必须在相同DELETE体显式加入 `"cascade_snapshots":true` 才会同时永久删除它与全部关联快照；快照也留下墓碑，旧快照PUT/batch不能复活。此操作不会影响旧图文库。

## 快照批量写入

`PUT /api/v1/review/snapshots:batch` 体恰好为items数组，1–200条，每条有自己的小写id及快照创建字段：

`{"items":[{"id":"123e4567-e89b-42d3-a456-426614174002","article_id":"123e4567-e89b-42d3-a456-426614174000","snapshot_date":"2026-10-30"}]}`

批次按输入顺序逐条独立处理，HTTP200的data.items内逐条返回 `{id,status,data}` 或 `{id,status,error:{code,message,existing_id?}}`。新建status201，相同内容200，冲突409；其他字段/关联错误依该项status返回。一个失败项不回滚已经成功的项，顶层JSON/数量/访问校验失败则返回整次HTTP错误。调用者必须逐项检查，重试仍保留每条原id和内容。重复id允许按序处理，相同体可先201再200，不同内容后项409。未知存储/网络错误可终止批次并返回整次500，先前项可能已经提交；先逐个GET原UUID核对，不换ID盲重试。失败项id回显输入字符串，缺少字符串id时为null。每项没有request_id，使用整次X-Request-Id排查。

## 错误

| HTTP | error.code | 处理 |
| --- | --- | --- |
| 400 | VALIDATION_ERROR / INVALID_JSON | 未知或重复查询、未知字段、类型/范围/日期错误、无效JSON |
| 401 | UNAUTHORIZED | 未开启公开模式且无有效所有者会话，或显式凭证无效 |
| 403 | FORBIDDEN / CSRF | 无权身份、Bearer、缺失/错误Origin或公开头，或会话CSRF失败 |
| 404 | NOT_FOUND / ARTICLE_NOT_FOUND | 接口、UUID、关联文章或活动记录不存在 |
| 409 | IDEMPOTENCY_CONFLICT | 同UUID不同创建内容，或save_id用于不同删除请求 |
| 409 | VERSION_CONFLICT | expected_hash不是当前版本；先GET核对再决定 |
| 409 | READ_REVISION_CHANGED | 列表读取期间全局修订改变；从offset=0重读 |
| 409 | REVIEW_UNIQUE_CONFLICT | 业务键重复；error.existing_id给出现有UUID |
| 409 | REVIEW_DELETED | UUID已有永久删除墓碑，不能重放PUT复活 |
| 409 | ARTICLE_HAS_SNAPSHOTS | 删除文章时有快照但未显式cascade_snapshots:true |
| 413 | BODY_TOO_LARGE | 整个JSON请求超过256KiB |
| 415 | CONTENT_TYPE | 请求不是application/json |
| 429 | REVIEW_RATE_LIMIT | 复盘公开写入每owner每进程60/分钟或2000/UTC日 |
| 500 | INTERNAL_ERROR | 内部错误；保留request_id排查 |
| 503 | NOTES_CONFIG / REVIEW_CONFIG | 所需owner配置不可用 |

文章删除成功返回 `{data:{deleted:true,id,deleted_snapshots:数量}}`，其他资源为 `{data:{deleted:true,id}}`。ARTICLE_HAS_SNAPSHOTS额外包含 `error.snapshot_count`。

错误形状示例：

`{"error":{"code":"REVIEW_UNIQUE_CONFLICT","message":"业务键已存在","existing_id":"123e4567-e89b-42d3-a456-426614174000"},"request_id":"服务端请求关联标识"}`

## 最小 curl 示例

```sh
# 仅示例；example.invalid 不对应生产服务，不在本次任务中执行。
BASE=https://example.invalid
ID=123e4567-e89b-42d3-a456-426614174000
curl "$BASE/api/v1/review/articles?account=V%E5%AD%97&offset=0"
# article.json 使用下文的文章创建JSON；路径UUID在首次创建前生成并固定。
curl -X PUT "$BASE/api/v1/review/articles/$ID" \
  -H "Origin: $BASE" -H "X-Public-Business: 1" \
  -H "Content-Type: application/json" --data-binary @article.json
# 修改/删除前重新GET，使用返回的content_hash；保存完整请求用于原样重试。
curl "$BASE/api/v1/review/articles/$ID"
curl -X PATCH "$BASE/api/v1/review/articles/$ID" \
  -H "Origin: $BASE" -H "X-Public-Business: 1" \
  -H "Content-Type: application/json" --data-binary @patch.json
curl -X DELETE "$BASE/api/v1/review/articles/$ID" \
  -H "Origin: $BASE" -H "X-Public-Business: 1" \
  -H "Content-Type: application/json" --data-binary @delete.json
```

其他资源替换为对应路径和上面的JSON体；batch使用snapshots:batch与items对象。所有示例域名和数据均为说明用途，没有写入数据库或发送业务内容。机器可读契约见 [public/openapi.json](../public/openapi.json)，公开说明见 [public/api-docs.html](../public/api-docs.html) 和 [public/llms.txt](../public/llms.txt)。
