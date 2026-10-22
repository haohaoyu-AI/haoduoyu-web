# 全历史密钥扫描的精确例外

阶段0使用官方 Gitleaks 8.30.1 默认规则扫描全部可达分支/历史，原始为139个 generic-api-key 命中、退出码1。独立逐条证明：81个合成凭据/敏感字段夹具、3个合成幂等标识、55个内容SHA256。哈希重算匹配，测试值核对构造与消费，不按 tests 路径豁免。

.gitleaksignore 只保存不可变历史提交的精确 Fingerprint（提交、路径、规则、行），不含 Secret、Match、作者、原始报告或生产数据。新提交即使相同路径也不会匹配旧指纹。新增例外须另行证明来源并审查，不能自动追加或排除目录。

CI 用完整 checkout、--all --full-history -m --root、强制脱敏及忽略 inline allow 注释，只应用这些指纹。应报告“精确例外后的新增告警”，不能将原始命中说成零。密钥扫描不能替代生产派生夹具的隐私审查。

两个 CI job 均检出实际 PR head（push 时为该 push 提交），fetch-depth 为0。这样检查对象是可读回的源提交，不是 GitHub 临时生成的合并对象；否则同一资源哈希会因每次临时 merge SHA 改变而重复产生不同指纹。真实分支合并历史仍按 -m 扫描。main 合并后还须单独完成干净克隆验收，不能用 PR head 检查替代。

扫描二进制来自[官方固定发行版](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)，SHA256固定校验。Fingerprint定义见[官方说明](https://github.com/gitleaks/gitleaks#-gitleaksignore)。原始扫描留在受限工作区，不随公开分支上传。

本阶段资源 pin 清单另有2条 generic-api-key 误报：api-docs.html 与 openapi.json 的内容SHA256，均逐项重新计算匹配。仅追加首个恢复提交中这两处的精确指纹，原始告警留在受限工作区。因此当前精确例外总计141条，不是把原始扫描改写为零。
