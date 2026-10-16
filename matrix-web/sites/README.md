# 好多鱼图文 · Sites Worker / D1 适配

这是完整业务适配，原 Node/SQLite/Docker 版本仍保留在上层目录。UI 和公开 API 文档由构建过程直接读取原 `public/` 与原文档内容，没有复制维护第二套 UI。新服务仍是私人多运营账号统计、复盘与驾驶舱，不提供写作或发布功能。

## 本地构建与验证

Node 24，所有依赖为开发/构建依赖，Worker 不需要 npm 运行环境：

```bash
npm --cache /tmp/haoduoyu-npm-cache ci --ignore-scripts --no-audit --no-fund
npm test
python tests/browser_qa.py --artifacts /tmp/matrix-sites-browser-evidence
npm run build
```

测试使用 Miniflare/workerd、临时 D1、合成账号与 loopback；不访问 Sites、生产库、真实发布平台或外部素材。`cf:false` 禁止 Miniflare 获取远程 Request.cf 元数据，Worker 外部 fetch 也被测试夹具阻断。浏览器启动使用真实 `.mjs` 文件，避免 Node `--input-type` 参数传播到 Miniflare 内部线程。

```bash
npm run dev
```

便携本地预览在 `http://127.0.0.1:8787`，状态保存在忽略的 `.preview/d1`。默认不创建管理员、样例文章或统计数据，不启用初始化密钥。此脚本只用于 portable 环境；managed Linux 仍遵守正式 Sites 的 supervisor/browser 流程。

## 代码结构

- `src/worker.mjs`：全部原 HTTP 接口、静态资源、安全响应头、一次性初始化、管理员备份下载。
- `src/records.mjs`：异步 D1 业务服务，保留原校验、全局重复检查、账号范围、版本、来源、累计快照及三日窗口规则。
- `src/storage.mjs`：SQL 表位置命名空间、原子 batch、提交时权限检查、revision/CAS、稳定读取与有界重试。
- `src/security.mjs`：Cookie、Origin/CSRF、受限 Bearer、登录限流、请求大小及来源配置。
- `src/backup.mjs`：一致的账号/文章/快照/日指标/用户/Key/审计/幂等导出，以及仅空隔离库的显式恢复工具。没有 HTTP 恢复入口。
- `db/schema.ts`：11 张新 `matrix_*` 表。`db/legacy/` 和 `drizzle/` 保留取得的旧站 schema 及 54 项历史链，另追加第 55 项矩阵迁移；新迁移不含业务种子、DROP、旧表 ALTER 或回填。构建逐项校验旧 SQL/快照的 SHA-256 和 journal 前缀。

原 `src/auth.mjs` 的 scrypt、密码规则、摘要和常量时间 CSRF 比较被直接复用，构建时打包入 Worker。平台身份头本身不授予经营数据权限。未实现或代理平台专属 `/signin-with-chatgpt`、`/signout-with-chatgpt`、`/callback`，也不使用平台认证绕过凭据。

## 持久性与并发约定

业务写入先读取并验证，再在同一个 batch 中执行全局 revision CAS、当前权限检查、业务 SQL、审计和可选幂等 receipt。文章还保留自身 version CAS。零行更新通过命名 CHECK 转成整批失败。已知 revision 冲突最多重新规划 24 次；未知 D1 提交/网络错误不自动执行第二次写入，客户端使用原幂等键重试。暂时繁忙返回 503。

驾驶舱和其他组合读取接受前后 revision 相同的完整计算；不把 `withSession()` 当冻结快照。读到并行变更会丢弃结果并重算，最多 5 次后返回 503。这个模型要求业务、权限和密码写入统一经过此服务；管理员恢复使用隔离 fence。`last_used_at` 只是使用元数据，其更新不参与业务 revision。账号范围通过 JSON 参数展开，避免 100 账号加筛选条件超过 D1 的绑定参数预算。

累计 observation 追加保存，按 `as_of` 取最新；日新增单独 upsert；NULL 的账号总量 scope 与文章 scope 各有唯一索引，账号总量优先。缺项与 0 保持不同，累计数据不当作按日发生量求和。停用账号仍能复盘历史，不能新登记文章。

## 初始化与配置

生产配置由正式 Sites 环境变量工具在另行授权后设置；本轮没有配置真实值：

- `SITE_ORIGIN`：最终应为 `https://haoduoyu.xyz`；仅精确 HTTPS origin 可用于生产，HTTP 只允许 loopback 预览。
- `MATRIX_BOOTSTRAP_SECRET`：默认无值。未来由操作者安全提供随机 32+ 字符密钥后，`POST /api/v1/bootstrap` 才启用；同 Origin 和独立 Bearer 校验通过后，只能在空初始化状态原子创建首个管理员及三个运营账号配置。并发初始化只有一次成功，之后不能重用。不要将值写入 Git、命令行参数或聊天。
- `TRUST_CF_CONNECTING_IP`：默认不设置。确认 Sites 分发层会安全覆盖该头之前，不应启用。默认共享总桶 + 用户名桶仍提供持久限流，攻击者更换 X-Forwarded-For/CF-Connecting-IP 不能增加尝试次数。

`scripts/initialize.mjs` 只接受 stdin JSON 的 `origin`、`bootstrapSecret`、`username`、`password`，向指定 origin 发起一次初始化，不打印输入或底层异常。真实操作仍需用户先授权配置密钥；本轮只运行合成测试。完成后应通过受支持配置通道清除初始化密钥；服务的 initialized 状态也会阻止再次初始化。

## 备份与隔离恢复

管理员会话可 GET `/api/v1/backup` 下载带 SHA-256 校验的完整业务 JSON。包含密码/Key 的散列、审计和幂等收据，因此是私有恢复材料；没有明文密码或明文 Key。会话和限流窗口不在恢复范围，恢复后必须重新登录。

`restoreIntoEmptyDatabase(db, backup, {allowEmptyRestore:true})` 是操作者代码工具，默认关闭，只允许明确的空目标。先将目标标记为恢复中，分批导入，检查外键后才开放。失败的目标保持隔离，不能作为线上库使用，也不能覆盖旧库。实际生产 D1 的导出、目标创建与恢复操作通道仍需 Sites 提供；本轮只验证临时库恢复，不宣称备份旧站。

## 构建产物与生产门槛

`dist/server/index.js` 是自包含的 Worker ESM `default.fetch`；UI 已嵌入，运行时不读取本地文件。`dist/.openai/hosting.json` 保留目标项目 ID 与旧源的 `DB`、`BUCKET` 逻辑绑定，`dist/.openai/drizzle/` 包含 schema-only 迁移。`dist/server/wrangler.json` 记录本地验证的兼容日期、旧源已有的三个兼容 flags、DB/BUCKET 绑定和占位资源 ID；正式 Sites 是否采纳这些元数据尚未确认，不能当成实际资源配置。

当前 manifest 是待正式接收的切换候选：保留旧源 DB/BUCKET，应用不读写旧附件，不继续提供旧写作 MCP 处理器。旧 v159/v160 源码快照已保存到私有 GitHub 并独立读回核验；原 54 项迁移 SQL/快照逐字节保留，Drizzle 重新生成只新增矩阵表的第 55 项。旧源码不再是缺项，但真实生产已应用账本和当前 live 指针仍未取得，失败 v160 的迁移状态不能靠本地重放推定。

本轮在临时 D1/R2 上通过了精确 50 项 v159 -> 55 项组合历史重放、幂等重跑、旧合成行/附件保存及联合库独立登录；27 项矩阵回归也使用继承的三个 flags 通过。生产 D1/R2 完整备份、正式迁移 runner、域名透传和运行预算仍需支持性核验，没有生产部署。

最新交付与切换步骤见 [SOURCE-BACKUP-PREFLIGHT-2026-10-16.md](../docs/SOURCE-BACKUP-PREFLIGHT-2026-10-16.md)。原适配阶段证据见 [SITES-ADAPTER-2026-10-16.md](../docs/SITES-ADAPTER-2026-10-16.md)，其“源码尚未取得/初始0000”结论已由本轮进展更新。
