# 配图 Word 六步进度协议 v1

本协议仅覆盖配图和 Word 保存，不包含投草稿箱。`article` 与 `local_word` 共用字段；身份、claim、输出和平台许可仍由各自既有工具管理。实现以 `lib/word-progress-contract.ts`、`lib/word-progress-tools.ts`、`lib/word-progress.ts` 为准。

## 六个主步骤

| `stage` | 页面名称 | 真实动作和可显示数量 |
| --- | --- | --- |
| `read_source` | 读取原文 | 已实际读取冻结原文；不按时间推断完成。 |
| `collect_images` | 搜集图片 | `candidate_urls` 是实际找到的公开 HTTPS 候选，累计去重；显示已找到 N 张，无可信记录时只显示搜集动作。 |
| `confirm_images` | 确定配图 | 筛选去重、检查实际像素、确定锚点和顺序、必要压缩。`inspected_images` 记录实际图片 SHA、宽高和既有锚点；可显示已确定 N/M。 |
| `generate_word` | 生成 Word | 使用冻结原文和图片清单生成实际 DOCX；完成观察需已有同一 Word 输出身份。输出申报本身不证明生成或页面检查完成。 |
| `inspect_pages` | 逐页检查 | 绑定 `word_sha256`，实际渲染并逐页检查；`rendered_pages` 是实际页数，`checked_pages` 是累计升序页码，可显示已检查 N/M。 |
| `save_final` | 保存成品 | 既有 begin/chunk/finalize 协议保存同一输出；分块计数来自本站已接受数据。完成只由本站 finalize 后独立读取成品证据确认。 |

不等分百分比，不把时间流逝当进度。步骤状态为 `pending`、`current`、`completed`、`unrecorded`；`unrecorded` 表示缺少可证明的历史，不能显示成已完成或待重新执行。

## 字段与工具

`read_word_progress` 参数为 `target_kind`（`article` 或 `local_word`）、精确 `target_id`，以及可选的 UUID `event_id`。它返回 `word_progress`、当前 `observations`、可选 `event_receipt`，并明确 `resume_only=true`、`new_execution_grant=false`。读取不 claim、不续租、不派发、不发导入许可。

`record_word_progress` 参数：

| 字段 | 约束 |
| --- | --- |
| `target_kind`, `target_id` | 同一 owner 的精确文章或 `localword_<UUID>`，不得选“最近一篇”或替换任务。 |
| `claim_token` | 现有有效 claim，仅留在执行者内存；不放 URL、页面、日志、文档或证据包。 |
| `input_sha256` | 原样使用 read 返回值。localword 绑定冻结 `input_json`；article 绑定冻结正文或既有原文摘要。 |
| `expected_version` | 使用最新 read 返回的版本；执行者和原生钩子均可能增加版本。 |
| `event_id` | 每个真实观察的稳定 UUID；未知响应重用原编号和原内容。 |
| `stage`, `state` | `state` 可为 `running`、`completed`、`waiting`、`failed`、`recovering`、`executor_lost`。 |
| `observation` | 必须有该步骤允许的 `action` 和枚举 `reason`；仅附该步骤实际观察到的字段。 |

`observation` 的可选字段为 `candidate_urls`、`inspected_images`、`images_total`、`word_sha256`、`rendered_pages`、`checked_pages`。候选 URL 不含凭据或签名参数；图片 hash 不重复，已报告的像素/锚点不替换；确定后的总数不随意改变；已检查页码不倒退。无可信数量时省略计数字段。

确定配图完成必须匹配既有冻结图片清单和实际像素观察；逐页完成必须覆盖同一 Word 的全部实际页面。`save_final` 禁止通过 `record_word_progress(state=completed)` 标完成。进度写入原子重验 owner、当前有效 claim、输入、图片清单、输出及版本；重复事件内容冲突、倒序、重做已确认步骤、并发失配和晚到写入均拒绝。

返回的 `word_progress` 包含 `contract_version=1`、身份和输入摘要、单调 `version`、`legacy`、`started_at`、`updated_at`、`completed_at`、`read_at`、`steps`、`execution`、`save`、`output`。`output` 只暴露输出编号、SHA、大小和已接受分块位置，不暴露存储路径或 claim。

`started_at` 来源于首条真实进度观察；缺历史则为空，不补造开始时间。`updated_at` 来源于真实观察或本站图片/输出操作；页面刷新和计时不改它。`read_at` 仅表示这次读取时间。`execution.update_overdue` 只表示一段时间没有真实更新，不证明后台停止。

## 执行与恢复顺序

### 精简配图与成果交付

同一输入的原文已在上传时解析并保存。优先使用 `read_article` 返回的冻结段落；只在来源审计需要实际原文件、已有证据不足或输入不匹配时读取原上传块。已确认的读取原文阶段不再重复提取全文。配图六步保留其实际语义；界面将它们与头条、知乎各自的私人草稿记录组合展示，不新增后台步骤或执行许可。

先读取同一任务已有的图片清单、Word 输出身份和持久检查点。已验核且身份匹配的成果直接复用；只有确实缺失的部分才继续处理。未知响应先回读原事件、原输出或原分块回执，不重新搜索已确认配图，不重新转换已验核图片，也不生成替代 Word。检查点核验、原生成品保存、独立读回与两平台验收针对不同事实，全部保留；同 SHA/大小的复用仍须核对实际字节与原身份。

交付以简短结果和各自真实草稿链接为主，Word 保留网站可选下载。助手不额外生成或推送单独配图说明，也不默认追加 Word 附件；不把图片网址加入冻结 Word 正文或平台草稿。图片来源与审计清单、中间文件及已有下载能力继续保留。搜索、原稿重复提取以及消息附件发送由助手执行，网站界面无法控制这些行为；本段是执行与交付约定，不能宣称本次展示改动已停止助手端附件发送。

展示端只根据受控步骤、状态和原因码生成中文提示，不透传原始错误、自由动作说明、诊断或文件名。未知原因提示核对已有结果；原始记录继续保留在后台审计，折叠内容也不显示它们。平台草稿链接仅接受项目当前验收合约中的完整地址：头条 `https://mp.toutiao.com/profile_v4/graphic/publish?pgc_id=<纯数字>`，知乎 `https://zhuanlan.zhihu.com/p/<纯数字>/edit`，并与对应平台绑定。其他域名、空白编辑页、编码、凭据、额外参数及 fragment 不作为可点击成果；不解码或删除参数后重建地址，也不改服务器记录或独立验收语义。

“需要处理”须说明本人登录或验证、请小鱼核对，或等待读回停止结果。缺少记录、停止请求和无新更新均不能证明后台仍在工作。这里精简的是展示及重复交付约定；后台六步和安全检查点未删减。

1. 每次开始、刷新或断线恢复，先读取精确任务的业务状态、`read_word_progress`、已有图片清单和输出。保留同一文章/job，不重做已确认阶段，不替换已冻结 Word。
2. 仅现有有效 claim 持有者在实际动作后回写。每次图片冻结、begin、chunk、finalize 后重新读版本，避免与原生钩子竞争。没有有效 claim 时停止写入并使用既有恢复流程，不通过进度工具重新认领、转授或抢并行执行者。
3. 回写响应未知时，调用 `read_word_progress`，携带原 `event_id`。`event_receipt.state=recorded` 表示该事件已持久化；还需检查 `applicable` 和当前输入/输出。`not_recorded` 仅表示本次读取未发现该事件，不能据此换新事件、claim、任务键或重做动作。仍持有同一有效 claim 且输入/输出未变时，可重试原请求；版本或业务身份变化则先停写核对。
4. `failed` 是可恢复的进度阻碍，不修改业务任务、claim 或输出。恢复后记录实际 `recovering`/`running`。既有业务 `failed` 的终态和恢复限制保持原样，不能靠进度记录解锁。
5. 网络读取失败、执行者无更新、执行者明确结束分别显示。页面网络失败不代表执行者失联；`executor_lost` 必须有 `reason=executor_ended` 的明确执行者结束报告，超时只显示无新更新。等待、失败和恢复使用实际原因，不伪造后台状态。

## 原生钩子与观察边界

article/localword 的图片冻结、输出 begin、成功 chunk、成功 finalize 已接入原生钩子。钩子记录本站真实持久化结果，仅读取已有进度流后追加；未采用协议的旧活任务不会因此新增历史行。重复/竞争钩子不影响既有 Word 操作，后续 read 仍从真实业务数据导出图片清单和分块证据。既有列表、任务读取和 claim 响应中的进度是可选轻量投影，不下载 Word 字节；只会核对当前对象版本并利用已匹配的独立摘要。无证据时显示“成品等待读回确认”，不是重新制作。进度读取失败或超过一秒返回 `word_progress=null`、`word_progress_unavailable=true`，不得吞掉已认领 token、阻断既有 Word/下载或平台许可。显式进度工具仍严格报错；客户端保留同一任务上次记录并标注不可用，不能串用另一任务。

成功原生动作使旧等待、失败或明确失联标签转为“恢复中”，但不会补全未观察的步骤。混用旧工具后，可根据已有冻结图片/输出从当前实际步骤续接；跳过且未确认的历史保留 `unrecorded`，不要求补造候选、像素或逐页数字。终态租约豁免仅用于真实 `output_finalized` 钩子；晚到的图片、begin、chunk 钩子不能追加已完成任务。

源码没有代替执行者进行公开图片研究或页面渲染的后台引擎。读取原文、候选搜索、筛选去重、像素/压缩检查和逐页验收依赖执行者真实行动后的观察回写。`evidence=executor_report` 明确表示执行者报告，不能宣传为服务器认证的研究或视觉验收；`site_record` 表示本站图片/输出记录。工具可用不等于缺失步骤已执行。

旧记录只显示可证明的图片清单、输出身份、已接受分块和保存证据。已冻结 N 张图片不证明曾搜索 N 张，也不证明像素检查历史。旧 localword 的 `execution.rendered_pages` 只显示已有验收摘要，缺少逐页历史时不补造 N/N。没有进度工具的旧执行者继续既有 Word 协议，页面显示本站可证明阶段及“尚无实时执行记录”；不得伪造进度或为补历史重做任务。

## 保存证据与桌面状态

本站完成必须先调用对应 `finalize_article_output` 或 `finalize_local_word_output`，再独立 read。读取实际成品，检查存在、字节大小和完整 SHA；失败时显示 `readback_pending`，不把按钮点击、通知接受、Word 生成或 platform draft 状态当成保存成功。完成后执行者进度写入被拒绝，读取保持只读。

`save.cloud_ready` 表示业务已 finalize；`save.independently_confirmed` 表示独立完整字节摘要核验已匹配当前 R2 对象版本。显式 `read_word_progress` 会完整读取成品核验；同一 owner、任务、输入、对象路径、冻结 Word SHA/大小及当前对象版本完全相同，才可复用最多 5 分钟的内存摘要证据。缓存最多 128 项，不保存 Word 字节；缺少提供方版本、HEAD 失败、对象缺失或换版均不得复用。只有后者确认六步保存完成。`save.desktop_saved` 保持 `null`：云端完成不能证明桌面落盘。

本地桥接须下载同一 Word、验证大小/SHA，再取得既有本地 `result` 核验保存回执，才显示“已交回本地核验保存”。桥接回传未知时保留原云任务并提示结果未确认，不重新生成或替换任务。本协议不修改 Windows 代码、桥接授权、账号权限、订阅或平台许可。

## 持久化与迁移

`0038_word_progress_events.sql` 新建 owner/target 隔离的追加事件表，主键含单调版本，事件编号唯一，运行期 UPDATE/DELETE 被触发器拒绝。只有既有已确认永久删除事务完成同 owner/article 的正式墓碑后，删除文章行才会原子清除该文章对应的观察正文；local_word 和其他任务不受影响。此例外不提供新删除入口或放宽现有确认/锁/范围。迁移只新增表，不回填真实活任务或旧历史，不修改冻结输入、现有 claim、Word 字节和平台账本。保留执行任务/最近文章分离、清空规则和上传诊断只读边界。合成测试与审包不得包含凭据或真实稿件。

## 完成记录边界

六步执行者观察、计数、版本与时间存储在事件表，可跨断网和刷新恢复。当前版本没有持久的独立成品读回成功凭证；`save_final completed` 不能由执行者声明，read 工具不暗写。缓存过期或换到冷实例后，页面会把独立核对显示为“成品等待读回确认”；这不回退已持久的 `cloud_ready`、业务完成时间、原下载状态或桌面保存回执。不能把缓存淘汰表述为成品丢失或要求重新制作。
