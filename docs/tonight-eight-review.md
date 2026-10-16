# 今晚八项优化：代码候选与验收边界

本轮只在独立云环境执行。真实网站源码通过本人 Sites 控制面签发的源码凭据和标准 Git 取得，凭据仅经隐藏 stdin / 子进程内存使用；未写入文件、Git 配置、提示词或日志。未使用标注为合成测试的 app_* 业务工具。

## 基线与位置

- Sites：`appgprj_6ac1907e61a48191a067ce3c30b21265`，`https://haoduoyu.xyz`。
- V159：`e3f7bb1b49b0d7a9dcfd7a85d43bb7dc8a0e50e1`；正式部署为父级核验的 `appgdep_6accc1ba16c881918c0f7a0294fa3632`。
- 源码：`/workspace/sites/haoduoyu-production`，分支 `codex/tonight-eight-improvements-20261013`，取得时工作树干净。
- 环境预置 GitHub `haoduoyu-web` main 是旧 Windows/Python 包 `4c61f3c265a3998c7971241a4b4e64df65afebd3`。本候选没有修改该旧包；它的只读审查不能外推为本候选验收。
- 两份仓库均未发现 AGENTS.md 或仓库 .agents/skills；真实源码 README、任务合同与相关 SOP 已读取。

## 八项状态

| 项目 | 本轮结果 | 尚需父级 / 生产验收 |
|---|---|---|
| 1 清空 | **部分**：可恢复收起/恢复，事务中再核对状态，保留原文、Word、草稿链接、凭据围栏和统计；未结束任务拒绝收起；不再从主界面提供永久删除。 | 生产尚未清空。全量 R2 对象/依赖统计尚无可用的正式只读入口；不可恢复删除及历史审计范围冲突仍待决。 |
| 2 选题 | **代码完成，接线部分**：按钮“刷新选题”，真实进度、失败/重试；相同活动研究复用，同一老通知可重试，不用另建任务绕互斥。 | 父级已建立北京时间 00/06/12/18 的联合刷新计划；本轮没有另建计划。需正常业务连接及实际执行者验收。 |
| 3 热文 | **部分**：最近72小时、阅读下界≥10000、单篇文娱初筛、最多10账号；常见主页 URL 正规化、防重复保存、清晰反馈和登录提示；浏览器实际测过添加/移除。 | 原2+新8的公开身份证据已保存，仅为种子，未写生产账号池。原 owner 不迁移、不覆盖。动态公开页面采集与风格证据入库未接线；静态读取不足会显示未核验，不能说热文不存在。 |
| 4 得到 | **部分**：新云端一篇请求、固定新对话、独立事件、同任务动作意图和一次执行、防重复消息/下载、真实 Word SHA/大小/标题绑定、两平台实际同 Word 回读和结清才可完成；新页面不调用旧本机链。 | 真实云执行者、正式 MCP/事件连接和完整平台链未验收。原持有者可同凭据重读/续接；失联或过期后不会抢权，安全恢复/暂停的完整云控制接口仍需后续补审。未操作真实得到或平台。 |
| 5 写作台 | **代码完成**：删除导航入口，`/writing` 转到文章数据；原页保留为 legacy-page，相关后端/历史/专用工具不删除。 | 待生产回归。 |
| 6 配图发布 | **部分**：当前/历史分离，可恢复单篇删除及当前列表清空；暂停/取消请求保留在途动作与成果；原进度和正常续接门禁保留。 | “重试并续接”保存同任务意图，不代表已派出执行者。可信原执行终态/映射及实际恢复仍需正常能力；未释放侯明昊旧认领。未修改或绕过上传 claim/reserve/consume，未知不重传。 |
| 7 文章数据 | **部分**：独立历史表与界面、来源/耗时/真实草稿链接/状态；未来正常同 Word 双平台回读自动入历史；固定北京10月12日起范围；发布时间和实际采集/平台统计截止/明确区间独立记录；迟到累计不冒充精确24小时。 | 8条真实证据已完成离线导入验收，未写生产。正式公开文章 ID、24小时实际后台采集与更新执行者尚不可用；父级5859展现/16阅读/0评论未匹配样本未关联任何稿。 |
| 8 交互 | **代码完成，生产验收部分**：移除重复入口，初始加载禁点击，操作互斥、反馈、重试、手机历史卡片；真实 Chromium 桌面/390px手机截图。 | 截图为云环境内真实本地预览与隔离 D1/R2，不是生产联通验收。 |

## 真实只读摸底

正式 Sites 数据库 articles 分3页读完，共7行，均为已知本人 owner：6行 deleting、1行 processing。当前 processing 的侯明昊稿仍保留；未继续任何旧永久清理。得到旧批次有两个 completed 但原执行结束未确认，一个 paused 1篇且没有完成条目。未改原批次、平台稿、账号安全、订阅或任何现有计划。

数据库控制面表清单只返回前50个名称，不足以枚举全部业务依赖和 R2 对象。本轮不会将上述行数称为完整清空资源预览。可恢复界面的范围也有明确分页上限，原稿和审计不因此销毁。

## 证据材料

- 历史 ZIP：6036字节，SHA256 `087584a57f045a89dfbfd65832c1355432f80872584cc2d3a8d1a06887cf60ec`；Library `libfile_6d63189bf2a881919a45a68d6c811065`。
- 账号 ZIP：9886字节，SHA256 `6d75957864ddaafcbb1812944f88715254e60ae4eb7600eaec2d1049b5b49ddd`；Library `libfile_d38ae9b35c0081919ac3186777e7d1b2`。
- 两者均在本云环境通过 Library 官方材料化流程取得实际字节，未假设父级共享路径。审阅副本位于 `evidence/tonight-eight/`。
- 历史：8条、全自动5/半自动3、双平台私人草稿7/仅Word1；两个完整原标题缺失，website_article_id 全为 null；全部公开发布及24小时指标未知。
- 账号：皮皮电影、电影烂番茄保留；新8为毒舌电影、独立鱼、乌鸦电影、影探、虹膜、3号厅检票员工、影视口碑榜、影视小锄头。禁用候选不进入10个清单，有限样本不代表完整扫描。

## 验证

- `node tests/tonight-eight-d1.mjs`：完整51个迁移，实际 SQLite；可恢复操作、状态竞争、跨 owner、过期未结束认领、历史空值/不造文章ID、指标明确24小时/迟到累计/不可获取、云请求与消息一次门禁、同 Word 两平台完成守卫。
- 通过：`hot-article-account-discovery`、`hot-article-discovery-storage`、`hot-article-discovery-races`、`hot-article-discovery-clock`、`topic-research`、`article-state-transitions`、`upload-attempt-guards`、`article-word-settlement`、`word-serial-attempt-ui`、`word-progress-read-ui`（22项）、`mcp-contract`。
- `node tests/tonight-eight-browser.mjs`：真实 Chromium + 正常 localhost 页面/API + 隔离 D1/R2，实际保存、移除、重复点击、上传、无效Word、收起/恢复、8历史/14草稿链接、未连接云按钮禁用、无篇数输入、写作台转向、退出登录、桌面/手机布局。未访问平台草稿 URL，生产和平台写入0。
- `npx tsc --noEmit --incremental false` 和 `npm run build` 通过。
- 新模块/相关库 targeted eslint 通过。旧 `app/page.tsx` 与 `components/word-stage-progress.tsx` 有15个 React lint错误；在 V159原样基线分别为2和13，未声称全站 lint 通过。未跑整个900项历史套件或真实生产链。
- 截图及结果在 `evidence/tonight-eight/ui/`。因目录含本人历史信息，仅作为本次审阅证据，不自动放进公开静态目录。

## 接线与部署方案

当前 schema-only 合同修复及未应用/已应用迁移分支条件，以 [schema-only-backfill-contract.md](schema-only-backfill-contract.md) 为准。以下保留各轮审查历史，不能当作当前发布资格；旧候选的五条顶层回填已在本隔离候选移至有界正常维护接口。

1. 父级先审本分支与新的 `drizzle/0050_colossal_catseye.sql`。这是唯一新增迁移，原0–49全部保留。新增表/索引/只保存核验元数据的历史捕获触发器，不删除业务内容或重置权限。
2. 发布前由父级判断授权，使用正常 Sites 源码/迁移/构建/发布流程，确认新表先于查询代码可用；不要用 GitHub旧包或裸 HTTP/RPC 绕恢复业务连接。回滚 Worker可回V159，新增数据/审计留存，不删除迁移数据。
3. 正式目录恢复/核实同一 Sites 项目的正常 MCP，先成功只读业务工具并比较账号池 owner_scope 与正常页面。合成工具描述、has_mcp、回调200或工具存在不等于真实业务接通。
4. 6小时计划与按钮共用 `create_topic_research`、`refresh_hot_benchmark_accounts`；不新增服务器定时器，不停原得到3/8/12/21。
5. 新一篇链使用 `start_dedao_cloud` / `dedao.cloud_requested`，实际执行者按 `read/claim/begin/confirm/bind/renew/finish_dedao_cloud` 接续。正常 Word 上传必须保留结果不明时的同稿核查；绑定须真实标题、文件名、SHA和字节一致。之后仍用既有文章与两平台原子上传门禁。新事件订阅由父级正常发现后接线，保留原订阅。
6. 审核后由本人正式连接导入历史证据和8个新增账号；不按源码里猜的 owner 写入，不造网站文章ID。24小时采集在实际公开文章身份可核验后，再配置真实读数据执行者；当前不把草稿当作发布。

本轮未合并、未发布/部署、未永久删除、未发送真实得到消息、未提交任何真实平台文件，也未创建重复自动化或新本地 Codex 任务。

## V159 原样基线的15项 lint 明细

| 文件 | 行 | 列 | 规则 |
|---|---:|---:|---|
| `app/page.tsx` | 109 | 35 | `react-hooks/refs` |
| `app/page.tsx` | 314 | 111 | `react-hooks/set-state-in-effect` |
| `components/word-stage-progress.tsx` | 62 | 17 | `react-hooks/set-state-in-effect` |
| `components/word-stage-progress.tsx` | 69 | 5 | `react-hooks/refs` |
| `components/word-stage-progress.tsx` | 69 | 34 | `react-hooks/refs` |
| `components/word-stage-progress.tsx` | 69 | 73 | `react-hooks/refs` |
| `components/word-stage-progress.tsx` | 69 | 108 | `react-hooks/refs` |
| `components/word-stage-progress.tsx` | 72 | 38 | `react-hooks/refs` |
| `components/word-stage-progress.tsx` | 77 | 58 | `react-hooks/purity` |
| `components/word-stage-progress.tsx` | 78 | 5 | `react-hooks/refs` |
| `components/word-stage-progress.tsx` | 78 | 45 | `react-hooks/refs` |
| `components/word-stage-progress.tsx` | 78 | 96 | `react-hooks/purity` |
| `components/word-stage-progress.tsx` | 79 | 17 | `react-hooks/set-state-in-effect` |
| `components/word-stage-progress.tsx` | 80 | 17 | `react-hooks/set-state-in-effect` |
| `components/word-stage-progress.tsx` | 86 | 86 | `react-hooks/refs` |

原始规则首行与基线SHA在 `evidence/tonight-eight/baseline-lint.json`；全部运行命令、exit与未运行项在 `evidence/tonight-eight/test-results.json`。

## 独立审查后修复（以本节及新增合同为准）

首轮候选 `5c092589dceae3169e544d7d9af29e5c477e737a` 的增量包缺少基础源码和0–49迁移，不能供独立完整复跑。后续交付完整最终跟踪源码、构建脚本、lockfile、tests与全部51迁移；原始历史台账及出版快照另行由授权审查者通过Library取得，不夹入源码包。

- R1：公开状态必须是明确作品管理/平台状态，精确文章 ID 与原本人草稿匹配；主页可见和文章 URL 可读仅是预览线索。原文、来源、时区和规范时间分别保存；时间冲突/未核验时 published_at、24小时区间和到期时间均空。私人、定时、未知和旧无证据观察不能生成exact_24h。原定时日程只读保留。见 `docs/article-publication-evidence.md`。
- R2：回填、主文章/知乎更新以及新增正常上传执行结束/云执行结束捕获都核对成品WordSHA、两平台SHA/标题/账号/规范URL、正常已核验上传attempt和同attempt结束凭证；Word串行占用/未结束动作拒绝认证。没有结束凭证的旧元数据不自动盖章。元数据捕获不授予操作许可。
- R3：新增收起专用云任务结束守卫，与共享Word/平台完成守卫分开；active、end_reference缺失或动作未结清都不能隐藏，且不自锁finishCloudDedao。正常云结束后可捕获历史，正文/平台稿不删除。
- R4：每一页与首/current owner及恢复列表逐次核对，一变立即丢弃整批、清空旧视图/分页/恢复控件，下一次明确刷新从新owner offset0开始。当前请求停止后不再合并晚页。
- R6：统计边界使用已核验完成/回读时间，上传在10月12日前而完成在范围内的文章纳入。
- R5继承问题：V159原函数确实允许过期claim换人。本修复仅堵住过期自动换人，初次queued且无claim才可领取；过期旧holder不能迟到保存，原任务不丢，刷新仍复用。完整真实执行结束/安全恢复接口尚无可信合同，仍是阻碍，不声称已完成恢复或伪造原执行结束。研究助手文案已同步；尚无原holder续期接口，超过30分钟会安全停留等待后续补审。

本次未执行生产迁移、发布、清空、平台提交或变更日程。唯一新迁移0050仍未部署，修改其可空发布时间/捕获守卫并同步snapshot；任何环境已应用旧0050时必须另做正常前向迁移，不可重放旧文件。更新验证与未运行范围见 `evidence/tonight-eight/followup-test-results.json`。原15项lint不构成跳过任何安全或接线缺口的理由。

## 第二次复审后（当前合同）

- 0050回填及全部捕获按原段落首个JavaScript trim意义下非空字符串取标题（含制表/换行/Unicode空白），不重写段落。空前缀完整同稿回执可入历史；全空段落和错标题仍拒绝。
- 已增加0051增量迁移，保留原0–49。原持有者续期含到期后仍是当前holder的情况，同token/同任务，控制receipt持久防重。完成/失败需先续期。`docs/topic-research-contract.md` 第8/23行旧到期抢认领描述已改。
- 同任务恢复预览和原子恢复合同已实现，要求内部可信终态读取器独立核验claim/task/input/epoch/原执行映射和完整动作结清。默认生产adapter未接通，返回人工阻塞，不能用caller证明、超时或新任务绕过。原恢复成功路径仅离线验证端替身测试，绝不称真实云恢复已验收。原始无执行身份或丢token且无可信证据仍需人工处理。
- 控制记录不可改/删，恢复保留研究ID/输入/事件身份，不自动派送，不抢在途通知。旧token fenced；续期/状态竞争及同毫秒控制变更均使旧预览作废。
- 完整源码包新增明确合成的 `evidence/word-progress/v1-partial-fixture.json`，SHA256 `276205f95c217e838a66003e7b5e2f8102a82a5bfb262a046fa1e6b213ca306a`；原12组回归全部通过。原始台账/出版快照仍在独立Library授权材料，不入源码包。
- 本轮52迁移隔离SQL、恢复负测、受控API真实Chromium续期未知响应防重、typecheck/定向lint/build结果见 `evidence/tonight-eight/round3-test-results.json`。生产迁移/发布/计划/平台稿均未动。

## 第三次复审后：业务失败/完成跨任务绕过修复

独审正确指出：81596cb仅堵住过期重新认领，却仍让原持有者续期后通过业务失败清空claim，再创建不同研究ID取得新执行权。这不是未认证提权，而是执行互斥缺口。本修复将两者分开：完成/失败只记录业务事实，保留原claim和独立owner级topic执行围栏。

所有创建、认领、派送、恢复入口检查未结清topic执行，覆盖completed/failed及历史重叠排队任务。新 `settle_topic_research_execution` 只在可信原执行终态/完整动作结清/claim-input-epoch-claimed_at映射再次核验后，原子保存不可改的结清证明并释放精确终态claim；不创建任务、不派送，不解除其他围栏。活动任务恢复仍只能在真实结清后重排同ID，不能新任务绕过。

新增唯一前向0052迁移（共53个），0–51在本轮不改。已被旧代码清空claim的0051holder仍回填为未结清；更旧的未知映射保持人工阻塞，不把completed或旧recover JSON当结束证明。触发器保护旧代码直接创建/插入claim、换claim、提前clear及审计删除。实际生产terminal adapter仍未接通，默认不会解除任何执行围栏；成功正例仅离线可信验证端替身。

原12组、新增5组及前向迁移负测共18组全部exit0；SQL覆盖失败/完成后跨任务创建、旧排队claim、dispatch、旧版clear/claim/insert绕过，以及可信结清后正常新任务。typecheck/定向lint/build和受控API的实际Chromium续期/失败围栏文案测试通过，均不冒充生产联通。精确命令、exit与限制见 `evidence/tonight-eight/round4-test-results.json`。本任务未生产迁移、发布、合并、改日程或操作平台。

## 本轮唯一并发P2（基于8ea7b231）

仅修续期/结清跨表复用同owner同request_key的事务竞争：新增0053统一键表PRIMARY KEY(owner,request_key)，两张回执表真实插入时在同一事务占位；显式ABORT不被INSERT OR IGNORE吞掉，失败方整批回滚，不会结清后才报冲突。回读只读统一键，不再跨表UNION任选首行。旧冲突保留两份原回执并标人工阻塞，不猜胜者。原围栏、可信终态默认不可用及其他生产逻辑不改。

实际SQLite双提交顺序、同操作8次并发重试、不同owner同键、只读核对后新nonce及旧冲突前向迁移均通过。完整19组回归、54迁移、typecheck/定向lint/build通过；见round5-test-results.json。完整包附基于8ea7b231的精确增量patch与最小运行代码patch（完整应用需包含迁移journal/snapshot）。没有部署或生产操作。
