# 阶段 5b：保留旧 dashboard 并标记弃用（红灯检查点）

基线 307d54f84a7e817955aa5b5f2fb173f4c545cd23，分支 opt/phase5b-dashboard-deprecation。
只处理 D4。保留 /api/v1/dashboard、全部字段、计算和授权；仅给原有成功 200
响应增加 Deprecation: true。错误响应和其他路由不增加此头。

OpenAPI 保持 1.1.0，只给该 GET operation 增加 deprecated:true 与成功响应头说明。
没有删除日期、Sunset、自动清理或未来自动删除任务。最终是否删除由站长另行决定，
api_keys.last_used_at 不能证明某个接口的调用情况。

本次测试锁定完整旧正文、状态及其余所有响应头，只精确投影规定的新增头和文档。
原实现缺少弃用标记与成功头应先红；接口行为原先正常，不将这描述为产品故障。
不开始 E2 日志/request_id，不改 UI、schema、配置、权限或生产，不部署。
既有 JS 115637 B 与 strict PNG 47/56 缺口继续保留。
