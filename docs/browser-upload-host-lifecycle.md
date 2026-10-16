# 私人草稿上传的宿主执行生命周期

用户操作仍是“新建文章 → 一键导入文档”。下列租约、文件交接和失败处理由已有授权的工具宿主内部完成，不增加用户确认或上传前检查页面。

当前正常首次头条、知乎私人导入统一 coordinate/native 分步主合同：CUA仅完整native-only定义，认证parent保留业务core/MCP/全baseline；真实prepare后claim/reserve/consume/saving，validate前真实gate auth，readonly validate返回dispatch_ready，父同步核对取消/真实ready/15秒后burn并立即单次物理派发。详见 [当前步骤协议](native-coordinate-step-protocol.md)、[两平台合同](private-draft-host-transfer.md) 和 [真实验收](native-coordinate-host-validation.md)。下文v99及头条browser/旧runner操作流程是历史或既有显式兼容，**不是当前默认**；原许可围栏、正常结束和平台独立状态仍适用，不自动回退、不借新程序重放拒绝。历史source/blob/真实失败证据原样保留，不覆盖本次handoff版本及SHA。

## 历史源码和真实证据（2026-10-07）

当时补丁针对正常 Sites 工具确认的 v99，生产 source commit 为 `328367190d66f4ead9eebab083d848c81b087582`。根已在完整权威 checkout 整合 A + ddd + abe 并上线。当时执行器使用此前完整读取的权威指定文件和上述精确补丁组合，稀疏 Git 的 ancestry 不是生产 ancestry；下表保留当时补丁前 blob，不能全量部署原 v98 checkout：

| 文件 | 补丁前 blob |
| --- | --- |
| scripts/browser-upload/bridge.mjs | ae804ae717bc0ea6efd337e0e3f969941c2d5d00 |
| tests/browser-upload-bridge.mjs | d5a47346837fce69cd7cde8b439fe73024bec9d2 |
| lib/article-upload-execution-end.ts（本次不改） | 6d0c92b05e012a4fe679c4fcdf7f7a6471766671 |

根已报告生产验收：王星 TT 恢复当前 lease 后，原生输入再次报告 AT-SPI 错误，没有新增 attempt 或文件提交；正常 `finish_article_upload_execution` 返回 `released=true`，独立 preview 确认 `claim_present=false`，原 Word 和旧 attempts 保留。这证实既有结束接口能避免本次继续占用六小时；本执行器未调用生产结束、清锁或平台操作。

随后根的新实际观察是：同一原生 Chrome 的 GTK picker 在 Home/downloads 只有旧 Word，没有王星。该 picker 文件空间不在执行 shell 或 Cua Node fs 的可见范围内。Node/tmp 副本的 size/SHA 不证明原生 Chrome 能读它，也不能单凭这个观察把此前 SDK 平台拒绝的原因判定为文件空间。

根随后尝试本人网站原稿正常“下载Word”控件，页面变为 chrome-error://chromewebdata/；正常 DOM 工具拒绝读取非 http/https，执行者未绕。下载记录仅旧 UUID 且标记已删除，实际 picker 仍只有两旧 Word，没有新王星；没有 claim/new attempt/Open。该历史故障不证明本次下载已成功，也不确定401、网络或其他原因；不换绕行URL、不改变安全设置。

## 文件导入主路径

1. 由正在导入的同一云 browser 使用本人网站正常 final Word 下载入口取得已有完整 Word，沿用当前 handoff 的身份和现有授权，核对原文、图片、size/SHA。正常官方下载事件和 `download.path()` 按 [同一执行者交接](file-handoff-entry.md) 操作；不猜另一个执行器的路径，不重新生成 Word 或配图。
2. 按平台准备真实选择器，尚不选择或提交文件。头条 Codex 法先注册 filechooser 等待再点击真实文件控件；知乎坐标法由当前截图定位，真实鼠标单击三步导入菜单／弹窗文件控件并等待稳定，保留唯一原生窗口，不注册 browser filechooser。AX 空树不是空文件，另一个 fs 的 stat 成功不是此 picker 的可见性；窗口位置／尺寸变化重新定位，不使用 TinyFish。
3. 宿主内部为该平台 attempt 正常 reserve/consume，只有该次 `execute_import=true` 且真实 saving 写回成功才通过 runner 的 `submitAfterSaving` 提交一次：头条同一 chooser 一次 `setFiles`；知乎同一原生窗口单击准确 Word 行、确认选中后单击 Open 一次，不默认双击。不要在 runner 外先按 Open，再调用 runner 或 SDK 重复提交。缺少对应真实宿主能力就停止，不自动切换方法；SDK 正常 `goto` 是导航，不等同文件提交。
4. 可访问性报错可能发生在正常动作后。先读原页截图/正常状态，不能自动重放刚才同一个 click/type/Open。只有真实新的状态证据才能决定后续动作；没有新的进展时停下记录结果。
5. 导入成功后，正确自动封面跳过；内部保存退出、重开同一草稿核对。真实保存与重开证据齐备才记录成功。不得逐图替代完整 Word 导入、重复 Open/Cancel 或假定保存成功。

`prepareNamedWord` 仍只检查本执行器已有合法字节，返回 `visible_in_browser:false`。不要把它的结果改为 true 来替代真实 picker 交接。两平台方法均保留原有可见性或严格同浏览器下载交接规则；不把原生 Open 与 SDK setFiles 叠加。

## bridge 接入正常结束接口

既有真实工具宿主的调用映射需加入：

```js
finish_article_upload_execution: args =>
  tools.mcp__codex_apps__app_finish_article_upload_execution(args)
```

正常 app 回执由宿主按已有逻辑解包：优先 `structuredContent`，否则解析实际 JSON text；`isError` 或无法解包即失败。不能把 MCP envelope 直接当 `released=true`。Cua/page JS 不拥有 `tools` 或凭据。当前正常工具宿主已实际只读确认缺少 `structuredClone`；bridge 对标准 JSON 请求/响应提供 JSON clone fallback，仍不会替代持久宿主、凭据生命周期或实际 browser 能力。

创建 `createArticleUploadBridge` 时增加 `executionStopped(platform)`，它必须是宿主提供的**同步布尔**生命周期事实：该执行已取消/结束，所有本次 browser/file/status 写入已 settle。不能仅检查 checkpoint 的 phase，不能写永远为 true 的 callback，也不能由 Cua 的 `executor_stopped:true` 单独证明。该补丁不会强停浏览器或撤回已交给 runner 的 import grant。

正常成功 `record_article_status(completed)`／`record_article_delivery(saved)` 已由正式终态入口按后端规则结束对应租约，不再调用 finish，也不伪称另有 `released=true`。下面只处理未完成／未知且仍有当前有效租约的执行停止。

失败结束次序：保留本次实际诊断 → 取消后续动作并 await 真实已发动作 settle，核对实际文件窗口已关闭／settled 的证据 → 若该次曾 consumed，先按精确 attempt 正常记录其 executor end → 宿主发出以下无凭据请求：

```js
{
  status: 'bridge_required',
  operation: 'finish_article_upload_execution',
  args: { article_id, platform, executor_stopped: true }
}
```

还没有本次 attempt 的失败可以直接正常 finish 自己的当前 lease，不能伪造 attempt 或把旧 ended attempt 写成新失败。服务端会拒绝同平台任意历史 consumed 但没有 exact executor-end 的情况。终态和制 Word 的 processing 不能使用此接口。

bridge 将实际当前 claim 只在 volatile closure/调用中交给该正常工具。开始结束时清除该平台的内存 claim/permits 并关闭旧 bridge，成功、拒绝、丢失回执或坏回执均不能 fallback 到旧 `currentClaim`，不能重放。仅清洗过的非秘密响应回 Cua；错误和异常不会透传 host/token。

同平台凭据操作、recover 和 finish 在 `currentClaim` 的任何 await 前就取得单飞围栏。它一直保持到正常调用和完整回执检查结束，不超时先解锁，不排队，不让迟到 reserve/recover 回执覆盖之后的执行。其他平台独立；read、preview、诊断可保留。

确认 `released=true` 后，宿主同时销毁外部保存的该旧内存 claim。后继正常认领新的 lease 并建立新 bridge，不能自动复用旧 closure 的 token，也不能将释放成功当 reimport 授权。finish 回执不明时旧 bridge保持关闭；只读正常 preview，确有原 lease且已有 exact owner recovery授权时才可正常 recover。新的合法 token 回执才打开新代，旧 permit 一律不恢复。

此源码提供桥接接口和安全生命周期约束；真实跨 turn 的持久工具宿主及 `executionStopped` 信号仍须根在已有执行环境接入，不能把一段离线测试或每次新建 isolate 当生产已接通。

## 尚缺的未消费许可续接

v99 现有流程不能续接被 finish/recover fence 的未消费 reservation：普通 reserve 返回旧 attempt，新 claim 无法满足旧 `claim_hash`，而 executor-end 和 owner reimport 要求父 attempt 已 consumed。此补丁没有伪造消费、删除旧行或提供通用 unlock。

最小待实现方案是在现有 reserve 内增加 `mode=continue_unconsumed`，创建新的 append-only child。它应继承原 exact grant，不增加用户一步，并至少满足：

- 当前正常 live holder 的 hash 与旧父许可 hash 不同；仍绑定有效原执行者的许可不能夺取。实际原执行结束及已有成功 finish/正常授权 recovery 的交接证据必须成立，过期/空编辑器不能代替进程结束。
- 父为该平台 exact latest，revision/snapshot 未变、无 child、`consumed_at IS NULL`，只允许 `reserved` 或 recovery 产生的 `outcome_unknown`。不得只凭 consumed_at 空就分类 never-submitted：`verify_existing` 本就可以为空，必须拒绝。
- 父必须承载真正导入授权（首次、明确首次、手工 reimport 或已验证 continuation），同 article/platform/account/冻结 Word/baseline/owner task 范围不变。父无本次 editor/readback 或矛盾的实际提交证据。
- 对从未消费的 reimport 父，继承原 standing grant、授权根指纹、旧 `retained_editor_urls` 和原 draft identity；历史 consumed unknown 仍保留，不能把整个平台重标为 never_attempted。
- 插入 SQL 再次核 exact 父 snapshot、新 live claim、artifact/destination、无 child和已结束的旧执行 fence；两次并发仅一个 child。新版本、新一次性 token绑定新 child；旧行、旧 hash、旧授权和诊断逐字段保留，消费 SQL再核 lineage且一次性 CAS。
- 使用独立 `authorization_kind='unconsumed_continuation'` lineage guard，不能伪装 consumed-only reimport。新行 `confirmation_message_id` 保持空，原批准 ID 引用在 audit 内，避免现 exact approval 唯一索引冲突。幂等缓存不得重发 token。

实现前需用真实 SQLite 和生产唯一索引验证两平台 finish→正常 claim、recover、首次/standing-reimport continuation、连续 handoff、两个 reserve/consume 竞争、旧 consume 竞争、claim/artifact/父变化、verify_existing和有效旧 holder拒绝，以及旧 URL 不被报为新结果。当前正常接口仍不提供这种续接；root 若遇此分支应保留旧记录并明确缺口。


V117 未消费许可缺口的历史复核契约见 [精确未消费恢复与回执交接](upload-unconsumed-continuation.md)。其中未部署描述对应当时补丁；当前生产状态以实际 handoff 为准，该历史文档不授予对真实记录执行恢复的权限，也不证明新默认执行器支持该分支。
