# 碎碎念与备忘录公开业务编辑

独立分支 `opt/public-notes-memos-edit` 基于生产 `701db4febbdb17b098d8734b22d94f1a813d7616`。用户明确授权两个模块现有及未来内容公开免登录新增、编辑，并保留可恢复删除；管理、备份和密钥没有公开。本分支只保存实现与验证，不表示生产权限已更新；父级统一安排发布。不含未完成视觉分支。

## 视觉分支最小共享触点

- 后端：`src/daily-notes.mjs`、`src/memos.mjs`，新增专用 `src/public-note-access.mjs`。没有把这些接口加入通用公共业务 allowlist，也未更改原 security/storage/admin 机制。
- 前端：`web/core/memos-state.mjs` 从服务端 can_edit 和不含真实 owner ID 的 draft_scope 初始化匿名草稿空间；`web/memos-controller.mjs` 的本机草稿入口使用该空间。不要恢复为必须登录 owner 才编辑。
- 碎碎念：`web/core/daily-notes-state.mjs`、`web/daily-notes-controller.mjs`、`web/pages/daily-notes.mjs` 增加恢复操作。布局和 CSS 无变更，原 can_edit 自动显示编辑控件。
- 生成产物：从合并源码重建 `public/app.js` 并更新 `.ci/public-assets.json`。`public/style.css`、`public/memos.css` 与生产基线逐字一致。
- 测试投影：`tests/public-note-ui-delta.json` 和 helper 精确锁定这五份前端权限增量，再执行原 memo/文章证明；没有扩大允许任意源码变更的范围。视觉任务如改变同一文件，应合并具体变化后更新精确视觉证明。

## 权限与固定归属

`PUBLIC_BUSINESS_MODE=1` 时，匿名 notes/memos 只使用已有的 `DAILY_NOTES_OWNER_ID` / `MEMOS_OWNER_ID`。不接受 user_id 或任意主体查询，不从 todo 的 PUBLIC_BUSINESS_USER_ID 推导 owner。未启用公开模式时仍保留原登录所有者编辑能力。所有 owner 配置必须合法并指向现有用户。

匿名 actor 是真实的 kind=public，actor 字符串分别为 public-notes:<owner>、public-memos:<owner>，不会注册成 session/admin 或获得通用公共业务权限。有效 owner session 优先，继续要求正确 CSRF；其他有效登录主体和 API key 不会被悄悄重绑为匿名 owner。过期 Cookie 不授予登录能力，公开请求仍需满足匿名写约束；Authorization 错误不降级为匿名授权。

匿名写必须通过精确同源 Origin 和 `X-Public-Business: 1`，保留输入大小/纯文本、ID/归属、排序及结构校验。每个模块/owner 保留每分钟60、每日2000次的有界 per-isolate 最佳努力写限制；不是分布式全局配额。memo 容量限制仍含墓碑32组/200篇。所有写继续走既有 mutate/commit guard；CAS、幂等键和保存收据保持，未知结果不自动创建新保存请求。

匿名可使用 memo 回收站与其业务保存收据。碎碎念增加 `POST /api/v1/daily-notes/:date/restore`，请求 `{version,save_id}`，通过原 CAS/幂等机制恢复墓碑中保留的正文；重复相同请求不重复创建版本。恢复中禁止接受会丢失的输入。只恢复当前明确固定主体的数据。

安全设置、密码、API keys、审计和全库备份仍要求原真实管理员鉴权；公开写 header 不能解锁这些接口。todo 和文章的现有权限及行为没有改变。

## 数据、验证及交付边界

没有数据库迁移、schema/备份格式变更、新凭据或 Cron。旧数据不复制、不清空；不读取任何真实私人笔记。合成公开编辑测试覆盖 notes/memo 分组与笔记新增、编辑、软删恢复、同源/header、跨用户/API key、限流、CAS/并发、未知提交收据，以及匿名 backup401。

[浏览器证据](public-notes-memos-evidence/report.json)包含桌面和手机匿名操作、备份401和精确资源哈希；只使用临时本地合成库。此前 owner-only 测试在公开模式关闭时继续验证历史能力边界，公开模式另有专用用例。

最终完整检查结果及提交在交付回复中报告。远程 Actions 先前 Forbidden，未重试或绕路。没有创建 PR、GitHub merge 或部署。回退可切回原 Worker/配置；本次没有新增或删除任何数据库对象。回退后匿名编辑权限会收回，但已保存的业务文字保留。

## 本轮实际验证结果

唯一一次完整本地回归执行706项，702通过、4失败：文章 CRUD/PATCH 各一处旧 notes 私有写断言，快照集成中的旧 can_edit=false 与全源码逐字不变证明。按明确的新授权更新前两类预期，并通过精确权限增量投影保留快照/文章原证明；相关6项定向复验全部通过（包含新 actor 类型变异拒绝）。未重复全量，也不将首轮结果改写成706全绿。9个资源与源码/bundle一致性、两个本地预览均通过。

匿名专用用例覆盖两模块业务操作、跨用户与 Origin/header、管理员会话优先、API key拒绝、控制面401、模块限流、CAS并发以及未知成功提交仅一批写入与收据回读。桌面1440/手机375匿名操作无页面异常、无外联；UI命名空间新增单元测试17/17通过。生产和远程 Actions 状态不由本地结果推断。
