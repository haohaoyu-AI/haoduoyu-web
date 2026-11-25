# 爆文库：登记仿写

前台爆文库只画出已经被仿写的对标样本。判定依据是我方文章已有字段 `matrix_review_articles.reference_article_id`，它指向 `matrix_review_benchmark_articles.id`。没有新列。没填这个字段的样本仍留在库里，前台不显示。

`used_by_article_ids` 只读，由上面的字段反查。登记时不要写它。样本本身仍用现有的 `PUT /api/v1/review/benchmark-articles/:id`。我方文章的账号必须和对标样本所属账号一致，否则关联返回 404 `REFERENCE_NOT_FOUND`。

公开写入与碎碎念相同：请求来自站点源，并带 `X-Public-Business: 1`。

## 已有我方文章

必须先读出当前哈希，再改这一篇。

1. `GET /api/v1/review/articles/:id`，从响应读取 `content_hash`。
2. `PATCH /api/v1/review/articles/:id`，请求体只有关联所需的两项：

```json
{"reference_article_id":"<对标样本 id>","expected_hash":"<上一步的 content_hash>"}
```

`expected_hash` 必须等于刚刚读到的 `content_hash`。记录已经变过时返回 409 `VERSION_CONFLICT`，需要重新 GET。成功后哈希会变，下一次修改要再用新的 `content_hash`。

## 新建

`PUT /api/v1/review/articles/:id` 只用于新建。同一 id 再次 PUT，内容与已保存的记录一致时是重放；内容不同返回 409 `IDEMPOTENCY_CONFLICT`。已有文章要改关联，走上面的 GET 再 PATCH，不要用 PUT 覆盖。
