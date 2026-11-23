# haoduoyu.xyz 托管兼容性与可回退方案

核查日期：2026-10-16 UTC。新站起点：`15d1ba2401daaa0281e5afd13c8bd869776db50c`。本轮只读核查正式 Sites 元数据、支持文档与本仓库代码；没有发布、合并、修改 DNS/访问控制、停止旧站、读取业务行、导出生产数据库或创建授权。

## 结论

`haoduoyu.xyz` 已有 Sites 托管和有效 SSL，可以继续作为新站正式域名。当前 `matrix-web` 是 Node.js 24 + 本机 SQLite + Docker 持久卷应用，**不能把现有 Docker 镜像或源码原样上传 Sites 就上线**。Sites 运行 Worker，持久数据通过 D1/R2 绑定，构建入口、数据库事务和运维方式均需适配。

优先保留现有项目、域名和托管，先验证纯 Sites 适配能否在受支持的认证方式下保留“独立账号密码、无需普通访问者登录 ChatGPT”的要求。文档没有提供这套现成密码会话栈的直接部署承诺，本轮也没有运行适配原型。不能静默改为 ChatGPT 登录，不能承诺无需适配。若该要求无法在 Sites 支持范围内满足，再使用能运行现有 Node/Docker 应用的主机；已有 Sites 托管不等于已经具备这类主机，现阶段不需要购买。

另一个上线前置缺项是旧站独立保存：已有 Sites 历史版本和构建归档，但尚无经过验证的旧站完整源码、数据库与附件独立备份，不能声称已具备完整独立回滚。

## 已核实的旧站状态

证据为正式工具 `sites_get_site`、`sites_list_custom_domains`、`sites_list_site_versions(limit=5)`、三次对应版本的 `sites_get_deployment_status`、`sites_read_database_overview`。脱敏记录见 [SITES-INVENTORY-2026-10-16.json](./SITES-INVENTORY-2026-10-16.json)，不含服务凭据、环境变量值、临时截图链接或业务行。

| 项目 | 实际结果 |
| --- | --- |
| Sites 项目 | `appgprj_6ac1907e61a48191a067ce3c30b21265`，active；当前用户 owner。 |
| 项目描述 | 正式元数据仍为“仅本人使用的合成事件连接测试，不含真实文章”；不能将其业务连接工具当作生产运维或备份接口。 |
| 自定义域名 | `haoduoyu.xyz`、域名状态和 SSL 均 active；当前 live URL 为 `https://haoduoyu.xyz`。 |
| 平台 DNS 配置 | CNAME target `custom-domains.chatgpt.site.`；另返回 apex IPv4 targets。它们是平台配置，不是已核对的 DNS 服务商完整记录，TTL、代理模式及实际 A/AAAA/CNAME 记录未读取。 |
| 访问模式 | public，访问策略 revision 2；存在平台认证 client。public 页面可有匿名访客，不等于业务接口可匿名写入。 |
| 数据库 | D1 绑定 `DB`，返回 50 个用户表名，包含 `articles`；只读取名称，不读取行或私密内容。没有读取完整 DDL、迁移状态或真实数据库标识。 |
| 任务与 MCP | Sites 自身返回 automations 为空；v159 成功发布记录含 MCP。外部执行器、事件队列或其他调度器是否仍可写入，不能由该列表推断。未调用旧业务连接工具。 |

### 最新保存版本不等于当前线上成功版本

| 版本 | 源提交 | 已核实发布结果 | 保存的构建归档 |
| --- | --- | --- | --- |
| 160 | `ab35236c37d015cd0ec40e5dae3545eb30307da4` | **failed**，`incomplete input: SQLITE_ERROR`，2026-10-14 02:01:58 UTC | 10,956,800 bytes / 334 files |
| 159 | `e3f7bb1b49b0d7a9dcfd7a85d43bb7dc8a0e50e1` | succeeded，2026-10-12 11:18:12 UTC | 9,922,560 bytes / 321 files |
| 158 | `d847bc80dd8d536584012428a75cd4769fc7a9b4` | succeeded，2026-10-12 08:40:48 UTC | 9,912,320 bytes / 321 files |

v159 的候选回退版本 ID 为 `appgprj_6ac1907e61a48191a067ce3c30b21265~appgver_a5d91e235f708191ae2cff2385a6ece4`，归档 hash 为 `sha256:6bea57a0f33db14d9489cace7730a05e1609e53cd49c647991db38439418c684`。正式部署接口接受已保存的版本 ID，但本轮没有执行回退。

在最近列出的版本中，159 是最高编号的成功发布记录。`get_site` 没有明确给出当前生效版本 ID，不能据此完全确认当前 live 指针，更不能把失败的 v160 作为回退基线。切换前需通过平台当前部署记录/设置确认生效版本，并固定其 ID、源提交、归档 hash 和运行配置。失败发布可能已应用部分数据库迁移；v160 的一条错误不足以判断迁移影响，本轮没有重试或修改旧站迁移。

## 当前应用与 Sites 的具体差异

| 层面 | 当前实现 | Sites 支持约定与适配影响 |
| --- | --- | --- |
| 发布格式 | [Dockerfile](../Dockerfile)、Node 进程监听端口；没有 Sites hosting manifest 或 Worker 产物。 | 正式技能要求构建 Worker/static 产物及 `.openai/hosting.json`，不接收 Docker 容器作为此项目运行时。 |
| HTTP | [server.mjs](../src/server.mjs) 创建 `node:http` Server，按主机/端口监听，读本地 public 文件。 | Workers 现有 `httpServerHandler` 可桥接部分 Node HTTP 代码，不能把 `node:http` 一概认定为不支持；仍需 Worker 默认 fetch 入口、资源打包及 IP/请求语义验证。[官方 HTTP 文档](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/) |
| 文件持久性 | [db.mjs](../src/db.mjs) 使用 `DatabaseSync`、WAL、本地文件权限和专用数据卷；备份写私有文件。 | Worker 文件系统是内存 VFS：bundle 只读，临时区不持久，文件所有者/权限不提供原模型。不能以 `/tmp` 替代生产 SQLite 卷。[官方文件系统文档](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/) |
| 数据访问与原子性 | 4 个核心文件约 796 行；同步 `.prepare().get/all/run`、`BEGIN IMMEDIATE`，将业务写入、审计及幂等记录放入事务。 | Sites 的持久结构化存储为 D1；异步绑定、批量事务和 schema-only migrations。必须适配服务层、条件更新、全局去重、审计、幂等及密码轮换竞态，不能删除事务后称兼容。[D1 API](https://developers.cloudflare.com/d1/worker-api/d1-database/) |
| 登录 | 自有密码 hash、会话 cookie、CSRF、受限 Bearer key、仅 CLI 首次建管理员。 | private Sites 会先要求平台认证；public Sites 允许匿名请求，但业务仍须鉴权。正式认证文档要求保留 Sites 认证集成，未给出当前独立密码/CLI 的托管适配流程；需明确支持边界并验证。 |
| 密码计算 | `node:crypto.scrypt`，N=32768、最大内存 64MB。 | 当前 Workers crypto 文档广泛支持 Node crypto，不能无证据把 scrypt 列成“不支持”；现有参数的 CPU/内存、Sites 配额和实际登录延迟仍未测。[Crypto 文档](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/) |
| 初始化与备份 | 管理员通过容器 CLI；Node SQLite backup；本地文件 `0600`；已做隔离卷恢复。 | Worker 没有本应用的容器 CLI/数据卷，需要受支持的管理员引导和 D1 导出/恢复路径；原 Docker 备份证据不能替代 D1 恢复验收。 |

正式 Sites 认证文档的约定是由平台管理 hosted authentication，并保留其集成；private 访问和独立密码会形成两层登录，不能绕过平台访问边界。当前项目 public 这一事实保留，并未证明完整密码会话移植已通过支持或兼容性验证。本轮不修改 access mode，不新增替代认证栈，不把 ChatGPT 登录当作用户已接受的替代需求。

## 最小可行路径与用户动作

以下为工程估算，不含平台支持答复、主机交付、域名生效和生产数据备份等待；不是已完成工作或上线日期承诺。

| 路径 | 可保留的资源 | 必要工作与粗估 | 用户最少动作 |
| --- | --- | --- | --- |
| **优先：纯 Sites 适配** | 同一项目、现有域名/SSL/托管，UI 大体复用。 | 先用 0.5–1 人日验证认证支持、scrypt 资源与 D1 原子性；通过后约 4–7 人日适配入口、数据层、初始化/备份和回归。当前独立密码要求不变；若平台只提供 SIWC 路径，暂停并报告差异。 | 补齐旧站源码/数据库支持性导出途径；若需要改变登录方式，必须由用户另作明确选择，本轮不默认接受。无需先买主机或改 DNS。 |
| **保留现有 Node 版本：Node/Docker 主机** | 已测试应用、独立密码、SQLite 事务和备份工具。 | 主机就绪后约 0.5–1 人日配置 TLS、卷、反代 IP、备份及隔离验收，最终切换另算；应用架构基本不改。现有 Sites 不提供已证实的 Docker 主机运行方式。 | 提供已有可用主机/容器托管目标，或后续选择新目标；在安全渠道完成必要连接；最后在具体回退方案下切换域名并设置管理员密码。无需现在购买。 |
| **备选：Sites 作为 HTTP 门面，后接 Node 主机** | 可保持现有域名/SSL 的 Sites 绑定，并保留 Node 自有登录。 | Worker HTTP 转发在运行模型上可讨论，但仍需新后端主机；需验证 Cookie/Origin/CSRF、Bearer、可信客户端 IP、代理鉴权与平台认证边界，估计比直接主机增加 1–2 人日。此混合方案本轮未验证。 | 仍要提供后端主机和后续安全配置；不能称为“无需新运行环境”或“已经支持”。 |

纯 Sites 若进入适配阶段，必须保留旧数据绑定和表，不对旧 `articles` 等表运行新站建表/改表脚本。新站使用经正式 manifest 验证的独立 D1 绑定，或在既有 `DB` 内采用明确的 `matrix_*` 表命名空间并只追加 schema；独立绑定的具体声明与平台支持本轮尚未核实。两种方式都要证明旧版本不会读取或修改新站表。没有用户确认的数据迁移需求时，新站只初始化运营账号配置，不搬入旧写作业务数据。

## 旧站保存与回退：当前能做到什么

| 保存对象 | 现有证据 | 切换前必须补齐 |
| --- | --- | --- |
| Sites 保存版本/构建包 | v158/v159 成功记录及 archive_storage 的 hash/大小/文件 ID；v160 失败记录。 | 确认实际 live 指针；取得匹配归档的支持性下载、校验与再部署可用性。版本归档是构建产物，不包含完整业务数据库。 |
| 完整可构建源码 | 本仓库保留旧目录与 Git 历史；旧基线是 `4c61f3c265a3998c7971241a4b4e64df65afebd3`。`MIGRATION.md` 表明它来自 Windows/Python 工具快照，没有 Sites hosting 源码配置。 | 通过正式源码流程取得候选线上版本的精确源提交，例如 v159 的 `e3f7bb…`，保存源码、锁文件、schema/migrations 和非秘密配置，并做独立 checkout/build 校验。本仓库旧目录不能代替该步骤。 |
| D1 数据 | 只确认 `DB` 及表名；没有导出数据、schema 或验证恢复。 | 从平台支持的通道完整导出 schema+data，记录时间/hash，在独立数据库恢复，核对完整性、数量、引用与必要功能。现有 Sites 工具只暴露表概览/有界行读取，没有完整 export/restore 动作；不能把分页读行或版本 tar 当备份。 |
| 附件/对象存储 | 没有取得旧站 R2/附件绑定或对象清单。 | 核实是否有文件存储，若有，保存对象、键、校验清单及数据库引用。未核实时不能报告“没有附件需备份”。 |
| 环境、访问策略与外部执行器 | 仅记录 public/revision 2、env_set_revision 1 和 Sites automation 列表为空。 | 在受控位置保存恢复所需的设置与绑定；秘密值不能写 Git/聊天。盘点旧 MCP、回调、写入执行器和其他调度，确保下线后不会继续改旧库。 |
| DNS 与域名 | Sites 域名绑定 active；平台返回建议 target。 | 若走新主机，先读取并保存 DNS 服务商的实际完整记录及 TTL；保留原 Sites 项目、版本和数据，不能先删域名绑定或删项目。 |

Cloudflare 原生 D1 提供 SQL 导出和有时间窗口的 Time Travel；它们需要相应数据库访问权，不能假定用户能直接操作 Sites 托管方的 Cloudflare 账号。导出可能阻塞数据库请求，不能把它当作本轮完全无影响的只读盘点而立即执行。Time Travel 会原位覆盖数据，不是独立副本；保留窗口取决于套餐（官方为 Free 7 天、Paid 30 天），本项目套餐和可操作途径未核实。[导出文档](https://developers.cloudflare.com/d1/best-practices/import-export-data/)、[Time Travel 文档](https://developers.cloudflare.com/d1/reference/time-travel/)

**独立回滚结论：尚未验证成立。** 平台内已有成功代码版本可作为候选恢复材料，但版本回退不会自动恢复数据库、附件、环境和访问策略；也不能证明能脱离 Sites 独立运行。不得在这些缺项未补齐时宣布“旧站已完整备份，随时可独立恢复”。

## 后续切换顺序（本轮未执行）

1. 固定当前实际生效的旧站版本与配置；完成旧站源码、D1、附件和外部执行器盘点及隔离恢复。保留旧项目、旧数据库和完整归档，不删除数据。
2. 在隔离资源验证新站运行时、独立登录、账号范围、幂等/版本/审计、null/零、快照和新备份恢复。保持 `SITE_ORIGIN=https://haoduoyu.xyz` 的最终约定；提前测试目标 HTTPS 链路。普通 Sites 发布 URL 也是生产，不把发布当临时预览。
3. 形成可审阅的准确版本、绑定、记录与回退步骤，再进入用户已选择的域名切换窗口。必要时先停止旧系统写入并取最终备份；静态页面切换、DNS 切换和数据库恢复是不同动作，分别记录。
4. 若复用同一 Sites 项目，替换为新 Worker 时旧 UI/API/MCP 处理器不再承接业务；保留旧数据库和历史版本。若换到 Node 主机，只改 DNS 不会让原 `chatgpt.site` 地址和旧 MCP 自动下线；还需通过正式受支持方式撤下旧业务处理器或限制旧站访问。该后续生产动作需按当时授权执行，本轮没有做。
5. 验收登录、录入、复盘与退出；失败即先停止新站写入、保存新站增量数据，再恢复已固定的旧版本/原绑定或 DNS。若旧库保持不动，优先保持其原数据；如确需数据恢复，单独按验证过的备份流程处理，不能直接用旧时间点覆盖新写入。DNS 有缓存传播期，不承诺瞬间全网回切。

## 本轮验证边界与下一步

已实际完成：正式 Sites 状态/版本/域名/DB 名称盘点、正式技能与 Cloudflare 一手文档读取、源码/配置比对，以及以下仅本地的 Compose 展开检查：

```bash
SITE_ORIGIN=https://haoduoyu.xyz TRUSTED_PROXIES=127.0.0.1 \
  DOCKER_CONFIG=/tmp/matrix-docker-config docker compose config --quiet
```

命令通过；这里只证明域名配置语法可以使用，`127.0.0.1` 是检查用值，真实 Docker/反代连接 IP 尚未确定，不能直接复制为生产信任配置。没有启动 Compose、运行 Worker 兼容性原型或 Sites 构建/部署；没有为了检查而安装 Wrangler、申请 Cloudflare 账号、创建源码凭据或调用业务连接工具。

下一步优先补齐旧站精确源码与完整数据库导出/恢复途径，并在不触碰旧库的前提下做小范围 Sites 认证和 D1 原型；原型未通过前，不改变独立密码需求、不购买新主机、不切换域名。若选择保持现有 Node 代码，则准备一个满足已知运行时要求的目标，再执行同样的保存和验收门槛。

## 读取的正式 Sites 资料

本次通过 `skills.read` 实际读取 `c9/sites`：`SKILL.md`、`references/storage.md`、`references/identity-and-secrets.md`、`references/troubleshooting.md`、`templates/worker-esm-starter/README.md`、`templates/vinext-starter/README.md` 和其 `.openai/hosting.json`。关键约定包括：Worker 托管、D1/R2、平台认证、失败发布可能已应用迁移，以及发布产物和源码版本的绑定。本文中运行时细节另附 Cloudflare 官方链接；估算与方案选择为基于这些证据的工程判断。
