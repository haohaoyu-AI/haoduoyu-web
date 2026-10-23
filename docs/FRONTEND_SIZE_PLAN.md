# 前端结构优化收益账（仅分析，未证明可达标）

输入是固定产品main `a67d1dce1b9c104f3ae23cf6b67be899b98e0d41` 的未压缩UTF-8 ESM：app.js为115637B，目标100000B，差15637B。没有修改代码、构建参数、文件边界或验收阈值。原已报告低风险重用试验约2804B不是本次新测，也没有完整可并入补丁；即使全部兑现，仍为112833B、差12833B，不能宣称已找到达标路径。

## 本次可复核的静态账

数据见[分析快照](frontend-size-analysis.json)。用Node24及现有check-web的Acorn解析当前已提交bundle，不运行产品或大基准：按esbuild的`// web/...`标记量取模块字节范围，按顶层函数AST起止量取函数字节；等长文本的比较使用cooked字符串。模块数30，模块范围不含最前的通用引导字节。这是定位成本，不是可移除字节。

| 输出模块 | 当前字节 | 观察 |
| --- | ---: | --- |
| pages/dashboard | 18471 | 指标、关注、Top、周期表、图表与口径文字均需保留。 |
| pages/articles | 11715 | 筛选/表格/表单有共享候选，但排序、缺值和动作语义不同。 |
| actions | 10027 | 43原名handler与薄分发；可读注册表不是可删除功能。 |
| pages/settings | 8881 | 账号/凭据/安全/审计各自合同，不能为省字删日志或一次性凭据流程。 |
| ui/components | 8176 | 已有field/formEnd/accountOptions等复用，不能把整个模块当新增收益。 |
| pages/reviews | 7811 | reviewModal约4120B、renderReviews约3663B；异步索引/弹窗世代必须保留。 |
| forms | 6063 | 写后成功流程有小段重复，登录/改密/凭据显示/账号刷新顺序不同。 |

在至少32B的精确相同Literal/TemplateElement cooked文本范围内，仅检出6组重复，忽略helper、调用、参数和转义成本的毛冗余345B。它不包含短字符串、不同表达式或近似模板，也不证明所有结构重用只有345B；反之不能把毛冗余当净收益。这些候选与原2804B试验可能重叠，绝不能相加形成假预算。

## 有界候选：先出净收益，未证明前不实施产品改造

| 候选 | 真实位置/复用方向 | 可用字节依据 | 必须保留的边界与收益状态 |
| --- | --- | --- | --- |
| 文章标题按钮/原文/缺值小组件 | articleTable、renderAttentionArticles、articleDetail、dashboardMetric、renderReviews | 精确重复静态片段分别94B、58B、44B等；总额含于上述345B | 共用helper可保持相同HTML，但调用开销可能抵消；e()/safeURL、data-action和三态缺值不变。净收益未知。 |
| 表单选择器与上下文布局 | articleModal、reviewModal、accountModal、keyModal及field/formEnd | articleModal2491B、reviewModal4120B是整函数大小，不是可删部分；精确上下文片段65B重复 | 只共享完整可读标签/选项渲染，保留id/label/required/disabled/过滤与焦点；不能通用化任意HTML或绕过e()。净收益待候选实测。 |
| 表单成功收尾 | submitSaveView/Article/Review/Revoke | 4处可观察到closeModal→toast→await renderPage→return的相同顺序，只有消息不同 | 仅这4处可考虑单一async helper；账号、密钥、登录、改密合同不同不合并。消息和异常/await次序保持；预计只是小项，不能把整个6063B算收益。 |
| 表格/指标行渲染 | dashboard的Top/关注/平台行，articles表与详情指标 | renderCumulative3507B、renderArticles3091B、articleTable2353B为分析范围 | 先列公共cell/数字/缺值组件输出，不上通用schema解释器，不改列次序或动态转义。当前没有已验证净节省数。 |
| 图表共享几何/图例 | renderPublicationTrend、renderTrend、既有CSSOM hook | renderTrend3050B只说明工作量；图表类型/空态有差异 | 只能共享相同的轴/图例拼接，保留13状态computed、受控CSS变量和CSP；不能删图、减少数据或文案。收益未知、风险较高，最后考虑。 |

请求/会话/索引世代、取消消费者、401、api()/e()/safeURL等已验保护不作为省字重写目标；不引入运行时依赖、框架、字典编码、符号缩写、物理行压缩或压缩器。把业务改成巨大数据表/字符串解释器也不叫可维护复用。

## 可执行的下一步与停止条件

1. 若另获结构优化范围授权，从该固定产品建立独立实验分支，先挑一组完整模板/小组件；先写可读设计与精确输出边界。当前文档PR不做此实验。
2. 每个候选只有在默认esbuild、UTF-8/ESM/不压缩下实际构建，记录“候选前B−候选后B＝净收益”，扣除helper/调用/格式化成本；源与生成产物同时保留。静态毛量不记为节省。
3. 同输入cooked输出、受影响动作/表单、转义/焦点/会话时序不变后才可计入收益；定点真实合成浏览器/截图验证受影响项，保留像素差异，不为测字节重复整套大基准。
4. 每一组独立记录且去除重叠。若合理可读候选没有合计≥15637B的已验证路径，明确报告不可证明可行，停止无目标微优化；由用户决定另立结构重构范围或延期未通过项。不能降低100000B目标或以“可见UI不变”代替体积达标。

**结论：目前未证明≤100000B可行，仍未通过。** 本账提供可复核定位与有限实验门槛，不承诺五项候选相加必能达标。
