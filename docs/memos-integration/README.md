# 文章 UI 与长期备忘录整合交接

本分支 `opt/memos-production-integration` 是以下两个精确输入的本地 Git 合并：

- 当前生产文章 UI：`fe8efa479c0c2865970b43053db4deb62a3380c9`。
- 已交付备忘录：`0bff743cc6951a6fb51ffa47dd8cdcc4c55bcbb6`。

文章列表、编辑、默认存稿概览、已发布数据切换和导入 CLI 保留生产实现。备忘录的公开读/owner 会话写、版本 CAS、保存收据、本机草稿及可恢复删除保留独立模块实现。当前默认首页仍为 todo。本任务没有执行 GitHub PR 合并、创建 PR、部署或生产迁移，也没有启动磨砂视觉改版。

## 共享触点

| 文件 | 合并结果及后续注意事项 |
| --- | --- |
| `web/core/constants.mjs` | 生产文章状态与筛选常量完整保留，只增加备忘录导航项 |
| `web/controller.mjs` | 生产文章总览和已发布链接逻辑完整保留，加入备忘录加载/绘制分支及第七个手机导航项 |
| `web/ui/components.mjs` | 生产文章标题/操作保留，新增备忘录独立页头 |
| `public/style.css` | 与生产 `fe8efa` 完全相同，未引入视觉改版 |
| `public/memos.css`、`public/index.html` | 保留备忘录隔离样式和 stylesheet；手机导航七列是唯一公共导航样式接入 |
| `public/app.js`、`.ci/public-assets.json` | 从合并后的源码重建并计算九个资源精确哈希，不采用任一分支旧 bundle |
| `src/worker.mjs`、`src/lib/request-trace.mjs` | 加入独立 memo API、资源及日志路由；文章 API、原授权机制和 storage 未变 |
| `scripts/build.mjs`、迁移元数据、`src/backup.mjs` | 七个迁移、18 张表、v7 备份；旧 v1–v6 恢复兼容 |
| `tests/*ui-projection*`、`tests/frontend-actions.test.mjs` | 先精确剥离备忘录增量，再执行原文章 Phase7 证明；原 Phase7 哈希清单未放宽 |

全部其他生产 `web/` 文件逐字保留；新增四个 memo 模块逐字等于 `0bff743`。浏览器文章测试的导航数量断言从六改为七，未减少场景。未来视觉 worker 必须从此次整合提交继续，合并源码后重建 bundle；不要从旧备忘录整包覆盖生产文章 UI。若视觉工作需要改变精确源码/样式证明，应记录其具体变化，不把完整模块或目录排除在检查外。

## 数据与运行配置

现有生产数据库保持原绑定和业务数据。已执行至 `0005_article_pipeline` 的数据库只追加下面这一个文件，不能重新执行 `0000–0005`、bootstrap，或将备份恢复进现库：

```
drizzle/0006_long_term_memos.sql
size: 2580 bytes
sha256: b17df8f270fcefa479efa1eb06d851b3c4af5f8b67279e34f9f852e55eacbd18
```

`0006` 只有两张新表和两个索引，没有用户数据、旧表重建或删除语句。旧 SQL 和 `src/storage.mjs` 与生产输入完全一致。新版本的 v7 全库备份会读取新表，必须先完成已审阅的增量迁移后再切换新 Worker；本地打包不执行该操作。

发布者需要显式保留现有 DB、SITE_ORIGIN、PUBLIC_BUSINESS、daily-notes 配置，并设置指向已有 owner UUID 的 `MEMOS_OWNER_ID`。缺少该绑定时备忘录关闭并返回 503；不能从 todo 或 notes 的 owner 配置推导写权限。现有 `scripts/cloudflare-config.mjs` 未自动透传 MEMOS_OWNER_ID，不能假定通用配置生成器会替发布者加上它。本交付包不含真实凭据、生产数据或部署绑定。

v7 保留 owner 隔离、软删除、幂等收据和修订号高水位，恢复兼容 v1–v6，恢复目标仍必须为空隔离库。初版容量含回收站：32 个分组、200 篇笔记，正文 64 KiB；软删除不释放额度。未增加搜索、附件、Notion 同步或调度。

## 验证与包

本次定向源码/投影测试 11/11，通过变异拒绝用例核对文章和备忘录两边的边界。组合 Worker 的本地浏览器验收为备忘录 10/10、文章流水线 15/15；使用合成数据、真实合成登录和临时 D1，手机为 Chromium 375/390px 模拟。报告和构建哈希见 [备忘录报告](../memos-integration-evidence/memos-report.json)及[文章报告](../memos-integration-evidence/article-pipeline-report.json)。旧 memo 和 Phase7 历史证据保留原样。

本轮再执行一次完整本地检查，结果随最终整合提交交付，不把上轮独立模块的“首轮570/577、修复后56+1”改写为全量通过。GitHub Actions API 此前返回 Forbidden，本次没有换路线或重试；远程状态保持未知。

交付归档为 `artifacts/memos-production-integration.tar`：只含当前组合 Worker、`runtime.json`、精确 `0006`、本 README 和记录最终提交/每个文件 SHA256 的 manifest。故意不含旧迁移、自动部署脚本或真实配置。最终归档 SHA256 在父任务交付回复中提供。其生成不表示任何迁移或部署已执行。
