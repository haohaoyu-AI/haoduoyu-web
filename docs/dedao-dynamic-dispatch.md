# 得到大脑事件动态派送

按钮先保存批次，再用现有 `dedao.writing_requested` 订阅唤醒父任务。原生批次入队只依赖已验证的该事件订阅与原有小鱼下游订阅；不要求之前某台电脑、某个 Codex 对话已就绪。网站不创建 Codex 对话，不改权限，不注册第二份订阅，也不设置后台轮询。

`connected` / `executor_connected` 仍表示实际执行连接；`accept_queue_ready` 只表示可以保存并发送事件。这两个状态独立，工具注册、配置布尔值、事件接受和创建任务都不会使原生执行就绪。

## 持久协议

1. 按钮保留 `request_key`，同键同篇数及所有并发启动只返回同一活动批次。一个活动批次的既有唯一索引保持。新原生队列先保存 `dedao_wake_outbox`，尚未取得真实任务身份时不创建 `dedao_batch_runtime`；读视图依据 outbox 明确标为原生，不能被旧 CLI 领取。
2. 每个 `owner / batch_id / queue_revision` 保存一个 outbox。首次 `pending → sending` CAS 才发送，事件 ID 为 `dedao_evt_<batch>_<queue_revision>`，数据仅为该批次与排队版本。回调 2xx 只记录 `accepted`，未知记录 `unknown`；按钮重试、刷新和读取不重发。发送中断后的 `sending` 也是未确认，不能用超时声称父未收到。
3. 父正常读取确切批次和当前授权电脑工具结果，再调用 `reserve_dedao_dispatch`：固定 `dispatch_key`、实际 `dispatcher_id / target_environment`、本次 `selection_ref / observed_at`。原子唯一赢家首个 `may_create=true` 才允许一次正常 Codex 任务创建。重复、其他键、未知回执、旧排队版本及时间流逝都不会再次授予创建权。
4. 父用 `record_dedao_dispatch` 记录真实创建或读取结果。`created` 必须含实际 `thread_id / session_id / turn_id`、真实工具引用和时间。该回执仅绑定当前队列；不设原生 session ready，不声称浏览器已登录。`unknown` 保留锁，读取同一 reservation 与实际目标任务后再记录真实结果。若首个 reservation 回执本身丢失，没有收到 `may_create=true` 的调用者先读取，不能据 `reserved` 推断尚未创建并补发。
5. `not_created` 只允许实际尚未发出创建请求，或正常工具明确拒绝且证明未创建。已为 `unknown` 的记录不能降级为 `request_not_sent`；必须有明确工具拒绝证据。新的尝试仍需原批次暂停并合法恢复产生新 `queue_revision`，同代不换键重建。
6. 子任务使用自身真实电脑检查和既有原生桥协议：注册、实际 bind、官方生命周期观察、90 秒内浏览器与可读下载检查、原子 claim。动态 claim 的数据库 CAS 同时匹配本代创建回执、实际 thread/session/turn；仅 `claimed=true` 才允许浏览器、文件和写作动作。私有桥凭据及 claim token 不进 outbox、调度记录或 UI。

## 恢复与换机

已领取的批次先保留原执行锁。心跳过期、网页断线、聊天空闲和另一个新 active turn 均不能证明旧执行停止。原执行者实际 `safe_boundary` 或精确官方工具观察确认原 turn 完成、中断、结束后，才允许恢复同一批次并选择另一台当前授权电脑。

父有实际官方 `read_thread` 等工具的确切旧 turn 终态结果时，可记录 `outcome=stopped, source=codex_app_tools`，要求匹配原派送的 thread/session/turn、本代 revision、原 runtime 领取身份；时间不得来自未来，也不得早于实际创建和当前领取/绑定更新。CAS 只冻结这一原批次的 claim、租约及动作，记录其安全边界，绝不修改原生 session 的当前 turn、state 或 ready，因此不会停止历史线程中新活跃的另一轮次。随后必须独立读取同一派送与批次确认已应用。

上述工具引用是本人授权调度者对正常工具结果的观察回执，服务器不独立认证 Codex 平台结果。不能编造引用、从按钮点击或超时推导终态。未领取但已创建的任务同样必须有确切终态，或明确未创建回执，才能重派；默认未领取边界不能被当成它已停止。

恢复保留同一批次、篇次、原得到对话与四条消息、既有动作 ID、最终版本、下载记录与实际字节 SHA、分块、上传文章 ID 及小鱼求助回执。每代派送保留旧绑定历史。已完成批次只读；新独立批次可选择新 Codex 对话，不要求旧 Codex 线程整体关闭。

## 迁移与验证限制

`0044_dedao_dynamic_dispatch` 只新增两个内容及凭据无关的表，并向原 runtime 加 `dispatch_mode`，旧记录默认 `fixed`。不重建原 runtime 表，不触碰旧触发器；`0000–0043` SQL 与 `0043` snapshot 保持原字节。新动态创建后才首次插入有真实身份的 runtime。既有固定 CLI / 原生任务保留兼容，安全恢复后可转为动态派送。

实际隔离 D1/R2 合成测试与本地 Worker 浏览器测试分别验证服务器和页面协议，不等于真实事件唤醒、本机 Codex 创建或得到写作验收。本次本机原对话只读在用户补充明确批准后成功，确认登录；只读不等于写作、下载或执行终态证据。exec/workspace 内部错误仍未恢复，实际文件字节未核验；页面载入的历史篇次与网站已提交篇次不同，不能据此推断旧回合结束或内容已同步。没有真实按钮、写作、下载或认领动作，历史 3/3 批次保留。只有该能力恢复、父独审和正常发布后，才可协调新的明确授权批次实测。
