# 原生 Codex 电脑插件生命周期桥

这套桥接只连接当前家里电脑上的原生 Codex 对话，不启动 CLI，不控制浏览器，不写文章，不代替真实小鱼提交回执。现有 CLI 包不能冒称已使用电脑插件。

## 当前连接方式

当前任务使用 Codex 官方应用工具读取同一原生对话的真实回合状态，并用运行时 `requestMeta` 绑定当前 thread/session/turn。根执行端在内存中调用 `client.mjs` 的 `nativeCall(folder, 'native_lifecycle_observation', {...})` 回传 `source:codex_app_tools` 与真实读取记录引用；原生身份改变时先用 `recordActualCurrentTurn` 保存实际元数据。不能把自行推测或聊天空闲当作官方观察。

原生执行端明确停止该批次全部动作后用 `safe_boundary` ACK；发生未知中断时，在下一实际原生回合先读取原对话记录再核对恢复。这个事实与 CLI 进程退出无关。hooks 是可选补充，未安装或未信任时不能声明 `hooks_ready` 或 `hook_trust_confirmed`。

## 本机凭据

正常本人已授权 MCP 注册 `native-codex:<真实 thread_id>` 后，执行端把私有注册响应直接通过标准输入交给 `scripts/dedao-native/install-credential.mjs`。另附当前真实 `turn_id`；不得把密钥粘贴进提示词、终端命令、网页或日志。TTY 输入先启用 raw mode 关闭回显，再显示 `Ready for private registration JSON on stdin (input is hidden)`；收到一行 JSON 后立即解析、恢复 raw mode 并暂停输入，不等待 EOF。正式私有输入通道直接传入内存中的注册响应，不建立明文文件。

本机文件在 `%USERPROFILE%\.haoduoyu-dedao-native\<thread_id>`。`vault.json` 使用 Windows CurrentUser DPAPI，目录权限限制为当前 Windows 账户。`binding.json`、`outbox`、`receipts` 不保存密钥或文章内容。凭据过期必须经正常授权 MCP 重新注册；hook 不能绕过过期或自行登录。

如 Sites 外层登录要求授权 header，只复用正常已授权 `get_site` 返回的现有 `siwc_bypass_bearer_token`，由同一隐藏安装通道保存到 DPAPI。helper 同时发送外层 `OAI-Sites-Authorization` 与应用窄范围原生 `Authorization`；不得新 mint/rotate token，不改变访问范围或公开任何凭据。

## 生成可审阅 hooks

用本机 Node 运行 `scripts/dedao-native/prepare-hooks.mjs --thread <真实 thread_id>`。输出 `hooks.review.json` 的绝对路径和 SHA256，明确标记 `installed:false`、`trusted:false`。此操作不会修改 Codex 设置或信任数据库。可选安装位置是当前用户 `~/.codex/hooks.json` 或已信任项目的 `.codex/hooks.json`；已有 hooks 必须保留并合并，不覆盖。当前实际任务不依赖启动 CLI 或安装这些 hooks。

官方说明要求用户审阅并信任当前 hook 定义，新建或改变定义会被跳过。官方明确给出的审阅入口是 Codex CLI 的 `/hooks`；本次查询到的官方文档没有明确列出 Codex 桌面信任面板的名称和点击路径。不能据此声称桌面授权已完成，不能修改信任数据库或使用跳过信任参数。实际桌面若显示审阅提示，用户须在该 Codex 窗口审阅当前文件；若没有受支持入口，网站应保持“执行端未连接：原生生命周期 hooks 尚未审阅信任”。

来源：[官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)、[官方插件打包文档](https://developers.openai.com/plugins/build/plugins)。自有插件 hooks 需手动安装，且不能提交公共插件目录。

## 真实事件与恢复边界

`UserPromptSubmit` 保存实际回合编号；`Stop` 表示回合停止；`Interrupt` 表示主对话被中断；`SessionEnd` 表示原生会话结束。Stop 不表示程序退出。SessionEnd 的官方输入没有 turn_id，本机只关联最后已真实观察到的当前 turn_id，不制造编号。

每次实际事件先写独立 UUID 到 outbox，再发送 `/api/dedao/native`。网络结果不明确时保留同 event_id；`flush.mjs --thread <真实 thread_id>` 只重传原事件，不重放发送、下载、上传或求助。结果不明确、目录锁仍在或凭据过期时必须核对原记录。

网站暂停先冻结新操作。原生 executor 明确停止该批次全部浏览器、文件、状态动作后才能报告 `safe_boundary`；模型主动 ACK 与真实 Stop/Interrupt/SessionEnd 回执分别保存。网站恢复保持原批次，先核对所有未明确动作和已提交记录。注册或聊天空闲不会自动证明可恢复。

准备文件和离线测试不是 hooks 实际运行的证明。`hooks_ready`、`hook_trust_confirmed`、`wake_ready` 必须有实际信任、原生事件回执和受支持唤醒验证后才能设为真。
