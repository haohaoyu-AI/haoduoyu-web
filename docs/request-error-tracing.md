# 阶段 5c：请求与错误关联（设计检查点）

基线 24b5c5082a115cd9ee78e440c0848245079e6048，分支 opt/phase5c-request-error-tracing。
只做 E2；不部署、不改权限/env/schema，也不开始登录限流变更。

每次 fetch 用已有服务端 crypto.randomUUID 创建独立上下文，不采用客户端 X-Request-Id。
路由采用固定路径、动态 {id} 模板或受控 unmatched 标签；method 仅允许标准枚举，其他为 OTHER。
所有响应在出口追加 X-Request-Id，优先直接改可变 headers，immutable 时只以原 body stream
和复制 headers 新建 Response，不读取、解析、tee 或重新缓冲成功正文/静态文件/缓存 Blob。

错误 JSON 仅在构造时增加顶层 request_id，原 error/code/message/data/status 保留。
catch 是实际错误出口；另有恢复后幂等回执可携带 status>=400 的 returned 响应，需在重放
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

## 核心实现检查点

request-trace 模块只拥有服务端 UUID、受控路由/方法、不可变头复制及固定错误分类。
Worker 只把上下文传至路由和幂等重放；catch 构造时增加顶层 request_id，响应出口加头。
成功正文、静态字节、缓存流不读取或重新编码。幂等 status>=400 重放只给响应增加顶层字段，
不写回 receipt。所有最终500在统一出口尝试一条日志，日志失败不重试、不改变响应。

核心定向7项通过（最初两红转绿，另5项工具/流/安全分类检查）。这只是核心检查点，
完整权限/幂等/缓存/HTTP wire 与 OpenAPI/历史合同的严格投影尚待完成；不称全阶段通过。


## 合同与 HTTP 验证检查点

OpenAPI 保持 1.1.0。所有实际响应文档增加共用 X-Request-Id 引用；Error 顶层增加可选
request_id，不改变既有 required/error/code/message。恢复的幂等回执只在 status>=400
增加顶层字段；3xx 不增加正文字段，所有状态仍有新的响应头 ID。ID 不进入 receipt 或缓存。

历史对照 helper 对精确 X-Request-Id 验证 UUIDv4，再仅移除此头；错误 JSON 只在确认顶层
request_id 与头一致后移除此字段。嵌套业务同名字段、原有完整正文/状态/其他头继续比较。
真实 fixture 保留 rawJson、raw text 和原始 headers；成功正文不能获得顶层 request_id。
OpenAPI 对照逐个校验新增描述/schema/引用后，仅投影这些明确新增项，不忽略整个响应定义。

定向17项已通过，包括5类真实500、16并发请求、成功与恢复错误幂等重放、热总览缓存、
日志 sink 抛错、流零读取/不可变 headers，以及真实 loopback HTTP 登录 Cookie/CSRF、
GET/HEAD/304 和匿名错误关联。测试只用合成库，日志不输出生成的 canary 或认证值。
最初红灯仍只有2项；其余测试不是声称已在旧版执行的红灯。

已确认的既有边界：显式带 status=500 的异常，旧 catch 会将其 message 返回到 HTTP。
在固定基线与候选的同一合成注入中逐字段相同；本次安全日志不含该 message/name/cause。
这不是日志泄露，也不代表已修复 HTTP 既有反射，未来应独立决定是否改变错误合同。
HEAD 的 Fetch 内部错误 Response 保持旧 JSON body；真实 HTTP 适配层不发送 HEAD 正文。


## 独立审查发现的运行时出口缺口（尚未修复）

真实 Miniflare/workerd loopback HTTP 注入 throw null、throw undefined 和 Error.name getter
再次抛错三类异常，均返回运行时 text/plain 500，X-Request-Id 缺失，未经过新日志出口。
这是旧 catch 本身构造响应失败的旧边界，普通异常响应的全部合同测试不能证明覆盖这些值。
第一次诊断使用超过当前 workerd 支持的日期，启动失败，不作为 HTTP 证据；改用已支持日期
后3项实际成功发起请求并观测上述结果。没有生产访问或真实秘密。

建议最小差异：仅当原错误分类/响应构造再次抛错时，外层兜底创建已有通用 INTERNAL_ERROR /
服务暂时不可用 的 JSON 500，再走相同安全头/请求ID/单条日志出口。不改已有受控错误的
status/code/message 或成功流；但旧运行时 text/plain 500 会改为受控 JSON 500，这是明确
行为差异，先交主线程审查，不默默实施。当前实现尚不能宣称所有运行时500完整关联。


上述运行时边界的旧新6条实际 HTTP 元数据见 request-error-tracing-runtime-boundary.json。
原始本地诊断日志与脚本保留在 /workspace/scratch/phase5c-runtime-*，不将启动失败当观测成功。
完整回归还发现旧缓存测试比较两次请求的全部头，因新增请求ID必然不同而失败；修订为验证
两个UUID且彼此不同，再仅投影此新增头，其他头/正文仍全等。单项复测通过，原失败日志保留。
