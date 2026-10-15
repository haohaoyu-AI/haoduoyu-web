# 独立站V2完整包验证 — 2026-10-15

本轮按最新澄清继续完成同一独立站的必要打包修复，不新建站、不改原站。
结果是：**V2真实采用新包后，重现原站V160的SQL迁移错误；不是可用版本。**

## 本次确实发布了什么

- 项目：`appgprj_6ad0582893088191b7bb69025f245b19`。
- 地址：<https://haoduoyu-isolated-test-20261015.haohaoyu202409.chatgpt.site>。
- 源码：`d15f418e426311a9a092734349198610a5953e78`。
- V2保存版：`appgprj_6ad0582893088191b7bb69025f245b19~appgver_84a3aea641608191823225a825dd5d9f`。
- 正式部署：`appgdep_6ad05bd7a1e4819194d30a11600503b9`。
- 终态：`failed`，`incomplete input: SQLITE_ERROR`，更新时间
  `2026-10-15T04:51:51.044503+00:00`。

正式get_site_version返回V2、新源码SHA和445文件归档，确认这次不是复用V1旧包。
实际保存归档SHA256为 `dcf2f45980afe8f2ec5b77c251b192e814b5caba4852c4c9ed321284c3cc03ef`，
17,397,760字节。它与本地提交tar的hash/大小分开记录，不冒称本地tar是平台原样消费字节。

## 候选与V1的具体差异

`d15f418e` 相比 `a3111a12e3aa28883e88579d4c9c49505a3834de` 仅增加24行
`ISOLATED-TEST-RELEASE.md`，用于明确保存新版本；应用、数据库定义、54份旧SQL、
54份snapshot及journal无字节修改。正式保存版的source字段再次确认了已推送源码。

必要修正发生在归档布局：V1输入有根 `.openai/drizzle/`，但遗漏构建生成的
`dist/.openai/drizzle/`。V2保留完整生成的dist树，并保留入口验证要求的根metadata：

```text
.openai/hosting.json
.openai/drizzle/                 # 109个迁移相关文件
dist/.openai/hosting.json
dist/.openai/drizzle/            # 完整保留生成目录，同样109文件
dist/server/index.js
dist/client/...
```

两个metadata位置均逐文件与源码一致，两个hosting manifest都指向独立项目，
仍为DB/BUCKET逻辑绑定，无生产物理库ID、无MCP/plugin/connector声明。
本地包SHA256 `e133356793bf1814a3c66fae9fbdee70f069e5eba950c0e537cf4369e21c6dcb`。

V1缺表的唯一根因尚不能由官方内部执行轨迹确认。对照结果支持“遗漏生成metadata导致
迁移未被采用”的候选解释：V1部署后无表，V2完整包进入迁移并报错、留下用户表。
不把这个推断写成已取得平台分句/选择规则，也不把它套到原站V160。

## 云端只读验收：失败后确有部分DDL

V2之前的正式概览 `tables=[]`，省略表数0。V2失败后，正式概览返回50个可见用户表名，
包括 `articles`、`article_history`、`dedao_cloud_requests`、`claude_settings`。
因此，失败后保留了至少部分DDL，不能用failed终态推导没有执行迁移。
这不证明单个statement/batch是否原子，也不证明完整账本或schema定义。

对上述四个**概览实际返回**的表分别调用官方行读取，limit=1：均返回0行、has_more=false；
列名完整返回且包含预期字段。没有读取隐藏账本、猜表名或执行直接SQL。
`article_history` 和 `dedao_cloud_requests` 是0050新增表，证明至少部分0050 DDL已落地；
不能据此断定0050全部完成，更不能指定失败一定在0053。

109是迁移相关文件数，不是109条已执行迁移。54份SQL是否全部执行、view/trigger定义、
实际失败输入与位置、完整账本和平台执行契约仍未获得。

## 可用性边界与停止条件

本轮没有以本地测试替代线上验收。独立源码此前构建、类型检查及空SQLite读取通过，
只保留原范围；本次新证据来自正式保存版本、部署状态和用户表只读接口。

本线程工具目录没有可调用的已认证浏览器或新站业务写入接口，且试站明确未启用MCP。
原站连接器不能被改作新站写入工具；不能伪造用户身份或使用HTTP/RPC绕授权。
因此线上登录、页面交互和保存没有验收，不宣称可用；真实写作、配图、上传和草稿
也未配置或执行。

收到与原站相同的实际SQL失败后，按用户明确条件停止后续发布。没有改旧SQL、
追加猜测修复、清库、重建站点或重新部署V2。该独立库现在也有未知的部分应用状态，
不能把它继续当全新空库盲目重跑。V1仍是最近成功发布，URL保留但不是业务可用交付。

目前仍为owner私有、显式允许1人、外部访客0、群组0。未导入生产数据、环境密钥、
认证凭据、旧订阅或执行者，未新增费用购买或升级套餐；原站项目/域名/权限/计划
和业务稿件均未写入。所有动作已结束，没有后台继续执行。

完整脱敏回执及四表核验见 [v2-status.json](../evidence/isolated-test-site-20261015/v2-status.json)。
