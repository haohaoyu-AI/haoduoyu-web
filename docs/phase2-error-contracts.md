# B3：错误工具统一的行为刻画

基线：`1f5afffaac5bccd14c3dd25600df3a9b85d1ee40`。仅整理错误工具，不包含 B4 的重复文章提交期错误映射。

## 修前与修后

- 修前行为刻画通过：110 个源码调用点、20 个真实隔离 Worker HTTP 错误响应。
- 修前结构检查失败：不存在统一的直接抛出模块；这不是业务红灯。
- 修后相同基线刻画及新结构检查通过。公共资源、OpenAPI、权限、数据库结构与安全算法不变。
- 110 点清单及旧状态码/错误码/消息在 [机器可读基线](../tests/fixtures/error-contracts.json)。`baselineLine` 为旧版位置，`ordinal` 在各文件内对应调用次序。动态字段用两组明确合成值，初始化消息的两个分支均被记录；不是声称每个分支均执行过真实 HTTP 请求。
- 20 个 HTTP 用例覆盖未认证、未知接口、文章筛选/排序/分页、总览参数、文章与账号校验、凭据校验、快照/每日录入等错误，比较完整错误 JSON 与 HTTP 状态。

| 调用文件 | 调用点 |
| --- | ---: |
| shared/auth.mjs | 7 |
| src/security.mjs | 12 |
| src/storage.mjs | 4 |
| src/backup.mjs | 9 |
| src/worker.mjs | 24 |
| src/records.mjs | 48 |
| src/overview.mjs | 3 |
| src/analytics.mjs | 3 |

## 最小变动与传播

`src/lib/errors.mjs` 是唯一实现，`fail(status, code, message)` 立即抛出 Error。shared/auth 保留兼容导出并供本文件内部使用；security 的既有再导出未改。

原 shared/auth 的工厂返回错误对象，仓库调用方使用 `throw fail(...)`。保持这些调用语句：新 fail 在求值时直接抛出，仍进入相同 catch/finally 或异步拒绝路径，后面的语句不会执行。直接调用工厂返回 Error 的内部语义按任务书统一为抛出；不宣称这个内部返回值接口未变。

records 原有直接抛出实现改为导入。overview 的 3 处 `(code,message,status=400)` 改为统一顺序，显式保留 400 和溢出的 422。analytics 的 3 处内联 bad 改为 `fail(400,'VALIDATION_ERROR',message)`。未删除重复文章的旧 try/catch，未改变提交期映射。

测试额外检查现有校验函数同步抛出、catch/finally 顺序、异步拒绝和总览溢出 422。错误栈位置随工具移动，不作为外部协议；Worker 的错误响应序列化保持原样。基线快照不会由正常测试自动更新。
