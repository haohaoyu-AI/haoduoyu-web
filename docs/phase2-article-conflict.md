# B4：文章提交期唯一约束

基线：`92eba55d840baf4635242d6ed4de606cb17867a8`。本次唯一有意的 HTTP 例外：文章提交批次的已知唯一约束，从原 `409 DUPLICATE / 记录已存在，请检索后更新原记录` 改为 `409 ARTICLE_EXISTS / 该平台文章或链接已经登记`，与既有预检查提示一致。

## 红灯不是普通并发

测试只在隔离层包装真实 D1 batch：预检查已完成，执行实际提交时将一个冲突文章 INSERT 放在同一批次的应用语句之前，触发真实 SQLite 唯一约束。没有产品注入入口。批次失败会整体回滚，因 revision 未变不会被 CAS 重试掩盖。

修前创建与更新各覆盖 URL、平台文章 ID，四例均实际进入 batch 一次，捕获真实 D1 唯一约束并返回原 DUPLICATE，因目标 ARTICLE_EXISTS 断言失败。普通并发请求在修前已经通过，明确不作为红灯证据。

修后这四例验证失败批次无文章、审计、幂等收据或 revision 部分变化；去掉测试注入后同一幂等键成功重试，并且再次重放不增加写入。真实主键冲突另作提交级测试。并发登记仍只提交一条文章、审计、收据和一次 revision。

## 精确分类与保持边界

只在 storage.commit 的真实批次 catch 内识别完整 SQLite/D1 唯一约束诊断，限定以下列组合：

- `matrix_articles.id`
- `matrix_articles.account_id, matrix_articles.url`
- `matrix_articles.account_id, matrix_articles.platform_article_id`

仅接受明确的 SQLite 原始格式或当前 D1 包装格式；有扩展类型时主键须为 PRIMARYKEY，业务索引须为 UNIQUE。已带应用 status 的异常仍原样抛出。不会因异常中出现 article 字样、相似表名、未知列、混合表列、其他约束或包装杂文而分类为 ARTICLE_EXISTS。

真实 accounts/audit 表唯一约束仍为原 DUPLICATE；无关异常与已分类异常验证按对象原样重抛。原授权 guard 的映射优先级保持不变。revision、幂等、授权证明、版本 CAS、事务及数据库结构未改。

records.createArticle/updateArticle 只移除无法包住实际提交的两段 try/catch，保留 run 排队及 expectChange。B3 的原始错误快照不重写：测试仅明确移除原 records 的两处死映射，增加 storage 提交边界的一处同三元组映射；其余源码调用及 20 个 HTTP 错误样例保持锁定。调用点总数由 110 变为 109（-2 +1）。B5 不在范围内。
