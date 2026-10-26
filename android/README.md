# 好多鱼 Android 自用版

当前工程版本：`2.0.0`，`versionCode 2`。默认进入原生本地工作台，待办、备忘录和生活/工作碎碎念通过本地数据层读写，与 `https://haoduoyu.xyz` 的既有 API 共享线上数据。原 WebView 保留为低频功能入口。

状态：离线候选版，debug 暂供测试；release 默认未签名。新增自动化检查待对应提交 CI 实际验证，尚未实机验收。正式交付仍需长期发布签名的针对性批准和实际文件校验。

## 本版范围

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
- 账号与范围固定。会话失效、无权限、换账号或范围变化时暂停同步并保留队列，不切换公开模式重放。
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

检查包含核心状态/队列、Robolectric SQLite 适配、协议、源 API 契约和原返回回归。新增检查待对应提交 CI 确认；自动化不能替代手机实机验收。

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

当前没有长期发布签名配置。默认不生成私钥、不保存密码、不上传 keystore；创建密钥、保护位置、备份和持续访问须先获针对性批准。同包名覆盖升级必须保持兼容签名；密钥丢失可能导致无法正常覆盖升级。临时 debug 包不能保证后续覆盖升级。

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
