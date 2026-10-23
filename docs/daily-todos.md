# 每日待办

桌面首页顶部直接填写今日计划；手机无明确页面目标时默认进入待办，登录后保留该目标，明确深链接仍直达原页面。导航中的“每日待办”可按日期查看和补充记录。日期统一使用北京时间（UTC+8），完成后文字划线，可取消完成。跨日显示新一天的清单，旧日事项及勾选状态留在原日期，不删除、不自动搬移未完成项。没有提醒、定时服务、外部服务或付费依赖。

## 手机显示与切换

≤760px 增加底部五模块导航和当前页标识；文章、数据、账号记录分成独立卡片，账号编辑按钮及日期完整可见，总览周期表按两列指标排列。桌面保持原有表格。

导航外壳按用户 ID 和会话代次复用；同目标导航不重新发请求、不增加历史记录、不丢输入，显式刷新仍可用。每次真实换页仍取消旧读取并检查渲染代次；不增加结果缓存、不自动重放登录或写请求。

## 数据与权限

- `matrix_todos` 是独立新增表，按现有登录用户 ID 和日期查询。通过原有 Cookie/CSRF 验证；API key 不可读写待办。
- `GET /api/v1/todos?date=YYYY-MM-DD` 返回 `{date,today,items}`；省略日期使用服务端北京时间今天。
- `POST /api/v1/todos` 接收 `{id,date,text}`。客户端固定 UUID 在请求结果不确定时重复提交只产生一条记录；同 ID 不同内容返回 409。
- `PATCH /api/v1/todos/:id` 接收 `{completed,version}`。显式状态和版本条件防止迟到/重复请求覆盖新状态；版本冲突返回 409，界面重新读取后提示。
- 内容最长 500 个 UTF-16 单元，必须非空。日期必须是有效的四位年份 `YYYY-MM-DD`，允许历史和未来日期。
- 未新增删除、移动、编辑正文接口；未修改原有用户、账号、登录防护、环境变量或业务表语义。

## 迁移、备份和回滚

原始 `0000_lively_stellaris.sql` 和其快照保持不变；追加由 Drizzle 生成的 `0001_daily_todos.sql`，只包含 `CREATE TABLE` 与 `CREATE INDEX`。Sites 发布会在上传 Worker 前应用待执行迁移。不能通过清空数据库来初始化本模块。

备份升级为 `haoduoyu-matrix-d1-v2` 并包含待办。HTTP 管理员备份只附带当前登录用户的待办，其余旧表仍按原有范围导出；仅供运维调用的 `exportBackup(db)` 保留完整导出能力。恢复仍限空的隔离目标，兼容 v1 旧备份（恢复后待办为空），v2 缺表或校验和错误会拒绝。

上线前保留当前 **Sites v8**：

- version_id: `appgprj_6ad231e97f4c8191b3a376ed2d0fa4e4~appgver_8c4bc95e68548191895293917590d1c9`
- Sites 源提交：`e7765af3c6d4b87ed39de7831db2962db9c826d9`
- 完整原发布记录：[2026-10-23-v8.json](releases/2026-10-23-v8.json)

回滚仅重新发布 v8 Worker，不回退/清空数据库；新增表保留，v8 不会操作它。迁移可能先于失败的部署生效，结果未知时先查状态，不能改写已应用迁移或重复部署。

## 验证入口

合成后端用例：`tests/daily-todos.test.mjs`；备份：`tests/daily-todos-backup.test.mjs`；前端行为：`tests/daily-todos-ui.test.mjs`。真实 Chromium 验收使用 `tests/daily-todos-browser-server.mjs` 和 `tests/browser-daily-todos.py`，只读写独立回环合成 D1，截图与原始报告留在忽略的 `artifacts/daily-todos/`。结果以最终精确提交的记录为准。
