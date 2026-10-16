# 成品保存前恢复：验证记录

正式源码基线：V135，`4949dbc651abfc1ba5ec3a08a13ff7457a9714ae`。新迁移 `0045_article_word_executor_recovery`。

独立执行者使用实际 Site TypeScript 和隔离 workerd D1 完成 **58 组**合成测试，退出码 0；测试期间八个关键文件哈希不变。覆盖持有者结束/外部终态绑定、主 claim 过期不等于终止、重复及倒序事件、十路同请求和双请求竞争、丢响应同 key 回读、事务回滚、完整 snapshot 变化、旧原生及 checkpoint/progress 缓存和 R2 迟到写入、既有 Word 分块身份保留并续同份 DOCX、暂停/取消、合法 0/0 容量排队、旧接口绕过和已结束 execution ID 复活拒绝、7/2 分池、只读终态、旧记录兼容、审计不可变与敏感引用拒绝。

另外一名审查者实际执行七项独立 D1 兼容断言，审查新 MCP 契约及迁移；第二份静审检查了终态与 CAS 边界。两份审查无剩余发布阻断。外部 Codex 终态仍明确为 owner-attested，测试不会假称服务器认证外部线程。

根执行的 16 个既有回归 suite 中，0033 help-queue migration test 首轮因原测试固定假定自己是最后 migration 而失败；其失败日志保留。已将该历史测试隔离到准确 0032→0033 journal 前缀，真实 workerd D1 重跑通过；修改后相关八个 suite 的最终重跑全部通过。旧 partial recovery 用例改为验证拒绝 boolean-only 绕过，原有效持有者仍可续同份 Word 并独立读回。其他初轮 suite 全部通过。

最终 TypeScript 检查和生产构建均退出 0。迁移核验确认原 90 个 migration SQL/snapshot 产物字节不变、旧 journal 前缀及 68 表定义完全保留，仅新增两表和四个不可变触发器；143 个页面/组件文件与基线字节一致，hosting/capabilities、依赖、清空、Windows 和 bridge/host 无变更。

完整日志和带源码 SHA 的独审位于独审包 evidence/preword-recovery。真实原任务只作授权只读核对，不用于合成写测试。没有新增真实图片字节、没有新真实 Word，没有实际 Word 页面渲染或桌面落盘验收。本轮环境没有可调用的受支持浏览器工具；未做本轮视觉验收，页面字节一致不冒充浏览器验收。
