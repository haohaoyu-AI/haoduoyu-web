# 草稿立即入库，发布后回到同一行

复盘文章原来没有发布状态。头条 Excel 里的已发布稿会直接成为一篇文章，草稿箱里的稿要等外部队列，默认拖到北京时间次日 08:00 才送进来。本站没有这个 08:00 定时任务。下面两个接口在请求到达时立刻写入，不再排队到早上。

已有文章不补造草稿。`publish_status` 为空的旧行仍视为已发布。新列都可空，不改旧行的内容哈希。

迁移：`drizzle/0028_review_draft_status.sql`。上线前对 D1 执行这一份，再部署读取这些列的版本。三条都是 `ALTER TABLE matrix_review_articles ADD`，不回填、不删数据。

| 列 | 含义 |
| --- | --- |
| `publish_status` | `pending` 待发布，`published` 已发布，`unmatched` 未能对上。空值是旧的已发布行。 |
| `draft_saved_at` | 草稿写入头条草稿箱的时间。带时区的 ISO 时间，页面按北京时间显示。 |
| `alternate_titles_json` | 正好 4 条备选标题。发布时改标题，靠它们加对标原文把已发布稿认回同一行。 |

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

匹配只在同一个 `account` 里进行，顺序是：

1. `platform_article_id` 相同，就是同一篇。标题可以改成四条备选之外的句子，仍然更新原行。
2. 没有相同的平台编号时，对标原文的标题或链接（或 `reference_article_id`）必须对得上，并且发布后的标题等于草稿标题或四条备选之一。
3. 只凭标题相同，不算同一篇。
4. 对上两行以上时不猜测。新行标成 `unmatched`，原来的待发布行保持不动。同一条发布再送一次，如果还是对不上草稿，会更新这条 `unmatched` 行，但不会因为它自己的平台编号把它改成已发布。只有对上待发布草稿，或对上一条已经是已发布的文章时，才标成已发布。
5. 这个账号已经有待发布草稿、但又对不上时，新行标成 `unmatched`，不计入发文和阅读。
6. 这个账号还没有任何待发布草稿时，发布回写仍作为已发布文章写入，避免把尚未切到新接口之前的历史 Excel 全部标成未能对上。

对上之后，原草稿行改成 `published`，写入发布标题、链接、`published_at` 和平台编号，并把 `snapshot` 挂到这一行。不会再插入第二个 UUID。

`PUT /api/v1/review/articles/:id` 在带有 `published_at` 或 `publish_status: "published"` 时使用同一套匹配。对上待发布草稿则返回原行 id，`matched: true`。该账号已有待发布草稿而又对不上时，新行是 `unmatched`。

页面上的时间都按北京时间显示。
