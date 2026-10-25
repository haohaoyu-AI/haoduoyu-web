# 长期备忘录：独立交付边界

本分支 `opt/long-term-memos` 从已验收的文章后端提交 `2e83203255f8f38c80e5ed32c8d275edc47141b6` 开始，依赖其 `0005_article_pipeline` 和 v6 备份格式。不包含 `opt/article-pipeline-ui` 的未完成代码。此文件和分支不是生产发布记录；本轮仅允许保存、推送，合并和部署由父任务统一进行。

开发期间文章 UI 已另行上线为 `fe8efa479c0c2865970b43053db4deb62a3380c9`，生产数据库仍为 v6。发布者须将本分支与该已上线版本整合，不能直接部署基于旧 `2e832032` 的整包覆盖文章 UI；本任务不负责执行该合并或部署。

## 冻结范围

- 数据只有“分组 → 笔记”两层，不按天分页、归档，不引入笔记本、绘画、附件、无限树、AI、索引、Notion 同步或定时任务。
- 新增 `matrix_memo_groups`、`matrix_memo_notes`，独立增量迁移 `0006_long_term_memos`；旧 SQL 不改。所有在线写仍走原 `mutate`，复合读取仍走原 `consistentRead`，不改变 storage 机制。
- `src/memos*.mjs` 为独立 API；`web/*memos*`、`web/core/memos*`、`web/pages/memos.mjs` 为独立前端；`public/memos.css` 隔离样式，只有移动导航七列规则触及公共导航。
- 界面桌面采用分组栏、笔记列表、编辑区域；移动端逐层切换。标题和正文只处理纯文本。新增、改名、自动保存、回收站恢复在本轮范围内。
- 每个 owner 最多 32 个分组、200 篇笔记（含回收站）；标题最多 120 字符、正文最多 64 KiB UTF-8；排序整数限 0–1,000,000，UUID 和归属均校验。达到上限时拒绝新增，不自动永久删除。

## 权限与保存

部署前必须由发布者设置明确的 `MEMOS_OWNER_ID`，它必须指向已有管理员用户 UUID；无配置或对应用户不存在时关闭模块并返回 503。它不继承 `PUBLIC_BUSINESS_USER_ID`、todo 匿名写或 `DAILY_NOTES_OWNER_ID`。公开 API 不接受 `user_id`，只公开该主体未删除的分组和笔记。回收站及保存收据只允许 owner 登录查看。

写操作要求真实 owner session、同源 Origin 及 CSRF，API key、匿名公共业务身份和其他登录用户均无写权限。读接口的 `can_edit` 用于界面显示，服务端每次写仍独立验证授权。保留原 todo 匿名写、notes 公开读/owner 写、默认 todo 首页。

每次写必须携带原 `version` 和 UUID `save_id`；版本不符返回 409，不自动覆盖。保存收据与业务变更同批提交；网络结果未知先查收据，不能当成未写后创建新请求。浏览器保留未确认的原请求与草稿；恢复和再次写入需要明确处理保存状态。分组删除确认标题及当前活动笔记数，删除分组只隐藏子笔记，恢复不复活此前单独删除的笔记。

每个浏览器文档使用独立草稿分区；刷新或复制标签页只读取前一个分区，避免另一标签页把离线稿清空。owner 的“本机草稿”入口可查看、复制及显式恢复最多 100 份历史笔记草稿；不同草稿不会静默覆盖，恢复后仍核对服务器版本。存储不可用或容量不足时显示明确提示。草稿并非服务器备份，清除浏览器存储会丢失本机副本。关闭原标签页后的通用分组操作尚无单独的历史恢复入口，原页面刷新仍保留收据核对状态；笔记草稿历史恢复已接入。

## API 契约

所有路径以 `/api/v1` 为前缀。成功响应沿用 `{data: ...}`，错误沿用现有错误码和 request ID。

| 方法与路径 | 行为 |
| --- | --- |
| `GET /memos` | `{groups,notes,can_edit}`；笔记仅元信息；owner 可见回收站；分组含 `active_note_count` |
| `GET /memos/notes/:id` | 单篇完整标题/正文；公开读取过滤笔记及父分组墓碑 |
| `PUT /memos/groups/:id` | `{title,position,version,save_id}`；version=0 创建，否则 CAS 改名 |
| `PUT /memos/notes/:id` | `{group_id,title,body,position,version,save_id}`；group_id 创建后不可变 |
| `DELETE /memos/groups/:id` | `{version,save_id,confirm_title,confirm_note_count}`，软删除 |
| `DELETE /memos/notes/:id` | `{version,save_id}`，软删除 |
| `POST /memos/groups/:id/restore` | `{version,save_id}`，恢复分组 |
| `POST /memos/notes/:id/restore` | `{version,save_id}`，父分组必须已恢复 |
| `GET /memos/operations/:save_id` | owner 保存收据；无收据不证明迟到的写不会完成 |

## 数据与并行合并

新备份 v7 包含两张表、软删除和 source revision 高水位；恢复仍仅限空隔离目标，兼容 v1–v6，旧版本补空备忘录表。owner 范围导出不泄漏其他用户备忘录；旧 todo、notes 和文章字段兼容规则保留。迁移 0006 只添加表和索引，不插入用户资料。

共享接入点：`src/worker.mjs`、`src/lib/request-trace.mjs`、`web/controller.mjs`、`web/core/constants.mjs`、`web/ui/components.mjs`、`public/index.html`、`scripts/build.mjs`、迁移元数据、`src/backup.mjs` 和 `.ci/public-assets.json`。`public/app.js` 是派生产物，未来与文章 UI 合并时先合并 `web/` 源码，再重新构建和更新精确资源哈希，不能整文件覆盖另一分支。`0006` 编号若被其他分支占用，发布者需先协调重编号及元数据，禁止改写已执行迁移。

本轮只使用合成 fixture，不读取私人笔记，不迁入真实重要资料，不访问生产数据库、Cloudflare、头条或既有浏览器任务。必要浏览器验收仅在临时本地 D1、回环地址与合成登录中执行。

## 验证证据

后端专项 8/8、数据兼容专项 23/23、前端状态专项 16/16 通过（专项包含相关旧版本回归，不能相加冒充最终全套总数）。真实本地 Worker 浏览器验收 10/10 通过；[桌面截图](long-term-memos-images/desktop-owner-1440.png)、[手机截图](long-term-memos-images/mobile-owner-editor-375.png)及[精确产物哈希报告](long-term-memos-images/report.json)随分支保存。手机为 Chromium 375px 模拟，无真实设备或线上验收声明。

本轮唯一一次完整测试执行 577 项，初次 570 通过、7 失败：3 项为新模块内部 `reads` 名称与旧 VM 测试变量冲突，3 项为既有前端精确证明尚未投影备忘录接入，1 项为本地缺少历史提交对象。只改为 `memoReads` 并加入可拒绝变异的精确导航/路由 AST 投影；精确补取原历史提交，无需修改 dashboard 代码。受影响前端及状态套件随后 56/56 通过，原 dashboard 历史证明 1/1 通过，9 个资源与源码产物一致性、构建和两个本地预览通过。没有重复执行整套 577 项，也不把首轮结果改写成最终提交全量全绿。

最终提交、完整 CI 和密钥扫描结果在交付报告中给出。历史基线 CI 只用于说明依赖已验收，不冒充新增功能证据。此环境的 `gh run list` 查询 GitHub Actions 返回 `Forbidden`，不代表 CI 已失败或通过，也未绕过该访问限制。尚未部署。
