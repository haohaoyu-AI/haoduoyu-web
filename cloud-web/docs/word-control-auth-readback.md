# Word 控制未知结果与只读回查

本补修仅涉及前端响应处理。`/api/word-recovery` 的 401/403 在 JSON 解析前识别，同一客户端任务隐藏旧私人详情并拒绝重复控制写入。Home 使用捕获的 owner 回调清空私人工作区，旧 owner 的晚回调不能清理新 owner。

20 秒网页等待超时、网络失败、畸形成功回执及错误 attempt/意图/版本都显示“操作结果未确认”，保持同任务控制写入围栏。超时仅终止网页等待，不证明后台已停止，不自动重新 POST，不创建执行、claim、预约或消费。成功意图回执须完整、与本次 intent 相符、保留相同 attempt，并递增已知控制版本与 epoch；更晚的本站控制记录仍优先。

围栏可通过现有“重新读取进度”解除：必须明确发起正常 GET，收到同 target/input/attempt 的完整新快照，服务端观察和 attempt 读时钟更新，控制版本未倒退。`readback` 保存实际成功 GET 的原始 DTO，`readbackStartedAt` 使用与组件相同的 `performance.now()` 单调来源证明请求在未知结果之后开始；它不是服务端终态、保存字节或结清证据。列表、轮询投影、存储内容、旧 GET、失败 GET 及伪客户端字段不能代替该回查。正式 GET 的安全暂停可恢复现有续接按钮；正式新 generation 有自己的控制范围，不继承旧未知锁。

桌面兼容页连接既有同源 `GET /api/local-word-jobs/:id`，只读取已选定任务。bridge 回调可更新显示，不能填充回查证明。读取核对 job ID、冻结输入、`local_desktop`、`word_only` 和空 destinations；旧 target/input/attempt/generation/epoch 的晚读取不能回灌，401/403/404 先隐藏详情。本人正常登录后可在仍打开的连接页重新读取同一任务。完整浏览器重载已清除 fragment，不能凭空重建 nonce 或旧任务；需要从本地版现有“求助小鱼”入口正常进入。本补修没有新增本地 HTTP 路径、bridge POST、批次导入或 dispatch 能力。

`validateWordProgressDto` 是共享前端 DTO 结构检查，阻止缺少 save/execution 等字段的快照进入回查证明、merge 或详情渲染。它不授予执行权限，也不改变独立成果读回与安全结束门禁。旧凭据 1000 ms、服务端 CAS、attempt/epoch、保存及结清合同保留。

离线专项使用实际源码、合成 React hooks、延迟 fetch/Abort 和惰性 bridge；无本地网络、真实电脑、模型或平台调用。新 `word-control-auth-unknown-ui.mjs` 在固定 35 源码为 5 通过 / 10 失败，修后 15 / 15；桌面实际源码专项为基线 1 通过 / 52 失败，修后 53 / 53。原始红与修后日志保存在 `/workspace/scratch/haoduoyu-independent35-20261014/remaining/word-auth-unknown-fix/`。原控制排序 17、超时 5、Home 进度读取 24、Word 展示 12、phase-pool、serial/settlement，以及旧 Desktop page 13 / bridge 28 均通过，TypeScript 退出 0；定向 lint 仍有基线 14 条既有错误，无新增规则消息。实际电脑落盘、整合构建和浏览器验收由父级单独处理，前端 GET 成功不代表桌面交付成功。
