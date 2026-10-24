# 正式迁移运维准备（尚未执行）

2026-10-24：用户已在 `cf-check.haoduoyu.xyz` 关闭 VPN 后完成新增、勾选和删除；正式站仍为 Sites v9。本次只实现代码和合成演练，不部署维护、不冻结原站、不导出真实数据、不创建资源、不导入生产库、不切 DNS。

## 原 Sites 完整导出能力仍然缺失

本次核查当前工具描述：Sites 仅提供 `read_database_overview` 与 `read_database_table_rows`。后者每页最多 25 行、offset 上限 10000，且有列/行/单元格截断与省略标记；它是只读预览，不是具有完整性保证的数据库导出。当前没有完整 SQL/SQLite 下载、任意 SQL 或完整导出工具。概览仅确认 DB 与预期 15 张表，不证明取得完整内容。

应用现有 `GET /api/v1/backup` 以当前用户过滤四张待办相关表，不得从它生成自己的“独立”源库存再宣称全用户完整。没有新增公开导出路由、生产秘密、后台绕行或伪造连接。

**必须先由平台提供受支持的完整源快照/导出运维通道，或确认已有受支持且有完整性保证的私有下载能力。** 未取得前，正式迁移停在准备阶段，不部署维护让原站无谓停用。本仓库的 operator helper 需要调用方已经具有授权的完整 D1 handle；它不授予 Sites 原数据库权限。

自有 Cloudflare D1 的 `wrangler d1 export --remote --output=PRIVATE_FILE` 是官方 SQL 导出流程，但不能拿自有账号权限代替原 Sites 数据库的权限，也不能把 SQL 文件直接交给只接受 v4 JSON 的离线校验 CLI。

## 临时维护入口

运行时变量 `MIGRATION_MAINTENANCE=1` 在 Worker 路由、初始化、鉴权及所有数据库访问前返回 HTTP 503，包含 `MAINTENANCE`、`Retry-After: 60`、`Cache-Control: no-store`。包括 `/health`、静态页面、初始化、登录、Cookie、Bearer GET 和匿名业务请求，均不会读取 DB、认证配置或请求体。不按查询参数、请求头或公开 API 开关维护。

默认不启用；设置为 `0` 或移除可恢复原处理。Cloudflare 本地配置生成器只接受显式字符串 `0` 或 `1`，不自动部署。Sites 版本同样读取运行时变量，但现有生产 v9 不含这段代码；不能仅设置变量就声称已冻结。未来须先批准精确维护版本及环境变量动作，并验证原域名与旧 Sites 默认入口均返回维护响应，再排空旧版本在途请求。源站切换后应继续保持冻结，避免旧地址和 DNS 缓存写入旧库。

这只阻止进入该 Worker 的新请求；不能取消在途事务、冻结直接 D1 运维写入或停止外部重试队列。须先暂停所有已知网页/AI/API/任务，处理结果不明请求并排空；维护不能靠关闭匿名模式、修改 SITE_ORIGIN 或只停业务 POST 替代。Bearer GET 的 last_used_at 写入不推进 revision，因此最终导出期间同样不能放行。

没有 HTTP 维护豁免、导出后门或新管理凭据。持有独立授权完整 DB handle 的离线 operator 路径不经过网站 fetch，仍可使用。

## 冻结后的全用户迁移快照

`scripts/migration-inventory.mjs` 的 `exportMigrationSnapshot(db, {sourceFrozen: true})`：

1. 不传 `sourceFrozen: true` 则拒绝；此参数是操作员确认，**不执行冻结也不证明冻结完成**。
2. 从独立完整源 handle 清点全部 15 表，包括重置表。
3. 调用无 todoUserId 过滤的 `exportBackup(db)`，导出 v4 的全部 12 张持久表，保留所有 user_id、软删除、模板关联、偏好、凭据哈希/权限、审计与幂等。
4. 对照库存校验后再完整清点一次，比较所有表的行数/哈希与 revision。能检测未推进 revision 的元数据变化，但双重读取不是对活跃数据库的原子快照替代；独立冻结仍是前提。

源库保持原样。迁移恢复有意清空 sessions/login_attempts、重建 control，不能把它说成复制所有旧会话。恢复后必须重新登录。不要合并不同用户；公开模式只使用经核实的真实用户和账号 ID 范围，凭据/会话/原始备份不进入匿名接口。

私有文件放在仓库外，目录 700、文件 600；不得进入 Git、聊天、截图、公开目录或 CI 产物。操作员只报告验证状态、表数量和脱敏摘要，不报告数据行或凭据哈希。已有离线校验命令：

```sh
npm run verify:migration-backup -- --backup PRIVATE_V4_JSON --inventory PRIVATE_SOURCE_INVENTORY_JSON
```

这是离线空库恢复，不会访问云账号或创建资源。源库存来源须独立核实，不能从待验证备份反推。

## 自有 D1 的私有分批导入适配

`scripts/remote-d1-import.mjs` 的 prepare 模式仅本地执行：先以原恢复函数演练完整 v4 备份及 15 表库存、哈希、外键，再生成 SQL 计划。固定已验证的表/列名，文本以无损 UTF-8 hex SQL 值编码；每批最多 20 行、256KB，过大单行拒绝而不截断。计划目录必须在仓库之外、新建且权限 700，文件 600，不覆盖已有计划。

```sh
node scripts/remote-d1-import.mjs prepare \
  --account VERIFIED_ACCOUNT_ID \
  --database VERIFIED_DATABASE_UUID \
  --name VERIFIED_DATABASE_NAME \
  --backup PRIVATE_BACKUP_JSON \
  --inventory PRIVATE_INVENTORY_JSON \
  --directory NEW_PRIVATE_PLAN_DIRECTORY
```

仅在另行批准导入到确切空目标后，才可使用 execute 模式。目标先应用仓库原四份 schema 迁移、保持业务空库和隔离，不把它指向测试库或原库；工具本身不创建云资源、不应用 schema、不安装 Wrangler、不登录或创建 token。

```sh
node scripts/remote-d1-import.mjs execute \
  --config PRIVATE_DEFAULT_WRANGLER_JSON \
  --confirm-empty-target VERIFIED_DATABASE_UUID \
  --directory PRIVATE_PLAN_DIRECTORY
```

execute 使用已有 Wrangler CLI 和操作员已有授权，调用官方 `d1 execute --remote --file --json --yes`，不假设 REST 多语句 batch 事务保证。它核对账号、精确 UUID、唯一同名绑定、计划文件哈希，拒绝环境/profile 歧义；先只读检查 15 表和空目标状态。独占执行收据防止同一计划重复/中断续跑；失败、进程中断或提交后响应丢失均停下，不盲目重试。新计划也不能覆盖非空或已围栏目标；须先独立检查结果，另行批准处理失败目标。

**完成也只返回 `serving:false`、`FENCED_PENDING_INDEPENDENT_REMOTE_VERIFICATION`。** control 始终 initialized=2；不会复制旧会话、限流窗或自动解围栏。独立完整目标 handle 可调用 `verifyRestoredInventory(db, backup, inventory, {expectedInitialized: 2})` 验证全部持久表、重置策略、FK 和 quick_check，函数不会改变围栏。默认校验仍要求 initialized=1，不改变原离线工具行为。

当前合成 transport 已演练分批、完整哈希/FK、未知提交、重复导入与失败隔离，**没有执行真实 Wrangler/云端导入，也没有实现自动的远程完整读回与启用流程**。取得目标的受支持完整读回渠道、私下完成同样校验并另外批准最终启用前，不得挂正式域名或将 initialized 改为 1。CLI 成功不等于生产迁移验收完成。

公司设备上的私有备份/凭据不会因代码 push 自动出现在家用设备；代码保存不等于真实数据已经备份。后续应在安全位置另行接续，不把这些私有文件上传公开 PR。

## 正式动作的批准边界

完成源通道和合成演练后，仍须先批准维护窗口、原站维护版本/变量、私有备份、精确空生产 Worker+D1、真实公开范围，以及仅 `haoduoyu.xyz` 的根域绑定/DNS/TLS 变更。只接受既有免费计划和余量，不启用 Paid 或新增长期凭据。

正式 SITE_ORIGIN 为 `https://haoduoyu.xyz`；测试站继续用合成库。冻结后最终全量导入，不承诺在线 CDC/增量合并。目标完整哈希、外键、quick_check、重置策略验证通过前不得对外开放。原 Sites v9、旧数据库及最终快照保留。

新目标无写入时可核对后回旧入口；有新写入时先冻结并备份新库，验证反向恢复或差异同步后才能回退，不能只切 DNS。旧 Sites 自定义域绑定和证书若需要解除，必须先说明冲突、重建和缓存影响再批准，不能承诺瞬时恢复。

来源：[Cloudflare D1 导入导出](https://developers.cloudflare.com/d1/best-practices/import-export-data/)、[Workers Custom Domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。以上流程支持性不等于已经取得原 Sites 的源库访问权限。
