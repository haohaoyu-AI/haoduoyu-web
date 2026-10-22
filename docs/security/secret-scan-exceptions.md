# 全历史密钥扫描的精确例外

当前精确历史指纹总数为 154；下列各阶段数量是当时记录，不代表当前总数。

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


阶段 4a 提交 abe3540cabddd9c479e2efa7a654aac648320a90 的 docs/frontend-product-hashes.json:5 命中 generic-api-key。该值是已公开 web/core/api.mjs 的源码内容 SHA256；执行器与独立评审分别从其 2047 个原始 UTF-8 字节复算，均与清单值完全相同，不是凭据。经 dot 明确批准，仅新增该提交/文件/规则/行的单条精确指纹，当前总数 150 条。原始失败 CI 39831884330 和脱敏扫描仍保留；没有文件、目录、规则或未来提交豁免。


阶段 4a 获批 squash 合并产生 main 2b3df6e730cc35166886774d032de9c35c2d06f0。该提交整树与已验收 head 71ea2e96e8715a4bbd422ad296ae331dc2527d54 相同，主分支 CI 39834576035 的 98 提交扫描仅重新报告 docs/frontend-product-hashes.json:5 的同一 generic-api-key 告警。执行器与独立评审从 main 的 web/core/api.mjs 原始 2047 UTF-8 字节复算，均与已审公开摘要一致。经 dot 明确批准，仅追加该 squash 提交/文件/规则/行的单条精确历史指纹，当前共 151 条。原始失败和脱敏结果保留；没有产品修改、文件/目录/规则豁免或未来提交豁免。

阶段 5b 提交 060b2af771348779aff41a99da0a8deb1fcbb4f4 的 .ci/public-assets.json:10
触发 generic-api-key。该行唯一值是保留 dashboard 并增加弃用标记后的公开 OpenAPI
内容 SHA256。执行器用 Python/Node，独立评审从该提交的原始 Git blob 解码后也用
Python/Node 复算：130322 B，均匹配该行 pin。不是凭据。经 dot 明确批准，仅追加
该提交/路径/规则/行的 1 条精确历史指纹，151→152；原失败 CI 39857127481 与脱敏
报告保留。没有文件/目录/规则或未来提交豁免，没有产品或权限修改。

阶段 5b 获批 squash 合并产生 main 8bf4543ca713305315906c6074e6caf76f911ea9，整树与
验收 head 389bd0340eb1fd485f61f7dfa2c3ed9106088b2e 完全相同。主分支 CI39858843126
功能222/222、构建/资产/双预览通过，扫描121内容提交仅重新命中 .ci/public-assets.json:10。
执行器及独立评审从该 main 原始 Git blob 读取130322 B，以 Python/Node 复算的公开
文档 SHA256 均与原获批 pin 完全一致，不是凭据。原152条指纹原字节不变；经 dot
明确批准，只追加该 squash SHA/路径/规则/行的1条精确历史指纹，152→153。原失败
CI及脱敏结果保留；本次只修审计记录，没有产品、路径/目录/规则、未来提交或权限变更。


阶段5c提交6b02e4a56baac4a8c217cdc52ef77e66a1d3c754的 .ci/public-assets.json:10
触发generic-api-key。执行器与独立评审分别读取公开OpenAPI的135847个原始UTF-8字节，
Python/Node复算SHA256均与pin精确相同；Git blob为d9eb6f5591f4d3c82c903dcba19749c93e7ff7e6。
不是凭据。经独立复核及用户明确批准，仅追加该提交/路径/规则/行的一条精确历史指纹，153→154，
原153条原字节保留。原失败PR CI39863560152扫描126内容提交仅此1项；本地all-refs
扫描128内容提交也仅此1项，覆盖范围不同，数量不冒称相同。原脱敏结果保留，没有文件、
目录、规则、未来提交、产品或权限豁免。
