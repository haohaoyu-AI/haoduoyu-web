# 好多鱼图文 Sites 完整最小适配交付

2026-10-16 UTC。独立分支 `codex/sites-matrix-adapter-20261016`，从隔离探针提交 `b19fde98e7dabfa52549b0d82a314c4830f9bf28` 接续；原开发分支 `codex/haoduoyu-matrix-v1` 保持不动。原 Node、SQLite、Docker、UI 与合同均保留。

## 已执行的实现

新增 [sites/](../sites/README.md) 完整 Worker/D1 适配，包含原合同的全部 HTTP 业务路由：账号管理、文章录入/更新/检索/详情、累计复盘快照、按日新增、驾驶舱、受限 API Key、审计、CSV 导出、独立登录/退出/密码轮换；静态 UI、OpenAPI 和 API 帮助内容直接复用原版本。

原 scrypt 和常量时间 CSRF 比较被打包复用。会话只存 token hash；业务不接受仅有平台身份头的请求。严格 Origin、host-only HttpOnly/SameSite Cookie、HTTPS Secure、权限范围、Key 撤销、持久登录限流和 no-store 响应均落实。平台登录/回调端点保留给 Sites，没有实现 OAuth 替身或绕过平台访问边界。

Drizzle 实际生成 11 张 `matrix_*` 表、所有索引/约束、SQL、journal 和 snapshot。所有运行时 SQL 只指向新表，现有旧 `articles` 不被读写。测试放入合成的旧表哨兵后，验证其行保持不变。账号总量 NULL scope 与文章 scope 使用两个 partial unique indexes，不会重复产生 NULL 总量行。

写入采用同一 D1 batch 的 revision/CAS、提交时授权、业务变化、audit、幂等 receipt；保留文章 version CAS。组合读取在前后相同 revision 下完成，跨变更结果会丢弃重算。网络/未知提交错误不自动重执行写入，客户端必须用同一幂等键恢复。私有小规模应用在持续写入争用下可能暂时返回 503，这比返回混合版本统计或覆盖其他更新更符合合同。外部执行器必须通过该 API，不能直接改 `matrix_*` 表而跳过 revision。

一次性管理员引导默认关闭，未创建真实凭据。操作者以后显式配置初始化密钥才能使用；创建首个管理员与三个运营账号配置是原子操作，不写入虚构文章或指标。新增管理员备份下载及显式空库恢复模块：校验完整性、保留业务/凭据散列/审计/幂等、拒绝覆盖现有库、恢复时保持服务隔离，不恢复旧会话。没有开放 HTTP 恢复入口。

## 实际验证结果

最终运行：**27/27 Worker/D1 测试通过，2/2 Chromium 完整浏览器流程通过**。原始 [测试输出](sites-evidence/2026-10-16/worker-d1.txt)、[浏览器输出](sites-evidence/2026-10-16/browser.txt)、[截图](sites-evidence/2026-10-16/browser/) 和 [只读/构建元数据](sites-evidence/2026-10-16/metadata.json) 随代码保留。

| 验证面 | 真实证据 |
| --- | --- |
| 原合同回归 | 12 项原接口测试在打包后的 Worker + D1 上执行，而非调用旧 Node HTTP 服务；全部通过。 |
| 并发与故障 | 20 个并发同键请求只提交 1 条文章/receipt/audit，返回完全相同响应；跨账号同 URL 并发只允许一个成功；版本并发一个成功一个 409；最后一步审计失败回滚文章、receipt、revision 和密码轮换。 |
| 授权与限流 | 过期会话、畸形 CSRF、仅平台头、只读 Key、跨账号读写、已撤销 Key 都被拒绝；提交前再次检查授权；更换伪造代理头不能重置 10 次用户名失败限流。100 账号 Key 加筛选仍通过，不依赖过量绑定参数或逐账号查询。 |
| 统计语义 | 原三日北京时间窗口、累计不求和、NULL/零/缺项、账号总量优先、生产方式与录入者分离、停用账号历史复盘均回归。 |
| 持久化与恢复 | 完整销毁并重启 Worker 后，持久临时 D1 的账号登录和文章仍可读；管理员导出恢复到第二个空临时 D1，保留 NULL/零与 Key 撤销，旧 session 不恢复；覆盖和篡改被拒绝。 |
| 浏览器 | 系统 Chromium `154.0.8037.57`；1440px 桌面、390px 手机及 320px 无页面溢出；登录、账号切换、录入、XSS 字面显示、双页面版本冲突、复盘、日数据 0、趋势、刷新和退出全部通过；无未捕获 JS 错误或外部请求。 |

所有数据为隔离合成数据。Miniflare `4.20260730.0` / workerd `1.20260730.1`，兼容日期 `2026-07-30` + `nodejs_compat`，Node `v24.19.0`。本地预览属于 portable 配置（`SITES_MANAGED_LINUX_CONTAINER` 未设置），已读取正式 local preview 指南；没有绕过 managed preview 限制。浏览器夹具起初因 Node eval 的 `--input-type` 传播到内部线程而卡住，已改用文件启动并重跑成功；不是将失败忽略为通过。

没有重新声称原 Docker 生命周期、真实 Sites 分发、真实 D1 副本或正式资源配额通过。原 Node 29 项测试的既有通过证据仍在前一报告中，原实现未改。

## 构建交付与实际发布边界

`npm run build` 已实际成功并验证 ESM `default.fetch`、嵌入资源、正确项目 ID、`DB` 逻辑绑定和仅新增命名空间 schema 的迁移。构建目录为 `matrix-web/sites/dist/`，打包脚本输出 `matrix-web/sites/artifacts/haoduoyu-matrix-sites-20261016.tar`，另附产物 SHA-256 和来源提交的 manifest。产物不含 node_modules、测试库、凭据或旧业务数据。

这是一份可交给发布流程的完整 Worker 构建，不是已获正式 Sites 接收/保存/部署的版本。正式源码 helper 的同步和原生归档绑定尚未执行，因其需要新源码凭据。当前 isolated `0000` journal 只在空临时库验证：生产已有迁移历史不可覆盖。取得旧源后，需要保留其完整 manifest、迁移、journal、snapshot 和绑定，再把新表 SQL 追加到原历史；失败的 v160 可能已应用部分旧迁移，必须核对状态后处理。现在不能直接上传此新 journal 试探生产。

## 正式只读复核：能确认与不能确认

本轮重新读取当前正式 Sites skill、身份、存储、Worker ESM 构建/验证模板、Vinext 配置/README 及 preview 文档。仅调用正式只读 `get_site`、`list_site_versions(limit=2)`、`get_site_version(v159)`、两次 `get_deployment_status` 和数据库表名概览；没有读真实业务行、日志内容或环境变量秘密。

- 项目 `appgprj_6ac1907e61a48191a067ce3c30b21265` active、owner、public/revision 2；live URL 仍为 `https://haoduoyu.xyz`，不改变其访问模式。
- v160 源 `ab35236c37d015cd0ec40e5dae3545eb30307da4`，部署 `appgdep_6acee28b68988191ae9b152791d1a90e` 仍 failed：`incomplete input: SQLITE_ERROR`。
- v159 源 `e3f7bb1b49b0d7a9dcfd7a85d43bb7dc8a0e50e1`，部署 `appgdep_6accc1ba16c881918c0f7a0294fa3632` 有 succeeded 记录，归档 hash `sha256:6bea57a0f33db14d9489cace7730a05e1609e53cd49c647991db38439418c684`。
- `get_site` 没有 current live version/deployment ID。`get_site_version` 只有源 SHA、构建包元数据和历史 deployment ID，没有源仓库定位。成功历史不等于当前线上指针，尚不能确认 v159 是 live。
- DB 概览确认逻辑绑定 `DB`，返回的 50 个表名中没有 `matrix_*`；未取得完整 DDL 或迁移状态，这不替代部署前的完整碰撞/历史审计。

缺少的精确平台能力/证据为：①当前实际生效版本/部署的只读定位；②不新增写凭据的源码 remote/读取凭据接口；③public 自有密码会话的正式支持约定及 Set-Cookie/Origin/Authorization 在自定义域名分发中的保证；④实际 Worker 兼容日期、Node flag、CPU/内存预算及是否采纳构建 wrangler 元数据；⑤完整旧 D1/R2 导出、隔离恢复及迁移状态通道。

身份文档确实说明 public 可匿名，但同时约定由 Sites 管理 hosted authentication，没有明确承诺本应用现有独立密码栈。不能把这解释为禁止独立账号，也不能把本地成功当正式托管支持。代码已完成独立适配，支持确认和正式 HTTPS 验收仍待执行；不替用户改为 ChatGPT 登录。

## 把旧站源码保存在 Git：已准备的具体后续动作

本仓库保留旧 Python 提交 `4c61f3c265a3998c7971241a4b4e64df65afebd3` 和新 Node 版本，但本地 Git 对象库没有 v159 的精确 Sites 源提交，不能声称旧 Sites 源已在 Git 备份。

正式工具只提供 `sites_create_source_repository_write_credential` 来取得 remote、branch 和短期 token；它会新增有写能力的凭据，因此遵守本轮限制，**未调用，等待明确确认**。精确待确认动作是针对现有 project_id 生成一次短期源码凭据，`publish_on_push` 不启用；只用于按正式 source helper 读取源码，不推送生产源、不触发自动发布、不改变访问控制。

取得授权后可执行：

1. 凭据只在会话内存，通过 stdin 传给正式 source helper，打开空独立目录。记录实际 remote/branch，解析 v159 和 v160 提交以及后续确认的真正 live 源提交。
2. 检查精确旧树的源码、锁文件、manifest、schema/migrations/journal，检查是否误跟踪秘密或运行数据；保存可构建代码与提交定位。若存在不应进入目标 Git 的内容，先形成脱敏保留方案，不能静默把业务数据推送。
3. 将符合要求的旧源码保存到用户 Git 中独立的 `archive/sites-<confirmed-version>-20261016` 分支/标签，保留原 GitHub Python 历史和现有新站分支。若必须清理秘密，记录原 SHA 与新保留树 SHA 的区别，不能谎称两个提交完全一致。
4. 在该旧源历史上追加本适配的新表迁移与构建集成，验证旧源码可重建和新产物符合正式 source helper 的版本/归档绑定，再进入以后单独的发布任务。

这是准备好的行动方案，不是已完成的旧站备份。旧 D1 数据、附件、环境、调度/外部写入器及实际 live 指针仍需分别保存和隔离恢复，源码 Git 分支和版本构建包均不能替代这些。

## 真实剩余上线条件

1. 用户确认新增短期源码凭据的上述精确范围；取得旧精确源与完整迁移/manifest，完成 Git 保留及迁移链追加。当前动作待确认，没有工具拒绝或未知执行结果。
2. Sites 明确独立密码会话支持及所需运行配置；确认 Cookie、Origin、Bearer 和最终域名链路，不绕过平台入口。scrypt 实际资源预算、共享限流是否需可信客户端 IP，都以此证据配置。
3. 完成旧站真实数据、对象、配置与外部写入器的受支持导出/隔离恢复；固定实际 live 和可回退版本。没有新站搬入旧写作数据的授权或需求。
4. 未来经安全通道配置真实 SITE_ORIGIN 和一次性初始化秘密，由用户设置真实管理员密码，再关闭初始化秘密；本轮没有配置这些值。
5. 正式 source helper 完成源提交/归档绑定及平台构建接收，再按用户后续指令执行生产替换与 HTTPS 验收。本轮明确不部署，未改 DNS、权限或真实凭据，未买服务。
