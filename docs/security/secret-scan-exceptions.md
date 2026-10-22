# 全历史密钥扫描的精确例外

阶段0使用官方 Gitleaks 8.30.1 默认规则扫描全部可达分支/历史，原始为139个 generic-api-key 命中、退出码1。独立逐条证明：81个合成凭据/敏感字段夹具、3个合成幂等标识、55个内容SHA256。哈希重算匹配，测试值核对构造与消费，不按 tests 路径豁免。

.gitleaksignore 只保存不可变历史提交的精确 Fingerprint（提交、路径、规则、行），不含 Secret、Match、作者、原始报告或生产数据。新提交即使相同路径也不会匹配旧指纹。新增例外须另行证明来源并审查，不能自动追加或排除目录。

CI 用完整 checkout、--all --full-history -m --root、强制脱敏及忽略 inline allow 注释，只应用这些指纹。应报告“精确例外后的新增告警”，不能将原始命中说成零。密钥扫描不能替代生产派生夹具的隐私审查。

两个 CI job 均检出实际 PR head（push 时为该 push 提交），fetch-depth 为0。这样检查对象是可读回的源提交，不是 GitHub 临时生成的合并对象；否则同一资源哈希会因每次临时 merge SHA 改变而重复产生不同指纹。真实分支合并历史仍按 -m 扫描。main 合并后还须单独完成干净克隆验收，不能用 PR head 检查替代。

扫描二进制来自[官方固定发行版](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)，SHA256固定校验。Fingerprint定义见[官方说明](https://github.com/gitleaks/gitleaks#-gitleaksignore)。原始扫描留在受限工作区，不随公开分支上传。

本阶段资源 pin 清单另有2条 generic-api-key 误报：api-docs.html 与 openapi.json 的内容SHA256，均逐项重新计算匹配。仅追加首个恢复提交中这两处的精确指纹，原始告警留在受限工作区。因此原阶段 1 验收提交的精确例外总计 141 条，不是把原始扫描改写为零。

阶段 1 获批的 squash 合并以新提交身份再次引入同样的两个公共资源 SHA256。已从公共文件独立重算并确认匹配，仅新增这两处在 squash 提交中的精确指纹。因此阶段 1 修复完成时精确例外总计 143 条（阶段 0 的 139 条 + 原阶段 1 的 2 条 + squash 提交的 2 条）；未排除任何规则或目录。

B1 将 OpenAPI 更新为 1.1.0，相应 public 资源 pin 的新内容 SHA256 触发 1 条 generic-api-key 误报。已独立重算 public/openapi.json 并匹配，仅增加首次 B1 源提交中该项的精确指纹。B1 原验收分支总计 144 条（前述 143 条 + B1 的 1 条），原始脱敏结果仍保留，不将其表述为原始零命中。

B1 获批 squash 提交以新身份引入同一 OpenAPI 1.1.0 内容摘要。独立复算确认与验收内容一致，仅新增该 squash 提交的 1 条精确指纹。B1 合并修复完成时总计 145 条（前述 144 条 + B1 squash 的 1 条），没有新增规则或目录豁免。

B2 为 AuditRecord 新增可选 entity_label，并更新相应 public OpenAPI 内容摘要。新增 1 条 generic-api-key 命中已独立重算确认，仅记录首次 B2 源提交的精确指纹。B2 原验收分支共 146 条（前述 145 条 + B2 的 1 条）；原始脱敏扫描保留，没有规则或目录豁免。

B2 获批 squash 提交以新身份引入同一已验收 OpenAPI 内容摘要。独立重算并与原验收文件逐字节比较一致，仅新增该 squash 提交的 1 条精确指纹。B2 合并修复完成时总计 147 条（前述 146 条 + B2 squash 的 1 条），没有新增规则或目录豁免；原始脱敏结果保留。


C4 首个实现提交 92cb38ad06392a33330e8b567d96ce2a406ded83 的 `.ci/public-assets.json:10` 命中 generic-api-key，实为新增轻量读取契约后的公共 OpenAPI 内容 SHA256。分别从当前 public/openapi.json 与该提交的 Git blob 独立重算，均与该行 pin 一致（129952 字节），不是凭据。仅新增此提交/路径/规则/行的精确指纹，C4 原验收分支共 148 条；原始 1 条脱敏告警保留，不排除规则、目录或未来提交。

C4 获批 squash 提交 dfb9751a43f785af606f12ec6900660ede7dd820 再次引入同一公共 OpenAPI 摘要，主分支 CI 39762328017 扫描报告 1 条告警。本地同参数全历史扫描确认唯一命中仍为 `.ci/public-assets.json:10` 的 generic-api-key。分别从 squash 和已验收提交 1f54abdd57313884b92a63b1c99dc1483367577c 读取 public/openapi.json，独立计算 SHA256，均匹配该行 pin；129952 字节正文及整棵文件树一致。仅新增该 squash 提交/路径/规则/行的 1 条精确指纹，当前共 149 条。原始脱敏扫描结果保留；没有扩大规则、目录或未来提交的豁免，也没有改变产品源码。
