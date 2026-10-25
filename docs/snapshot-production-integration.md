# 原子快照与当前生产备忘录整合

基线为生产 `6043d18cd75634542baecc6ffa665712cdf32eb1`，接入已通过 CI226（662/662）的 `18a88952514a765a153f688750020cbbb1cdeb03` 快照实现。独立分支 `opt/snapshot-production-integration`；本轮不部署、合并、创建 PR 或执行生产操作。

## 保留边界与证据

- 所有 `web/`、`public/app.js`、index/style/memos.css、db/drizzle、memo 实现、backup/storage/build 脚本逐字等于生产基线；仍为七个既有迁移、18 张表、v7 备份。本功能没有 schema 变化。
- 共享代码仅新增 worker import/两条 snapshot 分发及 request-trace 两个静态标签。memo 路由与资源继续保留。接口文档与九项资产 pin 保留各模块增量。
- 定向测试：首次10项中9项通过，新增组合测试因备份响应包装层断言有误而失败；仅修正测试断言，最终该项通过。合计10项均已通过，无产品修复或跳过。验证包括前端/数据库字节边界、文档精确投影、组合公开/owner 快照、Bearer 拒绝、memo 路由、快照不读 memo SQL、GET零写入、备份v7。
- 合成数据与临时 D1 浏览器验收：1440px/375px默认todo、memo导航与登录，共4项通过，无pageerror。证据见 [report.json](snapshot-integration-evidence/report.json)及同目录截图。
- `npm run build`、`npm run check:artifacts`（9项）、本地固定Gitleaks全历史扫描与`git diff --check`通过。此前两分支证据沿用，最终完整 CI 结果随交付消息提供。
- 当前 Worker SHA256：`38e4e282c1bff5736002281495748655d8e89dea9d91eea7158f87a9c3dcc5a0`。
- 边缘 CPU、实际生产扫描成本未实测；预算超限整体报错。快照不含memo，不新增Notion token、网站直推或Cron。

## 发布者清单（本轮未执行）

1. 发布前确认目标仍为已含0006的现有DB、v7/18表；保留现有DB绑定、SITE_ORIGIN、PUBLIC_BUSINESS所有配置、DAILY_NOTES_OWNER_ID、MEMOS_OWNER_ID和其他现存设置。不要执行任何迁移、bootstrap或恢复。
2. 仅使用本整合提交的组合 Worker；交付`artifacts/snapshot-production-integration.tar`只含Worker/runtime/本文及manifest，不带旧迁移、部署脚本、数据或配置秘密。manifest记录精确提交及每文件hash，外层包hash随交付提供。
3. 父级授权发布后检查health、默认todo、memo公开/owner入口及snapshot/index的权限/范围，确认无意外数据写入。不同scope需重建读取基线；错误不能充当删除证明。
4. 回退：恢复原生产6043d18的Worker部署与原配置，保留现有DB和0006，不回滚表、不恢复备份、不清除memo或业务数据。本功能纯读取，不需要数据逆操作。
5. 若后续合并视觉分支，保留上述路由和所有memo源码后重建包及资源pin；当前交付未包含视觉改造。
