# 当前架构

本分支前端源码位于 web/，以无环 ES 模块机械拆分；public/index.html 加载已提交的单一未压缩 ESM 产物 public/app.js，沿用单一 CSS 和原生 JS。登录后保留 URL 深链接。4a 仅机械拆分；4b 已合并 action/表单分发及 GET 生命周期；4c 已合并受控图表 CSSOM 与严格 style CSP。当前 5a 草稿仅进行后端等价时间工具抽取和无调用旧认证函数删除。

Worker 使用 /api/v1 Cookie 会话或受限 AI 凭据；CSRF/Origin、scrypt、安全比较、请求体上限、CSV 防注入和 e/safeURL 保持原样。D1 使用全局 revision 一致读/乐观锁和写入幂等。阶段1不改数据库结构、迁移或绑定。

累计快照与每日新增分别计算；未采集、未取得、真实零及 likes/approvals 保持区分。保险识别、题材推断和关注规则不变。优化前的历史基线没有结果缓存，每次读请求还有控制表维护及凭据元数据写入；这不是当前分支状态。当前 main 基线已包含 C1 的零普通控制写、C2 的五分钟元数据节流、C5 精确失效结果缓存和 C4 轻量读取；C6 SQL 分页也已验收合并；4a 前端模块已合并；4b 已合并；4c 已合并；本分支推进 5a。已发布的生产 Sites v7 固定版本仅包含 C1～C3，尚未包含 C4/C5/C6；不能把开发分支架构当作线上状态。

build.mjs 先使用已有 esbuild 将 web/main.mjs 生成 public/app.js（ESM、不压缩、UTF-8），再将 public 资源嵌入 Worker。CI 在首次 build 之前检查产物与源码逐字节一致，避免覆盖手改产物掩盖错误；check:artifacts 同时保留八资源 pin、生成资源和 Worker 字节检查。模块所有权、原事件顺序和运行状态归属见 frontend-modules.md 与 frontend-module-map.json。

测试只连接本地 Miniflare，预览绑定本地 D1 并禁止 Worker 外联。CI 使用 Node24、锁文件与最小只读权限，没有生产秘密或发布步骤。

第二期 B1：管理员会话 GET /api/v1/auth/me 在原 username、csrfToken 之外新增稳定用户 id。前端沿用既有精确 ID 匹配显示审计“我”，不依赖用户名；匿名和 AI 凭据访问仍拒绝。登录响应及其 AdminIdentity 模型保持原样，OpenAPI 1.1.0 仅为当前身份增加独立扩展模型。

第二期 B2：GET /api/v1/audit 在既有管理员校验后，以一次带动作类型约束的 LEFT JOIN 增加可选 entity_label。管理员拥有全账号读取范围；AI 凭据仍无权访问此接口，不执行标题关联。只有文章创建/更新动作且实体一致时取当前标题，缺失及非文章实体为 null；旧字段、排序与 200 条上限不变。前端仅用响应标题并经 e() 转义，旧记录无该字段时保留动作与时间，不借文章分页缓存猜标题。

第二期 B3：错误构造集中于 src/lib/errors.mjs 的直接抛出 fail(status,code,message)，shared/auth 与 security 的同名导出保留。旧 throw fail(...) 调用继续立即进入原异常传播路径；20 个 Worker 错误响应及 110 个源码调用点的状态/码/消息被锁定，详见 phase2-error-contracts.md。

第二期 B4：storage.commit 仅将文章表三个已知唯一约束的精确驱动诊断映射到 409 ARTICLE_EXISTS，其他错误与原事务/授权/revision/幂等机制不变。删除 records 中包不住提交的两段 catch。此提交期 DUPLICATE→ARTICLE_EXISTS 是明确例外，验证边界见 phase2-article-conflict.md。

第二期 B5：登录后保留 URL 深链接是既有的有意行为。init 实际认证并加载账号后，readRoute() 读取和校验有效的页面、账号、筛选、排序、分页、字段及周期参数，updateRoute 规范化 URL，不按 freshLogin 清空有效筛选。刷新及浏览器前进/后退沿用同一解析规则。freshLogin 在 init 中仍重置趋势/关注展开状态，必须保留；本次只删除给无参 readRoute 传入的对象，不改此重置或认证流程。

阶段 3 C1：普通 API 仅用一条 SELECT 同时检查 initialized/revision，不再运行 ensureControl 写入。bootstrap 与恢复保留初始化。protectedRead 将已读 revision 仅供 consistentRead 第一次 before 使用；重试重新读取并重新执行包含鉴权的 operation，出口检查保留，mutate 不接收它。会话 GET 零写；C1 当时保留的 AI last_used_at 写入已由后续 C2 节流，当前行为见下段及 perf-baseline.md。

凭据 GET 的 last_used_at 是独立展示元数据：认证内部携带既有值，以最终一致读成功轮决定首次/严格超过五分钟的同步更新；应用层与 SQL 用相同截止时间，恰边界/未来跳过，不额外 SELECT、不推进业务 revision。并发可发多个 UPDATE，仅SQL条件匹配的请求更新；更新失败沿用500。

静态缓存仅原始路径app.js/style.css/favicon.svg/openapi.json，采用构建SHA256与no-cache条件验证；GET/HEAD命中304，HTML与所有API/错误继续no-store。编码别名不进入白名单。生成资源含内部hash不表示每种资源对外可缓存；生产CDN行为需部署后单独核验。


阶段 3 C5（已合并、未部署）：总览正文以不可变 Blob 缓存，按 DB 绑定身份、revision、规范化查询及完整授权身份隔离。缓存有效期精确到北京日界、未完成 d1/d3/d7 到期与未来保险成员发布时间；缓存不能代替每次鉴权、首尾 revision 检查或 C2 元数据处理。总预算 16 MiB，单项正文最多 15 MiB，最多 50 项；pending、resident、活跃响应与每个租约的两个 64 KiB 缓冲预留共同计费。失败、重试和取消显式释放；超限完整绕过缓存，不截断响应。资源状态和目标运行时证据边界见 overview-cache-design.md 与 overview-cache-validation.md。

阶段 3 C6（已验收合并、未部署）：完整文章分页仅在 published_at 排序、无 topic/data_status 筛选且完整匹配集字符串排序兼容时使用 SQL 排序分页；只为页内文章补快照，其他情况保留原实现。ID/日期原始字符串、locale、权限及分页错误规则的兼容边界见 article-sql-page.md。未修改字段投影、数据库结构或 UI。

阶段 4b（已合并、未部署）：actions.mjs 保留所有原 data-action 名和处理体，events.mjs 只保留前置交互、薄分发及原顺序的九个事件绑定；forms.mjs 独立保留表单校验和写入合同。requests.mjs 分开拥有页面、弹窗、后台的 pending GET。共享键包含渲染/会话 epoch、身份、写入 generation 和有效请求选项；每个消费者独立解析 JSON 和释放取消订阅，最后一个消费者才中止底层传输。新页面取消旧页 GET，写请求不合并、不自动重试、不因换页取消。已完成冻结索引仍可在会话内复用，在途索引不得跨 owner 复用。既有 renderVersion、sessionEpoch、generation 及旧 401 保护保留，真实当前 401 仍退出。

web 源码的 160 字符/80 行检查使用 Node24 自带解析器，仅为开发检查，不打入运行时；同时拒绝词中续行。模板 cooked 文本逐项比较，正文空白不改变。新增行为的失败/取消及真实浏览器范围见 frontend-request-lifecycle.md。

阶段 4c（已合并、未部署）：发布柱和图例使用转义 data 属性，replacePageContent 写入后、
动画前同步调用 applyChartStyles，以 CSSOM setProperty 设置 --h/--plot-color。
颜色仅允许四个现有平台变量，高度只接受 0～80 有限数值；CSS 引用变量。
CSP 仅删除 style-src 的 unsafe-inline，浮层位置、body overflow 和动画延迟原 CSSOM 路径不变。
真实浏览器和 13 状态精确 computed 对照、四宽 PNG 差异及体积缺口见 strict-style-csp.md。

阶段 5a（草稿、未部署）：src/lib/time.mjs 复用日常量、日期转换、范围和中位数。
保留 records 的默认当前时钟、analytics 的字符串校验/空值规则、两种 shift 转换以及
先加后除与分别除二的算术差异；过滤和排序位置不变。analytics 原导出继续兼容。
shared/auth 仅删除仓库内无消费者的五个旧同步函数；在线 security/storage/worker 的
同名实现及所有安全机制保留。引用清单和等价验证见 backend-utilities.md。
