# 第二期验收入口与固定历史快照

## 当前发布状态：v8（不是整轮全部通过）

生产已于 **2026-10-23 03:45 UTC** 经明确批准部署为 [Sites v8](https://haoduoyu.xyz)。产品输入固定为 GitHub `ce18a7b7a09f8acbfb9fe7c397b97e5d87a20ac6`；Sites 正式源 `e7765af3c6d4b87ed39de7831db2962db9c826d9`，共同内容树 `a0b4078d87f428bd61de49b9d0e0fed19e3aaa58`。[发布证据](releases/2026-10-23-v8.json)将两个仓库标识、保存版本、部署与v7回滚点分开记录。

| 当前事项 | 当前结论与边界 |
| --- | --- |
| 固定产品 CI | [39893971392](https://github.com/haohaoyu-AI/haoduoyu-web/actions/runs/39893971392)全绿：256/256、构建、8资源、双预览，141内容提交扫描无新告警；155条精确历史例外未变。 |
| 阶段6 | 用户已批准，条件式登录退避代码已合入并随v8发布；合成可信来源隔离、碰撞与并发回归通过。[实现与限制](security/login-backoff.md)。生产信任标志仍未设置，平台全入口可信IP契约未取得；不能声称线上具备真实IP隔离，不可信共享桶限制仍在。 |
| main必要检查 | 用户已批准但尚未配置。现有管理能力不足，详细保护读取曾403；仍需已有适当权限的管理员设置build-test和secret-scan，不扩权或绕过。 |
| 体积与实验 | 正式产品仍115637 B，目标100000 B未通过。PR29、PR31失败候选未合并、未部署；不能把实验字节数当线上资源。 |
| 严格PNG与内存 | 原始47/56不变；[审计局部补证](audit-visual-closure.md)以两边各一次登录的相同合成输入复测，四宽4/4严格相同，不能拼接宣称56/56。其余5处原生控件边缘差异保留。16MiB逻辑预算不是完整isolate峰值证明；流后置失败、既有显式500 message反射仍披露。 |
| 上线复核 | 原生部署成功，域名/SSL active，环境revision4未变。父端独立云浏览器在03:51–03:53 UTC沿用已有管理员会话只读检查总览、文章/详情及数据页，站点自身warning/error为0；未测项和来源差异见发布证据。本执行器HTTP代理403仍保留；原浏览器探测仅查Playwright默认缓存，后续确认系统Chromium可用于本地合成验收，未借此绕过生产代理。 |
| 归档哈希 | 原tar与保存层hash不同；[逐成员复核](releases/2026-10-23-v8-archive-verification.json)将原7载荷重建为标准规范tar后，Python与Node所得hash精确等于原生返回值，且载荷与批准构建逐字节一致。未下载服务器归档、未读取后端实现，不猜内部代码路径。 |

以下直到文件末尾保留的是产品 `a67d1dce1b9c104f3ae23cf6b67be899b98e0d41` 的**固定历史验收快照**。其中240测试、生产v7、“当前”“未部署”“待批准”等均只指那个检查点，不能代替上面的v8现状；原文限制和证据不重写成新结论。

## 固定 a67d1dce 历史快照（原阶段7整理稿）

产品基线：`a67d1dce1b9c104f3ae23cf6b67be899b98e0d41`，内容树 `acbbef438763d343c6e16faf82a1e286d159b65a`。
本稿只汇总已有证据，不是整轮验收通过声明，不授权部署或安全设置变更。阶段 1～5 已分别验收合并；阶段 6 未实施，阶段 7 尚在收尾。

状态：**满足**表示所列范围有可核查证据；**未通过**表示已知未达目标；**未验证**表示证据或能力不足；**待批准**不能由默认值或旧部署许可代替。没有把这些状态混成总通过率。

### 当前证据与版本

- 精确 main [CI 39876510343](https://github.com/haohaoyu-AI/haoduoyu-web/actions/runs/39876510343) 已成功：Node24 干净 runner checkout、锁文件安装、构建前产物检查、构建、240/240 测试、8 资源、双预览。测试数量采用 Node 输出，含嵌套计数，不累加阶段报告。
- 全历史扫描在上述 CI 检出全部远端分支/标签，扫描132个内容提交；155条获批的精确历史例外后无新增告警。原始扫描不是零命中，例外不适用于新提交、目录或整条规则。详见[审计记录](security/secret-scan-exceptions.md)。
- 生产保持 Sites v7；其 GitHub 批准输入是固定 `f21c9ed3a2991fb256a0b4abe7c0f1318cf54fca`。Sites 正式源码仓库的提交标识另行记录，不能把两个仓库的 SHA 混为一项。C4/C5/C6、阶段4/5的后续成果尚未部署。
- 此文档 PR 的精确 CI 仅用于确认文档变更未破坏工程。产品验收引用上述固定 main；本次未手动重跑整套回归或性能/截图流程。

### 对照任务书第 7 节

| 条目 | 状态 | 已有证据与准确边界 |
| --- | --- | --- |
| 7.1 干净 main 安装与测试≥65 | 满足 | 上述 main CI 的干净 checkout、`npm ci --ignore-scripts --no-audit --no-fund` 和240/240。不是声称本轮另做过执行器干净克隆。 |
| 7.1 PR 自动构建/测试/扫描/产物一致性 | 满足 | [现有 CI](../.github/workflows/ci.yml) 两个只读 job；首次 build 前检验已提交 app.js。没有部署步骤。 |
| 7.1 必要合并检查 | 未通过／待批准 | 只读分支摘要为 `protected:false`、检查 enforcement off；可读 rulesets 为空。详细保护接口403，不代表可管理权限。需管理员明确批准并把 `build-test`、`secret-scan` 设为 main 合并必要条件，不能擅自扩权。 |
| 7.1 密钥扫描 | 满足（已审例外口径） | 132内容提交、155精确历史例外、零新增告警。原始命中、误报依据和历史失败保留；不是扫描全部原始结果为0。 |
| 7.1 四份当前工程文档 | 整理中 | README/RUNBOOK/ARCHITECTURE/CHANGELOG 对齐本基线；各阶段报告仍是其所标来源的历史快照。此清单是当前状态入口，不能把旧阶段计数/“未合并”当现状。 |
| 7.2 B1/B2/B4 回归先失败后修复 | 满足 | [阶段2汇总](phase2-summary.md)、各单项记录与当前套件；B4普通并发原本通过，实际提交期约束注入才是红灯。 |
| 7.2 B3/B5 行为不变整理 | 满足（行为刻画） | 不虚构业务修前失败；B3静态110调用点与有限真实错误样例、B5真实Cookie深链接保持，结构检查另列。 |
| 7.2 旧客户端兼容与 OpenAPI1.1.0 | 满足（指定新增/例外） | [旧契约测试](../tests/legacy-read-contract.test.mjs) 比较旧字段投影、完整其它头/状态；新增身份id、审计标题、新读取模式、Deprecation、请求关联等有独立断言。不是所有数据/非法输入穷举，也不是响应原始字节完全不变。 |
| 7.2 所有错误完全不变 | 原文绝对表述未通过；明确例外已批准 | B4提交期`DUPLICATE→ARTICLE_EXISTS`；E2旧错误构造自身失败从runtime text/plain500变固定JSON500。原受控错误合同保持；新增关联字段严格投影，不能掩盖这两项。 |
| 7.3 所有只读请求总写0 | 原文绝对表述未通过；分项修订满足 | 会话GET、控制/业务写0；AI凭据首次或严格超过5分钟允许最多1条元数据UPDATE，请求未到期0条。并发可多条语句但SQL防重复更新；0行UPDATE也计写。详见[计数](perf-baseline.md)。 |
| 7.3 额外控制查询≤2 | 普通路径满足 | 正常protectedRead为2；backup嵌套为4，争用重试另列。不能给所有端点与重试统一勾2。 |
| 7.3 静态第二次304 | 满足（本地与既有发布观察） | [C3与HTTP证据](perf-baseline.md)、[E2真实HTTP](../tests/request-error-tracing-integration.test.mjs)；GET/HEAD/304无误缓存，HTML/API no-store。本候选未上线，不能称其CDN新版本已验证。 |
| 7.3 数据页轻量读取/索引复用 | 满足 | [C4](reviews-light-reads.md)：真实Cookie网络回执，首屏无overview、弹窗不拉全量文章、写后/会话变化失效；最小索引新模式对不支持参数400，旧模式不变。 |
| 7.3 总览热读≤冷读10%与写后失效 | 满足（固定本地协议） | [78配对样本及限制](overview-cache-validation.md)，5000/20000/50000合成规模、完整正文、真正servedHits；鉴权/revision/时间边界重算。不是生产P95、永久revision缓存或生产内存证明。 |
| 7.3 C6 200随机对照与分页下降≥50% | 满足（固定本地协议） | [修订后C6](article-sql-page.md)：200完整旧新对照，损坏JSON守卫后52样本/26对，默认分页下降87.84%。原慢样本/失败保留，未优化路径不能声称稳定提速。 |
| 7.4 web行长/函数/生成一致性 | 满足 | 当前CI30模块/350函数，≤160字符/≤80行，构建前后产物一致。`frontend-module-size.json`是4a快照，不是当前检查结果。 |
| 7.4 四宽截图 | 可见UI满足；严格PNG未通过 | [4c证据](strict-style-csp.md)：375/390/768/1440、13 computed状态精确一致；56对47对逐像素相同。4对审计因重复登录内容不同，5对控件边缘13～32像素/最大差1；全部保留，不能全叫像素噪声。 |
| 7.4 控制台与CSP | 正常正向范围满足 | 正常流程无pageerror/CSP违规；逆向inline注入准确被拦，CSSOM正常。401、断网、409和刻意违规分列，字面“包括负路径全程零错误”未通过。 |
| 7.4 CSP无unsafe-inline | 满足 | [4c](strict-style-csp.md)与E2完整响应头对照；没有关闭违规报告或弱化策略。 |
| 7.4 全部data-action/表单 | 满足（已验功能范围） | [4b真实浏览器](frontend-request-lifecycle.md)、[4c](strict-style-csp.md)：26必需入口、11类表单、键盘/移动端、18请求探针；原始失败与重试保留。不是仅凭VM或源码字符串勾选。 |
| 7.4 app.js≤100000B | 未通过 | 当前115637B，差15637B；不压缩、不删功能、不改目标。[结构收益账](FRONTEND_SIZE_PLAN.md)尚未证明可达标。 |
| 7.5 不同IP攻击50次仍能正常登录 | 未实施／待批准 | 阶段6未做；当前共用peer降级与10次/15分钟硬限流。现有11次伪造转发头被限流的测试不能证明新隔离策略已实现。 |
| 7.5 500日志与request_id | 满足（受控Worker范围） | [E2](request-error-tracing.md)：服务端UUID、受控method/路由/错误分类、单条日志、sink隔离、幂等/并发/流不重编码、真实workerd兜底。系统级崩溃不在保证范围。 |

### 证据复用：不机械重跑

4c已验产品提交`dc598ac1c1b53303500e2313965c3f980d94d0ad`至本基线，`web/`、app.js、style.css均无差异。当前与4c的Git blob分别相同：app.js为`95e2e1a11dcdd804900287a75a327cd7aa30efb7`，style.css为`51c5aa2c34747b7bec3b88cef4f1429723ab5b46`。
因此四宽、控件样式与功能证据按来源和上述无变化链复用；后端5a/5b/5c由精确main CI的契约/权限/缓存/分页/头/真实HTTP回归覆盖。不能据复用链称旧PNG是新CI产物。发生相关源变更时，才重测受影响项。

- [4c公开纯合成数据及来源](strict-style-data/provenance.json)、[computed比较器](../tests/style-evidence.mjs)、[少量原图](strict-style-images/)。
- [4b请求回执](frontend-request-lifecycle-data/requests-browser.json)、[像素清单](frontend-request-lifecycle-data/pixel-comparison.json)、[执行来源](frontend-request-lifecycle-data/execution-provenance.json)。
- [C5原样本](perf-overview-cache.json)、[原workerd诊断](perf-overview-cache-workerd.json)、[C6修订原样本](perf-article-page-guarded.json)。
- [E2初始红灯](request-error-tracing-red.log)、[运行时红灯](request-error-tracing-runtime-red.log)、[旧新wire元数据](request-error-tracing-runtime-boundary.json)。旧失败记录不是当前仍失败的结论。

### 未关闭的风险与决策

1. **可信IP契约未知**：Sites技能和只读元信息没有提供`cf-connecting-ip`全入口防伪保证，生产未启用信任标志。Cloudflare公开说明存在Worker子请求特殊路径，不能用品牌或一次模拟头测试证明本站可信。[官方说明](https://developers.cloudflare.com/fundamentals/reference/http-request-headers/#cf-connecting-ip)。未取得平台契约前不开启开关；用户同意也不能替代技术证据。
2. **阶段6/分支保护待批准**：只读调查不等于允许修改。需要确认登录退避方案；main必要检查需已有适当权限的管理员操作，不为此新建token或扩大App权限。
3. **完整isolate峰值未验证**：16MiB只是缓存Blob/租约/规定缓冲逻辑账；不含冷查询对象、stringify、消费者和运行时。原18点采样`sampling_error=true`、重复且无时间戳，不能证明25ms或完整峰值；Node RSS/堆不能替代。只补有能力取得的目标指标，不反复跑78样本掩盖缺口。[原说明](overview-cache-design.md)。
4. **流后置失败**：返回Response后读体失败不能再转JSON500；会退役缓存项并释放租约。不是E2漏掉一个已返回500，而是已披露的失败时机边界。
5. **既有显式500 message反射**：状态已分类为500的异常沿用原HTTP message；E2新日志不复制它。此项未修，若需修改错误合同应另立任务，不能混入限流或纯文档提交。
6. **体积与严格PNG目标未通过**：不压缩/改阈值/删功能；不重拍到随机相同，不把可见UI签收替代严格字节结论。

当前不能将整轮或全部第7节勾为通过。下一步是逐项获得上述决策与必要平台证据；上线申请见[草稿](RELEASE_REQUEST.md)，生产v7继续保持。
