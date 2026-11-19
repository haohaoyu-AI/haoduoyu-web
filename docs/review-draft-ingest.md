# 草稿立即入库，发布后回到同一行

复盘文章原来没有发布状态。头条 Excel 里的已发布稿会直接成为一篇文章，草稿箱里的稿要等外部队列，默认拖到北京时间次日 08:00 才送进来。本站没有这个 08:00 定时任务。下面两个接口在请求到达时立刻写入，不再排队到早上。

已有文章不补造草稿。`publish_status` 为空的旧行仍视为已发布。新列都可空，不改旧行的内容哈希。

发布状态字段来自 `drizzle/0028_review_draft_status.sql`。文章关联、原稿标题和匹配材料使用现有的持久回执表。

| 列 | 含义 |
| --- | --- |
| `publish_status` | `pending` 待发布，`published` 已发布，`unmatched` 未能对上。空值是旧的已发布行。 |
| `draft_saved_at` | 草稿写入头条草稿箱的时间。带时区的 ISO 时间，页面按北京时间显示。 |
| `alternate_titles_json` | 正好 4 条备选标题，供匹配结果参考。 |

账号只接受 `V字` 和 `Z极客`。两边的草稿箱分开匹配。`好多鱼` 已停更，这两个接口直接拒绝。

阅读、点击率、爆 / 中 / 扑和走势图只统计已发布。待发布会计入「待发布」篇数，不进入那些汇总。未能对上的行会标出来，也不进入汇总，也不会再被当成一篇新的已发布文章。

## 草稿一存进草稿箱就调用

`POST /api/v1/review/drafts`

公开写入与现有复盘接口相同：来自站点源，并带 `X-Public-Business: 1`。同一账号、同一 `platform_article_id` 再调用会更新这一行，不会新建。

```json
{
  "account": "V字",
  "platform_article_id": "7702864660600570431",
  "title": "当前草稿标题",
  "alternate_titles": ["备选甲", "备选乙", "备选丙", "备选丁"],
  "sample_title": "对标原文标题",
  "sample_url": "https://www.toutiao.com/article/123",
  "draft_saved_at": "2026-11-18T09:05:00+08:00"
}
```

| 字段 | 类型 | 何时必填 |
| --- | --- | --- |
| `account` | 字符串，只能是 `V字` 或 `Z极客` | 必填 |
| `platform_article_id` | 字符串。头条文章或草稿的 item / pgc id，不要转成数字 | 必填 |
| `title` | 字符串，当前草稿标题 | 必填 |
| `alternate_titles` | 正好 4 条互不相同的字符串 | 必填 |
| `sample_title` | 字符串，对标原文标题 | 必填 |
| `sample_url` | http 或 https 链接，对标原文 | 必填 |
| `draft_saved_at` | 带时区的 ISO 时间。不传则用服务器收到请求的时间 | 可空 |
| `reference_article_id` | 已有爆文样本的 UUID。不传时，若该账号下只有一条相同 `sample_url` 的样本，会自动连上 | 可空 |
| `id` | 小写 UUID。不传则由服务器生成；同一平台编号重复调用时忽略新 id，沿用原行 | 可空 |
| `image_count` | 初稿配图数量 | 可空 |
| `draft_ref` | 平台的草稿引用，例如 `{"pgc_id":"7702864660600570431"}`，编号保持字符串 | 可空 |
| `match_evidence` | 正文和封面等核对材料，见下文 | 可空 |

成功后 `publish_status` 为 `pending`。爆文库用 `draft_saved_at` 作为「我们什么时候仿写入库的」，用对标样本自己的 `published_at` 作为「样本什么时候发的」。样本发布时间仍写在现有的 `PUT /api/v1/review/benchmark-articles/:id`，字段 `published_at`。

不要把这篇草稿留到次日 08:00 的 Excel 批次。草稿箱保存成功时就调用上面的接口。

## 发布之后更新同一行

`POST /api/v1/review/publications`

```json
{
  "account": "V字",
  "platform_article_id": "7702864660600570431",
  "title": "备选丙",
  "url": "https://www.toutiao.com/article/7702864660600570431",
  "published_at": "2026-11-18T10:00:00+08:00",
  "sample_title": "对标原文标题",
  "sample_url": "https://www.toutiao.com/article/123",
  "snapshot": {
    "snapshot_date": "2026-11-18",
    "reads": 320,
    "ctr": 4.5,
    "source": "toutiao_excel",
    "age_hours": 2
  }
}
```

匹配范围是同账号、同平台。平台文章编号相同且只有一个有效候选时，发布标题可以完全重写。系统也能读取该平台的草稿引用，或从标准头条文章链接识别编号。

编号缺失或不同的时候，正文关键段落要与来源、配图或事实共同支持同一原稿。正文缺失时，只有有序来源链接、相似封面和人物或事件及数字同时吻合才可关联。标题是辅助信息。正文明显不同、核心数字冲突、材料薄弱或多个候选都吻合时，保留待核对。该账号已有待发布稿时，待核对发布记录标为 `unmatched`，并且重复回写沿用原记录。尚无待发布稿的账号沿用历史导入行为。

对上之后，原稿更新为 `published`。`title` 是最终发布标题，`original_draft_title` 是原稿标题。已有样本、配图数和日期各自保留。已存的待核对发布挂到原稿时，旧 UUID 继续解析到同一篇，原有快照随关联移动。新回写可补充快照。日期相同而快照内容不一致时返回冲突，保留已存数据。

`PUT /api/v1/review/articles/:id` 在提交 `published_at` 或 `publish_status: "published"` 时使用同一套匹配。关联成功返回原稿 `id` 和 `matched: true`。

## 保存匹配材料

草稿及发布接口可提交 `match_evidence`。字段缺失时可省略。正文和封面证据用于内部匹配。

| 字段 | 内容 |
| --- | --- |
| `body` | 正文或关键段落，保留段落换行，最多 16,000 字符。可含文末「参考资料」等来源段落。 |
| `source_urls` | 已取得的文末资料链接，保留顺序，最多 16 条 HTTP(S) 链接。 |
| `cover_fingerprint` | 由图片像素生成的 `cover-v1:` 指纹。 |
| `people`、`events`、`numbers` | 文中的关键人物、具体事件、必要数字与单位，各最多 16 条，每条最多 160 字符。 |

有本地封面文件时，在支持 `createImageBitmap` 的浏览器端调用共享模块。已经有解码 RGBA 数据的导入程序可调用 `createCoverFingerprint({data, width, height})`。发布侧的缩放和重新压缩会改变指纹字节，服务端比较归一化后各区域的颜色和布局差异。接口只接收指纹和其他证据，不访问图片链接。

```js
import {fingerprintCoverImage} from './shared/review-cover-fingerprint.mjs';

const cover_fingerprint = await fingerprintCoverImage(localCoverFile);
const match_evidence = {body, source_urls, cover_fingerprint, people, events, numbers};
```

## 重跑一条已存在的待核对记录

工作区所有者可使用有效网站会话及现有 CSRF 保护调用 `POST /api/v1/review/publications/reconcile`。先读取发布记录取得 `article_id` 和最新的 `content_hash`，以 `expected_hash` 提交。再提交以下一项。

- `draft_id` 为网站上已有的原稿 UUID。系统从同账号和同平台候选重新检查证据，并校验唯一关联。
- `draft` 为已经人工核实的原稿信息，包含 `platform_article_id`、`title`、`sample_url`。用于发布记录已存在、网站尚无独立原稿行的情况。服务端校验平台编号及已补回的样本链接一致，并确认当前候选里只有该待核对发布。

默认只预检，返回 `preview: true`。核对原稿标题和将被关联的记录后，以相同字段加 `apply: true` 提交。相同确认请求可安全重放。对并发更新或同日快照冲突返回 `409`，当前历史保留。写入成功后用返回的原稿 UUID 回读详情和快照。

页面上的时间都按北京时间显示。
