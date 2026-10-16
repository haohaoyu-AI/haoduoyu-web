# Worker / D1 最小隔离兼容验证

日期：2026-10-16 UTC。基线：`5f548d91093b563bd2f539a7e647fa66e599379d`；独立分支：`codex/worker-d1-compat-20261016`。本轮只增加 `compat/` 探针、报告和脱敏证据，没有修改 `src/`、`public/`、合同、原分支或生产站点。目标仍是私人多运营账号文章统计、复盘与驾驶舱，保持独立账号密码要求。

## 结论

**运行时与核心 D1 语义具备继续适配的技术证据；正式 Sites 全链路兼容与上线资格尚未证明。**

现有 scrypt 在本地 workerd 中可以运行，并与 Node 双向验证。D1 原子批次能保留幂等、审计、版本竞态、密码轮换和 null/零语义，不能原样移植同步 SQLite 的交互事务。独立账号会话在本地 Worker 中可用，但这不等于正式 Sites 已确认支持该认证方案，亦不证明 Sites 分发层会按预期透传 Cookie/Origin。没有通过发布来试探生产行为。

实际结果：**17/17 Worker/D1 探针通过，29/29 原有 Node 后端测试通过。** 原始 [TAP](compat-evidence/2026-10-16/worker-d1.tap)、[机器结果](compat-evidence/2026-10-16/results.json)、[Node 回归输出](compat-evidence/2026-10-16/node-backend.txt)、[元数据与只读盘点](compat-evidence/2026-10-16/metadata.json) 均在仓库内。第一次运行有测试 SQL 的列数错误；修正探针占位符后重新完整执行，保留的是最终成功运行记录，没有修改业务实现来消除失败。

## 隔离方法和可复现范围

- Node `v24.19.0`，Miniflare `4.20260730.0`，workerd `1.20260730.1`，esbuild `0.28.2`，均有锁文件。兼容日期 `2026-07-30`，显式 `nodejs_compat`。这不是正式 Sites 实际运行配置的确认。
- 使用现有 `db.mjs` 在 Node `:memory:` 建库后提取 15 个真实 DDL 对象，只对标识符加 `matrix_` 前缀，逐条应用到临时 D1。未搬运任何源库数据。D1 为 Miniflare 临时目录，`d1Persist:false`，结束调用 `dispose()`；并非承诺 D1 模拟器完全不写临时文件。
- 随机合成密码、hash、session 仅存在本轮进程及临时夹具；持久证据没有密码、hash、Cookie、真实业务行或服务凭据。Worker 所有外部 fetch 被拒绝，测试域名为 `.invalid`。
- 没有 Sites hosting manifest、项目注册、源码凭据、发布包、生产数据库绑定或发布操作。复现方法见 [compat/README.md](../compat/README.md)。

## 已验证的关键点

| 主题 | 实测结果 | 适配含义 |
| --- | --- | --- |
| 原密码实现 | 直接导入现有 `auth.mjs`；scrypt N=32768/r=8/p=1、64 字节输出、原 maxmem=64MB 参数，Node hash 在 Worker 验证成功；Worker hash 在 Node 验证成功；错密码失败。 | 无证据要求更换散列，不能再将 scrypt 简单列为不支持。 |
| 其他算法 | Web Crypto PBKDF2-SHA256 的 100000 和 600000 次、Node PBKDF2 的 600000 次在此运行时可执行。 | 只是能力探测，不是选择更弱参数、修改密码格式或生产迁移建议。 |
| 独立会话 | 无平台身份时可通过合成账号登录；仅 `oai-authenticated-user-*` 头不能取得业务访问权；匿名业务请求 401。 | public 入口与业务私有性可以在应用层分离，须保留服务端逐操作鉴权。 |
| Cookie / CSRF | 返回 host-only、HttpOnly、Secure、SameSite=Strict Cookie；同 Origin + CSRF 才能写；跨 Origin、缺 CSRF、过期/篡改 Cookie 被拒绝；退出后会话失效；响应 no-store。 | 验证的是 dispatchFetch 下的头和应用行为，不含浏览器存储、正式 Sites 代理或移动端验收。 |
| 事务 | `BEGIN IMMEDIATE` 实际被拒绝；`batch()` 中 CHECK/FK/最后一步审计失败会整批回滚。 | 不能仅将同步 API 改成 await；需重组为原子 SQL 批次。 |
| 幂等 | 同 actor/key 的 20 个并发相同请求只产生 1 篇文章、1 条 receipt、1 条 audit，均返回同 ID；JSON 属性顺序变化重放；变更内容返回 409。 | receipt、业务、audit 必须一起提交；唯一冲突后只能重放已提交且 request_hash 匹配的记录。 |
| 约束失败 | URL 重复时新 receipt 与 audit 不保留；同键修正请求后可成功；最后一步审计故障也不留下文章或 receipt。 | 不可用 INSERT OR IGNORE 跳过约束后继续产生副作用。生产需区分约束冲突与基础设施故障。 |
| 版本并发 | 同版本两个 CAS 更新只有一个成功，失败方 CHECK 中止，版本只增加一次，audit 只有一条。 | SQL 更新零行不是事务失败，必须显式转成整体回滚。 |
| 密码竞态 | 新 hash CAS + 会话撤销 + audit 同批提交；轮换后所有会话失效；旧密码验证证明不能再创建会话；audit 故障保持旧 hash 与会话。 | 登录和密码轮换均要在提交时重新检查验证依据与会话，不得在 scrypt 之后信任过期读值。 |
| null 与零 | 原 `coalesce(article_id,'')` 唯一索引在 D1 有效：账号总量 NULL scope upsert 一行，文章明细单独一行；JSON reads=0 保持 0，缺失 likes 保持缺项/SQL NULL。`bind(null)` 保留 NULL，`bind(undefined)` 拒绝。 | 缺项不能默认 0；绑定前明确处理 optional 字段。账号日总量与文章日明细不能合并相加。 |
| 累计快照 | 追加两个乱序收集的 observation，按 `as_of` 选出较新的累计读数 100，未相加为 130；保留不同的 collected_at；0 与缺项不同。 | D1 能保存原语义；完整驾驶舱计算仍需移植并验收，探针没有宣称已移植整个 records 服务。 |
| 读取一致性 | 同一个 `withSession('first-primary')` 的两次读取可跨越一次提交，看见 0 与 1；session 不是冻结快照。交错发出的 30 次原子双写与 30 次双查询 batch 中，每批读到两项相等，最终本次观察到 30 个不同已提交版本。 | 多查询驾驶舱应以单条 SQL 或同一 read batch 取得相关事实，再做纯计算。bookmark 只能作为顺序一致性的游标，不能当备份或冻结数据库。 |

最后一次记录的本机耗时：scrypt hash 71ms，verify 80ms；WebCrypto PBKDF2 100000 次 12ms、600000 次 78ms。这是单次、本地、非生产的 elapsed time；没有测正式 CPU time、RSS、并发内存或 Sites 托管预算，不能据此保证登录配额。Cloudflare 官方列出 Workers 每 isolate 128MB、不同计划的 CPU 上限；Sites 可能另有预算，不能将普通 Free/Paid 限额直接当此项目配置。[官方限制](https://developers.cloudflare.com/workers/platform/limits/)

## 当前正式 Sites 约束与硬缺口

本轮通过 `skills.read` 阅读当前正式 Sites 的 `SKILL.md`、身份与秘密、存储、排障、Worker ESM README/build/hosting 模板、Vinext hosting/vite 配置及 `sites-vite-plugin.ts`。平台证据与本地实验分开处理。

1. **认证支持及入口链路：待确认，未验证。** 正式身份文档明确 public 可匿名访问、private 必须通过平台认证，也要求保留 hosted authentication 集成。没有找到本应用独立密码栈的明确托管承诺。用户已明确要求独立账号，因此探针保留此要求，不默认改用 ChatGPT 登录，不修改 private/public。保留 `/signin-with-chatgpt`、`/signout-with-chatgpt`、`/callback` 给平台，本探针不实现或拦截这些平台端点。需要受支持的隔离验证途径或平台支持答复，确认自有会话、Set-Cookie、Origin、Authorization 与自定义域名。由于本轮明确禁止发布，实际 Sites 分发验证没有执行；这不是已遭拒绝的操作。
2. **正式运行配置与预算：待确认，未验证。** Vinext 正式模板的本地配置使用 `nodejs_compat`，但本轮未取得该项目实际 Worker 兼容日期、flags、CPU 配额或内存观测。不能把本地 Miniflare 成功说成目标 Sites 构建/托管成功；也不能为适配配额降低散列强度。
3. **持久绑定隔离：待确认。** 当前 manifest 合同是单个逻辑 `d1` 名称，模板据此产生一个本地 binding。改名不证明新建独立物理数据库，多 D1 绑定未获文档证实。若复用旧 `DB`，只允许审阅过的 `matrix_*` 追加迁移，并证明旧处理器不写这些表；不能直接运行原 `openDatabase()` 触碰旧表。测试只证明命名空间 DDL 可在临时 D1 应用。
4. **旧站可恢复材料：仍不完整。** 详细状态见下一节。源码、D1、对象附件、环境与执行器没有完整独立恢复证据，仍是切换前置缺项。

官方 [Node crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) 列出全面支持及例外，不能凭印象宣称 scrypt 不支持；[Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/) 列出 PBKDF2 能力。[D1 API](https://developers.cloudflare.com/d1/worker-api/d1-database/) 明确 batch 事务回滚与 session 顺序一致性；本地 D1 试验方式来自 [Miniflare D1](https://developers.cloudflare.com/workers/testing/miniflare/storage/d1/)。本地试验没有验证真实 D1 副本调度、网络故障后未知提交、远程 bookmark、Time Travel 或导出恢复。

## 旧站只读复核与保存边界

正式调用只涉及 `get_site`、`list_custom_domains`、`list_site_versions(limit=3)` 和 v160/v159 的 `get_deployment_status`，未读真实业务行或运行旧业务 MCP。

- 项目 `appgprj_6ac1907e61a48191a067ce3c30b21265` active，owner，public/revision 2；`haoduoyu.xyz` 域名和 SSL 均 active，live URL 为该域名。
- v160（源 `ab35236c37d015cd0ec40e5dae3545eb30307da4`）仍 failed，`incomplete input: SQLITE_ERROR`。未重试；失败发布可能已应用部分迁移，不假设数据库未变化。
- v159（源 `e3f7bb1b49b0d7a9dcfd7a85d43bb7dc8a0e50e1`）有 succeeded 记录及构建归档元数据。`get_site` 仍未给出生效版本指针，不能宣布 v159 就是当前 live。
- 本地 Git 含旧 Python 基线 `4c61f3c265a3998c7971241a4b4e64df65afebd3`。树中有 MIGRATION.md，未有 Sites hosting 配置；`git cat-file` 无法找到 v159 源提交对象。说明现有 Git 材料未覆盖已知 Sites 精确源码，不等于已在所有远端证明源码丢失。没有为核查创建 Sites 源码凭据。
- GitHub `gh pr view` 的 GraphQL 读取返回 Forbidden（HTTP 403）；Git fetch/ls-remote 正常，已据此确认分支基线。该非必要元数据读取未重试，不影响隔离代码验证。
- 只读工具目前没有给出完整 D1 export/restore、R2 对象备份或历史源码无凭据下载的证据。本轮没有把版本构建包当数据库备份，没有读取环境秘密，没有创建任何恢复副本。

**旧站 Git 源码保留与独立数据恢复方案仍待补齐，未完成备份。** 后续需要精确 Sites 源码 checkout/build、schema+data 支持性导出及隔离恢复、附件清单/校验、恢复配置和外部写入执行器盘点，再固定实际 live 版本。具体切换顺序继续遵守 [原兼容性方案](HOSTING-COMPATIBILITY-2026-10-16.md)。

## 最小后续实施范围

先解决认证链路、运行预算、绑定及旧站恢复途径；在这些缺口解决前，不开展全量重写或宣布可上线。通过后，最小实现为：

1. 以正式 Sites Worker 入口与资源构建接入现有 UI，保持平台保留路由；用真实但隔离的 HTTPS 链路验收独立登录，仍无需普通访问者登录 ChatGPT。没有支持性结论时继续保留 Node/Docker 方案。
2. 新建异步 D1 repository，保留全部字段和指标规则；写入统一为带当前权限/账号校验、约束、幂等、版本 CAS、audit 的原子 batch。设计正式 CAS 断言和精确错误分类，处理响应丢失后的同键重试与未知提交；探针 CHECK 表和字符串匹配不是最终生产设计。
3. 多查询 dashboard 在一个 read batch/SQL 中取得一致事实，再复用纯计算；将累计快照、每日发生量、北京时间三日窗口、缺失/零、账号总量优先和覆盖率等现有回归带到 D1。恢复 scoped Bearer key、权限边界、登录限流及可信客户端 IP；这些尚未在探针移植。
4. 产出经审阅的 schema-only migrations、一次性安全管理员引导和密码轮换方式、D1 支持性导出/隔离恢复验收。真实管理员凭据由用户后续通过安全通道设置，本轮无真实账号。
5. 完成 Worker/D1 全功能、真实浏览器桌面/手机及目标 HTTPS 验收；固定旧站恢复证据与准确发布/回退方案后，再进入独立的生产切换任务。

本轮未发布、未修改生产权限/DNS、未购买服务、未创建真实持久凭据、未读生产行。原分支在开工和收尾只读检查时均为 `5f548d9`；所有新文件位于独立工作树与分支，无覆盖并行开发。
