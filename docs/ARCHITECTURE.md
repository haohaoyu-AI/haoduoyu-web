# 当前架构

前端为 public/index.html、public/app.js 与单一 CSS，无框架。登录后保留 URL 深链接是当前行为，ES 模块拆分尚未实施。

Worker 使用 /api/v1 Cookie 会话或受限 AI 凭据；CSRF/Origin、scrypt、安全比较、请求体上限、CSV 防注入和 e/safeURL 保持原样。D1 使用全局 revision 一致读/乐观锁和写入幂等。阶段1不改数据库结构、迁移或绑定。

累计快照与每日新增分别计算；未采集、未取得、真实零及 likes/approvals 保持区分。保险识别、题材推断和关注规则不变。当前仍无结果缓存，读请求仍有控制表维护和凭据元数据写入；这些未来优化目标尚未完成。

build.mjs 将 public 资源嵌入后打包 Worker。check:artifacts 校验 public 哈希、生成模块和实际 Worker 返回字节。任何有意前端变更须更新审阅后的 pin；阶段4新增模块源码时必须切换到可复现 esbuild 产物对比，不能沿用 pin 检查冒充源码构建一致性。

测试只连接本地 Miniflare，预览绑定本地 D1 并禁止 Worker 外联。CI 使用 Node24、锁文件与最小只读权限，没有生产秘密或发布步骤。

第二期 B1：管理员会话 GET /api/v1/auth/me 在原 username、csrfToken 之外新增稳定用户 id。前端沿用既有精确 ID 匹配显示审计“我”，不依赖用户名；匿名和 AI 凭据访问仍拒绝。登录响应及其 AdminIdentity 模型保持原样，OpenAPI 1.1.0 仅为当前身份增加独立扩展模型。
