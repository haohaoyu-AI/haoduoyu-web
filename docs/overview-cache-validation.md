# C5 总览缓存验证与边界

本阶段只修改总览读取与缓存所需的内部一致读回调参数，没有新增 API、数据库迁移、运行时依赖、静态资源或 UI 变化。基线为 main 60c896d11e0e755785589f83cb1bd2522fc548c3；C4/C6 及后续拆分尚未执行。本分支未合并、未部署。

## 红绿与正确性

最初 `node --test tests/overview-cache.test.mjs` 使用基线已构建 Worker 的真实 D1 测试失败：同 revision 热请求的 SQL 实际为 8，期望 3，1 项中 1 项失败。新增缓存后同一用例通过；不是把原有业务功能通过伪称修前失败。原日志保留在本地 `/tmp/haoduoyu-c5-red.log`。

- 完整本地 `npm test` 为 169/169，通过后又增加一个共享 reader 失败用例，纯函数 9/9 单独通过。没有把这些计数相加声称本地完整跑过 170。
- 远端 dc341245 的 PR CI 39750302351 与 push CI 39750296576 均成功；完整测试 170/170，8 项资源校验与两个回环预览通过。最终交付头的 CI 状态在 PR 中另核实。
- 纯函数覆盖 DB/revision/query/identity/permissions/scope 隔离、null 与空 scope、规范化、LRU、超大拒收、分配前预留、并发 pending/hot 租约预算、读完/取消/从未消费/进行中取消、单读者失败不提前释放其他读者、失败项退役及并发发布。
- 实际 D1 覆盖热命中仍鉴权和两次控制读取、revision 改变 miss、五轮冲突 BUSY 且无未发布残留、C2 冷/热失败、真实 scoped key、空作用域、移除 read 权限、撤销凭据、热命中被弃后重新鉴权。
- 与旧版逐次比较完整正文、状态和全部响应头：默认/7d/30d、Top N、平台、重复参数末值、重复 period 鉴权前错误、非法 period/account/Top 的错误优先级、未知参数、混合账号/文章每日数据、真实 0/缺项、METRIC_OVERFLOW。
- 北京日界、d1/d3/d7 与保险发布时间分别覆盖 −1/= /+1 ms，同刻事件、时钟倒退、请求跨界和重试跨界；完成快照必须同 kind 且 as_of>=due，错误 kind/提前快照不能完成待办。d7 另延长本地合成会话期限，避免把双方 401 当作日期行为证明。
- 原有 C1/C2、旧客户端投影契约、revision/CAS、幂等和授权回归仍在全量套件中。没有将有限契约样本说成所有输入和异常路径穷举。

## 预算与失败语义

固定总预算 16 MiB、正文单项 15 MiB、最多 50 项。驻留 Blob、pending 与仍活跃的退役项计费；每个响应租约另预留两块 64 KiB 缓冲和 512 B 元数据，直到进行中的读取结束才释放。未消费响应可能保守占用预算，后续请求完整绕过缓存；不能依赖 GC 才避免超额。预算不足/超大时不截响应、不少字段、不改窗口。

统计 `hits` 只是查到匹配项，可能因租约预算不足而绕过；真正响应命中使用 `servedHits`。这些统计只供测试模块访问，不新增公共响应头、接口或含身份/凭据日志。

流响应在 fetch 返回后的读取故障只能让读体拒绝，不能再改成 JSON 500；故障项立即退役，其他活跃 reader 的存储保留至结束。该新增表示的错误时机是已披露边界。Content-Type、完整 {data:...}、no-store 和安全头保持，不增加 Content-Length。

## 大数据与运行时证据

最终同场原样本见 `perf-overview-cache.json`；本地 workerd Inspector 原样本见 `perf-overview-cache-workerd.json`。精确 5000/20000/50000 合成规模，固定 seed/time，真实本地 Cookie 会话。端到端从 Worker.fetch 计时至完整 arrayBuffer，不省略约 14.6 MB 正文；旧新版共享同一隔离库、交替顺序，分别复用稳定 DB 包装对象。每路径旧/新完整正文 hash 必须一致，任一失败立即停止并保留部分，不能记成成功耗时。

原先完成的首版 78 样本保留在忽略的 artifacts/perf/overview-cache-initial-9e9a153.json。发现并发缓冲预留缺口后修订，再完整重跑最终协议；首版不混入最终统计。修订前的一次本地全量测试中途停止后重跑，不能把未完成输出算作通过。没有删慢样本。

Inspector 工具只监听隔离回环端口；生产 runtime.json 和安全配置未修改。最初外部临时模块路径导致 workerd 启动失败，显式 modulesRoot 后恢复；记录不代表权限绕过。最终本地 workerd 冷/热返回 200、正文一致，且与 Node 同场总览的完整正文 hash 相符。

**仍未取得 Cloudflare 完整 isolate 峰值证明。** Inspector 仅返回 V8 usedSize/totalSize/embedderHeapUsedSize/backingStorageSize；同步计算可使诊断排队，25 ms 意图采样不等于实际峰值覆盖。不同字段最大值不一定同一时刻，也不能拿 heap 容量、Node RSS 或逻辑缓存账相互替代。冷查询对象、stringify 临时值、运行时开销和消费者保留的数据不在 16 MiB 缓存账内。因此没有把“生产内存上限已验收”勾通过。

## 保存与范围

核心实现先后保存在远端 9e9a153、eaafb284。最后两项审计文件通过已有官方 GitHub 连接保存为 dc341245，完整树 4153ce98d24b5b086b9d9dd82bca402212c74a24 与本地 2737af1 完全相同；Git CLI 当时缺少凭据，未新建或扩权凭据。后续结果提交只增文档、诊断工具/合成报告，不改变已审产品源文件。

public 全部资源、hosting/runtime、db/schema、drizzle 与基线无差异。全历史扫描继续使用原 147 条精确已审历史指纹，未新增宽范围排除；本轮本地 75 个内容提交扫描无未豁免命中，不等于历史原始扫描零命中。最终远端完整历史扫描结果以对应 CI 为准。所有基准和截图只使用临时合成数据，不上传私有旧历史包、生产数据或原始敏感扫描明细。

## 四宽浏览器对照

本地双回环端口共享同一个临时合成 D1，分别运行旧版与候选，使用真实登录会话；浏览器与测试服务端固定时钟。375/390/768/1440 每宽总览、文章、数据和详情各一对，共 32 张 PNG / 16 对全部逐字节相同，横向布局检查通过，pageerrors 为 0。原始 PNG 保留在 artifacts/browser-cache；仓库仅保存 `overview-cache-browser.json` 的全部文件 hash 与诊断，不上传庞大截图包，不冒称主线程已亲自看图。两个正常未登录启动的 401 控制台诊断完整保留。

复现：构建后先在第一终端运行 `node tests/overview-cache-browser-server.mjs`，待双端口就绪，再在第二终端运行 `python3 tests/browser-overview-cache.py`。仅监听写死的 127.0.0.1:8791/8792，不接受生产地址。使用已有 Python Playwright 与 Chromium，没有安装新依赖。测试脚本拒绝在密码输入或一次性 token 出现时截图。
