# 云端续改验收 — 2026-10-14

> 后续单稿工作区、结果时效修复与当前诊断缺项见[第二轮续改](cloud-continuation-round2-20261014.md)。本页保留第一轮验收记录。

本轮从 GitHub 工作分支 `codex/offline-next-followup-20261014` 的
`65e26db2d70fae67e3d225311f2f851130260795` 接续，真实应用目录为
`cloud-web/`。初始环境检出的是旧 `work`，在工作区干净时先拉取指定分支，
没有使用旧 main 开发，没有改 main。仓库根、cloud-web、其父目录及正式源码
检出均未找到 AGENTS.md。本轮修改范围以最终 Git 提交为准。

## 迁移结论及新增证据

线上最近成功版本仍为 **V159**；V160 仍是原终态失败，错误
`incomplete input: SQLITE_ERROR`。本轮没有新部署、保存 Sites 版本、生产 SQL、
数据库清空、文章上传/发布、浏览器写作、日程或安全设置变更。
正式源码访问凭证未启用自动发布，凭证仅经隐藏 stdin/子进程内存，
未保存到文件、Git 配置、日志或提交。Sites source helper 在环境中不存在，
两处技能资源读取均不可用；使用正式返回的 Git 地址和凭证进行标准只读 fetch，
没有构造原始 HTTP/RPC。

已取得正式 V160 源码 `ab35236c37d015cd0ec40e5dae3545eb30307da4`，
独立 detached 检出用于比对，未向正式源码仓库推送。
V159 源码为 `e3f7bb1b49b0d7a9dcfd7a85d43bb7dc8a0e50e1`，
可在相同 Git 历史读取：

- V160 与当前工作分支的全部109份 drizzle 文件逐字节一致：
  54 SQL、54 snapshot、journal；build 5份、scripts 63份、配置/package 6份一致。
- V159→V160 只新增 SQL 0050–0053，原50份 SQL 和旧 snapshot 字节保留；
  journal 原50项为未改前缀。源码变化范围可确认，线上应用位置仍未知。
- 锁定本地 Drizzle 0.45.2 按 statement-breakpoint 切分，未按 END 再切；
  d1 migrator 将 pending 片段和 ledger INSERT 放进一个 session batch，
  session 对每个片段 prepare 后调用 D1 batch。
- 锁定本地 Wrangler 4.92.0 的正式分句器有 BEGIN/CASE 嵌套栈。
  0053整文件输出2片，视图 END 后逗号边界会保留多条顶层语句在第二片；
  两个完整 AFTER trigger 均保留，单独输入各切1片。
  它与上一轮 first-END 模拟器不同。不能把模拟失败当实际根因。
- 新测试用真实隔离 workerd/D1 验证全54迁移：
  Drizzle一次batch521输入，ledger54项hash一致；再次执行无pending batch。
  Wrangler全链466片执行后schema与Drizzle一致，0012四对象均存在。
  从V159前50项→0050–0053的Drizzle增量一次batch59输入，旧schema精确保留，
  最终结构与全链一致，ledger54项hash一致，重复无pending。
  本地契约共9组通过；原45项模拟诊断仍通过，边界保持。

可复核证据在
[`execution-contract.json`](../evidence/migration-deployment-diagnostics-20261014/execution-contract.json)、
[`v160-current-source-comparison.json`](../evidence/migration-deployment-diagnostics-20261014/v160-current-source-comparison.json)、
[`v159-v160-source-comparison.json`](../evidence/migration-deployment-diagnostics-20261014/v159-v160-source-comparison.json)。
重跑：`node tests/migration-execution-contract.mjs`、
`node tests/migration-splitting-compatibility.mjs`。数据库均为本地隔离合成库，
不读取生产环境/凭据、不调用正式站点。

**仍缺的四类平台证据**：实际消费V160归档及转换后输入；失败SQL文件/索引/
精确字节或hash与job trace；Sites job执行器/分句/prepare-batch-exec及事务契约；
线上迁移账本、真实schema/trigger定义和部分应用状态。
V160归档精确hash/源码SHA搜索0结果，指定归档读取仍不可见；源码已取得，
但源码不能替代实际消费包。24小时错误Worker日志当前0条，
该请求日志入口不提供迁移job。数据库概览未暴露内部账本或定义。
据此没有最小SQL修复的已证依据，也没有安全重跑条件：
原SQL、snapshot、journal保持原样，兼容改写仍仅在测试夹具。
本轮没有自动审批拒绝；阻碍来自正式接口未提供所需证据。

## 本轮交互修复

1. 账号添加/移除返回可选 `account_change`，依据实际SQL `meta.changes`。
   重复URL不谎称新名称已保存；已移除账号不谎称再次删除成功。
   旧响应使用“账号池已确认”，保持身份保护、10容量、扫描键和GET收敛。
2. 未确认文章通知在同一浏览器会话刷新后保留owner范围围栏。
   只存文章UUID和精确前置拒绝标志，不存正文、文件名或凭据。
   恢复围栏的首个读取不能释放它；后续同owner/同ID正常GET核验允许恢复
   才开放显式续接。已有在途/未知、事件和claim门禁不改，不自动POST。
   sessionStorage不可用时仍只保证当前挂载页；新会话/跨设备不保证客户端持久围栏。
3. 历史耗时按选中的计时字段显示真实来源；写作、请求、计划时间分开，
   请求/计划明确包含等待，非法/负值/倒置区间显示未记录。

修复前基线均有红对照；新增Home31案和历史耗时12案共43通过，
账号实际SQLite及组件反馈专项通过。测试使用实际模块/组件与合成数据，
不代表真实平台流程已完成。

## 八项可复核清单

| 项目 | 已完成或已核验 | 未完成的真实验收 |
|---|---|---|
| 1 清空从零 | 正式只读重读原操作 `a2da604b-7e3a-4d8d-897f-d41c805edf15`：57/57 deleted，内容行/对象剩余0、当前本人文章0、列表空；本轮未再清空。外部草稿和Library保留。 | 只读回执 `external_stop_confirmed=false`；不能把内容为空说成所有远端执行者已独立确认结束。 |
| 2 极简选题 | 单一刷新入口、防双击、处理中/失败/未知及同任务读取恢复已有实现。 | 每6小时计划由父线程管理，本轮未改时间表；真实按钮与计划执行终态、研究执行者尚未验收。 |
| 3 72小时热文与10账号 | 代码阈值为最近72小时/阅读保守下界≥10000、最多10账号、真实URL、缺指标不补数。增删反馈已修。通过正式Library取到原账号资料，ZIP9886字节/SHA `6d75957864ddaafcbb1812944f88715254e60ae4eb7600eaec2d1049b5b49ddd`，原2+新8、10唯一主页和产品URL合同校验齐。 | 资料仅为先前观察文档，无原始HTML/截图，本轮未重新在线核身份。全部样本eligible=false，22样本中2个缺文章URL，不能充当72小时真实热文。当前授权工具集无生产账号池读写入口；未入库、未采集真实阅读评论，6小时实跑未验收。 |
| 4 得到只留一键成文 | 单篇按钮、原queued/pending恢复、同task/action防重及Word/双平台完成守卫已有实现。 | 本轮未发送得到消息、生成配图、上传文章或操作私人草稿；真实云执行链由父线程现有执行者接续。旧批次读取为paused，连接/生命周期检查过期，不作为全局停机证明。 |
| 5 移除写作台 | 导航移除，旧/writing转文章数据已有实现。 | 候选未上线，仍需生产回归。 |
| 6 当前稿配图发布 | 当前与历史分离、清空/当前删除、真实进度、原稿/Word/通知防重和在途互斥已有实现；本轮强化通知跨同会话刷新围栏。 | 当前处理稿选择及真实取消结清、原成果续接/幂等重试、两平台私人草稿完整验收尚未进行；不能将恢复意图当执行已派送或将过期claim当可抢权。 |
| 7 历史文章数据 | 标题/模式/耗时/状态及真实发布时间、精确24小时/迟到累计/不可获取语义已有实现；本轮耗时标签补修。生产article_history当前0行，不重新导入被清空历史。 | 新稿真实历史及公开发布后24小时后台快照未取得；私人草稿继续不标成公开，未知数字不填。 |
| 8 极简可靠交互 | 本轮账号反馈、未知通知与耗时清晰度已补修；身份清理/失败/加载/互斥回归通过。 | 本地完整App桌面/手机合成验收与线上验收分开，生产候选尚未上线。 |

账号选择资料原2：皮皮电影、电影烂番茄；新增8：
毒舌电影、独立鱼、乌鸦电影、影探、虹膜、3号厅检票员工、影视口碑榜、
影视小锄头。资料只读放在Git外，真实账号包/台账不加入源码。
脱敏字段完整性记录见
[`account-material-acceptance.json`](../evidence/cloud-continuation-20261014/account-material-acceptance.json)。

## 验证结果与局限

全量TypeScript `--noEmit --incremental false` 与最终build通过；
`git diff --check`通过。独立初轮37套已有回归35通过、2个旧测试红；
计入最终新专项后，共39个独立唯一套件37通过、2个旧红。
最终冻结代码13套交叉回归全部通过。两个旧红均在未改HEAD原样复现：
`word-progress-review`旧夹具直接塞主claim、未取得Word执行位/传execution token；
`word-progress-review-d1`加载器把bare import fflate当lib/fflate.ts。
不放松执行门禁，不把这两项计为通过。与真实台账绑定或依赖旧Git路径的旧测试
未运行，不能声称全历史套件通过。各专项lint通过不等于全站lint通过；
既有Home/Word React lint基线错误保持公开记录。

正式只读摘要：
[`cloud-followup-official-readonly.json`](../evidence/migration-deployment-diagnostics-20261014/cloud-followup-official-readonly.json)；
独立回归与构建输出保存在本轮新证据目录的 `local-check-output.json`，
含原输出文本与每份字节SHA；遵循仓库忽略规则，不强制提交.log或logs目录。
完整本地Chromium验收26/26通过，
5页面在桌面1440/手机390宽度均无横向溢出；31个业务请求全为合成拦截，
未知API、非loopback请求和JavaScript页面异常均0。
预设401/503/abort资源错误属于负例，不隐瞒为控制台全空。
重跑使用 `node tests/cloud-continuation-browser.mjs`（先启动本地dev）。
浏览器结果只代表本地合成业务响应，没有实际平台写入。

## 后续发布条件

用户已授权测试通过后的正常网站发布，该授权保留。
待正式接口补齐失败输入、执行契约和已应用/部分状态后，针对识别的未应用失败
迁移做最小修复和同契约验证，再由同项目正常Sites流程同步精确源码、保存/部署，
保留受众、域名、日程与已有围栏。未知生产DB状态下不重跑V160，也不新建站点、
重置数据库或修改已应用历史SQL。本轮交付是GitHub工作分支源码与证据，
线上仍为V159；本轮结束后不宣称另有后台执行仍在继续。
