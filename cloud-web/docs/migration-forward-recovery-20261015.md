# 迁移输入与前向修复可达性 — 2026-10-15

本轮继续定位 V160 的 `incomplete input: SQLITE_ERROR`，不执行生产迁移、
不改历史 SQL/snapshot/journal、不清库或自动发布。
没有把“缺正式迁移账本”当作全部诊断结论。

## 正式保存版本能实际返回什么

本轮实际调用两次 `sites_get_site_version`，分别读取 V159 和 V160。
源码提交、归档 hash/大小/文件数及部署 ID 与已有记录相同：

| 保存版 | 正式源码提交 | tar SHA256 | 大小/文件数 |
|---|---|---|---|
| V159 | `e3f7bb1b49b0d7a9dcfd7a85d43bb7dc8a0e50e1` | `6bea57a0f33db14d9489cace7730a05e1609e53cd49c647991db38439418c684` | 9,922,560字节 / 321 |
| V160 | `ab35236c37d015cd0ec40e5dae3545eb30307da4` | `5a030fdbeb3178e855d38523d0a2963e97ca6180886eaad581f1dc9136e4c528` | 10,956,800字节 / 334 |

该工具真实结果只有 `id/project_id/version_number/source/archive_storage/
screenshot_url/deployment_id`；`source` 只有 `commit_sha`。
没有源文件正文、归档字节、转换后 SQL、失败位置、执行器或账本。
所以不能声称“从 get_site_version 读取了已保存源文件”。
原源码已通过先前获准的正式 Git 凭据取得，正式保存版的 SHA 再次绑定到这些对象；
这是源码证据，不是部署实际消费字节。原归档 Library ownership/visibility 失败
本轮没有重试或换通道。

本轮正式回执摘要见 [version-provenance.json](../evidence/migration-recovery-boundary-20261015/version-provenance.json)。

## 已完成的精确步骤，不重复执行

2026-10-14 已保存的逐文件证据足以复核：

- V159→V160：50份旧 SQL 全相同，只追加0050–0053；旧50份 snapshot 不变，
  journal 原50项为未修改前缀。V160全部109份迁移文件与当前检出逐字一致。
- 完整 SQL 的 SQLite 执行通过。锁定 Drizzle 0.45.2 在真实隔离 workerd D1
  完整执行54项，一次batch521输入；前50项升级只提交0050–0053，一次batch59输入。
  最终schema、全部ledger hash一致，重复执行无pending batch。
- 锁定 Wrangler 4.92.0 的实际分句器保留BEGIN/CASE嵌套；0053整文件分为2片，
  两个完整AFTER trigger都在。全链466片在隔离D1执行后schema一致。
- first-END模拟器能造成错误，完整SQL和测试兼容改写在45项合成行为测试中一致。
  但真实Wrangler实现不是那个模拟器，不能据此认定Sites也按first-END切分。
- 0012一个breakpoint含4条顶层语句；Node SQLite prepare只执行第一条的双实现局限
  已被识别。其源码早在成功V159内，不能据这个局限归因V160。

本轮没有重跑上述45项和9组，保持各自原观察时间与范围。
原始证据：[源码差异](../evidence/migration-deployment-diagnostics-20261014/v159-v160-source-comparison.json)、
[V160与检出](../evidence/migration-deployment-diagnostics-20261014/v160-current-source-comparison.json)、
[锁定执行合同](../evidence/migration-deployment-diagnostics-20261014/execution-contract.json)。
本地锁定实现不等于平台实际执行规则。正式存储规范只说明先迁移再上传Worker、
失败也可能已应用迁移；它没有返回该部署的实际分句、执行及记账实现。

## 本轮新增：构建和打包字节验证

`tests/migration-artifact-integrity.mjs` 检查既有构建，不重新构建、不上传：

1. 54个journal tag/SQL文件名对应、唯一，时间递增，snapshot身份链连续。
2. 原源码与当前 `dist/.openai/drizzle` 的全部109文件名、长度和字节一致。
3. 将构建中的 hosting manifest 和迁移子树打入临时tar，再解包比对，109份迁移
   全部字节一致。未发现本地构建/这个tar往返造成截断、换行转换、错名或漏文件。

这不是完整生产归档的等价重建，不能把临时子树tar hash与V160的334文件tar混同。
同样不能排除平台实际消费归档或转换阶段的问题。
三组通过结果和逐文件hash见 [artifact-integrity.json](../evidence/migration-recovery-boundary-20261015/artifact-integrity.json)。

## 本轮新增：追加修复在什么状态下可达

`tests/migration-forward-repair-barrier.mjs` 使用真正的本地Drizzle迁移器和隔离D1。
测试SQL全部为显式合成对象，前置源码始终完整；一个适配器仅在测试中注入丢失END，
不改生产或仓库任何旧迁移。

| 合成状态 / 新验证 | 实际结果 |
|---|---|
| 完整最小trigger与故意去掉END的输入 | 完整SQLite语法有效；截断输入报 `incomplete input`。这是校准样例，不是平台输入证据。 |
| 前置pending输入持续被截断，后面追加可重入CREATE | 真实Drizzle的4输入batch报 `D1_ERROR: incomplete input: SQLITE_ERROR`；追加修复未生效，原有行保留。移除合成截断后，同一完整源码正常通过。 |
| 前置已完整执行并记账 | 不再prepare前置，追加可达；第二次迁移没有新增batch。 |
| 前置trigger存在，但对应账本未提交 | 即使输入完整，先报 `trigger support_guard already exists`，仍到不了追加。 |
| 已有同名对象定义不同，追加IF NOT EXISTS | 定义原样保留，没有被修复。“可重入”不等于可纠正错误定义。 |
| 合成账本最后时间戳存在，但前序对象缺失 | 本地Drizzle只看最大created_at，不验证完整hash前缀；没有pending batch，却仍缺对象。 |

六组结果见 [forward-repair-barrier.json](../evidence/migration-recovery-boundary-20261015/forward-repair-barrier.json)。
这些结果说明**追加迁移不能保证覆盖所有未知状态**，不是说所有前向迁移都不可行。
若前置完整提交，或平台修复执行器后前置可正常通过，新增迁移可以成为正常路径。
本地batch回滚行为不被外推为平台的事务保证。

项目中也有具体的部分状态反例：0053第一句是无条件
`CREATE TABLE topic_research_control_keys`。如果该DDL已落地但未记账，后置0054
不能先于它运行来修复“表已存在”。只追加两个trigger也覆盖不了0050–0052缺表、
缺索引或不同定义。`0053_snapshot.json` 没有记录这些自定义view/trigger，
snapshot字节一致也不能代替实际定义核验。

## 当前根因结论与最小修复边界

目前没有证实项目SQL语法、命名或本地打包缺陷，也没有证实Sites分句器/输入截断。
相同错误字符串可被故意截断复现，并不能反推真实部署就是截断。
现有CASE→RAISE WHERE兼容改写继续只在测试夹具，不进入迁移目录。

没有新增“覆盖已应用/未应用全部状态”的0054。若正式证据表明前置均完整提交、
实际缺陷只是已确定的view/trigger定义，可以在验证原子执行契约后，追加有条件的
DROP IF EXISTS及重建，并验证原数据、冲突拒绝、幂等与并发保护；无需改历史SQL。
若前置仍pending且持续失败，必须先处理其真实输入/执行问题，追加不能越过它。

要进一步缩成最小修复，证据应按状态分支索取：

- 前置仍pending：实际失败输入/位置与平台执行合同，以及部分应用状态。
- 前置均完整提交：完整账本前缀与相关实际DDL；围绕已确定的定义缺陷设计追加修复，
  不必继续猜测历史失败位置。单看最后一条账本不够。

生产概览已有对象名称的只读回执继续作为名称证据使用，不重复读取；
行读取不提供触发器DDL或内部账本，盲目读业务行不能补齐这个缺口。
本轮没有新部署或生产写入，V159/V160状态沿用上一轮已正式重新核实的记录。
新测试、结果和本文同步原GitHub工作分支，主分支与所有历史迁移保留。

复核命令（从cloud-web运行；既有build存在时无需重新build）：

```text
node tests/migration-artifact-integrity.mjs --report /tmp/artifact-integrity.json
node tests/migration-forward-repair-barrier.mjs --report /tmp/forward-repair-barrier.json
```
