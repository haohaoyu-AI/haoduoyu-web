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

定向套件初轮 5/5 通过，其中固定种子 61327 的 200 组查询对照完整状态/头/JSON，117 组实际运行 SQL 快路径，其余覆盖旧路径或明确错误。额外测试涵盖同时间排序、原始偏移时间字符串、未核实/缺指标、超大页码、参数错误优先级、Unicode/NUL ID 和日期回退、范围授权、空 scope 和索引隔离。第六项用真实认证业务写入在 count/page 间推进 revision，验证整个读取重试并重新鉴权；没有增加测试用生产旁路。

产品提交 afdfb2cb3209ca3be19a72be0cfac12745b861df 的 [PR CI](https://github.com/haohaoyu-AI/haoduoyu-web/actions/runs/39764901449) 完整 187/187 通过（原 181 加本项 6 个顶层测试），包含 200 组比较、旧接口差分、C4 前端缓存和 C5 时间/权限回归；构建、8 项资源校验、双预览与密钥扫描也通过。独立审查后只补强了页外异常 ID 用例：将其日期设为 2001 年，明确断言不在当前页，仍必须加载全部 37 篇并走回退；该项本地 1/1 通过。最终报告提交的 CI 应另按精确 head 核验，不能把此链接当作未来提交的 CI。

本次没有 UI 资源变更，8 个 public 文件与基线逐字节一致，不重复 C4 的四宽浏览器或 C5 大基准。阶段 2 既有旧客户端契约测试沿用原覆盖边界，并非所有错误分支的动态穷举。原始本地红灯和定向日志保留于任务工作区，不含凭据。

## 同场性能协议

```sh
npm run build
node --expose-gc tests/bench.article-page.mjs
```

复用已审生成器：5000 篇文章、20000 条快照、50000 条每日数据、固定种子和时钟，同一临时数据库和真实本地 Cookie。比较基线与候选 `/articles?page=1`，并保留未优化 `/articles?sort=reads` 对照；每个接口和版本各 1 次首次、2 次预热、10 次正式采样，共 52 条原始样本、26 对完整正文比较。计时从 fetch 到完整读取响应，包含 D1 桥接；不剔除慢样本，失败记录保留，非成功耗时不充作收益。本地 Node 数据不代表生产延迟或完整 workerd/isolate 内存。

## 本次结果

产品和工具固定于 afdfb2c；[完整 52 条原样本](perf-article-page.json) 记录源码哈希，后续仅文档与上述测试断言改动。全部 HTTP 200，26 对完整字节、SHA256 和长度相同；revision 2→2，写语句、changes、rows_written 均为 0。

| 路径 | 旧正式中位 ms | 新正式中位 ms | 正文 B | 旧/新 SQL | 旧/新 rows_read |
| --- | ---: | ---: | ---: | --- | --- |
| /articles?page=1 | 3210.63 | 258.48 | 16828 | 68 / 7 | 105003 / 30364 |
| /articles?sort=reads | 3492.78 | 4034.99 | 4163723 | 68 / 68 | 105003 / 105003 |

默认分页本轮中位数下降 91.95%，超过 ≥50% 的本地目标。SQL 仍扫描匹配集做兼容性/计数，未增加索引；收益来自减少完整文章、快照装载和 D1 往返。未优化 reads 对照中位数反而增加 15.52%，保留全部慢样本，不能宣称全接口稳定提速。详细范围、计时、内存和局限见 perf-baseline.md；这里不是生产性能承诺。

本项尚待主线程验收，不自动合并或部署；C6 完成也不表示整轮优化已完成。
