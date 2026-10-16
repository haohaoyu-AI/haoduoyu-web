# 得到大脑：Codex 原生电脑插件执行

网站保存批次、每条发送意图、最新稿件下载身份、上传对象和小鱼提交回执。本机已绑定的 Codex 对话使用内置「电脑 / Computer Use」插件操作登录得到大脑的 Edge。选题、标题、框架和最终稿全部来自指定得到大脑对话。

## 执行身份与连接

原生执行端使用 `native-codex:<实际 thread UUID>`，浏览器会话使用 `native-session:<实际 session UUID>`。执行轮次使用 `native-turn:<实际 turn UUID>`。实际身份来自本对话的 Codex 应用工具和请求元数据，不以随机任务名、网页连接状态或聊天空闲代替。

本人通过已有网站 MCP 调用 `register_dedao_executor`。此工具保持既有能力参数兼容，按执行端身份前缀识别原生连接。检查项包括 Computer Use 可用、指定得到大脑对话已登录、Edge 能操作、实际下载目录可读取。注册返回短期 `native_bridge` 私有凭据；尚未绑定真实轮次、验证生命周期及任务唤醒时，执行端仍未就绪。

本机辅助连接通过 `POST /api/dedao/native` 完成绑定和任务通信。请求头为 `Authorization: Bearer <短期私有凭据>`、`Content-Type: application/json`，正文为 `{ "operation": "操作名", "args": { ... } }`。凭据通过隐藏输入交给本机辅助连接，保存在易失内存或当前 Windows 用户受保护存储。不得放入提示词、网页、URL、操作记录或日志。

此接口不接受网站浏览器的 Cookie 或访问者身份代替私有凭据，不开放 CORS，拒绝浏览器 Origin 和 Sec-Fetch-Site 请求，返回 `private, no-store`。请求上限为 100000 字节，足够传输既有 48000 字节 Word 分块。

只有凭据缺失、格式错误或查询确认不匹配/已过期才返回 401，要求正常本人授权续接。认证查询、运行时或存储故障返回 503，表示服务暂不可用，不能据此宣称凭据失效。日志仅包含固定错误类别和服务器生成的 request_id，不记录异常消息、SQL、请求头或凭据。503 时网页保留上次真实任务视图，暂时禁止启动和恢复，等待读取恢复后先核对原批次；暂停请求不明确时也不能声称已暂停，不盲目重试写入。

`bind` 绑定实际 `thread_id`、`session_id`、`turn_id`，选择 `lifecycle_source: "codex_app_tools"`，保存实际唤醒 automation 的 `wake_id` 和 `wake_state: "ACTIVE"`。这些配置声明本身不会使连接就绪。

本机执行者使用实际 `mcp__codex_app__read_thread` 和 `nodeRepl.requestMeta` 读取当前对话、会话、轮次及状态，然后通过 `native_lifecycle_observation` 回传 `{ source: "codex_app_tools", thread_id, session_id, turn_id, state, observed_at, observation_ref, event_id }`。`event_id` 是该次观测的 UUID，`state` 使用实际工具结果所支持的 `active`、`completed`、`interrupted`、`idle` 或 `ended`。引用和时间须对应真正执行的读取，不能虚构工具调用或把聊天空闲解释成 CLI 退出。

服务器校验身份、顺序和原批次绑定，保存执行者诚实回传的观测；它不独立认证 Codex 应用状态。未收到真实观测时，网页显示「原生生命周期尚未通过本对话工具验证」。本次采用本对话工具验证，不要求用户配置 CLI 钩子或寻找未经核实的桌面信任入口。

真实生命周期钩子是可选增强，用于即时记录 `Stop`、`Interrupt`、`SessionEnd` 和 `UserPromptSubmit`。只有真正安装、获信任且收到真实 `source: "hook"` 回执时才记录 `hooks_ready`；本次未安装钩子，不会把工具观测伪装成钩子回执。

接口还支持 `refresh`、`read`、`claim`、`heartbeat`、`native_lifecycle_observation`、可选钩子的 `lifecycle`、`safe_boundary` 与既有写作、下载、上传、提交、异常暂停步骤。执行身份由私有连接注入，不能借此操作另一对话或轮次。

网页只读取 `/api/dedao` 的公共任务视图。该视图不包含私有凭据，显示执行方式、实际对话和轮次、轮次状态、最近观测时间及具体缺项。尚未完成原生连接时显示「执行端未连接」。旧 CLI / CDP 连接单独标识，不能满足本页的原生执行条件；不会引导用户启用远程调试来完成原生连接。

## 启动、暂停和恢复

用户在网站「得到大脑」填写正整数篇数，点击「求助成文」。服务器保存唯一批次与当前 `queue_revision` 的持久事件 outbox，经已有 `dedao.writing_requested` 订阅唤醒父任务，不设置固定电脑、固定 Codex 对话或后台轮询。父任务先读取确切批次，再通过 `reserve_dedao_dispatch` 为当前授权电脑原子取得一次新建许可；仅首个 `may_create=true` 允许用正常 Codex 工具创建一个真实任务。父任务保存实际 thread/session/turn 回执，执行电脑再核对原得到对话、浏览器登录和可读下载目录，经原生生命周期验证后原子领取。网页按钮保留稳定启动键，防止双击、请求未知和刷新产生重复任务。订阅已验证、回调接受、实际任务创建、电脑能力验证与原子领取是分别记录的事实；只有最后的 `claimed=true` 允许写作动作。创建回执未知时读取同一派送记录和实际任务，不凭超时新建第二个任务。详见 `dedao-dynamic-dispatch.md`。

网页点击「暂停当前批次」会停止当前批次的新写入授权。原生执行者读取同一任务后停止发送、下载、上传及小鱼提交，并确认该批次的 `safe_boundary`。这只表示该执行者的本批次写入已经停止，不表示聊天关闭、原生轮次结束或 CLI 进程退出。

原生轮次停止、中断或会话结束，须有匹配实际对话、会话和轮次的真实工具观测，或可选的真实钩子回执。新轮次变为 `active` 不会自动释放旧轮次正在执行的批次。未知中断保持原批次；下一真实轮次先使用 `read_thread` 核实旧轮次已 `completed` 或 `interrupted`，再附 `previous_turn: { turn_id, state, observation_ref, observed_at }` 核对并冻结该确切旧轮次。

聊天空闲、网页关闭、心跳失效均不能作为旧轮次结束证据。缺失证据或暂停结果不明时，网页说明原因并保持原批次；不启动第二路执行。

恢复仅作用于已保存原批次，在原生连接正常且已确认本批次无写入，或已核实原生轮次结束后进行。每次恢复都先核对已确认消息、下载文件、上传文章和小鱼提交，已提交条目只读，不重复生成、上传或求助。

## 每篇文章和真实验收

固定使用 `https://www.biji.com/writing/6aa3c781dd3446e897981a7c`。四条消息及串行规则由现有 `dedao-contract.ts` 冻结。每次发送前先记录意图，发送后等待真实回应完成；自动进入下一阶段则继续等待并记录真实观察，不重复确认。

定稿后打开本篇最新正文版本，真实下载 Word，核实标题、实际文件名、绝对路径、字节数、SHA256 和最终稿版本。保留原文件及记录，通过既有分块上传与 Word 解析接口创建已冻结的文章对象，再复用求助小鱼逻辑。只有服务器确认真实提交回执后才计为完成，并开始下一篇；不等待配图或平台发布。

真实验收从网站按钮先启动新 1 篇批次，提交成功后再启动新 3 篇批次。保存两个批次和四篇各自下载、上传、小鱼提交与时间记录。旧文章、连接测试和离线测试不得计入。登录、发送、下载、上传、求助结果未知时先读取已有记录；不能制造 Word、模拟阶段、手动改状态或盲目重试来替代验收。

## 旧执行包

`dedao-executor.zip` 与 `Verify-1-Then-3.cmd` 属于旧 CLI / CDP 路径。保留兼容源码和历史记录时须明确其执行方式。原生 Codex 对话不使用 `reserve_dedao_launch` 或 `end_dedao_execution` 来声称完成连接或进程退出。
