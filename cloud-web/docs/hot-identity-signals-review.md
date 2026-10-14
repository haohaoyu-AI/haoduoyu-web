# 热文连续身份信号核对

基线：`90631880e59b15c059f3668c70a7c67c296ab446`。首次 focus 身份 GET 未返回时，后续 focus/visibility 原先被 `identityBusy` 丢弃；旧账号 A 的迟到响应仍可显示账号和热文，并恢复刷新按钮。

每次身份信号现在立即作废旧 ticket、隐藏尚未核对的账号/热文/添加表单并禁止 mutation。一个身份 GET 正在执行时，信号合并为一次后续 GET；若后续 GET 期间再有信号，继续只核对最新一轮。隐藏标签页的信号只作废响应，待可见信号再读取。身份 GET 沿用现有 10 秒期限。

最新核对网络失败后，旧成果与未知请求键保留在内部，但继续隐藏，按钮只允许 GET 重核。确认同 owner 后才恢复原成果和请求键；用户可显式续接，读取不会自动 POST。401/403、缺失 owner scope 或 owner 变化继续清除旧受保护状态和请求键。身份核对不释放正在执行的 POST 写锁，迟到 POST 也不能恢复旧视图。服务端 owner 校验与副作用门禁未改动。

`tests/hot-identity-signals-ui.mjs` 执行实际页面 hooks/callback，通过仅内存的 discovery transport 覆盖连续信号、迟到 A/最新 B、信号突发、超时失败、隐藏/可见、卸载、未知请求键恢复、401/403 和 POST 写锁。额外覆盖挂载初读仍未完成的场景：初读可以与一个身份 GET 并存，两者旧 ticket 都受 fence 约束。因此“一个活动 GET”仅指身份队列，不是全页面所有读取。隐藏标签页不发起 GET 的断言也仅指身份信号路径，挂载初读仍保留原行为。

同一测试对基线源文件得 **1 pass / 9 fail**，修复源文件得 **10 pass / 0 fail**。基线源 SHA-256、逐案结果和日志保存在 `/workspace/scratch/haoduoyu-three-review-20261014/hot/`：`baseline-page.tsx`、`baseline-red-results.json`、`baseline-red.log`、`fixed-results.json`、`fixed.log`。测试可通过 `HOT_IDENTITY_TEST_SOURCE` 读取只读源快照，通过 `HOT_IDENTITY_TEST_RESULTS` 保存结果。

原 19 组离线交互仅同步一个直接受影响的 focus 断线期望：先隐藏并只读核对，再由用户使用同 nonce 续接；保留普通 POST/回执断线成果、owner scope、nonce 和无自动重放断言。原期望失败记录在 `interaction-before-expectation-update.log`，同步后结果在 `interaction-after.log`。本轮不调用浏览器、外部 API、真实平台或生产写入；这些测试不代表部署或生产验收。
