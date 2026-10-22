# C6：文章 SQL 分页

基线：`0c5238d79551a807b35c0889ff69763bd04ae63e`。本项只优化带分页参数、按 published_at 排序、没有 topic/data_status 筛选的完整文章读取；不改变 UI、数据库结构或既有 API 字段。`fields=index` 保持 C4 的五字段投影和错误规则。

## 等价边界

旧比较器先按发布时间原始字符串排序，不解析时间；相同字符串按 id.localeCompare 升序。SQLite BINARY 与任意 Unicode ID 的 localeCompare 并不等价。

快路径因此额外要求当前默认排序器为 en/en-US、默认非数字且不忽略标点的排序；完整匹配集的 ID 为非空小写 ASCII 字母、数字或连字符，发布时间为可打印 ASCII 文本，均不能含 NUL。COUNT 和兼容性检查复用原 JOIN/WHERE。该通用字符域包含普通 UUID 和合成基准 ID，没有针对测试数据的特殊分支。字符域或排序环境不兼容时保留原查询及 JS 稳定排序。日期待核实备注不影响快路径资格。

SQL 使用 `ORDER BY published_at COLLATE BINARY <已验证方向>, id COLLATE BINARY ASC LIMIT ? OFFSET ?`，只为返回页补快照。分页参数仍由现有 paginate 解析；filtered total、scope-only unfiltered_total、offset 派生页码和空页行为保留。非分页、指标/耗时排序、题材/数据状态筛选和索引请求仍走原路径。真实业务写入后的并发一致性与重新鉴权继续由现有 consistentRead 负责。

已损坏数据库中的页外非法 metrics_json 不再被快路径读取或解析；API 写入的合法数据不受此影响。本优化没有扩展数据库修复职责，也不调整 schema 的发布时间 NOT NULL 约束。

## 红绿证据和回归

先在未修改的基线构建运行：

```sh
npm run build
node --test --test-name-pattern='C6 page query' tests/article-sql-page.test.mjs
```

180 篇合成文章、720 条快照的实际 D1 收据显示：返回 20 篇，旧版加载 180 篇完整文章和 180 条最新快照，断言 `180 !== 20` 失败。实现后同用例加载 20 篇和 20 条，D1 语句 8→7、rows_read 3783→1444、写语句及 rows_written 均为 0。这是装载量回归，不是性能耗时结论。

定向套件初轮 5/5 通过，其中固定种子 61327 的 200 组查询对照完整状态/头/JSON，117 组实际运行 SQL 快路径，其余覆盖旧路径或明确错误。额外测试涵盖同时间排序、原始偏移时间字符串、未核实/缺指标、超大页码、参数错误优先级、Unicode/NUL ID 和日期回退、范围授权、空 scope 和索引隔离。原始本地日志保留于任务工作区，不含凭据。最终完整 CI 与性能结果在交付时补充。

## 同场性能协议

```sh
npm run build
node --expose-gc tests/bench.article-page.mjs
```

复用已审生成器：5000 篇文章、20000 条快照、50000 条每日数据、固定种子和时钟，同一临时数据库和真实本地 Cookie。比较基线与候选 `/articles?page=1`，并保留未优化 `/articles?sort=reads` 对照；每个接口和版本各 1 次首次、2 次预热、10 次正式采样，共 52 条原始样本、26 对完整正文比较。计时从 fetch 到完整读取响应，包含 D1 桥接；不剔除慢样本，失败记录保留，非成功耗时不充作收益。本地 Node 数据不代表生产延迟或完整 workerd/isolate 内存。

本项尚待主线程验收，不自动合并或部署；C6 完成也不表示整轮优化已完成。
