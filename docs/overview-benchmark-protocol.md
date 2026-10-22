# 总览与文章基准协议（C5/C6前置）

仅测试工具与纯合成结果，不改产品。基线源提交 f21c9ed3a2991fb256a0b4abe7c0f1318cf54fca；运行报告另记录实际工具提交SHA。

## 重现

Node24，使用已锁定依赖：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run bench:overview
```

输出 `artifacts/perf/overview-benchmark.json`，该目录不提交。公开结果只选审查过的元信息/每次样本/汇总，不含Cookie、密码、凭据、响应正文或生产材料。普通npm test不跑手动大基准，只检查小规模生成器与统计；没有新增依赖。

配置固定在 tests/bench-fixture.mjs：seed104729、数据/请求时刻2026-10-22T08:00:00.000Z，5000文章，每篇4快照/10每日行，真实SQL核验20000/50000。不允许通过环境变量缩小规模。小规模12篇仅供CI形状验证，不能冒充大基准。三个合成平台账号；顺序头条/知乎/公众号，名称明确Synthetic。标题虚构、域名example.invalid；保留缺指标、真实0、独立likes/approvals、不同生产方式和日期待核实。保险标题仅用于合成业务覆盖，不引用生产进度。

SQL批量装载只发生在临时本地Miniflare D1准备阶段，计时中仍执行未修改的构建Worker与真实D1。固定时间的真实bootstrap/login生成合成管理员Cookie，所有计时请求使用该会话、完整授权范围；无认证模拟、不使用AI凭据元数据写。没有并发写者；revision前后验证不变。

## 样本与统计

三个原始请求参数保持：/api/v1/overview（默认yesterday）、/api/v1/articles?page=1（默认排序/20条）、/api/v1/articles?sort=reads（旧式不分页5000条）。各保留1次首次请求；随后2轮预热与10轮正式采样，每轮顺序循环轮换。合计39次，所有首次/预热/正式样本均保留。首次不是“冷isolate启动”，因为已完成同一运行时的初始化/鉴权。

每样本先显式GC（需--expose-gc），以performance.now从Worker.fetch前计到完整arrayBuffer读取后。包括D1桥接和计数器；不含准备/GC/SHA256/JSON验证。吞下失败而给成功耗时是禁止的：非200、抛错、形状不符、固定时间正文hash变化均记success=false、duration_ms=null、独立failed_elapsed_ms，并保存部分结果/中止。仅正式成功样本进入中位数、均值、四分位、最小/最大与总体标准差，不生成生产P95。10样本仍是本机初始分布，不足以单独证明稳定收益。

每样本记录HTTP状态、正文UTF-8 bytes、正文SHA256、参数、真实D1 SQL/控制查询/写语句/changes/rows_written/rows_read。0行UPDATE也计写，无receipt为null未知。所有计时管理员读取须无写语句。响应只验证后丢弃，文件不存正文。

Node RSS/heap/external/arrayBuffers在前后及25ms轮询中记录；内存窗口包含计时外的hash/JSON形状验证，CPU计数同样包含验证。同步峰值可能漏采，resourceUsage.maxRSS是整个进程的历史高水位。不是workerd进程或生产Cloudflare isolate内存上限证明。后续比较须保留同一协议/seed/固定时间/授权/参数/计数方式/GC和运行时，并报告负载差异，不只选一次较快样本。

## 阶段0与后续设计边界

阶段0旧中位数原样保留在phase0-baseline.md：overview8035.16ms，page1为351.63ms，reads为413.22ms。旧方法使用运行当天数据时间、3次样本、Workerd HTTP计时；本轮固定新语料/时间、Node应用计算加D1桥接，不能据数值差直接宣称C1～C3加速。未覆盖负载/平台/缓存冷启动的全部分布。

下一步缓存不能只信revision+参数+scope：overviewWindow默认Date.now，北京日界、待复盘到期、按发布时间计入的保险进度均可在无写时变化。固定基准时间只是可重复测量，不证明永久缓存正确。每次仍须重新鉴权和一致读；只能评估时间无关部分或精确时间失效边界并加回归，本轮不实现。

LRU50项不等于有界内存。阶段0约14.59MB正文×50约730MB，仅序列化载荷，尚无对象/复制。新报告记录实际body bytes、Node观察值，后续须字节预算、超大项策略和目标运行时峰值验证；不能截断历史窗口、响应或改变业务语义来凑预算。本轮无缓存、SQL快速路径、新接口或部署。
