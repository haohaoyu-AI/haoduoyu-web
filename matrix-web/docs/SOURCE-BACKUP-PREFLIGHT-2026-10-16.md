# 旧 Sites 源码 Git 保留与切换前核验

2026-10-16 UTC。本轮从已完成的 `553639f2064c7c2f768fdf9748d451a4c373ab78` 接续，独立分支 `codex/sites-source-preservation-20261016`。没有重做 UI/业务适配，没有向原 Sites 源码仓库推送，也没有生产发布、DNS/权限修改、真实管理员初始化或数据删除。

## 已完成：旧源码在私有 GitHub 保存并读回

已按用户明确授权，为 `appgprj_6ac1907e61a48191a067ce3c30b21265` 申请一次短期源仓库凭据。返回 `publish_on_push_accepted=false`，没有自动发布窗口。凭据仅经关闭终端回显的 stdin 进入读取进程，再作为 Git 子进程内存中的 HTTP header 使用；未放进命令参数、文件、报告、Git 或输出，抓取结束即清除会话存储。没有申请任何新持久凭据。

当前镜像未安装正式 `site-workflow.mjs`，其脚本也不能通过技能资源接口读取。这项环境缺失没有被说成已恢复：本轮采用凭据返回的 HTTPS Git 地址执行只读 fetch，在该本地源仓库同时设置不可推送的 push URL 与拒绝 push 的 hook；未调用会提交/推送的 source packaging 路径。两项精确源对象均已实际取得：

| Sites 版本与已知状态 | 原始源提交 | GitHub 代码快照提交 | 保留/排除文件 |
| --- | --- | --- | --- |
| v159，已知 succeeded 记录，当前 live 未确认 | `e3f7bb1b49b0d7a9dcfd7a85d43bb7dc8a0e50e1` | [`97379f5fac97484ae57053515b50a2cb79792cb2`](https://github.com/haohaoyu-AI/haoduoyu-web/commit/97379f5fac97484ae57053515b50a2cb79792cb2) | 860 个源文件原样保留，排除 219 个 evidence 文件 |
| v160，failed；也是本次读取的源仓库 main HEAD | `ab35236c37d015cd0ec40e5dae3545eb30307da4` | [`5d57d863e261488f4edf260d13f08dcba6263ac0`](https://github.com/haohaoyu-AI/haoduoyu-web/commit/5d57d863e261488f4edf260d13f08dcba6263ac0) | 903 个源文件原样保留，排除 237 个 evidence 文件 |

正式 GitHub `get_repo` 已确认 `haohaoyu-AI/haoduoyu-web` 的 visibility 是 **private**。两个分支为 `archive/sites-v159-20261016` 和 `archive/sites-v160-20261016`；没有覆盖 main、原 Python 历史或新站开发分支。

备份采用**无原始父历史的代码快照**，避免把尚未审阅的历次 Git 对象一并上传。每份 `SOURCE-BACKUP-MANIFEST.json` 记录原 SHA、原 tree、逐文件 SHA-256 和排除清单。GitHub 新快照 SHA 与 Sites 原提交 SHA 不相同，不能混称为原提交完整镜像。源文件内容未做静默修改；排除的是运行日志/截图所在的 `evidence/`，不影响构建所需的 app、lib、db、drizzle、public、配置、锁文件及测试源。

执行了已知 Provider Token、完整私钥材料、JWT、npm 认证项、凭据字面值及归档内部文本扫描，并复核命中上下文。未发现真实 Provider Token 或完整私钥；命中为授权枚举/SQL 逻辑和合成安全测试夹具。`.npmrc` 只有 audit/fund/update-notifier 设置，没有认证值；未发现被跟踪的环境文件或数据库导出。静态扫描不是对任意隐藏秘密的数学证明，本轮也没有宣称审计了全部旧提交历史。

随后在独立 bare 仓库从 GitHub 重新 fetch 两个备份分支，核对远端提交，并逐个读取全部 **860 / 903** 个文件重算 SHA-256，与原源文件清单全部相符。[读回证据](source-preflight-evidence/2026-10-16/archive-readback.json) 已保存。

此外，v159 备份使用其锁文件重新安装 752 个依赖，并实际执行原 `npm run build`，Vinext 构建成功；tracked 源文件仍干净。[完整构建输出](source-preflight-evidence/2026-10-16/legacy-v159-build.txt)。这是源码可重建证据，不是复原了生产数据库/附件，也没有声称重建字节与 v159 原发布包完全相同。

## 已完成：保留原链，再追加矩阵迁移

旧源揭示实际配置为 `DB` + **`BUCKET`**，旧应用还声明 `mcp`。新候选 manifest 保留同一 project_id、DB 和 BUCKET；不会把旧附件绑定设为 null。新应用不提供旧写作 MCP 处理器，相关停用效果必须在正式切换批准中说明，不在本轮修改线上连接或安全设置。

- v159 journal：50 项，最后为 `0049_article_purge_codex_observations`，snapshot 78 张表。
- v160 源 journal：54 项，最后为 `0053_far_sleepwalker`，snapshot 89 张表。
- 组合候选：旧 **54 项** SQL 与 snapshot 全部逐字节保留，journal 的原 54 项内容与顺序保持一致。复制旧 schema 定义供后续生成使用，Drizzle 实际生成第 **55 项 `0054_shocking_frog_thor`**，只增加 11 张 `matrix_*` 表及相应约束/索引。没有改写旧 SQL、snapshot 或原条目的 timestamp/tag。

旧文件哈希和 journal 前缀已写入 `sites/db/legacy-history.json`，构建会强制校验。原来的矩阵 `0000` 只是未部署的隔离原型，现已由组合历史中的 0054 替代；这不是删除生产已应用历史。

同时继承旧源的 `nodejs_compat`、`global_fetch_strictly_public`、`enable_request_signal` 三个 flags。本地新站兼容日期仍为已验证的 `2026-07-30`；重建旧 v159 的 metadata 日期为 `2026-05-15`。本地重建中的 CPU limits 未声明，不等于生产没有限额；实际 Sites 配置仍需平台核实。

## 实际验证：均为临时 D1/R2 与合成数据

新的 [历史链脚本](../sites/scripts/preflight-history.mjs) 使用真实 Miniflare/workerd D1 和 Drizzle migrator：

1. 精确重放 v159 的 50 项旧历史。
2. 插入一条合成旧文章和一个合成旧 R2 对象。
3. 从第 51 项继续重放至组合链第 55 项，再重跑完整 migrate；均成功。
4. 合成旧行逐字段不变、R2 字节不变，新矩阵表恰为 11 张；在该联合库上运行实际打包 Worker 的初始化、独立密码登录和账号读取，全部通过。
5. 额外验证一种解析失败机制：将 0053 的触发器误在第一个 `END;` 截断，会实际报 `incomplete input`；完整触发器可执行。**正式 Sites 是否使用这种切分方式未确认，因此不是生产 v160 根因结论。**

联合验证曾捕获一次本地 schema 整理错误：重命名 Drizzle 导出时误改了限流列名；已修正，重新生成未部署的 0054，再完整重跑通过。没有为了消除该失败而修改旧链。

[机器结果](source-preflight-evidence/2026-10-16/history-preflight.json)、[原始输出](source-preflight-evidence/2026-10-16/history-preflight.txt) 保留完整断言结果。使用继承 flags 的 **27/27 矩阵回归**也再次通过，[输出在此](source-preflight-evidence/2026-10-16/worker-d1.txt)。

新 Worker 执行文件与 `553639f` 的文件逐字节一致，SHA-256 为 `6e3d9e5c2f8c919568dfa5467bf51ead64a59f6ec6587aa3e64b929e65759364`。UI 与业务实现没有改动，因此未重复已完成的两套浏览器流程；原浏览器证据仍只是隔离环境证据。正式 Cookie/Origin/Authorization 透传、scrypt 托管预算和 Sites 接收/部署依然未通过验证。

## 尚未完成：真实数据/附件备份与线上迁移核对

源码 Git 保留已完成；**生产 D1/R2 完整备份与恢复仍未完成，当前不能切换。**

正式工具仍只暴露数据库表名概览和有界行读取，没有完整 schema+data 导出、迁移账本/执行器检查、R2 对象列举/下载、恢复或 actual active deployment/source pointer 动作。旧源码也未发现全库/全桶导出恢复接口。没有把分页读行业务接口、v159 构建归档、源码 Git 或新矩阵 JSON backup 当作旧站完整备份。

本轮只读表名概览已看见 `article_history`、`article_metrics_observations`、`article_workspace_archives`、`article_workspace_requests`、`dedao_cloud_actions`、`dedao_cloud_requests` 这 6 张 v160 新增表。它们可能来自部分迁移或其他既有创建路径，**不能据此推断正式 migration ledger，但足以说明不能按“v160 failed，所以仍是纯 v159 schema”处理**。表概览只返回 50 个名称，不能代替 89 表源模型的完整 DDL 或账本核验。

平台 `get_site` 仍只给 live URL 与 latest saved number；版本历史和源 main 都不能证明当前 live ID。当前只确认：v159 有成功记录；v160 报 `incomplete input: SQLITE_ERROR`；实际 live 指针、0050–0053 是否完整/部分应用、所用 SQL runner/切分规则仍未知。本轮没有重试失败部署或修补历史文件来试探生产。

Cloudflare 原生能力确实提供 D1 SQL 导出，但它需要对应数据库访问权，且运行中的导出会阻塞其他数据库请求；不能把当前临时 Git 凭据当数据库授权。[D1 导入/导出文档](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

R2 原生可通过 dashboard、Workers 绑定、S3 API 或 CLI 下载；S3 方式需要相应账户及 R2 API 凭据。当前 Sites 工具未给出整桶清单/下载路径，本轮没有创建 R2/S3 长期凭据，也没有假定用户能直接操作 Sites 托管方的 Cloudflare 账户。[R2 下载文档](https://developers.cloudflare.com/r2/objects/download-objects/)

Time Travel 是原位覆盖数据库的恢复，不是独立备份；在新旧表共享 DB 时，不能把它当只回滚旧表的按钮。本轮未调用。[D1 Time Travel 文档](https://developers.cloudflare.com/d1/reference/time-travel/)

## 可执行的切换顺序与批准点

**先补平台只读证据，不需要重复申请本轮已经完成的源读取许可：**

1. 由 Sites 支持的设置/接口或托管方确认实际 live deployment/version、数据库迁移账本及 hash、0050–0053 的对象/触发器状态、SQL runner 规则和物理 DB/BUCKET 映射。只在已确认某项未应用时，才按正式合同讨论修复；不得改已应用历史。
2. 获取受支持的完整 D1 与 BUCKET 导出通道及隔离恢复目标。若需要任何新持久凭据、权限或资源配置，逐项说明范围再批准；不借本次 Git 只读授权扩权。没有该通道就维持当前站点，不声称已具备完整回滚。
3. 批准具体备份维护窗口后，盘点并暂停旧 MCP/回调/外部执行器的写入，等待已发动作明确结束；保留未知状态，不自动取消或重跑。取得同一冻结窗口的 schema+data、迁移账本、对象/元数据/逐对象 SHA-256 清单与恢复所需设置；秘密和业务备份不进 Git。
4. 在隔离目标恢复并核对完整性、数量、引用、关键流程和对象字节，记录备份 hash/时间。保留原数据库、对象和源代码，不删除任何业务数据。

**通过以上门槛后，才进入后续生产批准：**

5. 确认 public 入口下自有密码会话的支持约定、三类头的透传、实际兼容 flags/日期和 CPU/内存预算。若有正式隔离 HTTPS 预览，先用合成数据验证；若没有，真实域名只能在已经批准且可回退的切换窗口验证，普通 Sites 发布 URL 不能伪称临时预览。
6. 单独批准真实 `SITE_ORIGIN`、一次性管理员初始化秘密及设置后清除的完整流程；用户通过安全通道设置真实账号密码。本轮没有设置这些值。
7. 单独批准向原 Sites 源仓库推送经核验的新版本、保存/发布和旧 MCP 下线效果。本次临时凭据只授权读取备份，不涵盖这些动作。正式 source helper 也须可用；当前环境没有该 helper，不能声称已经完成其归档/提交绑定。
8. 保留 DB/BUCKET 和全部旧表对象，应用确认过的待应用迁移，发布新 Worker。优先保持既有域名绑定，不在没有需要时改 DNS。用真实域名验收匿名拒绝、独立登录、会话、Origin/CSRF、Bearer、录入、复盘、重试和退出。
9. 失败时先停止新写入并保存矩阵增量，再恢复已固定的旧 Worker/manifest。代码回退不自动回退数据库；旧表和对象若未动，优先保留原状。任何必须的数据恢复都按独立备份方案另行批准，不做全库原位覆盖来抹掉新数据。

当前无被自动审批拒绝的操作。剩余阻碍是平台能力/证据缺失，以及上述尚未获得的生产操作批准；不是让用户重复批准已经完成的临时 Git 读取。
