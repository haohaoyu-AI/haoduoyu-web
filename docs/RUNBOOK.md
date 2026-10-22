# 运维与本地验证

## 本地环境

按 README 使用 Node24 安装、测试和构建。默认 npm 缓存不可写时，可将 npm_config_cache 指向工作区专用目录，不关闭 TLS 或包完整性校验。

npm run dev 打开本地 .preview/d1，只监听回环地址，不自动初始化。若需本地初始化，为该进程提供随机一次性 MATRIX_BOOTSTRAP_SECRET，将 origin、bootstrapSecret、明显合成的 username/password 经 scripts/initialize.mjs 的 stdin JSON 传入。不得将真实值放入命令参数、终端历史、日志或仓库。初始化后移除一次性秘密。

无需持久数据时用 preview:analytics。check:previews 为 dev 建立专用临时目录，检查两个入口的 HTTP 与预期认证状态，最后销毁自己拥有的进程和目录，不删除已有本地数据。

## 正式发布：另行批准后执行

1. 读取当前 Sites project、域名、源提交及 saved version，在非公开运维记录保存 version_id、deployment_id、环境 revision。当前基线是 Sites v6，计划标签名不等于 Sites 版本号。
2. 确认 PR、最终提交、CI 和所需契约/浏览器检查对应同一源码，不能把本地通过说成远端 CI 通过。
3. 走当前正式 Sites 技能，保持项目身份、访问权限、数据库和环境配置；不拿 deploy 当预览，不新增凭据或扩权。
4. 持久保存批准源码并独立读回；按受支持 helper 构建、归档和保存版本。站长确认后才 deploy，等待终态。
5. 验证域名、登录和主要只读页面/API。生产写入冒烟另用获批测试账号及范围，准确保留失败和已知限制。

GitHub push/PR 不等于 Sites 发布。外部写入前核实自动部署连接，不能因 Actions 无运行就认为 webhook 为空。CI 本身没有发布步骤。

## 回滚、备份与恢复

回滚也是正式部署，需要批准。重新部署发布前保留的 saved version 并核实终态，不恢复旧数据库或覆盖期间新增记录。结果未知先只读查状态，不能重复发布。

数据备份为受限材料，不入 Git。现有恢复只接受空的隔离目标并检查完整性；目标、身份、绑定未确认不得执行。线上 bootstrap 必须独立批准，不能使用本地测试凭据。数据库结构和安全设置变更不在本阶段内。
