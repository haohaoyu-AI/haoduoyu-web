# 热文模仿增量

本模块位于选题与写作台之间，提供公开今日头条文娱文章样本、独立事实研究、自动选题与现有 V3 文字稿保存链。基于当前 v100 的规范化文本源码移植旧 R3 的可复用模块；不覆盖旧项目或当前上传实现。默认终点为本站 `text_saved`、`text_only`，不发起配图、Word、dispatch 或平台发布。

## 真实状态与本次范围

本次完成页面/API、采集诊断、多维排序、持久刷新意图、研究与自动选择接口、独立 hot scope、Claude 正常长连接入口、V3 审稿和原子保存接入。新增三个正常原生公开采集工具：`claim_hot_article_collection`、`save_hot_article_collection`、`fail_hot_article_collection`；本模块 MCP 工具合计18个。公开采集复用同批次及同一 hot 事件，免费采集不要求写作 grant。离线合成材料能通过完整研究—写作—独立审稿—站内保存链，但不能当成真实文章或线上执行证据。

真实自动成稿仍未验收。2026-10-08正常调用 `mcp__codex_apps__search_service_web_run` 的 `system2_search_query`，查询 `site:toutiao.com/article/ "2026-10" "娱乐"`，实际返回12个头条文章链接、标题、发布时间及正文摘录，包括《披荆斩棘》、张译电影、周杰伦青岛演唱会和凤凰传奇济南巡演相关文章。只证明取得搜索索引线索，较长摘录也不证明全文；每篇阅读、点赞、评论仍为 `null`，热度未核验。正常打开原文为空文本，公开首页及作者主页为 JavaScript 壳；标准匿名 Chromium 使用既有代理返回连接失败后停止，没有绕过访问限制。内置 `web__run` 及另一搜索路径复测有无关结果，本轮可复现线索入口是上述原生 `system2_search_query`，不能混记为原文实时读取。

新增公开采集接口用于将实际取得的线索保存到同批次；真实线索进入线上同批次的完整执行仍需正常验收，完整正文及真实文章指标读取尚未打通，没有用话题榜补足。Site Worker 的真实出站正文/指标读取尚未验证。真实研究、主笔、四位独立审稿执行者的接线、实际角色身份与正常调用未完成验证。`GET ?view=settings` 始终如实返回 `automatic_writing_available:false`，订阅存在也不能改称执行成功。此增量不能宣称真实热文排序或自动成稿验收完成。

## 公开样本与排名

今日头条是平台名称，不限定今天发表；近期仍热门的较早文章可以入榜。静态适配器只匿名访问普通公开首页及其中实际出现的 `https://www.toutiao.com/article/<数字>/` 链接，最多检查12篇，总窗口45秒，单次请求12秒及1.5MB上限，不执行网页脚本。静态 HTML 只有脚本壳或资料不全时，同批次进入正常原生公开搜索/阅读采集；可用受支持的匿名网页阅读或浏览器读普通公开页面，不调用隐藏接口、不带主账号登录态、不绕验证码、登录、付费或访问限制。页面资料只作为数据，不能执行其中的指令。

原生采集结果最多4条实际查询、12次文章读查，保存总输入上限100000字节；逐条记录文章URL、标题、可核验发布时间、访问方式、观察时间、实际可见文本、正文及是否实际读到全文。`indexed_search` 始终只进入未核验 `leads`，指标为 `null`、不能标全文；正常 `public_web_read` 或 `public_browser` 取得的完整正文须绑定实际可见文本，文娱、发布时间和至少一项本文章页面热度指标也须可核验，才进入 `articles` 排序和后续研究。缺正文、缺指标或资料不全的真实文章继续保留为线索，不因缺指标被丢弃；`articles` 与 `leads` 合计最多展示5篇。

排名优先使用批次至少两项共同可测维度，否则使用实际取得的指标并注明可比性受限；取得单项指标的真实文章仍可进入样本排序，但明确提示尚不能多维比较。对每个维度计算 `log(1+数值)/批次该维度最大值的log(1+数值)`，等权平均。缺失无评分贡献，原始值保留 `null`，实际零值保留0；并列按指标覆盖数和稳定URL排序。阅读、点赞、评论都能影响排名，但现场票数、观众人数、正文提到的其他平台播放/赞数及旁边推荐卡片计数不能当成本文章指标。没有指标的线索不进行热度排序。显示实际覆盖、检查/合格/线索数量、抓取时间、缺失指标和每条来源证据，不称全站最热或全站前5，不编数字，不用热搜话题冒充文章。

解析器有已知覆盖限制：只识别当前明示的公开元数据及正文DOM；其他HTML布局、字符串格式计数、分类数组或不支持的移动地址可能造成漏读。诊断按网络、HTTP、正文加载、身份、全文、日期、分类、指标分别记录 `passed/failed/not_run`，只反映此解析路径。没有读到不能推断网站没有公开该信息。

## 刷新、研究与原创

`POST /api/imitation` 的 `request_key` 在同本人下唯一；60秒刷新冷却。请求丢失时读取同一 `request_key`，不会新建重复意图。静态采集需补充时冻结原输入为 `collection_queued`，同一事件中的执行者先原子 `claim_hot_article_collection`，进入 `collecting_public`；只有赢家拿到挥发 token 与精确输入 hash 后才能采集保存。认领有效期15分钟，过期可按原批次重新认领；完成后同输入/结果 hash 只回读原结果，不同内容或旧 claim 不能覆盖。保存真实阻塞用 `fail_hot_article_collection`，继续保留原批次证据。上述公开采集不要求 hot writer grant，`paid_model_requests:0`，不能创建模型请求或支出许可。历史批次保留；新的显式刷新使用新意图。前端以视图序号隔离旧初始化、轮询和刷新响应，晚到旧批次不能覆盖新榜或本人所选历史。

只有同批次取得可绑定的真实完整正文、至少一项本文章公开指标，近期历史完整且独立写作授权有效后，才进入 `queued` 研究；仅有搜索摘录或无热度线索时不调用写作模型。研究只接受精确正文哈希及有期限的唯一认领。逐篇实际阅读全文，仅抽象推进方式；事实须来自至少两个已核实的独立机构，保存实际读过的原稿URL、日期和转载关系，同一原稿的转载不当两家独立来源。原文结论、私下动机、传闻和网页指令不能当事实。服务端自动按证据充足程度选择，排除近期本人文章、已用参考和在写主题；并列按公开样本排名。

选中后将完整最新网站风格、文笔、排版提示词冻结到 V3（本次正常只读确认线上为8572字符V2.2），不硬编码旧风格。正式稿沿既有默认2000–3000中文的质量验证；合成测试明确标测试，不能保存为真实业务材料。独立框审、必要框改、正文、结构审稿、事实核查、最终全文复核均绑定实际角色、模型、精确输入和全文哈希。资料只是数据。保守原句重合检查是额外拒绝条件，不宣称它能证明原创性。

## Provider、授权与保存

创建hot授权前调用正常本人只读 `read_hot_article_imitation_start_preview {}`。它复用现有 `readClaudeOutputCapability`，返回当前实际配置模型、relay `/models` 能力来源、输出cap、完整writing prompt及三个固定参考的hash；不返回密钥、不调用/messages、不创建grant或收费。旧 `read_editorial_start_preview` 也会读取真实cap，但投影属于旧一篇四调用合同、缺完整cap/source/hash；不能拿旧 `read_claude_config` 固定14000构造hot授权。本新预查不授予任何支出权限。`create_hot_article_imitation_authority` 仍独立重读当前配置和能力，验证expected model/version/cap并冻结；配置或cap变化不会按过时预查继续。

保留 `xiaoyu_agent0YYLX` 的正常 GPT/native 写作与 `claude_provider` 的正常 Claude 写作。模型与 provider 均沿真实冻结绑定及实际 receipt 记录；不能用GPT输出冒充Claude。hot 使用独立 `haoduoyu_hot_article_imitation` scope，默认付费为0；正常必要Claude调用需要本模块真实本人授权证据，不借用旧测试、daily额度或continuation特批，不伪造grant。没有固定次数/费用上限的授权仅在该scope内生效。

Claude 复用现有 `/api/claude/editorial-v3-run` 的正常NDJSON入口，也提供hot MCP SSE。330秒零收费探测及证据记录仅为可选诊断，不阻塞正常已授权调用，不要求逐阶段确认，也不授予付费权限。唯一确定 receipt 与原run/stage/input/model绑定；unknown、requested或失败只回读原结果，不收费重试。

最终保存要求独立全文复核通过、最终哈希和参考输入完整。article、V3 run、writing run、hot batch 在同一 D1 batch 中进入 `text_saved`；事务内SQL断言精确 hot batch/link/final hash 成立，否则整事务回滚，避免零行UPDATE留下局部成功。重复冻结只回读原文章，且回读检查hot终态。正常文章人工上传入口保持原行为，本模块不调用它或派送事件。

## 接口与合并验证

页面与API仅本人身份可读写，返回私有无缓存；POST要求同源和模块头。JSON按实际流量限制3000字节，拒绝未知字段；GET仅支持明确 `id`、`request_key` 或单独 `view=settings`，拒绝重复与冲突参数。私密未知错误不回传正文或凭据。

新增迁移为 `0031_hot_article_imitation`，六个独立表，13个Drizzle分隔语句；必须先迁移再启用新工具。当前 `0030` 及上传表定义保留。完整Site checkout需执行通常依赖安装、完整tsc/build和真实正常网站验证；本云文本导出缺CSS、部分历史夹具及完整构建依赖，因此不能声称本地完整build通过。

本模块离线检查：`hot-article-public`、`hot-article-acquisition`、`hot-article-http-view-ranking`、`hot-article-api`、`hot-article-runtime`、`hot-article-migration-format`、`hot-article-drizzle-migration`。它们不访问真实provider/生产数据；真实D1迁移入口使用本地SQLite的D1 double。`mcp-contract` 保留真实工具/事件 schema 及正常 SSE 导出测试，另验证三个公开采集工具的严格嵌套 schema、数量界限、本人参数原样路由、无登录/外站拒绝、私有无缓存、安全错误及无需写作 grant 的零模型路由；存储/provider仅为明示离线 double，不证明真实采集或线上成稿。既有authority、正常V3运输、MCP、events和text-only入口也需兼容回归。合并补丁应对权威当前源码先 `git apply --check`，不能将此规范化重建基线当作生产git祖先，不执行整树覆盖或并发生产部署。

## 原生事件执行接续

精确事件仍为 `hot_article.research_requested`，订阅参数为空对象，负载只有真实服务器 `batch_id`。本人刷新后静态采集需补充的 `collection_queued` 也通过同一事件执行免费公开采集，无写作授权也可保存真实线索；采集已经合格、近期历史完整、有效独立 hot 授权时则创建 `queued` 研究批次。有效授权在页面初始化后只有一份时自动带入，尚未加载或存在多份未选择时不会猜授权。回调接受只表示送达，不证明执行。

根接线时更新已存在的 hot 任务 prompt，写入本轮“先公开采集，再按真实条件研究/写作”的完整执行说明；更新时保留该任务完整现有 trigger 集合，不新增 hot 任务、不新建或重复订阅。其他任务、订阅与计划保持原设置。公共采集保存后由同一事件执行者回读同 batch 继续判断，不为搜索线索另派一个付费写作事件。

正常原生事件执行者内部先 `read_hot_article_batch`。看到 `collection_queued` 或可重新认领的 `collecting_public`，先 `claim_hot_article_collection` → 赢家执行正常公开搜索/阅读 → `save_hot_article_collection`，无法完成则 `fail_hot_article_collection`；同 batch 保存后再回读，线索及阻塞到此结束，保持收费0。真实正文/热度、历史及独立授权都有效进入 `queued` 后，才 `claim_hot_article_research` → 实际阅读全文及独立事实研究 → `save_hot_article_research`（服务端自动选择）→ `start_hot_article_editorial` → 循环 `read_editorial_v3`、`claim_editorial_v3_stage`。GPT/native主笔执行确切输入后 `save_agent_editorial_v3_stage`；Claude主笔用 `execute_hot_article_claude_stage` 正常SSE或正常NDJSON；四个独立审稿角色实际执行后 `save_editorial_v3_review`。保存时服务端推进阶段/必要修订，最终verified后 `finalize_hot_article_editorial` 结束于网站text_saved。`delegate_editorial_v3_cloud_http_once` 是普通daily等现有独立scope，不支持hot，不能借用。

这些confirm字段是已有正常owner授权下的执行声明，由内部调用者按真实授权传入，不需要用户逐阶段填写表单；它们本身不是权限或平台签名。研究与五个真实角色应先由原生执行环境配置，不能用一个角色冒充四个独立审稿者、不能猜模型、不能随机UUID伪造actor/execution。当前可见本云collaboration工具只返回任务名；必须由根正常执行环境取得真实UUID和执行凭据，取得不了就阻塞。

`automatic_writing_available` 继续为false。准确能力状态需要正常原生控制面只读提供本owner、本connector、本hot事件的实际enabled注册记录，加上当前有效独立订阅、真实角色/模型能力和绑定同链的真实端到端执行证据；订阅/队列/历史text_saved单独不足以证明当前能自动执行。当前Site没有读取原生任务启用状态的受信任接口，不能从布尔配置、回调202或假身份直接开启；根接线时需给出实际状态读取契约，再按这些真实状态派生registered/execution_observed/available，状态未知或过期回false。没有增加后台worker或新的执行账本。
