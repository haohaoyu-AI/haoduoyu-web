# 碎碎念：独立纯文字日页（本地实现，未发布）

分支 `opt/daily-notes-module` 固定叠加于 PR37 的 `d96542b364d5596f954bb0da24d845148ee93cbb`。本增量不修改 PR37，不混入 e442 迁移工具。生产仍由原部署流程管理；本轮不创建 PR、不部署、不配置秘密、不启用 Cron。

## 使用与权限

新增导航“碎碎念”，以北京时间日期为一页。匿名访客可以查看明确所有者的文字；所有者通过原登录流程编辑、清空和软删除。其他真实用户及原 API key 也没有笔记写权限。原待办匿名读写保留。

`DAILY_NOTES_OWNER_ID` 必须配置为经私下核对、实际存在的管理用户 UUID。没有配置时安全返回 `503 NOTES_CONFIG`，绝不猜第一个用户，也不用 `public-business` 伪身份。此变量不是密钥，构建器只做格式检查，发布前仍须核对归属。笔记公开阅读不依赖 PUBLIC_BUSINESS_MODE；编辑必须有原所有者会话、精确 SITE_ORIGIN 与 CSRF。页面提供“所有者登录”，沿用现有认证。

每页正文最多 65,536 UTF-8 字节；拒绝非法控制符和不完整 Unicode 代理项，换行统一为 LF。显示使用 textContent/textarea.value，HTML 字样只作为文字。没有画布、图片、附件或 AI 分析。

编辑停止约 700ms 后自动保存，同一日期串行请求，中文输入法组合期间不发保存。不同日期的草稿可在当前页签切换；409 保留本地草稿并展示远端版本，只有明确选择后才用新版 CAS 保存。未知结果先 GET 核对；确认远端仍为原版本后才显示“重试同一保存”，使用原正文、原版本和原 save_id。后续编辑继续保留，旧保存确认后再串行发送。GET 失败不会重复写入。

**未保存草稿仅保留当前页签内存。** 离开页面有浏览器提示，但关机、强制关闭或切换账号不保证保留草稿；没有把私人草稿持久化在公共设备存储中。界面“已保存”才表示收到或回读确认保存结果。

## 接口、数据与并发

| 方法与路径 | 用途 |
| --- | --- |
| GET `/api/v1/daily-notes?date=YYYY-MM-DD` | 公共单日阅读；省略日期取北京时间今天；返回 can_edit |
| GET `/api/v1/daily-notes/dates?page_size=30&before=YYYY-MM-DD` | 非空且未删除的历史日期，日期降序；最多100项，返回 next_before |
| PUT `/api/v1/daily-notes/YYYY-MM-DD` | 所有者保存；正文严格为 text、version、save_id（UUID） |
| DELETE `/api/v1/daily-notes/YYYY-MM-DD` | 所有者软删除；正文严格为 version、save_id |

新表 `matrix_daily_notes` 以 `(user_id,date)` 唯一。version 用于 CAS，change_seq 在原 mutate 的同一原子批次中取全局 revision+1；时间戳不是变更游标。同毫秒更新和旧日期重新编辑不会漏掉。原 storage/mutate/consistentRead 实现不变。

保存回执使用独立 `daily-notes:<save_id>` 命名，只存日期、版本、删除状态和正文 hash，不存正文。原请求重放不能覆盖更新版本；同 save_id 换内容拒绝。清空和删除均递增版本/游标；软删除正文仅在受保护备份中保全，公开读及同步投影隐藏已删正文。

保存限制为每所有者、每 Worker isolate 每分钟60次和 UTC 每日2000次，有界16个桶；它不改变原待办限流，也不构成全地区统一配额。Provider 硬限制仍生效。无新增收费依赖、资源或自动升级。

## 备份与迁移

0004 是单独新增表及索引的 additive migration，不改原四份 SQL 或待办 schema。最新备份为 `haoduoyu-matrix-d1-v5`：16表库存，13表持久恢复，sessions/login_attempts 清空、control 重建。管理会话导出仍按用户过滤私有表，包括笔记；授权离线操作员导出才覆盖所有用户。敏感完整备份不能公开或提交 Git。

v1–v4 仍可恢复到隔离空库，缺失笔记默认为空；v4 的待办软删除和模板关联标志保留。v5 包含源 revision、各用户笔记及软删正文；校验和覆盖源 revision。恢复后的 revision 必须高于源值，保存后的变更才会大于恢复的同步游标。拒绝不安全整数或超出源 revision 的笔记游标。真实本地 D1 验证了空库、已有库应用迁移、跨用户隔离、外键、篡改与失败保持隔离，原 todo 行不变。

发布顺序须由授权部署方执行：

1. 私下保全当前可恢复备份，核对原用户归属及当前 DB/域名/公开业务配置。此代码没有读取生产数据。
2. 在隔离测试 D1 应用0004，设置明确 DAILY_NOTES_OWNER_ID，部署本分支精确构建；原 SITE_ORIGIN、公开业务范围及绑定保留。
3. 验收所有者登录/编辑/重读、匿名只读/拒绝写、清空软删、待办匿名勾选不变，确认 v5 备份可在隔离库恢复。
4. 经独立发布批准后才应用正式0004并发布精确版本，无须改 DNS。旧程序可忽略新增表回退，但旧版本备份不能保全新笔记；产生笔记后应先保存 v5。不得用发布前旧库直接覆盖发布后数据。

## Notion 增量准备与门禁

`src/notion-notes-sync.mjs` 是独立内部模块，**没有 HTTP 路由、调度或真实令牌调用**。它不把笔记塞进原六类业务快照。调用方显式提供 owner/父页/Secret 与有效所有者会话；未来定时运行还需另行审查服务身份与授权路径，当前不能靠匿名请求触发。

协议为 `haoduoyu-daily-notes-v1`，每日期独立 hash/版本/回执。一次捕获固定高水位，按 `(change_seq,date)` 分页，每次最多两条日页记录；并发新更新留到后轮。旧日期更新按游标增量同步，不限“当天”。只有 Notion 完整回读确认后才在 D1 同批保存成功回执并推进游标。内容相同跳过，真实变化才新建 v2；清空/删除创建独立状态版本，旧 Notion 页面不覆盖，已复制的公开文字不会被软删除撤回。

复用 PR37 的 Read+Insert 传输，固定目标 API、完整分页/封印校验和未知提交只读核对。回执只存 hash、page ID 和运行状态，不存正文或 token；未知 Notion 或回执提交维持 pending，不能盲目重发、自动清锁。两条记录共享40次 Notion HTTP 请求上限；预算不足停止并保留已确认游标。共享传输保留原业务快照协议；本增量另修正原共享错误渲染的 Notion Retry-After 传递，并有回归测试。

本地真实 D1 + 模拟 Notion 已覆盖分页、高水位、旧日期/同毫秒、hash跳过/v2、清空删除、限流、提交未知、重复导入后的游标和请求预算。**真实 Worker→Notion、真实权限/API、免费 CPU/额度及关机后定时闭环未验证。** 未配置凭据、未启用 Cron；不能将模拟测试描述为已同步上线。

## 界面证据

本地 Chromium 合成 API 在375px和1440px通过：公开只读/登录入口、日期分页、自动保存、跨日期冲突保稿、未知结果回读/原ID重试、纯文本 XSS、软删除和无横向溢出。截图均为合成数据：

- [手机公开阅读](daily-notes-images/readonly-375.png)
- [桌面所有者编辑](daily-notes-images/owner-1440.png)

可重跑 `python tests/browser-daily-notes.py`（需要环境已有 Python Playwright 和 `/usr/bin/chromium`）；不安装浏览器、不请求外网，结果写入被 Git 忽略的 `artifacts/daily-notes-ui/`。

另运行 `python tests/browser-daily-notes-real-worker.py`，375px真实前端→本地 Worker→临时 Miniflare D1 联测通过：原登录、所有者保存v1、独立无Cookie浏览器公开读且无编辑器、所有者软删v2、匿名空页。所有账号和内容均为 harness 合成数据，测试后销毁。它不替代真实部署网络、Notion和免费CPU验收。
