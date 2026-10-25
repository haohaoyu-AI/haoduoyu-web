# Phase2A 三表引用图候选：仅合成隔离验证

后续状态：Phase2B 已获准将同一候选接入活动模型与 API；见 [Phase2B 范围和执行门禁](article-pipeline-phase2b.md)。本报告保留 Phase2A 当时的证据，下面的“未接入”描述仅指该历史阶段；真实远端事务通道与空间仍未验证，不能据此部署。

基线为 `ad0516f59b5b841d831845c2a716641bfd1a520a`，继承既有诊断提交 `4cb7081`。PR37/38不改；没有访问线上数据、配置凭据、执行线上DDL、部署或启用Cron。

候选文件为 [0005_article_pipeline.sql](../migration-candidates/0005_article_pipeline.sql)，SHA-256：

`b45a31900d6b7153a423b8c7fa870b0a98da3e5b074b6d6f62ac044f7782a2ba`

**候选没有加入Drizzle journal、schema.ts、构建或运行时。** 它放在独立目录，避免platform递归复制drizzle时带入待审核SQL。Cloudflare构建仍只包含原五份迁移。本阶段验证的是替代迁移，不是草稿API已上线；备份v6仍是此前保存的未接入草案。

## 实际执行方式

先用最小真实Miniflare D1试验确认完整引用图替换可行，再生成上述完整候选并进行门禁测试。使用固定依赖的Miniflare/workerd、临时D1、合成数据；外部请求统一拒绝，未用普通sqlite模拟代替D1。

执行范围只有文章、观察指标、每日指标三张业务表，以及事务内创建后删除的断言表。其余13张matrix表不变。步骤为：

1. 前检比对三表及原6索引的固定源DDL、16表库存和入向外键。未知用户表、额外索引、view或trigger均失败关闭。D1管理的`_cf_`内部表不属于应用引用图，不尝试读取其受限外键元数据；唯一非业务表是结构已核对的本地fixture迁移账本。
2. 创建临时断言表，在同一batch内再次核对完整应用catalog快照，拒绝前检与执行之间的schema变化。
3. 新父表复制原13列和ROWID，旧文章明确写published；17个新字段按批准契约新增，其余默认NULL。
4. 新观察表/日指标表从建表起引用临时新父表；复制原9/7列、ROWID及全部原始JSON。账号级`article_id IS NULL`日指标同样复制。
5. 对三组原列及ROWID执行行数和双向EXCEPT断言，失败触发CHECK约束，阻止整批提交。
6. 按旧子表→旧父表顺序替换，先将新父表改回原名，使新子表的FK目标正常更新，再恢复新子表名称。
7. 恢复全部6个原显式索引及2个新部分唯一索引，删除临时断言表；本地迁移账本写入也在该batch内。

没有使用foreign_keys开关、defer、REPLACE或IGNORE。原NO ACTION、CHECK、PK、列默认值和旧索引WHERE语义保留。仅文章URL/发布时间改为可空；新增status允许SQL NULL，默认published，不把显式NULL改写为published。当前API尚未接入新状态或新字段。

候选SQL不可直接拿去对真实库执行。[测试专用runner](../tests/article-graph-migration.mjs) 负责前检、事务内catalog guard和同批次本地`__fixture_migrations`账本；这证明该本地通道的原子性，不等于已经验证Wrangler或远端迁移通道。

## 验证覆盖

```sh
node --test --test-concurrency=1 tests/article-reference-graph-rebuild.test.mjs tests/article-graph-statistics.test.mjs
npm test
```

- 有指标老库与空库成功；16表旧数据及schema保全。三表允许的结构变化按PK/FK、列、CHECK与索引语义核对，不把rename引号变化当业务变更。
- 21个DDL/复制/断言/索引阶段注入失败，均检查原状态及账本恢复、无临时对象残留；复制内容不符和最终账本写入失败也必须整批回滚。
- 未知依赖、view、trigger、额外索引及catalog竞争失败关闭，已有对象不被删除。
- 多篇NULL URL/发布时间记录可共存，status显式NULL保留；enum、整数与JSON顶层容器CHECK生效，合法未知JSON子字段原文保留。
- `gzh/109`与`gzh_109`不被扁平化；两个新唯一索引拒绝各自重复业务键。该存储验证不代表合并upsert或完整输入规范化API已实现。
- 固定实际Workerd时钟，前后两份相同旧bundle使用独立总览缓存，共享同一个隔离D1。45个旧API响应逐项一致，只投影文章对象17个批准新增字段；统计数字、真实零、缺失、顺序、coverage、period和到期结果不做容差/投影。
- `foreign_key_check`为空，`quick_check=ok`。不再运行被拒绝的版本查询。

这些测试只证明旧已发布数据在该候选下保持一致；**没有证明新增草稿/NULL数据的旧API已兼容**。不能以此部署当前旧运行时加候选schema。

## 空间、时长和配额边界

合成老库样例：迁移前212,992 bytes，D1逐语句meta观察到峰值249,856 bytes；batch执行27条语句，连同前检共准备46条语句，batch报告读取938行、写入113行。验收元数据读取另外计量。此样例不构成真实库容量或CPU证明。

截至2026-10-25的[官方D1限制](https://developers.cloudflare.com/d1/platform/limits/)为Free每库500MB、单SQL100KB、查询时长30秒。当前官方文档明确batch在每invocation查询配额中计一次，不能把46条prepared语句直接当46次配额请求；单语句限制和实际扫描/写入成本仍适用。

候选SQL文件9,910 bytes；最长单语句远低于100KB。真实执行前仍须核对三表副本、新索引、临时断言及数据库事务开销的峰值空间，保留可恢复备份并验证实际执行通道。不得靠拆分本原子迁移来适应超限，也不自动升级付费。

下一步需父级审阅：是否将候选正式接入schema/Drizzle/build精确白名单及v6备份兼容，再进入API空值和生命周期适配。此前WIP `a5b1935`不能直接当成完整实现上线。
