# 第五轮工作台简化交接

基线 `ae1fafe292755ba01df5a8a639b74245eec72752`，分支 `opt/workbench-ui-round5`。本轮仅修改前端与对应测试，没有生产数据写入、数据库迁移、API 或运行时配置变更；原有 22 张表、9 条迁移、匿名业务编辑与后台保护保持原样。未部署或创建 PR。

## 交付行为

- 左侧「好多鱼图文」只有一个入口；主区域只有「数据总览」「文章详情」。旧 `reviews` 及 `article_scope` 地址归一到两页；账号选择支持全部或单账号。日数据记录和发布核对保留为页面内折叠内容或二级操作，不再占第三个主页。
- 文章详情默认完整读取全部状态，在全量合并后筛选、排序、分页。兼容旧状态为空的真实记录，显示「状态未确认」，保留其真实指标与历史；不将未知状态改为已发布，不将缺失值改为零。读取不完整、超出预算、身份或计数不一致时明确报错，不静默截断。完整结果只缓存 10 秒，写入、刷新、身份或范围改变后失效。
- 待办输入不再出现红色聚焦框；下方直接显示常用项，可点选加入所选日期。实际已添加的项目禁用并显示「今日已添加」或「当日已添加」，保留跨日、草稿、中文输入和失败重试行为。
- 碎碎念不再显示「最近的文字」。当前编辑区置顶，已保存条目只显示真实修改时间、完整正文和重新编辑入口；正文不截断。输入、拼音组合、待保存、冲突及失败期间不会因自动保存收起编辑区。旧逐日记录、生活/工作分类及多条记录完整保留。

## 验证与截图

真实本地 Worker + 临时 D1 在 1440、375、390 宽度通过 12 组整合验收，无脚本或 HTTP 错误。合成夹具含恰好 80 篇文章，覆盖全部五个已知状态和五条旧未知状态、真实零与缺失指标；验收前后所有文章和指标字节的聚合哈希一致。测试只写本地合成待办和碎碎念。

整合证据见 [report.json](workbench-round5-images/report.json)，截图为合成数据：

| 页面 | 桌面 1440 | 手机 375 | 手机 390 |
| --- | --- | --- | --- |
| 数据总览 | [截图](workbench-round5-images/overview-1440.png) | [截图](workbench-round5-images/overview-375.png) | [截图](workbench-round5-images/overview-390.png) |
| 文章详情 | [截图](workbench-round5-images/articles-1440.png) | [截图](workbench-round5-images/articles-375.png) | [截图](workbench-round5-images/articles-390.png) |
| 每日待办 | [截图](workbench-round5-images/todos-1440.png) | [截图](workbench-round5-images/todos-375.png) | [截图](workbench-round5-images/todos-390.png) |
| 碎碎念 | [截图](workbench-round5-images/notes-1440.png) | [截图](workbench-round5-images/notes-375.png) | [截图](workbench-round5-images/notes-390.png) |

上一版合成页面在 [第四轮截图目录](workbench-round4-images/)。专项测试还覆盖全量目录预算/范围/缓存、未知指标、两页导航、39 项待办 UI、38 项碎碎念逻辑与输入安全、75 项既有 UI 回归及严格前端差异投影。最终 GitHub CI 结果以交付的精确提交和 run 为准。

用户本轮三张原截图的官方 Library `prepare_materialize` 已成功解析引用，但消费端 helper 下载返回 `download failed`，没有获得可读像素；未猜 URL、绕过 helper 或宣称看过原图。依据明确文字要求和实际页面复现实施；原图没有加入仓库，像素核对仍属于该受限项。

## 发布与回退

固定包、Worker 字节数和 SHA-256 见 [workbench-round5-build.json](workbench-round5-build.json)。发布端核对最终提交、CI 成功、包内 Worker 摘要后沿用当前绑定发布即可；**不运行初始化或迁移，不替换数据库、凭据或运行时配置**。回退只需恢复基线 Worker，保留全部现有数据。生产 80 篇文章未在本任务中读取后写回或变更，完整性证据来自合成夹具与后端源码零差异检查。
