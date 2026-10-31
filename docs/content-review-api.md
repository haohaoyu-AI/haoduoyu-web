# 内容复盘公开 API

内容复盘使用独立的 `/api/v1/review` 命名空间；入口为 `?page=review&account=V字`，提供总览（overview）、文章库（articles）、写作法典（playbook）三个视图，展示 V字 / 头条。原有复盘文章的 account 缺省为 V字，也接受其他合法账号字符串；文章 platform 仅允许 toutiao。复盘资源与旧图文 API、后台旧文章/观察/每日指标独立，不自动迁入。页面提供读取展示，写入由 API 调用者完成，没有页面编辑表单。业务结论、快照指标和法典正文留给 Grok BOT 填写，本次不初始化示例业务数据。

## 公开访问与边界

当 `PUBLIC_BUSINESS_MODE=1` 时，所有访客均可读取、创建、修改复盘资源；原有四类可永久删除，v1.2 新增资源支持软删除和恢复，无身份认证。署名、source_chat 和内容中的作者均为自述，不是已验证身份。记录归属沿用明确配置的日记 owner；有效 owner 会话也可访问。显式无效凭证不会回退到匿名公开访问，Bearer key 不授予这些资源的权限。此约定仅覆盖新复盘命名空间，不扩大密码、密钥、后台、备份或其他 API 的权限。

公开写入要求 Origin 与站点源完全一致、`X-Public-Business: 1`、`Content-Type: application/json`；owner 会话写入改用同源 Origin 与 X-CSRF-Token。每个 JSON 请求最多256KiB。公开写入按 owner 和复盘模块在每个进程内限流60次/分钟、2000次/UTC日，含拒绝请求和重试，不能当作全局计数。批量请求也受相同入口约束，每个HTTP写请求计1次，batch内最多200项仍计1次。所有例子只是文档，本次未对生产或其他服务发起请求。

## 操作目录

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /api/v1/review/overview | 总览、周比较与7/30日趋势 |
| POST | /api/v1/review/articles | 请求体携带稳定UUID id；创建或相同重放 |
| GET | /api/v1/review/articles | 列表；verdict/page筛选及原offset/read_revision |
| GET | /api/v1/review/articles/{uuid} | 当前文章、snapshots、applied_rules与24h分析；含content_hash |
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
| PUT | /api/v1/review/playbooks/{version} | 数字版本别名；请求体必须有稳定UUID id |
| PATCH | /api/v1/review/rules/{rule_id} | 指定账号/法典内修改规则，带expected_hash/save_id |
| PUT | /api/v1/review/snapshots:batch | 1–200条；逐条UUID与独立结果 |

UUID 均为小写 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`。原有UUID PUT 单项的 id 来自路径，请求体不放 id；新增 POST articles 与数字版本 PUT playbooks 的请求体必须包含事先生成并固定的 id；快照 batch 的每项也必须包含 id。单项GET返回 `{"data":{...实体字段,"content_hash":"64位小写SHA-256"}}`。成功及错误响应有 X-Request-Id，错误顶层 request_id 可用于排查。


## v1.2.0 新增资源与兼容字段

以下路径均以 `/api/v1/review` 为前缀。列表每页最多100条，`offset` 从0递增，`read_revision` 检测页间变化；变化时返回409并从头读取。列表默认排除软删除项，`include_deleted=1` 包含墓碑；UUID GET 可读取墓碑。各资源的 UUID GET/PUT/PATCH/DELETE 与 POST `/{uuid}/restore` 可用。PUT 创建或相同请求重放；PATCH 用最新 `expected_hash`。DELETE 和 restore 均提交 `{"expected_hash":"最新hash","save_id":"小写UUID"}`，返回当前实体与新 hash；相同 save_id、相同操作可重放，不同请求冲突。新资源唯一键包括软删除记录，不可用不同 UUID 绕过。所有创建的可选字段缺省为 null，服务端提供 created_at、updated_at、deleted_at、content_hash。

| 资源 | 创建必填 | 其他字段 | 列表筛选及顺序 |
| --- | --- | --- | --- |
| `benchmark-accounts` | account、platform、name | profile_url、fans、is_featured_author、posting_cadence、topic_focus、title_patterns、structure_notes_md | account、platform；name 和 id 升序；(account, platform, name) 唯一 |
| `benchmark-articles` | benchmark_account_id、title、url | reads、published_at、title_pattern、topic、news_hook、word_count、image_count、collected_on；used_by_article_ids 为派生关联 | account、benchmark_account_id、collected_on；sort=benchmark_account_id/collected_on/reads，默认 reads 降序、collected_on 降序、id；(benchmark_account_id, url) 唯一 |
| `notes` | account、note_date、kind、title | body_md、tags、related_article_ids、related_rule_ids、decided_by | account、from、to、kind；日期和创建时间降序；kind 为 insight、decision、diagnosis、account_health |
| `account-health` | account、platform、observed_on | impressions_per_day、reads_per_day、ctr、since_date、platform_notice、judgement、action、resume_on | account、platform、from、to；观察日期和创建时间降序 |

计数为非负整数，CTR 为0–100或null；健康 judgement 可为 null、normal、限流、降权、封禁。platform_notice 可为文本或 `{text,date}` 对象，date 可为 null。对标爆文 title_pattern 可为 null、dialogue、外媒、又一、数字开头、央视曝光、其他。数组可为 null 或不重复数组；null 表示未知。对标号仍有活动爆文、或爆文仍被引用时，删除返回409。

`PUT /benchmark-articles:batch` 使用 `{items:[{id,...创建字段}]}`，1–200项，每项独立提交并返回 `{id,status,data}` 或 `{id,status,error}`；HTTP 200 不表示每项成功。请求结果未知时先按原 UUID 读取，保留原 ID 与内容再处理，不换 ID 盲重试。

复盘文章新字段 `reference_article_id` 为 null 或同一 owner 和 account 的活动对标爆文 UUID；`sample_title` / `sample_url` 保留为兜底。对标爆文的 `used_by_article_ids` 从我方文章 `reference_article_id` 派生；提交该字段只能与当前关联一致，不一致返回409，修改关联应 PATCH 我方文章，避免两头失真。

手册 `status` 支持 draft、active、archived；未设置时展示 active。指定 V字 历史 v2（`8f553af0-302a-45fb-9fde-16d6d537c888`）在存储状态为空时兼容展示 draft，不写回历史行；显式设置后状态参与 hash。`sent_to_gemini_at` 为 null 的页面展示“草稿·未发送”，并不据此把所有旧版本改为 draft。规则 `evidence_note` 为 null 或最多2000 UTF-8字节文本，可由规则 PATCH 修改。旧记录新增可空字段为 null 不改变原 hash；历史长日报摘要不自动截改，新建或修改摘要仍最多两句。

## 日期与北京时间

文章的 published_at 若为具体时间，所有分组、每日统计、文章库筛选、趋势归日及 API from/to 均先转换为 Asia/Shanghai（北京时间）再取日期，页面的具体时间也以北京时间显示。例如 2026-10-26T20:05:00Z 等于北京 2026-10-27 04:05，归入10月27日。BOT知道具体时间时应录入带 +08:00 的 ISO 时间，例如 2026-10-27T04:05:00+08:00；服务端仍规范存储为 UTC，不改动原业务时间。仅知日期时传严格 YYYY-MM-DD，原样保留，不伪造零点；未知传 null。snapshot_date、period_start、period_end、published_on 是纯日期，不加8小时；sent_to_gemini_at 的具体时间也以北京时间显示。

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
| published_at | date / ISO timestamp \| null | 默认null；具体时间由BOT带+08:00录入并规范存储为UTC；纯日期原样保留，未知null |
| topic_category | string \| null | 默认null；240字节 |
| title_pattern | string \| null | 默认null；1000字节 |
| sample_title | string \| null | 默认null；2000字节 |
| image_count | integer \| null | 默认null；非负安全整数 |
| source_chat | string \| null | 默认null；4096字节，仅记录来源，不证明身份 |
| playbook_version_used | positive integer \| null | 默认null；实际采用的法典版本，不自动套用最新版本 |
| applied_rule_ids | string[] \| null | 默认null；规则ID数组，元素非空、≤120 UTF-8字节且不重复；[]表示明确未用规则，null表示未记录 |

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
  "source_chat": null,
  "playbook_version_used": null,
  "applied_rule_ids": null
}
```

### snapshots — 累计快照

| 字段 | 类型 | 约束与缺省 |
| --- | --- | --- |
| article_id | lowercase UUID | 必填；指向新复盘文章 |
| snapshot_date | YYYY-MM-DD | 必填；与article_id组合唯一 |
| age_hours | integer \| null | 默认null；实际采集时距发布的非负整数小时，不从日期猜测 |
| source | toutiao_excel / manual / null | 默认null；真实来源，未知保留null |
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
  "age_hours": null,
  "source": null,
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

### reports — 日/周复盘与历史三日记录

| 字段 | 类型 | 约束与缺省 |
| --- | --- | --- |
| account | string | 默认V字；120字节 |
| period_type | daily / weekly | 新建必填；禁止新建three_day，历史three_day仍可读取 |
| period_start / period_end | YYYY-MM-DD | 均必填，start ≤ end；不自动推断天数 |
| verdicts | object | 默认{}；文章UUID → {verdict:"爆"\|"中"\|"扑",reason:非空文本}，reason≤8192字节 |
| findings | object | 默认{"verified":[],"overturned":[]}；只允许这两个数组，每项含rule_id（≤120字节）且可有合法证据JSON |
| summary_md | string | 默认空字符串，非空最多128KiB；daily最多两句话 |
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
| rules | array | 默认[]；每项必需rule_id、section、text；rule_id≤120字节且数组内唯一，text≤16KiB；附加字段见下表 |
| rules[].section | enum | keep_topic / drop_topic / title / body / audience / checklist |
| sent_to_gemini_at | date / ISO timestamp \| null | 默认null；具体时间带+08:00录入、存储UTC、显示北京时间；仅记录，不触发发送 |

规则附加字段均可省略；旧规则读取按candidate显示，不写回存量JSON，也不凭空补造证据：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| status | candidate / trial / kept / dropped / hold | 未记录状态的旧规则读取为candidate |
| check | "manual" / {type:"manual"} / {type:"regex",value:string} | regex仅是元数据，不编译或执行；value≤2000字节 |
| support_ids / counter_ids | UUID[] | 支持/反例文章；小写UUID，不重复 |
| evidence | object | 恰好metric、with_median、without_median、n_with、n_without；metric非空≤120字节，中位数非负或null，样本数非负整数 |
| trials | integer | 非负安全整数；记录真实试验次数 |

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

列表基础形状为 `{"data":{"items":[],"has_more":false,"read_revision":123}}`，每条含content_hash。offset缺省0，每页固定最多100条，has_more为true时offset增加100；offset只接受0或无前导零的正十进制整数，最大9007199254740991。不得用结果不足100条代替has_more判断。

| 资源 | 支持的额外筛选 | 排序 |
| --- | --- | --- |
| articles | account, from, to, verdict, page | published_at DESC, created_at DESC, id DESC |
| snapshots | account, article_id | snapshot_date DESC, id DESC |
| reports | account, period_type, from, to | period_start DESC, created_at DESC, id DESC |
| playbooks | account | version DESC, created_at DESC, id DESC |

from/to为含边界的有效日期，articles在数据库分页前按published_at转换后的Asia/Shanghai日期筛选，reports按纯日期period_start筛选；两者同传时from≤to。account精确匹配，省略则不过滤。快照account筛选通过关联的新复盘文章生效，可与article_id组合。所有列表可传read_revision（非负安全整数），未知/重复参数被拒绝。

文章库另支持`verdict=爆|中|扑|pending`，pending为verdict:null；先筛选再分页。`page`为从1开始的正安全整数，每页100条，不可与offset同传；传page时data额外返回page、page_size:100、total（筛选后总数），原offset客户端无须改动。

首次读取保存read_revision，后续每页带回相同修订号；若全局数据变更则409 READ_REVISION_CHANGED，重新从offset=0开始。它用于发现跨页竞争，不提供历史时点快照；不带它的offset分页可能在并发写入时移位。hash只代表持久化实体，对象键稳定排序、业务数组顺序保留，客户端使用服务端返回值。新nullable字段为null时不改变旧hash；展示用candidate默认状态和派生分析不进入存量hash，不能按响应自行重算。

## 新增读取与BOT写入契约

`GET /api/v1/review/overview?account=V%E5%AD%97&range=7d&week=this`：account必填，range为7d/30d（默认7d），week为this/last（默认this），拒绝未知/重复参数。data含account、range、week、today、start/end、previousStart/previousEnd、rows/previousRows、current/previous、changes、trend、alerts、summary/conclusion及read_revision。rows为所选发布周的派生文章；趋势按range返回截至上海今天的7/30个发布日，与所选周独立。current/previous给出发布数、爆/扑数、可判定数与率、CTR中位数及有效样本数（miss_rate同flop_rate、ctr_median同median_ctr）。summary为计算统计句；conclusion仅取同账号、weekly且起止日期与所选周完全匹配的周报summary_md第一句，无报告时明确提示本周/上周尚未生成周报。各指标无有效值为null，计数0仍为0。cards为current的薄映射，含count、hit_rate、miss_rate、ctr_median，以及四个平铺的`<field>_prev_delta`和`each_prev_delta:{count,hit_rate,miss_rate,ctr_median}`。两种delta均等于changes[field].delta（本周值减比较周值）；发布数差为计数，率和CTR差为百分点，无可比较样本为null。

`GET /articles/{uuid}`的data直接返回原文章字段、sample24h、reads_24h、ctr_24h、completion_24h、verdict、reliable/verdict_reliable、verdict_basis、applied_rules及snapshots；不是额外包一层article。snapshots按snapshot_date、id升序，包含该文章全部快照；sample24h可以为null。文章列表同样返回派生分析，但不附全部snapshots。content_hash仍是原文章实体的hash，不包含这些分析或关联资源。

`POST /articles`只接受`{id:"稳定小写UUID",...文章创建字段}`。首次创建前生成并保存id，重试保持原id和完整内容；201创建、200相同重放、409不同内容，不能让服务端随机生成id。原`PUT /articles/{uuid}`继续有效，体内不传id。

`PUT /playbooks/{数字版本}`接受`{id:"稳定小写UUID",version:与路径相同的数字,published_on:"YYYY-MM-DD",...法典创建字段}`。id和version均必需；仍按账号+版本唯一，遵循原创建重放和墓碑规则。UUID版PUT继续有效。OpenAPI用同一个`/playbooks/{uuid}`路径模板说明UUID和数字别名，避免重复的等价路径模板。

`PATCH /rules/{URL编码rule_id}`的JSON体为平铺结构：account、playbook_id、expected_hash、save_id全部必填，再附至少一个status/evidence/evidence_note/support_ids/counter_ids/trials。只能修改这六个字段；rule_id、section、text、check须通过法典资源修改。account和playbook_id共同确定法典，expected_hash取该法典最新GET的content_hash，save_id为本次操作的小写UUID。返回完整法典data（旧规则可带展示默认candidate），不只是被改规则。规则ID不跨版本或账号模糊匹配。

```json
{
  "account": "V字",
  "playbook_id": "123e4567-e89b-42d3-a456-426614174003",
  "expected_hash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "save_id": "123e4567-e89b-42d3-a456-426614174004",
  "status": "trial",
  "trials": 1
}
```

规则PATCH有save_id收据：同一身份以完全相同的目标、账号、法典、旧hash及规范化修改重放，返回原成功结果，即使之后法典又被修改；save_id挪用于不同请求返回409 IDEMPOTENCY_CONFLICT。第一次操作hash过期返回409 VERSION_CONFLICT，先重读解决冲突，不能仅替换hash自动重试。该规则收据不改变原资源PATCH无收据的约定。新three_day报告返回400；历史three_day可继续GET、筛选及按原类型PATCH。daily新建或修改的正文最多两句；历史长摘要可保留并修改其他字段。按中文。！？、英文!?及后接空白/结尾的英文句点分句，小数点不分句。

## 24h样本、判定与周统计

`reads_24h`、`ctr_24h`、`completion_24h`来自同一个快照：仅从已记录整数`age_hours`在12–72（含边界）的快照中取距24小时最近的一条。距离相同依次取较小age_hours、较早snapshot_date、字典序较小id。不按各指标各取一条，不用snapshot_date减published_at猜年龄。无合格快照或选中快照的某项未知，该指标为null，真实0仍为0；历史22份缺年龄样本不能冒充24h样本。

每个账号取最近30篇有有效reads_24h的文章作基线，按上海发布时间降序，未定日期在后，同日具体时间排在仅日期之前，完全相同按id升序。至少10篇时采用nearest-rank：升序第ceil(n×0.8)和ceil(n×0.3)项为q80/q30；reads_24h严格大于q80为爆，≤q30且<q80为扑，其余为中。边界并列不拆分、不凑固定比例，全相等均为中。不足10篇时暂用≥1000爆、≤100扑、其余中，并返回reliable:false；无有效reads_24h则verdict:null、reliable:false。verdict_basis返回方法、样本ID及阈值，供BOT核验。

周范围按Asia/Shanghai周一至周日，this为本周，last为上周；与所选周的上一完整日历周比较。本周可包含尚未结束的日期，不伪称完整同比。发布数按published_at归日，不能用采集日、created_at或未知发布时间补成“当天发布”。爆/扑率分母为本发布周内有有效reads_24h且有判定的文章，包含临时固定阈值判定；无可判定项时率为null。CTR等聚合使用有效值中位数；变化为百分点（percentage_points），不是相对百分比。趋势逐发布日返回有效样本数，缺失指标为null。缺24h样本与超过2个上海日历日未采集分别提示，均不填造指标。

文章的applied_rules按同账号及playbook_version_used匹配法典。applied_rule_ids为数组时只返回列出的规则；为null时展示该版本全部规则作为版本上下文，不证明逐条实际执行；未匹配版本返回空数组。

## 创建幂等与修改并发

1. 首次创建前生成一次资源UUID并保存规范化完整请求。首次PUT返回201；同UUID与相同完整字段（含缺省值）返回200；不同内容409 IDEMPOTENCY_CONFLICT。PUT不是更新，不能用旧创建体覆盖PATCH后的新状态。
2. 业务键重复返回409 REVIEW_UNIQUE_CONFLICT，包含 `error.existing_id`；先GET该UUID核对，不能换UUID盲目重试。同UUID错误和业务键错误不是同一概念。
3. 修改前GET当前项，PATCH体包含expected_hash及至少一个可写字段。例如 `{"expected_hash":"从GET取得的64位哈希","image_count":0}`。hash过期返回409 VERSION_CONFLICT，先重读并解决内容冲突。未发生实际变化的PATCH返回当前项且哈希不变。
4. 原资源PATCH不是save_id收据机制；如果写入结果未知，先GET核对。若PATCH确已改变实体，原旧hash重试会冲突，不能把冲突当作未保存或换hash自动覆盖。

## 永久删除与防复活

原有 articles、snapshots、reports、playbooks 四类资源允许公开访客永久删除，无法恢复，没有restore接口。DELETE请求体恰好包含expected_hash、save_id；文章另允许cascade_snapshots。expected_hash必须来自最新GET，save_id是本次删除的小写UUID。

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
| 409 | IDEMPOTENCY_CONFLICT | 同UUID不同创建内容，或save_id用于不同删除/规则修改请求 |
| 409 | VERSION_CONFLICT | expected_hash不是当前版本；先GET核对再决定 |
| 409 | READ_REVISION_CHANGED | 列表读取期间全局修订改变；从offset=0重读 |
| 409 | REVIEW_UNIQUE_CONFLICT | 业务键重复；error.existing_id给出现有UUID |
| 409 | REVIEW_DELETED | UUID已有永久删除墓碑，不能重放PUT复活 |
| 409 | REVIEW_RULE_AMBIGUOUS | 指定法典内规则ID不唯一；核对法典 |
| 409 | ARTICLE_HAS_SNAPSHOTS | 删除文章时有快照但未显式cascade_snapshots:true |
| 413 | BODY_TOO_LARGE | 整个JSON请求超过256KiB |
| 415 | CONTENT_TYPE | 请求不是application/json |
| 429 | REVIEW_RATE_LIMIT | 复盘公开写入每owner每进程60/分钟或2000/UTC日 |
| 500 | INTERNAL_ERROR | 内部错误；保留request_id排查 |
| 503 | NOTES_CONFIG / REVIEW_CONFIG | 所需owner配置不可用 |

文章删除成功返回 `{data:{deleted:true,id,deleted_snapshots:数量}}`，原有 snapshots、reports、playbooks 为 `{data:{deleted:true,id}}`。ARTICLE_HAS_SNAPSHOTS额外包含 `error.snapshot_count`。

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
