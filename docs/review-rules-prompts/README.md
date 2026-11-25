# 分层规则与提示词版本

恢复候选基于生产 PR46 e993885c752e97532214ef14a2fcf32b324bc08c，保留 Claude 数据趋势及 robots 策略。用户已授权上线；本分支提交、构建或保存 SQL 均不代表已经执行生产迁移/发布。阶段性恢复过程见 RECOVERY.md，最终测试结果见 ACCEPTANCE.md。

## 层级与覆盖

规则增加可选 scope：global（整体）、toutiao（头条）、vzi（V字）、yujian（鱼见）、wechat（公众号）。旧记录省略 scope 时按手册 account 解释，不回填或改写 JSON。

- V字：global → toutiao → vzi；鱼见：global → toutiao → yujian。
- 公众号独立，只显示 wechat；规则与提示词的账号筛选一致。
- 精确、非空、区分大小写的 rule_id 相同才算同一规则；账号 > 平台 > 整体。不同分支不互相覆盖，不按语义猜测，不添加 overrides_rule_id。
- 被覆盖原文保留在默认收起区域，注明覆盖层；卡头分别显示总数、当前生效数、被覆盖数。同层重复不自动覆盖。
- 每个逻辑账号只用最新 active 手册；旧版本仍在后端。历史快照按当时原文显示，不套当前覆盖逻辑。
- 规则仍使用原有 section：keep_topic、drop_topic、title、body、audience、checklist。

规则文本复用安全 Markdown：加粗、无序列表、标题、引用、行内代码与代码块。仅固定颜色标记 [red]…[/red]、[amber]…[/amber]、[blue]…[/blue]、[green]…[/green] 映射到固定 class；HTML 转义，链接只允许 http/https，不能输入任意 CSS/HTML。

沿用 PUT/PATCH /api/v1/review/playbooks/{UUID}；单条规则可 PATCH /api/v1/review/rules/{rule_id}，带 account、playbook_id、expected_hash、save_id 和 scope。整个 rules 数组 PATCH 是全量替换，必须保留其余规则；不要拿局部数组覆盖全部内容。

## 提示词接口

- GET /api/v1/review/prompts/current：仅当前 active。
- GET /api/v1/review/prompts：所有历史，可过滤 status。
- GET /api/v1/review/prompts/{UUID}：单版本及 content_hash。
- PUT /api/v1/review/prompts/{UUID}：稳定 UUID 幂等创建；同 UUID 不同内容为409。
- PATCH /api/v1/review/prompts/{UUID}：必带 expected_hash；无 DELETE。

列表支持 scope、prompt_key、account、offset、read_revision。无 account 的后台查询可全览；指定 account 后与 scope 取交集。列表响应 {data:{items,has_more,read_revision}}，每页100项，跨页携带首次修订号；遇 READ_REVISION_CHANGED 从第一页重新读。

字段：id、prompt_key、scope、version、status、title、content_md、changelog_md、created_at、updated_at、content_hash。不返回 user_id。

- prompt_key：小写字母开头、最多64字符；字母数字可由单个 _ 或 - 分段，不连续、不结尾分隔。
- scope：上述五种之一。
- version：正安全整数，新 UUID 必须大于同 scope+prompt_key 组全部既有版本。
- status：draft（默认）、active、archived。
- title：必填非空，最多500 UTF-8字节。
- content_md：必填非空，最多131072字节。
- changelog_md：可空，默认空，最多131072字节。

建议键：longform_write、weitoutiao_write、image、transfer_chat；微头条使用 vzi+weitoutiao_write，不新增 scope、不套长文。头条系通用配图可用 global+image；公众号应单建 wechat 组。接口不限制只有这四个种类。

同 scope+prompt_key 最多一个 active。草稿可改标题/正文/说明，身份与版本不可变；激活原子归档旧 active。active/archived 正文不能覆写，archived 不能直接复活。恢复历史必须复制为新 UUID、更高版本 draft，再激活。拒绝降版激活。网络结果未知先 GET 核查，不能盲目换 UUID 重发。

前台只请求 current，折叠展示版本、生效时间和复制完整原始 Markdown；移动正文至少15px、行高1.6，代码块内部横滚。

## 权限与已有内容

沿用原内容复盘权限，不是私密后台。PUBLIC_BUSINESS_MODE=1 时允许匿名读及通过同源和标记校验的公开写；所有者会话写入需 CSRF，无效显式凭据不能回退匿名。未扩大或收紧权限，也未创建任何真实提示词种子。

独立提示词表不会自动搬移旧手册中内嵌的提示词。旧内容保留，首次新提示词列表可为空；文案由小小鱼填写，不得把空列表当作丢失内容而自动重建。

## 迁移、备份与发布

0021_review_prompt_versions.sql 仅新增一表三索引，SHA256 4ca25d204c9f1cb28d0799cffee31e248ab29a1ecde4ddd4f7c2580fc276ac0c。没有 INSERT/UPDATE/DELETE/DROP 或旧表 ALTER，不覆盖原规则。

发布前通过已有获授权的 D1 渠道核对正确绑定、当前 schema/账本和是否已执行；全用户私有备份需与独立库存同修订，不能只用用户范围 HTTP 导出。按 verify:migration-backup 在隔离空库恢复并校验。结果未知先只读核查，不重复迁移。新增表必须先于新 Worker，否则提示词读取失败。

备份 v17 包含所有提示词历史，v1–v16 兼容；恢复旧备份时新表为空。回滚只回滚 Worker，不删除新表/历史。已写入新提示词后，旧 Worker 的不含新表备份不能替代完整备份。

使用最新 main 的手动发布控制，登记精确源码/树/Worker哈希、最新100%生产版本；继承绑定和并发保护，不绕过白名单、扩权限或另建部署路径。生产操作回执应另存，源码文档不是回执。

## 隔离浏览器验收

运行 node scripts/preview-review-rules.mjs，打开 http://127.0.0.1:8796/ 。这是无数据库的合成页面，不是生产预览。已安装 Playwright Chromium 时可运行 python3 tests/browser-review-rules.py，检查1440/390/375宽度及三账号、覆盖展开/收起、完整复制、字号/代码横滚、错误与HTML惰性。该入口只验证共用渲染和复制函数，不代替真实应用控制器生命周期及生产验收。
