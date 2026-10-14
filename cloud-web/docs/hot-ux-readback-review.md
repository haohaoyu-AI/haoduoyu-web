# 热文已确认扫描与迟到账号操作的只读收敛

基线为 `35b306acba5672a6b6dae9e4909f95da3a91d89b`。此前独审已用实际页面与实际 store/parser/SQL 的合成环境复现两个 `90631880` 已有的 UX 缺口：同本人 GET 已返回当前 request_key 的已保存扫描，下一次刷新仍沿用旧 key，只回读旧扫描；add/remove 在途时身份 GET 先读旧账号池，随后成功 POST 回执被围栏丢弃，旧池停留到下次身份读取。它们不改变35的连续身份信号独审结论。

本候选只调整 `app/imitation/page.tsx`：

- 最新 GET 被接受，且同已核验 owner、scan.request_key 精确匹配当前 intent 时，消耗已确认 nonce。其他 key、scan=null、读取失败或旧 ticket 保留未知 nonce。身份改变、401/403 和缺失 scope 仍清除旧保护状态。GET 不自动 POST，不释放在途 POST 锁。
- POST 失败后的精确 receipt GET 已确认同 key 扫描时，以实际 scan.request_key 判断成功，避免 nonce 已被 GET 消耗后显示原 POST 错误。
- add/remove 结算时，若该写入的 ticket 已过期而当前 owner 仍是它冻结的同本人，则在原写锁 finally 释放前作废旧池并排队正常身份 GET。已有身份 GET 被围栏丢弃后合并一次后续 GET；隐藏页仅排队，待可见再读。成功或网络结果不明均不重放 POST。已确认 B、已清空 scope、卸载时的旧 A 回执不触发读取或恢复旧视图。迟到 POST 数据不回灌。

`tests/hot-ux-readback-ui.mjs` 直接转译实际页面及实际 fence/genre 模块，替换 hooks 调度与 discovery transport。17组包含同key/其他key/null/旧GET、网络失败、receipt成功反馈、collecting poll、owner/auth隔离、旧池已读/身份GET在途两种写入时序、迟到失败、隐藏、卸载、失败后的 GET-only 重核和原POST写锁。使用 `HOT_UX_TEST_SOURCE` 读取只读源快照、`HOT_UX_TEST_RESULTS` 输出结果。

实现者验证：基线35 **10 pass / 7 fail，exit1（预期红）**；候选 **17 pass / 0 fail，exit0**。原 hot identity10、offline交互19、candidate-render、discovery-races、discovery-clock3及owner10均exit0；TypeScript和定向lint exit0、diff-check exit0。首轮新测试的 `module` 局部变量被Next lint规则拒绝，改为 `evaluated` 后定向lint通过；原失败日志保留。不声称全站lint或build已由本实现者重跑。

独立worktree的实际App + Chromium：1440桌面和390触屏各8场景，共16/16，包含本次 matching nonce、add读回、remove在途身份GET收敛及原连续信号/hidden/unknown nonce/POST锁/auth边界。业务API均为明确合成响应，未知API和非loopback阻断，SW禁用，focus/visibility为确定性合成事件。page errors、未知业务、外部请求均0，无横向溢出；页面源码SHA前后相同。

精确命令、红绿结果、失败日志和合成截图位于 `/workspace/scratch/haoduoyu-hot-ux-next-20261014/`。这些属于实现者验证；新候选由另一审查者独立验收，不沿用原35独审资格。没有backend/schema改动，没有生产部署、真实采集、调度、provider或平台验收。
