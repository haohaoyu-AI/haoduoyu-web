# V98 上传诊断与恢复补丁

基线：Site `appgprj_6ac1907e61a48191a067ce3c30b21265`，线上版本 98，源码 `5e97a56e864fa9e5c34ff044b76dc23dd188f620`。补丁在独立 worktree `web-upload-recovery-v98` 完成，不覆盖根目录旧 Python 或其他 Codex 工作。仅代码修改和离线测试，未上传平台、改锁、改订阅或部署。

## 根因证据与边界

王星头条第一次真实 `setFiles` 返回后，页面明确“导入失败，请重试”；知乎第一次在菜单“导入文档”处等 chooser 超时，此按钮实际只打开第二层弹窗，真实选文件按钮为“点击选择本地文档或拖动文件到窗口上传”。后续正确取得 chooser 并单次提交后，知乎也明确导入失败。因此先前 chooser 假超时是步骤绑定问题；两平台提交后的明确拒绝是另一问题，内部原因尚未查明。2.84 MB 低于平台页面限额不能证明文件格式或平台内部处理正常。

旧 bridge 不支持正常预览／授权恢复，内存 claim 丢失只抛通用不可用。后端本来支持有效租约的精确指纹恢复，不必等到到期。旧 runner 无关联新 attempt 的输入，且旧 bridge 把关联预留返回的新 claim／单次 consume token 拒绝为不安全响应。这些断点会阻塞受支持恢复，但不能解释已实际提交后平台明确拒绝的全部原因。

## 修改

- 知乎显式 `ui.importStages` 为 `menu, dialog, file` 三步；每步记录本次观察 binding、`tab_id`、`browser_session`。只在实际本地文档按钮注册 waiter 并立即点击，误绑“导入文档”或跨会话在 reserve 前停下。既有可见性证据不再 Open／Cancel 预查。
- 明确区分 chooser 步骤失败、提交结果未知、真实平台拒绝；保留单次提交、readonly fence 和错误下一步。平台拒绝不被包装成 chooser 故障或审批基础设施已修。
- 已明确授权的手工重导使用新 session／关联 attempt，旧 URL 单独保留，新结果不可指向旧稿；重启 checkpoint 始终只读，无 grant／chooser。不同 linked action 仍共用文章／平台并发围栏，chooser 所有权由具体 session 绑定。
- bridge 只在工具宿主内存保存关联预留／正常恢复的新 claim 和单次 consume token；去除凭据后才向 Cua 返回。consume 发送前销毁本地 permit，超时或重放不补发。新 bridge 失去内存仍使用正常本人授权恢复，不写盘 token。
- `approvedScope.reimport[platform]` 必须匹配实际本人授权的 `authorization_scope/current_task_id/confirmation_message_id/current_word_sha256/word_size`，以及确认标志；同任务 `duplicate_tolerant_task` 沿用既有授权，不重新确认重复风险。`approvedScope.claim_recovery[platform]` 必须匹配精确 fingerprint 和本人原执行已结束／已核对成果的确认。后端原有许可门禁不放宽。
- 页面与认领失败回执明确有效占用可以在本人确认执行者结束后立即恢复，无需等到到期；仍在工作的执行者继续等待。恢复本身不授权导入。历史未绑定诊断不能覆盖新 attempt 当前进度。
- 已正确、已加载且有新鲜独立检查证据的知乎自动封面直接跳过，无封面 chooser／setFiles。有实际观察的私人 `ui.saveExit` 时，真见保存后退出再独立重开同 URL 核对；发布／删除控件仍拒绝。没有观察到退出控件时不推断退出操作。
- 补齐知乎非 pending 恢复的 readback／message／updated CAS，拒绝预览确认后同状态的新进度竞争。

## Word 兼容性结论

Library `libfile_4b792b1b3a0481918b34ac6a9617a69b` 确认正确最终稿与 2,841,251 B，期望 SHA 为 `235889852f291230e9708168c3a1a94ce82056380db7883ba5f65110515bdb44`。本地代码执行器正常 materialize 下载两次失败，没有最终字节；本地 `evidence/audit-docx-compatibility.py` 未对该最终稿运行。随后用户转交了原云端执行者对已合法下载原件及 Cua REPL 具名副本的只读校验结果：两份大小／SHA 均匹配，ZIP 26 项 CRC 通过，无重复／加密／宏／路径穿越，全部 XML／rels 可解析，23 个关系无外链／缺失目标，20 个真实 RGB JPEG 的 Pillow verify 通过，20 个 drawing／图片引用完整匹配；python-docx 正常打开，78 段（58 正文与 20 图片段）、20 inline shapes、1 节、5 个 Heading1。此处是明确归属的云端结果，未冒充本地复测，详见 `evidence/upload-recovery-v98-cloud-word-audit.json`。

缺少常见的 settings／theme／fontTable／docProps/app 本身不证明包违法：[Microsoft 最小合法文档示例](https://learn.microsoft.com/en-us/office/open-xml/word/structure-of-a-wordprocessingml-document)仅需要主文档部件；[官方 SDK 主文档约束](https://raw.githubusercontent.com/dotnet/Open-XML-SDK/main/generated/DocumentFormat.OpenXml/DocumentFormat.OpenXml.Generator/DocumentFormat.OpenXml.Generator.OpenXmlGenerator/Part_MainDocumentPart.g.cs)亦允许 settings／theme／fontTable 缺席。极简手工包与第三方导入器存在兼容差异是待验证的推测，当前没有具体结构错误或平台解析回执支持“补齐这些部件即可修复”。XML 可解析与 python-docx 可打开也不等于完全 schema／语义合规。下一项有定位价值的离线检查是用 [OpenXmlValidator](https://learn.microsoft.com/en-us/office/open-xml/word/how-to-validate-a-word-processing-document)只读打开原件（`WordprocessingDocument.Open(path, false)`），记录版本及每条错误的 part／XPath／类型／说明；只执行验证方法，不运行官方教学示例中的损坏演示方法。图片 verify 之后还可重新打开调用 load 完整解码，不能把 verify 直接称为完成全部像素解码。若发现具体问题，再制作保持正文、图片顺序与比例的独立副本并核验，不覆盖原件或直接重传。本次没有新增 Word 兼容补丁、修改原稿、试传或用旧本地稿替代。

## setFiles 路径证据边界

`scripts/browser-upload/file-ready.mjs:6–23` 只检查调用它的 Node 文件系统并返回 `visible_in_browser:false`。runner `preflight` 与后端预留／消费仅核验传入的可见性声明、路径、会话、大小／SHA 及前后一致性，不执行浏览器端文件检查。官方本地 browser 插件 `26.930.41038/docs/api.json` 的 `PlaywrightFileChooser.setFiles` 要求绝对路径对浏览器可见，但没有说明路径在 REPL、shell 还是浏览器宿主解析。现有网站源码也没有该官方工具的路径解析实现。

云端补证表明 REPL 的具名 `/tmp` 副本与 shell 可读的 browser 下载原件各自有效，同时两个文件系统视图不同。不能由任一端 stat／SHA 推导 chooser 可读，也不能凭不同视图断言这次 `setFiles` 失败或路径是平台拒绝根因。后续交接应分别记录实际 download.path 来源、REPL／shell 的字节检查和已有浏览器选择证据，复制成功不得自动改成 `visible_in_browser:true`。如果那一次提交的文件控件仍存在，可通过受支持只读检查补充 `input.files` 的 name／size／type；这些元数据仍不证明 SHA、服务端接收或导入成功，不触发新 chooser、setFiles 或 Open／Cancel 预查。当前未证实 chooser 路径解析端，也未证实浏览器取得的完整字节。

网页只验证外部步骤制作的最终 Word、冻结正文和图片；不是 DOCX 生成器。现有完整性验收不等于平台兼容性保证。AT-SPI、工具审批、浏览器传输和平台导入服务均不属于此补丁可修复范围。

## 验证

针对 runner、bridge、真实 SQLite 账本、恢复、关联重导、最终文件交接、Home React UI 和现有主线运行离线回归；真实平台／模型／生产数据库写入为 0。具体最终结果见本次提交和 `evidence/upload-recovery-v98-validation.json`。没有声称真实浏览器联调或两平台导入已恢复。

最终验证：runner 33 组、独立负例 14 项、恢复 34 组、关联重导 31 组、账本 21 组，以及 bridge／文件交接／Home UI／主线和真实SQLite新旧bridge集成全部通过；生产构建与 TypeScript noEmit 通过。选定文件 ESLint 有基线既存 14 错误／1 警告，逐项与 V98 原文对照，无新增 lint finding；未借此次补丁整理旧 any 类型。
