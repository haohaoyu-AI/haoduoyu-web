# 当前架构

前端为 public/index.html、public/app.js 与单一 CSS，无框架。登录后保留 URL 深链接是当前行为，ES 模块拆分尚未实施。

Worker 使用 /api/v1 Cookie 会话或受限 AI 凭据；CSRF/Origin、scrypt、安全比较、请求体上限、CSV 防注入和 e/safeURL 保持原样。D1 使用全局 revision 一致读/乐观锁和写入幂等。阶段1不改数据库结构、迁移或绑定。

累计快照与每日新增分别计算；未采集、未取得、真实零及 likes/approvals 保持区分。保险识别、题材推断和关注规则不变。当前仍无结果缓存，读请求仍有控制表维护和凭据元数据写入；这些未来优化目标尚未完成。

build.mjs 将 public 资源嵌入后打包 Worker。check:artifacts 校验 public 哈希、生成模块和实际 Worker 返回字节。任何有意前端变更须更新审阅后的 pin；阶段4新增模块源码时必须切换到可复现 esbuild 产物对比，不能沿用 pin 检查冒充源码构建一致性。

测试只连接本地 Miniflare，预览绑定本地 D1 并禁止 Worker 外联。CI 使用 Node24、锁文件与最小只读权限，没有生产秘密或发布步骤。

第二期 B1：管理员会话 GET /api/v1/auth/me 在原 username、csrfToken 之外新增稳定用户 id。前端沿用既有精确 ID 匹配显示审计“我”，不依赖用户名；匿名和 AI 凭据访问仍拒绝。登录响应及其 AdminIdentity 模型保持原样，OpenAPI 1.1.0 仅为当前身份增加独立扩展模型。

第二期 B2：GET /api/v1/audit 在既有管理员校验后，以一次带动作类型约束的 LEFT JOIN 增加可选 entity_label。管理员拥有全账号读取范围；AI 凭据仍无权访问此接口，不执行标题关联。只有文章创建/更新动作且实体一致时取当前标题，缺失及非文章实体为 null；旧字段、排序与 200 条上限不变。前端仅用响应标题并经 e() 转义，旧记录无该字段时保留动作与时间，不借文章分页缓存猜标题。

第二期 B3：错误构造集中于 src/lib/errors.mjs 的直接抛出 fail(status,code,message)，shared/auth 与 security 的同名导出保留。旧 throw fail(...) 调用继续立即进入原异常传播路径；20 个 Worker 错误响应及 110 个源码调用点的状态/码/消息被锁定，详见 phase2-error-contracts.md。

第二期 B4：storage.commit 仅将文章表三个已知唯一约束的精确驱动诊断映射到 409 ARTICLE_EXISTS，其他错误与原事务/授权/revision/幂等机制不变。删除 records 中包不住提交的两段 catch。此提交期 DUPLICATE→ARTICLE_EXISTS 是明确例外，验证边界见 phase2-article-conflict.md。

第二期 B5：登录后保留 URL 深链接是既有的有意行为。init 实际认证并加载账号后，readRoute() 读取和校验有效的页面、账号、筛选、排序、分页、字段及周期参数，updateRoute 规范化 URL，不按 freshLogin 清空有效筛选。刷新及浏览器前进/后退沿用同一解析规则。freshLogin 在 init 中仍重置趋势/关注展开状态，必须保留；本次只删除给无参 readRoute 传入的对象，不改此重置或认证流程。

阶段 3 C1：普通 API 仅用一条 SELECT 同时检查 initialized/revision，不再运行 ensureControl 写入。bootstrap 与恢复保留初始化。protectedRead 将已读 revision 仅供 consistentRead 第一次 before 使用；重试重新读取并重新执行包含鉴权的 operation，出口检查保留，mutate 不接收它。会话 GET 零写，AI last_used_at 元数据写仍保留给 C2，见 perf-baseline.md。

凭据 GET 的 last_used_at 是独立展示元数据：认证内部携带既有值，以最终一致读成功轮决定首次/严格超过五分钟的同步更新；应用层与 SQL 用相同截止时间，恰边界/未来跳过，不额外 SELECT、不推进业务 revision。并发可发多个 UPDATE，仅SQL条件匹配的请求更新；更新失败沿用500。

静态缓存仅原始路径app.js/style.css/favicon.svg/openapi.json，采用构建SHA256与no-cache条件验证；GET/HEAD命中304，HTML与所有API/错误继续no-store。编码别名不进入白名单。生成资源含内部hash不表示每种资源对外可缓存；生产CDN行为需部署后单独核验。


阶段 3 C5（独立 PR，未部署）：总览正文以不可变 Blob 缓存，按 DB 绑定身份、revision、规范化查询及完整授权身份隔离。缓存有效期精确到北京日界、未完成 d1/d3/d7 到期与未来保险成员发布时间；缓存不能代替每次鉴权、首尾 revision 检查或 C2 元数据处理。总预算 16 MiB，单项正文最多 15 MiB，最多 50 项；pending、resident、活跃响应与每个租约的两个 64 KiB 缓冲预留共同计费。失败、重试和取消显式释放；超限完整绕过缓存，不截断响应。资源状态和目标运行时证据边界见 overview-cache-design.md 与 overview-cache-validation.md。
