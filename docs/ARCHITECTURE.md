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
