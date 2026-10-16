# 每日双作者接入新审稿链：证据、边界与最小设计

## 当前结论与本轮范围

本文审计基线为 `5b100a9a7f26be18e4c13b19e5b82c600e077d8b`。文件和行号均指该基线，研究为本地只读源码审计，不表示生产数据库、实际模型、执行触发器或私人草稿已经验收。

当前 contract2 新链是 **Claude-only**。旧 daily 支持小鱼与 Claude 两个初稿作者，但不能据此声称新链已有每日双作者适配。修改 `read_writing_brief` 的文字说明，不能创造缺失的作者提交接口、每日幂等边界或新收费授权。

本轮最小实现限定为不新增表的只读前置核验：计算固定日期作者key、复用现有request及旧daily查询、如实报告阻塞。它不生成新收费 grant，不创建实际写作请求或流程，不派送事件，不调用模型，也不回退到旧写作链。

- Claude intake 应如实阻挡：旧 recurring daily 费用 scope 不包含新链由真实独审问题驱动的必要请求，不设固定总次数上限，缺少对应的新 recurring 授权。
- 小鱼 intake 应如实阻挡：contract2 尚缺实际 agent-writer 接口，不能将 Claude-only 链标为已经支持小鱼。
- 前置核验不是执行入口；本轮不会登记新任务，也不代表请求已派送、文章已生成、审核已执行、最终文本已冻结或私人草稿已交付。

本轮主任务已另行核验最新用户指令：北京时间 08:00 原计划的恢复已经独立获得授权并执行。**恢复计划不等于扩大每天的收费次数，也不等于新双作者链已经能够执行。** 基线 README 与旧设计文档中的“计划仍暂停”是当时的历史说明，不用于描述当前调度状态。适配开发不得借计划恢复之名升级旧 daily scope。

## 一、可核对的源码证据

### 1. 新 request 不是 recurring daily 授权

- `lib/editorial-request.ts:11`：冻结输入的 scope 是 `one_public_entertainment_article`，授权固定 `max_provider_requests:4` 和四个 Claude writer stages；没有 daily 日期、writer kind 或 recurring grant 的字段。
- `lib/editorial-request.ts:29,34`：读取和创建严格校验这份一次文章授权，创建依赖 enabled Claude 配置、精确模型、提示词版本及核实的输出能力。
- `lib/editorial-request.ts:33`：明确说明旧 daily 一次费用 scope 不能覆盖新链；`source_id`/`execution_id` 是审计引用，不能代替缺失授权；同一来源任务复用同一 key，不以新 key 重启失败或未知结果。
- `lib/editorial-request.ts:34,41`；`docs/editorial-request.md:32`：一次 request 的有效期是 24 小时，编排认领为最长 8 小时。这不是长期每日任务的授权模型。
- `db/schema.ts:66–68`：request 只有 owner/key 与 owner/flow 唯一性，没有日期/作者的每日唯一性。

### 2. 新 flow 的所有主笔阶段都是 Claude 路径

- `lib/editorial-flow.ts:28`：`outline`、`body`、`structure_revision`、`fact_revision` 直接被定义为 paid stages。
- `lib/editorial-flow.ts:38,50–51`：创建和运行依赖 Claude 设置与 Claude capability；不存在小鱼独立创建分支。
- `lib/editorial-flow.ts:40–41`：主笔产物必须绑定实际 completed Claude receipt、输入与快照 hash、requested/returned model；只有零问题修订可以保留原版本。不能通过改 provenance 标签绕过实际回执。
- `lib/editorial-flow.ts:95`：`saveEditorialReview` 拒绝主笔阶段，因此该接口不能用于小鱼框架、正文或改稿。
- `lib/editorial-flow.ts:96–105,125`：实际 writer 执行和恢复均使用 Claude provider receipt。
- `lib/editorial-flow.ts:136,139`：最终 manifest 的 author 与 `writing_runs.writer` 硬编码为 Claude。
- `lib/editorial-flow.ts:48`：五个 actor 必须互异，writer model 与冻结 expected model 一致。只更换 participant 的 actor/model 不会提供小鱼 writer 接口。

### 3. 旧 daily 的一次额度不能重解释

- `lib/writing.ts:70,75–79`；`db/schema.ts:7`：旧 daily 按 owner、北京时间日期、writer、run_kind 唯一，重复认领复用同一文章。
- `lib/claude.ts:100–110`：旧 Claude daily 收费 reservation 是 `owner:day`；completed、failed、requested 已存在时不再次调用。
- `lib/writing.ts:116–127`：保存绑定旧实际 provider 结果、文章、日期、模型、来源和原 14000 cap；不能替换实际 Claude 正文。
- `README.md:161`：旧正式 Claude daily 每 owner/北京日期一次尝试，测试 scope 与正式 daily 分开。
- `lib/text-revision.ts:164`；`docs/daily-editorial.md:16`：旧 daily 独立审改的 `approved_calls=used_calls=0`、`provider_enabled=false`，不新增收费请求。
- `lib/text-revision.ts:151`：旧流程只要求 review/verify 与初稿 writer、rewriter 分离，并未要求 rewriter 就是初稿作者。
- `lib/daily-editorial-finalize.ts:21`：旧流程最终标记 `agent_text`，并单独保留初稿 writer/provider 信息。它不能冒充同一 Claude 或同一小鱼执行了新链全部主笔阶段。

## 二、最小适配分层

### A. 每日确定性核验与未来真实映射

当前只读核验依据 owner、`Asia/Shanghai` 日期、writer生成确定性UUID，并查询该key的现有request和同日期作者旧daily。未来真正执行时才需冻结授权及date/writer绑定，并以原子CAS保障每作者每日最多一个真实request；不能用查询结果冒充写入幂等锁。内部文章/流程 ID 可以是 UUID，但每日 request key 必须从固定每日作者 tuple 确定性派生，不能在每次调度、重连、失败或授权变更时生成随机 key。

同日期作者槽的失败、未知、取消、过期和阻挡记录均保留。修改模型、grant 或接口版本不能绕过已有槽再写一篇。真正进入下一层时，确定性key应固定映射唯一 request、flow、article，映射与认领需要原子提交。检测到旧 daily 已占用该日期作者时，不得新增同日作者文章或把旧快照升级成新授权；应返回原记录和明确的兼容边界。

本轮没有ledger写入，仅报告阻塞。后续接入即使获得用户授权，也须先实现、验证上述原子映射和真实writer adapter。优先扩展现有request冻结新daily_binding和新grant引用，并对其新增与旧daily认领互相加同日作者CAS门，旧记录不迁移不改；若现有结构无法保证跨表并发隔离，届时才单独评审最小新锁表，不为记录blocked建表。

### B. 两种 writer adapter

后续 request/snapshot 必须显式冻结 `writer_kind=claude|xiaoyu`，将“主笔阶段”和“收费阶段”拆成不同判断。

**Claude 分支：** 原V68一次性grant保持四个命名阶段各一次，不做升级。未来新recurring版本保留YYLX实际模型/input/snapshot/receipt绑定，采用真实问题驱动的逐轮原子reservation，不设固定总次数。每轮冻结前版及问题单hash；零待改项保留同版本/hash，不为填满步骤收费。失败或未知不能改round/key/model/cap/scope来重试；人民币预算不可证明可执行时不发起调用。

**小鱼分支：** 不读取 Claude 配置或 capability，不调用 YYLX，不创建 Claude provider receipt。需要新增实际 agent-writer 保存接口，而非借用 `saveEditorialReview`：

1. 接受真正主笔产物的命名阶段（初始outline、必要outline_revision、body、structure_revision、fact_revision）及明确round_id；只在正确flow/phase、活跃认领、前版/真实问题报告hash和有效授权中保存。命名阶段种类不是总调用次数上限。
2. 使用与对应真实 agent 执行相同的冻结 writer actor/model；所有主笔阶段与必要修订轮保持同作者身份，不重新编造 actor。
3. 保存真实独立 execution ID、精确输入/快照 hash 和完整原始结果；校验产物、逐问题采纳/拒绝及全部文字改动。
4. 使用明确的 agent-writer provenance，与独立审核 provenance、Claude provider provenance 分开。owner-attested 回执不是模型运行的密码学证明，也不能写成 Claude 实际输出。
5. actor/execution 和不可变产物应能读回；重复保存同结果只读，不允许覆盖已冻结产物或更换身份。
6. 服务端读取、恢复、freeze、manifest 和最终 `writing_runs.writer` 都按冻结作者分支，不保留硬编码 Claude。

这只是后续实现设计。**本轮不具备该小鱼接口，不声称新链已支持小鱼主笔。**

建议真实提交接口名为 `save_agent_editorial_writer_stage`。最小输入是 run_id、round_id、stage、认领token、expected_snapshot_sha256、expected_input_sha256、expected_previous_version_sha256、expected_review_report_sha256、actor_id、execution_id、model、raw_result。初稿轮没有previous/report时用明确null；修订轮必须匹配服务器持有的真实问题报告及前版，不接受调用者自行补造。共用严格产物解析，写artifact与推进phase同一事务；读取时重建冻结绑定并核验全文hash。它不接受 passed 字段代替独审，不修改Claude receipt，也不把小鱼输出包装成Claude。新create/request的writer_kind分支、同作者角色固定、按作者manifest与writing_run交付必须同时补齐，不能只增加一个存文本入口就宣称可执行。


### C. 共用独立审核和现有交付

复用框架审核、结构审稿、全文事实核查和最终全文复核的产物校验。五个真实 participant actor 互异，审核员不能代替主笔改稿。最终复核必须重新读取干净全文，包含新引入的事实；diff 或“schema 通过”不能证明实际审稿发生。

零问题修订只保留确切原文本、版本和 hash，仍须独立最终复核。freeze 只接受服务器持有的确切最终版本和 hash。交付复用原 article 的现有配图、Word、私人草稿链，不公开发布，不改旧订阅，不新建旧测试批次，不改写历史快照、收费 reservation 或旧额度。

## 三、一次新的 recurring 授权要覆盖什么

用户不需要每日点击网页、填写 JSON、逐阶段批准或设置参与者。一次真实且完整的新 recurring 授权可以覆盖后续每日执行，但不能由现有旧 daily scope 或助手自己的 `confirm=true` 声明补造。

新 grant 最少应冻结：

- owner、真实用户批准的来源/确认记录、grant ID/版本和状态；助手引用的消息/执行 ID 如未经服务端验证，必须保持“审计引用”的真实标识。
- 原 recurring task/schedule 来源、`Asia/Shanghai`、开始日期、持续范围或直到取消、撤销后停止新执行的边界。
- 每日小鱼和 Claude 各一篇、各自同一主笔完成框架/正文/必要改稿、不同选题及近期去重。
- 公开文娱题材与公开证据；私人草稿目的，禁止公开发布及无关私人数据。
- 当前精确 Claude model、完整提示词版本/hash、核实的输出 cap 和 capability 证据。
- YYLX 固定目的地 `https://app.yylx.io` 接收公开资料及写作提示词；禁止传私人知识库、个人轶事或凭证。
- Claude 不设固定总次数上限，仅允许真实独立审稿问题驱动的必要修订循环。每轮绑定前版全文/框架与报告hash、证据版本、同主笔身份和唯一reservation；零问题跳过，失败/超时/未知只读对账而不收费重试。原四阶段一次性grant保持不变，不能将其改成无次数限制。
- 小鱼零 YYLX 请求；每日作者槽、同 request/flow/article 绑定、旧 scope 隔离和终止恢复规则。

模型、提示词及 output cap 的**当前生产精确值**须由主任务在批准前核验、披露；本审计没有生产读取结果，不能猜测其值。请求数/token 上限不保证金额上限，也不能虚构人民币价格。若用户要求货币预算，应另行明确可验证的金额上限与超额停止行为。

恢复 08:00 计划已经获得独立授权并执行，不需要重复要求恢复。尚缺的是新 recurring 日更授权绑定及可执行人民币预算与相应作者流程的批准；它不授权另建额外测试文章、重试旧失败或单独额外收费验收。

### 最新确认与仍缺的最小决定

用户已明确恢复08:00，并批准新流程“允许，且不限次数”。这允许后续设计真实问题驱动的必要修订循环，不等于无限重试，也不改旧grant。尚未给每日人民币金额上限；主任务正在追问该金额，不应再要求用户回答同一个次数问题。

金额给出后仍须核验YYLX账户/组别/模型当前计费规则、输入输出和缓存/长上下文价格、货币单位、可能的倍率与实际扣款数据。仅以token usage估算，或把请求数/token cap换个名称，都不是可执行的人民币硬cap。如果不能在每次不可撤回的请求前预留可证明的最坏成本、原子核对每日已花/预留预算，并在实际回执对账后结清，必须报告预算不可执行而不开始收费。精确模型由主任务实读为claude-opus-5-5；旧scope仍是14000输出/每天一次，新scope的cap与真实费率另行核验，不猜人民币价格。

最小待答问句已只剩：

> 每天Claude写作的人民币费用上限是多少？

后续新recurring grant应记录该回复、此前无固定次数批准和模型/提示词/cap/资料传输披露。缺少金额、可执行计费证据、真正小鱼writer接口或持久云执行验收时，继续准确报告阻塞，不每日弹阶段批准按钮。

### 无固定次数的版本/hash修订门

新版本须为每一稿框架/正文生成不可变版本及hash，独审报告必须锚定本版本与确切输入。只有尚未解决的真实问题单可开下一轮同作者修订，修订必须逐问题交代采纳/拒绝和完整新文本；新文本必须重新独审，正文新事实必须接受全文事实核查及最终确切全文复核。每轮身份、证据、前版hash、报告hash与reservation共同幂等；重复事件、失败、超时或未知不能创建下一轮规避旧reservation。没有问题就不收费改稿，不以重复同报告驱动无意义循环；相同版本/相同问题单已处理、未产生合法新版本或缺新核实证据时，应报告无进展/材料阻塞而不另建一轮。金额预算是实际可执行停止边界；当前V68只有四个stage的一次性reservation，本轮不会暗改它或启用第五阶段。

## 四、持久云执行与真实验收

新 request/outbox 能持久化，不代表网站可以启动真实 agents，也不代表 provider 请求本身已有持久后台执行队列。`docs/editorial-request.md:13–26`、`docs/editorial-flow-v2.md:32,42` 明确区分请求派送、实际 agent 编排、长连接执行和实际私人草稿验收。

后续启用实际每日双作者运行，至少需要：

1. 零网络离线测试：日期边界、不同 owner/作者隔离、并发重复调度、稳定 key、失败/未知不重开、旧 scope 与旧记录保持不变。
2. 两作者完整产物测试：小鱼四个主笔阶段实际接口、Claude 原 receipt 路径、同作者身份、独立审核、零问题同 hash、完整最终覆盖及作者 manifest。
3. 服务端权限测试：无 grant、错误 author/day/model/cap、取消/过期、未连接或未知派送均 fail closed。
4. 授权范围内的真实持久云执行验收：当前有效 recurring 来源、真实触发器、当前 owner 身份、真实独立 writer/reviewer/execution 记录、长连接完成与实际模型回执。
5. 真实同文章交付验收：确切最终全文/hash、Word 文字不变、配图与可打开的私人草稿；文章 saved 不等于交付完成。

如果这些步骤需要新订阅、部署、生产迁移、额外付费测试或其他本轮未批准的动作，应另外获得所需授权。本轮只实现确定性key与现有request/旧daily的只读前置核验，不新增登记表、不创建request或grant、不接入收费执行，不把上述未实现或未验收项标为完成。
