# V字档案报告修正

工作区所有者以有效网站会话进入 V字档案。这里的修正按既有报告 UUID 保存，在档案中读到最新版本，并可逐页查看原文和各次修订。原报告接口继续提供其原有内容。

- `GET /api/v1/review/archive/reports?type=review` 列出 V字已有复盘报告。
- `GET /api/v1/review/archive/reports?type=ai` 列出所有者已在档案中确认归属 V字的 AI 汇报。
- `GET /api/v1/review/archive/reports/:type/:id` 读取详情、`content_hash` 和修订历史。列表用 `next_offset` 续页，历史用 `next_history_offset` 作为 `history_offset`。两种续页均可附上原返回的 `read_revision`，发现数据改变时重新从第一页读取。
- `PATCH /api/v1/review/archive/reports/:type/:id` 带现有 CSRF 和 `{expected_hash,changes}` 保存修正。`expected_hash` 来自最新详情。复盘沿用该报告的字段与周期校验，AI 汇报可更正 `author` 和 `content`。

已有 AI 汇报的原表没有账号字段。所有者可按自己名下的已知汇报 UUID，附上详情参数 `?confirm_v_account=1` 预览。核实归属后，首次 PATCH 需要带 `confirm_v_account: true`。用空的 `changes` 可仅确认归属，保持原文。

首次实际修订会保留原始版本，之后每次修订追加版本。保存请求使用同一个 `expected_hash` 和相同修改，可在结果不明时重试。若另一方已改过内容，返回 `409 VERSION_CONFLICT`，先回读再决定如何合并。
