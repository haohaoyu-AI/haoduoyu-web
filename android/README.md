# 好多鱼 Android 统一薄壳候选 3.0.0

当前分支候选为 `3.0.0` / `versionCode 4`，启动 `MainActivity` 的同一网站前端，不另建原生业务首页或新原生同步队列。DOM Storage、IndexedDB 与 Service Worker 沿用同一个第一方 WebView profile；返回、系统文件选择、外部链接与下载保持原有边界。网络恢复只向严格受信 origin 发送固定唤醒事件，不赋予身份或写入权限。

旧 SQLite 文件与 schema 保留。恢复前先验证原始分块字节并建立可核对的私有备份，仅原先已同意、且线上仍是同 origin/account/scope 的旧队列可以由旧引擎继续核对。未获同意、冲突或异常状态可在原生只读入口查看、复制和完整导出；大型内容使用系统文件导出而非剪贴板。导入历史备份只建立只读副本，不进入网页或旧版可执行队列。旧周期任务取消且服务禁用，旧库不改名或删除。

旧任务恢复到 `OfflineActivity` 时也进入薄壳；若系统 Bundle 仍带草稿，先将正文、tab/date 与空值语义保全到独立私有只读文件，再跳转网页。落盘失败会保留可复制、导出和重试的恢复页。保留的 2.0.1 APK 只是参考，不能从 code 4 原地降回 code 3；正式发布前还须验证同原证书、更高版本码的回退构建或可靠恢复方案，不能靠卸载或清除数据回退。

正式 3.0 APK 尚未签名、未交付、未实机验收，仍待网站离线验收与家机原发布私钥。云端只产出明确标注的独立 debug 参考包与不可安装的 unsigned release；不得用测试密钥冒充正式覆盖升级。详见 [UNIFIED-V3.md](UNIFIED-V3.md)。

## 已保留的 2.0.1 正式交付说明

此前已交付版本：`2.0.1`，`versionCode 3`。其默认原生本地工作台、授权与同步说明原样保留如下，且 CI 对固定 `d5e4173` / Android tree `23fcf5c` 重建并执行原 80 项 JVM 与 16 项 Node 检查；它们不是 3.0 新界面的使用说明。

2.0.1 修复 2.0.0 错误要求登录而无法接入匿名公开工作台的问题。实现提交 `337140824124c055fe4a94e9746129d5b8583a6c`、[CI 40333738055](https://github.com/haohaoyu-AI/haoduoyu-web/actions/runs/40333738055) 已通过 80 项 JVM/SQLite/原生界面测试与 16 项返回/API 契约测试，无失败或跳过，debug/release lint 与编译通过。86,644 字节正式 APK 已用原发布密钥签名并交付 Library，SHA256：`6d2ac04d3fe33131c3d90544a41c40d654d006bd186e93584257c6845f77fce6`。尚未实机验收或生产公开工作台端到端写入验收。

## 2.0.1 首次使用与覆盖升级

网站无需注册或登录。App 联网后自动核实同一个公开工作台并下载已有记录。点击顶部“点此允许本机记录公开同步”或“更多 → 公开工作台与同步授权”，阅读目标与公开性说明后选择“允许公开同步”，之后自动上传本机队列。暂不上传仍可本地记录和下载。

从正式 2.0.0 直接覆盖安装，保持 `xyz.haoduoyu.personal` 与原发布签名，版本码由 2 增至 3。不要卸载或清除数据。SQLite 表与状态 schema 仍为 1；没有绑定其他身份的旧实体、未发送队列、草稿和位置原样保留，目标绑定与公开上传授权分别持久化。旧私有身份、旧 frozen wire 或未知线上基线不会被改写成公开请求，遇到这类状态会保留并暂停。

新增检查使用合成数据经过真实网站 worker 的匿名入口，覆盖公开身份、请求头、拉取、幂等、冲突、删除和工作台范围隔离；Android 检查覆盖对应客户端协议、真实请求头构造与 2.0 SQLite 覆盖升级交互。测试不写生产内容，也不代表真实手机端到端验收。

## 2.0.1 历史范围

| 模块 | 本地使用范围 |
| --- | --- |
| 待办 | 按日期新建、圆形勾选/取消完成、长按删除；保存先落盘，再同步 |
| 生活、工作碎碎念 | 独立条目离线新建、编辑、删除；旧按日期日记保留独立身份 |
| 备忘录 | 本地读取、新建、编辑、删除笔记，保留分组关系 |
| 每日工作提醒 | 读取实际获取的日期摘要，没有新增系统定时通知 |
| 图文 | 读取实际获取的 published 记录元数据，不含未获取记录、完整原文或配图文件 |

当前待办 API 支持新建、完成状态和删除，线上已有待办文字不能原位编辑。需要改名时先保留原记录，再新建所需内容。备忘录首版不做跨组移动或分组批量删除。

启动无需等待远程网页首屏。输入草稿、模块/日期和列表位置持久保存；创建/编辑与清空相应草稿在同一事务完成，保存成功后才更新保存流程。存储失败保留输入并提示，不自动清空或重建数据库。

“更多”保留原网页入口。网页自身的未保存输入遵循原站行为；离线高频编辑使用本地工作台。同步细节见 [OFFLINE.md](OFFLINE.md)。

## 数据与同步

- 应用内部 SQLite 同时提交数据、草稿、身份、冲突和 outbox。UTF8 状态拆成最多 256 KiB 的 BLOB，验证总字节、块数和 SHA256，避免大 TEXT 超出 Android CursorWindow。
- 记录使用稳定实体 ID，操作使用稳定 UUID。首次发送前冻结原请求、版本和操作 ID，重试继续原请求。
- 复用完整工作台清单和分日期快照，验证范围、manifest、日期及内容 hash。分段先暂存，完整且前后清单稳定后一次对账。
- 冲突保留原基线、本地和线上内容，等待本人处理。删除保留墓碑，普通编辑不自动复活记录。
- 公开目标由网站明确返回的 `publicBusiness: true`、`id: public-business` 与完整快照 `scope_id` 共同核实。身份固定为 HTTPS origin 与 scope 的派生标识；首次联网先下载，明确允许该目标公开上传后才提交本机队列。非公开身份、权限或范围变化时暂停并保留数据，不自动切换目标。
- 联网恢复、回到 App、手动同步和 JobScheduler 可触发同步；后台可能延迟，强制停止后需重新打开，不能保证立即同步。

仅申请 `INTERNET`、`ACCESS_NETWORK_STATE`、`RECEIVE_BOOT_COMPLETED` 三个普通权限。没有新增相机、麦克风、定位、共享存储、通知或精确定时闹钟权限。

## 隔离与后续范围

工作分支为 `android/personal-v1`，改动限于 Android 工程和专用 CI。不改网站、`main`、第六轮发布分支、后端、数据库迁移或部署，不新建独立业务数据源。

首版复用既有版本 CAS、幂等收据和完整快照，本轮无需后端扩展。统一大规模分页增量、图文全部状态和精确硬删传播需后续单独讨论；完整原文/配图离线还需要原文附件契约。

## 编译与检查

工具链：JDK 17、Gradle 8.9、AGP 8.7.3、SDK Platform 35、Build Tools 35.0.0。最低 Android 8.0（API 26），target/compileSdk 35。原网页入口仍需系统 Android WebView。工程未提交 wrapper JAR。

在 `android/` 使用已有工具链运行：

~~~text
node --test tests/back-script.test.mjs tests/offline-contract.test.mjs
gradle --no-daemon :app:testDebugUnitTest :app:lintDebug :app:lintRelease :app:assembleDebug :app:assembleRelease
~~~

检查包含核心状态与队列、Robolectric 真实 SQLite 适配和原生界面、协议、源 API 契约及原返回回归。本版本已完成上述自动化验证；自动化不能替代手机实机验收。

- debug：`app/build/outputs/apk/debug/app-debug.apk`
- release：`app/build/outputs/apk/release/app-release-unsigned.apk`，待签名，不能直接作为可安装正式版交付

~~~text
apksigner verify --verbose --print-certs app/build/outputs/apk/debug/app-debug.apk
aapt dump badging app/build/outputs/apk/debug/app-debug.apk
zipalign -c 4 app/build/outputs/apk/debug/app-debug.apk
~~~

实际交付记录源码提交、构建类型、APK 字节、SHA256、证书 SHA256、最低系统和 LibraryID，以真实文件和上传回执确认。

## 签名、安装与验收

正式 applicationId 为 `xyz.haoduoyu.personal`；debug 为 `xyz.haoduoyu.personal.debug`，版本名追加 `-debug`。临时调试签名不能冒充稳定发布签名。

本版本已在获准的本机用户文档专用私有目录创建加密 PKCS12 发布密钥，密码仅存 Windows 凭据管理器；未将密钥或密码放入仓库、聊天或 Library。后续同包名覆盖升级必须沿用同一签名。独立离线加密备份仍待用户指定受控位置；不得擅自上传秘密。临时 debug 签名不能替代正式签名。

本人收到经核验且已签名的 APK 后，在自己的 Android 8.0+ 手机下载并打开安装。安全或管理策略阻止时停止，不降低安全设置、关闭扫描或绕过限制，不远程安装。

更新前确认已保存内容和待同步队列。签名不一致时保留现有 App 和数据，不直接卸载绕过冲突；卸载或清除数据会删除未同步记录和草稿。本版尚无完整数据库备份/恢复界面。

实机待验收：无网冷启动/输入、中文输入法/键盘、勾选/长按/返回、切后台/重启、日期/位置、联网恢复、网页并发冲突、删除不复活、会话失效和后台限制。使用测试数据，不自动写入生产记录测试。

## 旧预览交付记录

旧源码：`4f145f9a63538596f483be67a0fc240b267248b4`。该包是在线 WebView 预览，未实现本版离线数据层。

- 文件：`haoduoyu-personal-v1-4f145f9-debug-preview.apk`
- LibraryID：`libfile_9cbb0ee1077c81918912c273fc59c1a9`
- [下载旧在线预览包](https://chatgpt.com/api/library/files/libfile_9cbb0ee1077c81918912c273fc59c1a9/download)
- 字节：`27947`
- SHA256：`fc34966eb4d963bae5402c8fed49f2c56e2501b80b392d5f984350a2cc21df40`
- 原 CI `40296009533` 成功但未保留文件；实际领取来自 CI `40309850238`

此 LibraryID 只标识上述旧包。离线新版使用自己的实际构建与上传回执，不复用旧包身份。
