# 家里电脑原生执行说明

Codex 执行对话由父任务在按钮事件到达时，按当时授权电脑动态创建。执行端 `native-codex:<实际 thread UUID>`、浏览器会话及实际 turn 必须来自该任务的正常工具元数据；历史固定对话不作为新批次前置条件。文章操作只使用 Codex 内置电脑插件，在原得到对话 `https://www.biji.com/writing/6aa3c781dd3446e897981a7c` 执行。

## 连接和下一回合续接

1. 用 `requestMeta` 读取当前实际 thread/session/turn，检查已登录的 Edge、原得到对话及可读下载目录。用本人正常授权 MCP 的 `register_dedao_executor` 回传本次检查，不能复用未经重新检查的旧布尔值。
2. 注册响应只缓存于私有工具内存。启动 `install-credential.mjs` 后等它显示 `Ready for private registration JSON on stdin (input is hidden)`，再经正式隐藏 stdin 通道传入一行 `{native_bridge,turn_id,endpoint}`。不要打印私有响应，不把凭据放入命令或明文文件。helper 保存到 `%USERPROFILE%\.haoduoyu-dedao-native\<thread_id>\vault.json`，使用当前 Windows 账户 DPAPI。
3. 从 `client.mjs` 导入 `nativeCall`；它从 DPAPI 读取凭据，不将凭据或认领令牌写进日志。下一回合先调用 `recordActualCurrentTurn(folder, actualMetadata)` 保存实际运行时身份，不能生成或猜测 turn_id。
4. 用 Codex 官方 `read_thread` 读取这同一对话。若原批次属于前一回合，必须看到那个确切 turn 的 `completed` 或 `interrupted` 记录才可核对释放；缺证据时保留原锁并停止新动作，不能用空闲、心跳过期或新回合代替。
5. `nativeCall(folder,'bind',{lifecycle_source:'codex_app_tools',wake_id:<实际 automation ID>,wake_state:'ACTIVE'})` 必须引用现有已验证 `dedao.writing_requested` 事件订阅的实际唤醒入口。不得填写虚构 ID，不另建订阅或轮询。网站启动先持久入队，父任务按 `dedao-dynamic-dispatch.md` 预留并记录实际新任务，再由该任务核验电脑与生命周期。配置、事件接受与执行领取须分别验证。
6. 用 `native_lifecycle_observation` 回传 `source:'codex_app_tools'`、独立 event_id、实际状态、实际观察时间和工具记录引用。新 active 回合核对旧执行时，附真实 `previous_turn:{turn_id,state,observed_at,observation_ref}`；state 只能为确已看到的 completed/interrupted。全部时间统一为 JS `new Date(...).toISOString()` 的 UTC 毫秒格式。观察文件保留在 `observations`；未知网络结果只重传同 event_id 和原参数。检查服务器 `recorded/applied` 与页面连接状态，不把注册或 bind 当作验收完成。

hooks 是可选方案；本次正式连接不依赖 CLI 或 hook 信任窗口，不声称可选 hooks 已安装或获信任。

## 本机 API 通信入口

正式入口是 `scripts/dedao-native/control.mjs`。它只做已授权 API 通信和原 Word 文件传输，不启动 Codex CLI 或另一个文章执行器。原 `.sites-runtime/native-control.mjs` 保留为相同入口的兼容包装。

普通操作的 payload 仅包含非秘密身份和动作参数，可由 PowerShell 单行 JSON 管道提供。`$actualThread`、`$actualSession`、`$actualTurn` 必须取自根执行端当前真实元数据，不能自行填写推测编号；例如只读原批次：

```powershell
@{thread_id=$actualThread;session_id=$actualSession;turn_id=$actualTurn;operation='read';args=@{batch_id=$actualBatch}} | ConvertTo-Json -Depth 8 -Compress | node .\scripts\dedao-native\control.mjs
```

管道必须使用 UTF-8；Windows PowerShell 5.1 给本机程序传含中文的标题或路径前，将该会话的 `$OutputEncoding` 配置为 `[System.Text.UTF8Encoding]::new($false)`，避免默认编码损坏中文。PowerShell 7 的默认 UTF-8 管道可以直接使用。

`claim` 的 args 为原 batch_id 和最新 queue_revision，helper 在 HTTP 前生成并 DPAPI 保存本批次 claim_token；未知结果复用它。后续动作只传 batch_id、ordinal 和对应公开参数，token/execution_id 由本机注入，输出递归移除凭据、token 和文件字节。`uploadfile` 在 payload 根级另给真实绝对 `filepath`，核对服务器下载记录后每块得到 `stored:true` 才继续。只有安装凭据的 payload 含秘密，必须使用上述正式隐藏 stdin 通道，不能放进普通 PowerShell 管道命令文本或明文文件。

当前 Sites 外层登录验证需要复用已授权 `get_site` 返回的现有 `siwc_bypass_bearer_token`。只经隐藏 stdin 可选字段安装并保存到 DPAPI；请求添加 `OAI-Sites-Authorization`，应用 `Authorization` 仍使用窄范围原生桥凭据。不得新创建或旋转该 token，不改变网站访问范围，不将它放入页面、提示词、日志或普通操作参数。

## 每篇的实际 API 顺序

从网站“求助成文”按钮填写正整数并启动，只对当前明确授权的新验收批次执行；历史已完成批次与 1/3 验收记录只读，不为测试重做。先 `nativeCall(...,'read',{batch_id})` 核对原批次、排队版本、篇次、旧意图、文件与小鱼记录，再 `claim`；helper 在发出认领 HTTP 前生成 UUID 并先存入当前 Windows 用户 DPAPI 保护的私有存储，未知认领保持原 execution/token。只有 `claimed:true` 才能动浏览器。

每篇按 `recommend → adopt → framework → finalize → download` 顺序：

- 每次先 `begin_dedao_action`，仅 `execute_action:true` 允许执行一次。发送接口返回的原定消息，等待实际回复完成；对方已主动推进则记录 `auto_advanced`，不要重复发送。
- 消息完成用 `confirm_dedao_action` 保存实际回复引用。正文、审稿、事实核查时可以用 `record_dedao_progress` 回传真实阶段；它不能替代定稿确认。
- 若团队已完成审稿修正后停下来询问，而实际事实核查尚未发生，先持久保存真实阶段观察和唯一推进意图，再核对原对话仍停在该阶段，只发送一次“继续送吴查查事实核查，并按核查结果修正后交出最终稿。”。这条消息只推进已有流程，不添加内容意见；等待真实核查、修正和最终稿。生成中、已自动进入事实核查或发送结果未知时，先核对原对话与意图记录，不重发此句或默认四条消息，也不能提前定稿。不扩充动作枚举或改写服务器阶段事实。
- 最终稿确认后，打开本篇最新正文并真正下载 Word。读原文件，核对标题、实际文件名、绝对路径、大小、SHA256、正文版本和浏览器来源，调用 `record_dedao_download`。保留原文件；下载不明确先检查文件及记录，不重新下载，不自造 DOCX。
- 用 `upload_dedao_word_chunk` 按固定上传对象及原文件偏移传输，每块最多 48000 字节，再 `finalize_dedao_word_upload`。未知上传核对同对象、偏移和 hash，不新建文章或改稿。
- `submit_dedao_item` 为该固定文章触发一次“求助小鱼”。用真实服务器记录确认“已提交，等待小鱼接手。无需再次点击。”；此后本篇才完成，才能开始下一篇。已提交文章不再生成、上传或求助。

## 租约、暂停和恢复

执行租约为 180 秒，等待得到回应期间每约 60 秒用 `heartbeat` 续本批次原执行，保持每次等待短于 60 秒。领取前浏览器检查必须在 90 秒内；重新核实登录和下载目录后通过 MCP 注册，新的私有凭据同样隐藏保存。仅心跳不证明浏览器登录。

桥凭据有效期为 30 分钟，执行中提前用 `refresh` 续当前已绑定回合，helper 会同步 DPAPI 的实际 expires_at；refresh 不领取、不激活、不恢复。凭据已经过期时必须通过本人 MCP 重新注册，保存新凭据后核对原批次，不能绕过过期。租约已经过期也不能靠心跳复活或偷领原执行。

接口 401 仅表示凭据确实缺失、格式错误或查询确认失效；认证查询或运行时暂时失败会返回 503，保留现有私有凭据和原任务。先等服务读取恢复，核对同一批次、动作和文件记录，不把 503 当作必须重新注册，也不重发任何结果未确认的写入。页面暂存的旧连接和进度不证明执行仍在继续；暂停请求结果不明时须等待真实回读。

网页登录失效、文件不明、提交不明等，用 `pause_dedao_batch` 保存具体原因；执行端确认已停止本批次所有浏览器、文件和状态动作后才调用 `safe_boundary`。这只确认本批次停止，不表示聊天或 CLI 进程退出。网页允许恢复后点击“恢复当前批次”，重新 read、核对旧意图与新 queue_revision 后认领原批次。未知中断在下一真实回合先核对原 turn 记录，不能另建重复任务。

四篇的完成依据必须分别来自实际标题、原 Word、上传对象、小鱼回执及时间。旧测试和旧文章不计入本次验收。
