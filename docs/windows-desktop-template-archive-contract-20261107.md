# Windows 常用待办归档契约审计

本页为 2026-11-07 的只读源码审计及后续实施边界，**没有实现业务功能、运行新增测试或访问生产记录**。正常 `git fetch origin fix/restore-production-source-75c22677` 成功，`FETCH_HEAD` 精确为 `34bff302e128c92f46f00e76d59f9b44b9b7242e`；未合并该分支，不改网站、后端或数据库。

## 来源与线上关系

- 固定候选源：[34bff302 的 todo-templates.mjs](https://github.com/haohaoyu-AI/haoduoyu-web/blob/34bff302e128c92f46f00e76d59f9b44b9b7242e/src/todo-templates.mjs#L53)。此提交说明为恢复已审阅的生产网站源，但该说明不等于已独立证明当前线上 Worker 的精确提交。
- 该提交 `public/openapi.json` 的 SHA256 为 `db16b231b41c6012c1cf7b1c2c2f8bdcf447924a791b2ce5766f0263e3ce698d`，与本轮已取得的公开 OpenAPI 相同；其 `public/app.js` 为 `cd34b302606ce03203b26ae0381bfb06fb8eeb2208f919d0688ceb789acbf061`，与已取得线上 bundle 的 `8cb0dc0eddec1a8552dac3591f7ec57ad24d75ff00e075e0fa310beeeccf756d` 不同。候选 `web/pages/todo-templates.mjs:117–159` 与线上 bundle 中读取归档列表、发送 archive/restore 的相关流程一致，但不能据此声称整个构建或后端相同。
- 当前桌面既有真实 Worker fixture 为 `c30a8a956715b6ea809db4b87c0f4fcddf8f61de`，没有归档合同。后续应另建固定 `34bff302` 的隔离 fixture；不把旧 fixture 改成已验证新功能，也不猜测生产迁移状态。

## 明确的服务合同

| 操作 | 固定源码语义 |
| --- | --- |
| `GET /api/v1/todo-templates` | 仅当前 actor 的 `deleted_at IS NULL AND archived_at IS NULL` 模板。 |
| `GET /api/v1/todo-templates?archived=1` | 仅当前 actor 的 `deleted_at IS NULL AND archived_at IS NOT NULL` 模板；唯一查询键为 archived，值只能为 1，重复参数或其他键拒绝。无分页合同。 |
| `POST /api/v1/todo-templates/{UUID}/archive` | JSON 必须仅含 `version`；正安全整数且严格小于 `Number.MAX_SAFE_INTEGER`。按 actor、UUID、当前版本 CAS 更新 `archived_at/updated_at`，版本加 1。 |
| 同路径 `/restore` | 同一请求结构，将 `archived_at` 置 null；**恢复归档，不恢复软删除**。已软删除模板仍 404。 |

`src/todo-templates.mjs:78–89`：当前归档状态已经等于目标，且当前版本等于请求版本或请求版本加 1 时，直接返回当前模板，不再写入或递增。其他旧版本 409。成功返回完整模板、统计字段及明确的 `archived_at`：归档为时间戳，恢复为 null；返回体不含 `deleted_at`。常规活跃 GET 的 `archived_at:null` 可省略，归档 GET 的时间戳保留。

归档不删除待办历史和关联。`src/todos.mjs:68–81` 将关联模板的活跃状态定义为未删除且未归档；新待办带 `template_id` 时须活动模板，否则 404（`:98`），已有待办重新关联已归档模板返回 `TEMPLATE_ARCHIVED` 409（`:154`）。不应通过另建模板或 UUID 绕开归档状态。

认证按 actor 所有者隔离。私有接口仍要求 session 管理身份与 CSRF；API key 不能冒充管理员。公开模式须正常启用、明确 `X-Public-Business:1` 和精确 Origin，保留原读写配额与 16KiB 请求限制。入口和授权见固定源 `src/public-business.mjs:8–14,44–87`、`src/business-access.mjs:7–17`、`src/worker.mjs:287–301`。

没有模板按保存 ID 查询的精确收据接口，归档 body 也不接受 `save_id`。同状态重放不是某次丢失请求已经提交的证明。Unknown 继续保留原请求 ID、字节与围栏；两张列表仅供只读核对，不能自动确认、换键或盲重发。

## 迁移、快照与现有测试

- 固定源 `drizzle/0019_todo_notes_archives.sql` 只新增 `matrix_todos.note NOT NULL DEFAULT ''` 和可空 `matrix_todo_templates.archived_at`；SQL SHA256 为 `5666cdc6f6b84f7e33457e4c4b45a0ed26d6acc5cbefcebaf29912cb11de97ec`。`scripts/migration-contract.mjs:184–196` 校验该迁移。桌面实现不执行生产迁移。
- `src/business-snapshot.mjs:46` **排除归档模板**。普通 snapshot 中缺席不等于删除；归档集合必须独立 GET、独立缓存及标明完整性，不能由快照补空。当前桌面完整离线准备也只读取活动模板，后续需明确扩展该边界。
- `src/backup.mjs` 的 v15 保留归档字段；旧 v14 导入补 null。备份兼容不等于 Windows 旧客户端私有目录已经迁移验收。
- 已存在源码测试：`tests/todo-notes-archives.test.mjs` 覆盖增量迁移、归档/恢复、历史保留、归档禁止创建关联待办、v15 备份和 v14 默认值；`tests/public-business.test.mjs:84–101` 覆盖其他所有者不可写、Origin/公开标头拒绝、归档列表、旧版本冲突及关闭公开模式。**本次仅阅读这些测试，未执行，也未核实候选 CI 结果。**

## 桌面接入必须同步修改

1. `Haoduoyu.Api/RoutePolicy.cs` 增加唯一合法 `archived=1` 查询及模板专属 POST archive/restore；`ApiRequests.cs` 使用单字段、严格版本上界的 builder。不能泛化开放任意模板子路径或查询。
2. `MutationVerifier.cs:100–118` 当前模板强制版本加 1，且通用 restore 强制 `deleted_at`，会误拒同版本 no-op 与真实归档恢复。应在通用分支之前按模板归档动作校验 UUID、同版本或加 1、完整返回字段及目标 `archived_at` 状态，不放宽其他资源的收据规则。
3. `SyncEngine.VersionTarget():474–489` 当前不识别 archive。若从已确认创建/归档/恢复结果派生子操作版本，应识别模板专属动作，核对同资源、UUID 和真实返回版本，再冻结一次请求；不能硬编码版本、借恢复动作清除 Unknown 或把归档恢复当软删恢复。
4. `WorkspaceProjection.cs` 需实现模板归档本机意图与 activity 筛选。当前模板列表完整性与 `Matches/Covers` 不区分 archived 查询；直接新增第二张缓存会让两个完整列表相互当作删除证据。必须按活动/归档范围分别建立权威，archive/restore 设置归档状态，不能复用 `_local_deleted`。关联待办的历史、完成状态和原始正文不改写，模板可用性只作派生展示。
5. 原生模板页应明确活动与归档列表、显式归档和恢复、待同步/Unknown/冲突来源。保留既有 DELETE 请求的历史与含义，不能悄悄把旧软删除请求改为归档。列表读取失败、身份变化、超预算或取消均保全旧缓存、草稿和队列；本轮 1MiB 网络等既有预算不扩大。

## 后续隔离验证设计

在另建的精确候选 Worker 与临时合成 D1 中，禁止外部 fetch；不访问生产记录。捕获真实成功和拒绝响应，至少验证：

- 活动/归档列表互斥、无分页猜测；归档保留历史与链接、恢复后重新可用；已软删模板不能恢复归档。
- archive、restore 各自状态改变为版本加 1；同状态同版本与加 1 重放均不改数据库；旧相反状态、相差超过 1、并发竞争只允许合同内结果。
- body 缺字段/额外字段、0、负数、非整数、字符串及 MAX_SAFE_INTEGER 拒绝；查询重复、archived=0/true、额外键、非法 UUID 拒绝。
- session/公开正常路径与错误 CSRF、Origin、标头、其他所有者、key 管理权限、公开模式关闭及原限流拒绝；不修改约束、鉴权或额度配置来让测试通过。
- 实际 WorkbenchApi 响应验证接受合法 no-op 与 `archived_at:null`，拒绝错 UUID/状态/版本/缺字段；GET 当前相同状态仍不能确认丢失请求。
- 本机活动/归档缓存任意读取顺序不互删；Queued/Unknown/Conflict 意图、依赖创建→归档→恢复版本、相同名字不同 UUID、离线重开、备份恢复 Unknown 及切分区全部保全。
- 原生显示窗口仅假 HTTP 和临时私有目录，验证取消/坏响应/身份漂移不替换缓存、不发送业务写；中文输入、断电与真实安装仍留待实机。

可实施范围是基于固定候选合同开发桌面功能、生成新隔离证据并正常保存独立分支。当前线上 Worker 精确 SHA、0019 生产迁移是否已执行、新动作的真实生产响应和实机验收仍未知；不据此部署、迁移生产、安装用户设备或重试已拒绝的 artifact/job-log 下载。
