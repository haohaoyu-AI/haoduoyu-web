# 免费 Cloudflare 迁移准备（未部署）

2026-10-24：用户预算为免费，仅授权迁移准备和独立分支保存。当前旧 Sites 与旧数据继续保留；不合适就维持现状、继续原有使用方式，是无需购买服务的退出条件。本准备不创建账号、凭据、Worker、D1 或其他云资源，不自动付费，不变更 DNS/WAF/认证，不迁移生产数据。

此文件保留迁移准备阶段的授权与待验证状态，不代表最新线上部署状态。碎碎念独立增量的当前发布边界见 [daily-notes.md](daily-notes.md)；以下本地工具版本/表数已同步更新。

## 免费边界

官方截至本次核查的信息：

| 项目 | Workers / D1 Free |
| --- | --- |
| 信用卡 | Workers、D1 产品页均说明可免费开始且无需信用卡 |
| Worker 请求 | 每账号每天 100,000 次，UTC 零点重置；达到后可返回 1027 |
| Worker CPU / 内存 | 每请求 10 ms CPU；每 isolate 128 MB，共享并发请求内存 |
| D1 用量 | 每账号每天读取 500 万行、写入 10 万行；按实际扫描/写入计量，索引也有成本 |
| D1 存储 | 10 个数据库，每库最多 500 MB，账号总计 5 GB |
| D1 查询 | Free 每个 Worker invocation 最多 50 次查询；批次内每条语句也受对应限制，不能把大型恢复当作一个普通 Worker 请求 |
| D1 Time Travel | Free 为 7 天；不是长期离线备份，也不能据此假定原 Sites 账户具备可操作恢复权限 |
| 达到免费额度 | Worker 请求受限；D1 超过日读写额度会拒绝查询，存储满后限制新增。付费计划的超额计费规则不能混作 Free 额度 |

来源：[Workers 产品页](https://www.cloudflare.com/products/workers/)、[D1 产品页](https://www.cloudflare.com/products/d1/)、[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)、[Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)、[D1 定价](https://developers.cloudflare.com/d1/platform/pricing/)、[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)。这些是公开规则，不是对用户未知账号当前账单状态的读取结果。

本路线只接受经确认的 Workers Free。不能把付费计划中“用量很小预计免费”当成零收费保障；不启用 Paid、自动升级或额外收费产品。若控制台要求付费/绑卡、额度不合适，立即停止，不降密码强度、删鉴权或自行升级。

现有登录使用 scrypt。小规模个人使用并不免除 CPU、内存、查询数及数据库总量限制；本地 Miniflare 通过不证明 Cloudflare 免费 CPU 限制下通过。需要在后续单独批准的合成云测试中核验登录/密码变更 CPU、并发内存、常用读写查询、备份体积和目标网络直连表现；不满足就不切换。不能承诺大陆各运营商稳定或所有 AI 服务都可访问。

## 构建与保全

不新增运行时或开发依赖，不修改业务模块、API、schema、前端和鉴权：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run build:cloudflare
```

默认构建仍输出原 platform 布局。新 target 输出 dist/cloudflare/index.js 和五份 SQL 迁移（原四份及新增0004），不包含 .openai；保留现有 assets 生成方式。Cloudflare 构建不会删除已有 dist/server 平台产物，default platform 仍保持原先清理 dist 的行为。不能先构建 platform 归档后再用其他构建覆盖产物，再把混合目录作为旧版归档。

没有账号配置时只生成 **wrangler.template.json**，其中标识是不可用于部署的占位符。没有部署命令、GitHub 自动部署任务或创建资源操作。单纯本地构建不能证明账号是 Free。

后续经批准且核实账户/资源后，构建可从本地环境读取全部四项：CLOUDFLARE_ACCOUNT_ID、CLOUDFLARE_D1_DATABASE_ID、CLOUDFLARE_D1_DATABASE_NAME、CLOUDFLARE_SITE_ORIGIN，才生成 wrangler.json；部分配置或非 HTTPS origin 会失败。可选 CLOUDFLARE_WORKER_NAME。标识必须来自已核实资源，不可把模板或测试 ID 当真。授权令牌不写进配置、仓库或命令行。默认 workers_dev/preview_urls 均关闭，没有生产域名路由或 bootstrap secret，也不自动打开 TRUST_CF_CONNECTING_IP。

先把源码与验证结果保存在独立分支/draft PR，不合并 main、不部署现有 Sites。Git 只保全代码及净化文档，不会备份生产数据库；目前没有取得生产全库备份，不能声称数据已经额外保全。

## 全用户备份与离线校验

“个人使用”不等于数据库只有一个用户。现有 GET /api/v1/backup 以当前用户过滤 todos、todo_templates、todo_template_links、todo_preferences、daily_notes；检查文件自身 checksum 通过也可能漏掉其他用户的私人记录。

新增 scripts/migration-inventory.mjs 是不挂 HTTP 路由的 operator 工具：

- createSourceInventory(db)：在一致读中，从**完整源数据库**直接清点 16 张 matrix 表，保存行数和按稳定 JSON 规范化后的整表哈希。不接受未知 matrix 表静默遗漏。
- exportBackup(db)：复用现有函数且不传 todoUserId，取得当前 v5 全用户备份。完整源库存与备份应在获批写入冻结后生成并再次核验，不能从网页的用户过滤备份反推库存。
- verifyBackupInventory：要求 v5、原 checksum、同源 source_revision、16 表库存及 13 张恢复表的行数/内容哈希全部一致。库存不是数字签名；其完整源身份、版本与保管来源必须另外核实。工具不能凭空访问当前 Sites 的生产 DB，受支持的生产 operator 导出渠道仍待确认。
- verifyRestoredInventory：恢复后再逐表比对哈希，并检查外键、D1 支持的 PRAGMA quick_check，以及恢复围栏。D1 不支持的 SQLite integrity_check 不作为可运行命令。

恢复分类必须明确：13 张持久表原样恢复；sessions、login_attempts 清空，control 根据恢复流程重新建立且 revision 高于源值。所有用户须重新登录；密码哈希、AI token 哈希、权限/撤销状态、审计、幂等、待办删除状态、模板、偏好及笔记都保留。所有私人表哈希包含 user_id，能检测跨用户遗漏；还需在业务验收中验证用户隔离。

离线工具将备份恢复到全新临时 Miniflare D1，禁止外联，不接收云账号或数据库标识，完成后销毁自己的临时运行环境：

```sh
npm run verify:migration-backup -- --backup /private/backup.json --inventory /private/source-inventory.json
```

真实备份和库存均含敏感信息或其哈希/内部标识，应由用户在授权的私有位置保管，目录 700、文件 600；不得进公开 Git、聊天、截图、CI 产物或公开静态目录。仓库新增忽略 .migration-private/ 只是补充保护，首选仓库之外保管，不以 ignore 代替访问权限。

脚本不会打印行内容、密码/token 哈希、SQL 或输入解析错误。验收只返回通过状态和表分类数量。本轮仅以合成数据运行，不保存真实备份。

## 后续切换及失败退出

1. 先确认用户是否拥有自己的 Cloudflare 账号且为 Workers Free、没有自动付费/额外产品；NS 记录不是账号归属证明。没有账号时由用户自行注册免费账号，无需提供密码、API token 或私钥。
2. 另行批准最小账号访问、合成 Worker+D1 资源及测试范围，核查额度后在隔离目标测试；这一步尚未执行。测试访问正常也不自动授权真实迁库或 DNS。
3. 所有云测试以合成数据进行。实际电脑/手机关闭 VPN/代理，分别用家庭宽带和移动数据检查 HTTPS、静态资源、原账号流程及获授权 AI API；用户不接受表现就停止，旧站照常使用。
4. 真正迁移前另行确认维护窗口、完整源导出渠道、私有保管路径、旧入口写入冻结、目标身份/容量、导入工具和回滚方案。需验证冻结覆盖自定义域名与旧 Sites 地址、网页和 AI 客户端。当前产品无维护开关，未擅自新增或部署。
5. 导入只能进入获批的空隔离目标；不覆盖旧库。现有 restoreIntoEmptyDatabase 保留失败围栏；大型远程恢复不得直接放进一次受 50 查询限制的 Worker invocation。实际远程导入需另行实现/验证受控分批或平台支持流程，当前离线 CLI 不是远程导入器。
6. 数据和目标验收通过后才申请具体 DNS/TLS 切换，不同时增加公开统计或更改私人待办首页。切换后建议观察 48 小时，授权 AI 调用连续验证；继续保留旧站与快照。
7. **切换前失败**：不改 DNS、不关旧站，可直接维持现状；保留代码分支，丢弃失败的合成目标前先确认它不含用户数据。
8. **切换后但目标尚无新写入**：核对快照一致后按批准流程回旧站，注意 DNS 缓存窗口。
9. **目标已有新写入**：先冻结并保全新记录，演练反向恢复到空目标或经审查的差异同步，再决定回退；不能只把 DNS 指回旧数据库。当前没有验证完成的无损生产反向迁移，不承诺立即无损回滚。

本准备保留“不迁移”的退出选项，不以失败为由强推付费主机、换认证或扩大数据公开范围。
