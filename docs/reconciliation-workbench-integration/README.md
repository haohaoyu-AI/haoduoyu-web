# 最新工作台上的实际文章对账增量

生产基线 `f405b4cc309a7cb1f40133cc7e19d827244a3fa4`（部署9486c8eb-ede9-47b7-8a3c-f21cec23360e）；接入已通过CI237（713/713）的对账增量 `e2c4d61010bda0f2c0e9dd322cba26d6627a04b9`。独立分支 `opt/reconciliation-workbench-integration`，没有操作生产或真实用户内容。

## 精简差异

- 组合源码新增独立article-reconciliation聚合和页面、总览第三项“实际对账”、router保存该口径、actions切换和events处理对应筛选。
- 工作台品牌与一级图文导航、memo两栏/直接创建、todo历史/常用/返回、设置和回收站、sidebar/info-icon、顺滑保存逻辑继续保留。所有web文件除上述controller/router/actions/events四个精确增量及新增页面外，均与f405b4c逐字一致；表结构、迁移、todo/notes/memo业务、所有样式与权限实现不变。新只读端点沿既有文章身份和账号范围，无新增凭证或权限类别。
- API `/api/v1/article-reconciliation`、请求日志静态标签、OpenAPI及app/pin为既有已审增量；旧bundle全部由组合源码重建，没有覆盖旧完整包。
- 测试先精确移除本次对账UI增量，再继续既有工作台、memo、notes和Phase7全部边界断言。工作台冻结manifest不改；新增集成manifest的before固定为f405b4c。
- 只统计真实记录。日期/篇数/排期/保险起点目标未配置；expected/missing/overdue为null。编号间隔仅候选，样本映射无事实仍未知。不新增默认值、表、索引、调度、Notion直推或secret。

## 验证

13项受影响统计/权限/分页/并发/文档与前端边界测试通过；build/check:web/11项资产校验通过。真实合成Worker与临时D1的八项工作台修复浏览器验收20项通过、30张截图，无pageerror或外部请求；桌面1440/手机375的对账导航、真实统计、筛选空态、路由恢复、错误反馈、默认todo/memo入口通过。当前测试只含合成内容，无线上验收重复。

[组合工作台报告](report.json)注明本次f405生产基线和组合Worker hash；harness_historical_baseline仅保留原脚本元数据，不作为本次源码基线。全部30张截图在artifacts/workbench-acceptance，本目录保留部分截图；[对账截图与报告](../article-reconciliation-evidence/report.json)对应本组合Worker。最终完整CI结果随交付给出。

原对账增量的CI236失败（测试脚本current声明与打包变量重名）及CI237通过证据保留；此集成使用已修正变量名，不更改原业务断言。边缘CPU和生产扫描成本未实测。

## 发布和回退（本轮未执行）

交付 `artifacts/article-reconciliation-workbench.tar` 只含组合Worker、runtime、本文、manifest；记录精确commit和每文件SHA256，不带迁移/部署脚本/配置秘密/业务数据。

父级确认后按现有发布流程，仅替换本组合Worker，保留当前18表/v7数据库、所有绑定、owner及公开范围配置。无迁移、bootstrap或恢复。本分支没有创建PR、merge或部署。原 `article-reconciliation.tar` 是旧基线历史包，不能用来覆盖新版工作台。

需要回退时恢复f405b4c Worker及原配置，保留现有数据库；不回滚表、不恢复备份、不清除任何内容。没有实现新排期，对用户仍只需集中确认各槽位生效日/执行日与篇数/截止时间、保险起始与目标号，以及可选样本对应表。
