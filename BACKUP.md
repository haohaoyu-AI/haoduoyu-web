# 源码保全范围

codex/ui-refactor-20261021 的 f8050c8 是 Sites v6 运行源码备份。opt/phase1-foundation 在其上恢复经审查的合成测试、预览和 CI。远端保存与 CI 成功必须以实际 GitHub 提交和 PR 状态为准，不能用本地 commit 代替。

公开材料不包含生产数据库、原生产派生复刻、运行凭据、完整旧证据包或私有历史 bundle。已有源码业务识别常量不是生产数据库导出。不要加入 .preview、.env、备份或整体截图证据。

原始扫描与详细取证留在受限工作区，本分支仅提交净化摘要及精确历史误报指纹；这不证明所有历史和其他存储绝无隐私数据。GitHub 保存、正式 Sites 源仓保存、版本保存和部署分别核验，见 docs/RUNBOOK.md。

## OpenAI review backup v16 (migration 0020)

New exports use `haoduoyu-matrix-d1-v16`: 36 restored tables plus 3 intentionally
reset runtime tables in the independent inventory. They now include all eight
content-review tables introduced in migrations 0015–0018, together with
`matrix_openai_review_config` and `matrix_openai_review_runs`. Earlier v15 exports
omitted the eight content-review collections. Those omitted rows cannot be
recovered from an old backup; retain the original database and obtain a new
complete export before any migration or recovery. Do not substitute a scoped
HTTP export for an operator's whole-database backup.

All ten review collections are private to the exporting session user in HTTP
backups. The operator-only export includes every owner. Run history retains
successful, failed, running, uncertain, and explicitly released uncertain runs,
including full local source captures, model input, instructions, and summaries.
Provider API keys are environment secrets, have no database column, and are not
exported or restored. A released run is not a successful checkpoint.

Restore accepts formats v1–v15 with their exact original columns and defaults
new review collections to empty. v16 keeps the same fenced, empty-target-only
restore and post-restore foreign-key/inventory checks. Old full inventories do
not prove completeness of newer review data. Migration 0020 only creates two
new tables and two indexes; it changes no existing business rows. Its exact SQL
is pinned by the migration contract hash. Successful run immutability and
config optimistic-version updates are enforced by the application write paths.
