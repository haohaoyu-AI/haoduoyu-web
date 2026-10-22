# 阶段 5c：请求与错误关联（设计检查点）

基线 24b5c5082a115cd9ee78e440c0848245079e6048，分支 opt/phase5c-request-error-tracing。
只做 E2；不部署、不改权限/env/schema，也不开始登录限流变更。

每次 fetch 用已有服务端 crypto.randomUUID 创建独立上下文，不采用客户端 X-Request-Id。
路由采用固定路径、动态 {id} 模板或受控 unmatched 标签；method 仅允许标准枚举，其他为 OTHER。
所有响应在出口追加 X-Request-Id，优先直接改可变 headers，immutable 时只以原 body stream
和复制 headers 新建 Response，不读取、解析、tee 或重新缓冲成功正文/静态文件/缓存 Blob。

错误 JSON 仅在构造时增加顶层 request_id，原 error/code/message/data/status 保留。
catch 是实际错误出口；另有恢复后幂等回执可携带非 2xx status 的 returned 响应，需在重放
构造点加顶层 request_id，不改变 data 或持久化的 response_json。每次 replay 都使用新 ID。
成功 JSON 不加业务字段，缓存与幂等回执均不存 ID。

出口按最终 status===500 尝试一条 JSON 日志，throw/returned 均覆盖，非500不新增错误日志。
日志只包含 rid/method/route/name/message；类别由受控 builtin 分类或固定 returned/unknown
标签决定，消息为可审核固定文字，不读取任意 error.name/message/stack/cause/嵌套对象。
日志写入抛错被隔离，不破坏原响应。不把错误对象或请求头/正文/原URL交给日志序列化。

现有 catch 对显式 status=500 的异常会保留自身 code/message；如果合成 canary 证明 HTTP
既有反射，单独报告，不为凑日志而改变原合同。HEAD API错误在 Fetch 内可有旧 JSON body，
真实 HTTP HEAD 仍无正文；保留原语义，验证 wire。静态HEAD与304继续保持空body。

OpenAPI1.1.0仅增加共有响应头说明和错误顶层可兼容字段。历史合同严格投影准确新增头及
顶层字段，并验证 UUID 与对应头相同，其余字段/头/状态不忽略；保留 raw response 供新测试。
本轮不重跑无关四宽或大基准。115637B与strictPNG缺口继承，不宣称解决。

## 初始红灯

在基线24b5c50产品上执行 node --test tests/request-error-tracing.test.mjs：
2项实际失败，/health没有服务端关联头；实际500返回时结构化日志为0而期望1。
错误JSON关联与后续日志字段断言尚未执行，不把它们称为基线已动态失败。
原始安全日志保存在 request-error-tracing-red.log；当时新增测试尚未提交，随本检查点保存。
