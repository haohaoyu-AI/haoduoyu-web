# V 字归档备份与恢复演练

已部署源码 `0814c393e47491fa5f59f59d1bfeb4b5603122de` 的 v18 网站导出按会话筛选数据。`review_articles` 的导出列清单遗漏 `publish_status`、`draft_saved_at`、`alternate_titles_json`，这三列已由 `0028_review_draft_status` 建立。发布前须使用受控的 D1 原生整库备份，或经过相同覆盖核验的等价备份。已有 v18 JSON 可作辅助资料。[v18 的导出列清单](https://github.com/haohaoyu-AI/haoduoyu-web/blob/0814c393e47491fa5f59f59d1bfeb4b5603122de/src/backup.mjs#L53) · [草稿迁移](https://github.com/haohaoyu-AI/haoduoyu-web/blob/0814c393e47491fa5f59f59d1bfeb4b5603122de/drizzle/0028_review_draft_status.sql)

## 数据库预检与备份

1. 在已授权的私有运维环境，确认当前 100% 流量的 Worker 版本及其实际 D1 绑定。用只读权限核对应用表、草稿三列，并记录数据截止点。若生产有迁移账本，直接 `SELECT` 已有表。若未设置账本，核对完整应用目录是否与已部署源码的 `0000` 至 `0028` 等价，并确认 `0029` 的对象均缺席。Wrangler 的 `d1 migrations list` 会初始化缺失的账本。[Wrangler 实现](https://github.com/cloudflare/workers-sdk/blob/main/packages/wrangler/src/d1/migrations/list.ts)
2. 核实原生整库导出权限、私有保管位置和导出窗口。D1 原生导出要求 D1 Write，导出期间可能阻塞数据库请求。记录已核对的绑定、源数据截止点、备份时间与文件 SHA-256。已有 Time Travel 书签可作为附加恢复点，其可用性取决于生产计划和保留窗口。备份、原始行、散列明细、会话数据及凭据留在受控环境，禁止进入仓库、公共构建产物或 CI 日志。[D1 导出](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/) · [D1 权限](https://developers.cloudflare.com/d1/observability/debug-d1/#error-10000-and-token-permissions) · [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
3. 在同一数据截止点取得可独立核验的源库行级证据。将原生备份恢复到全新的隔离目标，保留原封存备份及独立源证据。两次从同一导出文件恢复无法检验源库漏项。如果无法确认数据截止点一致、覆盖完整或目标完全隔离，则暂停迁移。

## 隔离库校验

校验工具只接受两个本地 SQLite 文件。`source-cut.sqlite` 对应独立取得的同一截止点基线，`restored.sqlite` 来自被验备份。先核对恢复结果，再只在隔离副本应用已锁定的 `0029_review_archive.sql`，最后核对迁移后的副本。工具以只读方式打开文件，SQL 导入及迁移由受控运维环境执行。

```bash
node scripts/review-recovery-audit.mjs restore /private/source-cut.sqlite /private/restored.sqlite
node scripts/review-recovery-audit.mjs migrate /private/source-cut.sqlite /private/migrated.sqlite
```

- 校验比较所有预期应用表的表结构、索引、行数，以及按主键对应的全列 SHA-256。迁移前的 42 张应用表必须逐行一致，新增六张表必须符合锁定结构且为空。原生恢复演练同时比对应用运行表。D1 平台元数据和迁移账本另行预检。
- 单独核对草稿三列的值与非空数，检查 `review-publication:` 回执原文及同所有者的原稿关联，并核对每条历史快照的 ID、所属文章、数量和全行哈希。发现既有悬空关联时保留证据并复核，演练期间不改历史数据。
- 校验会检查外键与 SQLite 完整性。CLI 只输出核验状态和汇总数，失败时只输出检查类别及表名。行级哈希、ID、正文和文件路径不进入终端输出。

## 发布次序与回退

隔离恢复和迁移演练通过后，重新核对生产绑定、数据截止点、当前结构和已有账本。`0029_review_archive.sql` 的 SHA-256 为 `887fca1169b03dfd221d79355683f45aab20a395db9d89a6abdfe767368fe069`。核实 `0029` 是唯一所需变更后，按现有授权的 D1 流程单独应用已审 SQL。未设置账本的数据库以完整目录和独立运维回执留证。迁移后核对六张表、九个显式索引、旧结构和已有账本，再按仓库受保护发布流程使用固定提交、构建字节哈希和最新在役 Worker 版本切换流量。发布工作流沿用已有绑定，数据库备份和迁移由独立运维路径执行。[仓库 Worker 发布流程](cloudflare-actions-release.md)

需要紧急回退时，先核对旧 Worker 兼容新增表，再按正式流程回退流量，保留已写入的归档数据。原地 Time Travel 会把数据库还原到旧时点，只有核清该时点之后的新写入、具备保全方案，并获得相应生产授权才可使用。[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
