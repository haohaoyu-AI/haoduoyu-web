# 阶段 5a：后端时间工具与旧认证代码（实施检查点）

基线 dc598ac1c1b53303500e2313965c3f980d94d0ad，分支 opt/phase5a-backend-utilities。
只做 D2/D3；不包含 dashboard 弃用、日志/request_id、UI 或生产变更。

## 已核实差异与边界

- records.beijingDay(stamp=Date.now()) 与 overview.beijingDay(stamp) 的省略/undefined 不同，必须保留 records 薄适配。
- analytics.beijingDate 先要求字符串且 Date.parse 有效；无效返回 null，不能替换成无条件数字转换。
- records.shiftDay 的模板字符串转换与 overview.shift 的 + 拼接转换，对自定义转换对象可能不同，保留两条精确适配。
- overview.median 先复制排序，偶数用 a/2+b/2；records/dashboard 与 analytics 的已排序数组中位数用 (a+b)/2。大数、NaN、空值与输入变异语义不可混同。
- coverageForDay 仍被 dashboard 使用，保留；dashboard HTTP 行为不改变。

## 旧认证函数引用初查

全仓库 rg 检查源、测试、脚本、文档、前端、工作流及动态 import 路径。
shared/auth.mjs 中 createUser、sessionCookie、authenticate、createSession、audit 仅有定义，
唯一相互调用为旧 authenticate → 旧 sessionCookie。src/security.mjs 的 authenticate/sessionCookie
和 src/storage.mjs 的 store.audit 是实际在线实现，不删除。
实际 shared/auth 消费者导入 hashPassword/verifyPassword、fail/digest/csrfFor/checkCsrf/checkOrigin；
测试另导入 validatePassword；基线唯一 shared/auth 动态 namespace 消费者只访问 fail。尚需完成最终符号/结构断言与引用清单。

先保存方案，再以原实现可执行行为刻画、提取前后合成输入/接口完整对照证明等价。
不编造修前业务失败；结构性去重和死导出断言可以先红后绿。
继承 4c 的 115637 B 预算缺口与 strict PNG 47/56，不宣称在本阶段解决。

## 已完成实现与初轮验证

src/lib/time.mjs 集中 DAY、北京时间转换、两种精确 shift 适配、distance/dates 与两种中位数策略。
analytics 保留 validStamp/beijingDate 的原导出兼容；records 默认时钟包装及过滤/排序位置保留。
shared/auth 删除上述五个旧函数和仅供它们使用的 randomUUID 导入，所有存活认证函数及
scrypt 参数逐声明原文相同。src/security、storage、worker、backup 业务实现不改。

baseline 固定 233 个跟踪文件，102 个 JS 模块完成 AST 检查；全部相关文本路径也核对，
8 个真实导入/动态导入位点见 backend-utility-audit.json。该静态审计覆盖仓库内调用，
不声称知道仓库源码的外部使用者。在线同名函数和 coverageForDay 保留。

先执行基线行为刻画：默认值、对象转换提示、中位数 overflow 差异全部正常；
结构断言因 time 模块不存在和旧 createUser 导出仍存在而红，不是修前业务故障。
提取后初轮 6/6 通过：4 个本阶段测试及原错误合同 2 项，包含 52 个匿名/管理员真实 Worker
完整正文、状态、安全头对照，没有易变字段投影或 CSP 归一化。使用 18/72/180 合成记录；
不运行大型性能基准。保留四个原死分支错误 tuple 的历史快照，仅在比较中精确排除，
其余 108 静态调用点和 20 个真实 HTTP 错误响应保持。

两次测试驱动修正单独留日志：先误传生成器参数、再只冻结 Date.now 导致备份 exported_at
不同。修正为同一构造器/时钟，不删除备份字段；断言失败只打印路由，避免输出合成备份中
临时认证散列。原失败日志仅本地保留，不上传。最终全量测试与 CI 尚待终态。
