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
测试另导入 validatePassword；两个动态 namespace 测试只访问 fail。尚需完成最终符号/结构断言与引用清单。

先保存方案，再以原实现可执行行为刻画、提取前后合成输入/接口完整对照证明等价。
不编造修前业务失败；结构性去重和死导出断言可以先红后绿。
继承 4c 的 115637 B 预算缺口与 strict PNG 47/56，不宣称在本阶段解决。
