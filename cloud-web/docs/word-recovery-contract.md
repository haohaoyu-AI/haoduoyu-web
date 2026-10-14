# Word 阶段恢复协议

当前候选基于正式 V136 / `7ccd3547e91d35cf14a4b318dc787dfd1ff8252e`。本轮严格得到来源、每 owner 一个实际配图执行、grant 计时和安全停止尝试约束见 [dedao-word-serial-attempt-contract.md](dedao-word-serial-attempt-contract.md)。下文 V132–V135 内容记录既有恢复协议；7/2 为保留的资源池上限，当前实际执行另受串行占用约束，不能据此派发七篇。当前发布状态以独审包 manifest 和正常 Sites 回读为准。

正式合并基线为 Sites 当前源码 V132 / d17eb83c03354b891d0473dcade5db4731e29097（已上线 V131；原 V130 迁移账本保留），2026-10-09 通过本 Site 官方短期 Git 源凭据取得，并独立读取部署 succeeded；未使用 GitHub 老 main。原 V127 冻结修复 999550af8b0f63b63f661d77eb5abe9ff0426fe7 和两个更早反例版本保留。V130 的得到大脑 native 及其他新模块完整保留；0041_dedao_native 已占用，本合并使用 0042_word_recovery，正式 0000–0041 SQL 原文件不改。本文和测试只含合成数据，不含文章原文或凭据。

用户于 2026-10-09 15:04:49 UTC 明确授权恢复功能正常上线。合并按当前正式源码、迁移占用、完整测试及准确冻结独审后执行官方推送/私人发布，不直接覆盖旧生产。新版 sites:sites (c4/sites) 尚未挂载本执行者，技能列表及实际读取均已核实；当前官方 Sites MCP 的源码凭据和私人发布能力可用，按其明确支持路线操作，凭据只留易失内存，不输出或写文件。真实配图出口和四篇成品仍独立未完成。

六步仍为读取原文、搜集图片、确定配图、生成 Word、逐页检查、保存成品。候选 URL、实际像素、已检页面等仅来自真实操作回写；心跳和时间从不推进阶段。老记录没有阶段历史即无历史记录。本站原生 finalize 加独立整文件读回才确认成品；local cloud-ready 不表示桌面已落盘。

## 前端字段

`WordProgress` 继续使用 contract_version=1，新增可选 `can_control_word` 和 `recovery`。recovery 包含 version、epoch、desired(run/paused/cancelled)、status(running/paused/cancelled/backoff/blocked/await_executor/saved)、reason、heartbeat_at、heartbeat_overdue、retry_count、retry_after、execution_confirmed、automatic_dispatch_available=false，以及仅表示旧已申报输出绑定存在的 legacy_declared_output。这里的 lease/token 不进入 UI。execution_confirmed 只表示有效租约及执行者报告，不能证明真实 Codex 宿主启动或旧进程停止；retry_count 表示已消费的中断预算，不表示后台自动重试已经执行。status=saved 表示已有 native finalize，独立保存确认仍取 save.independently_confirmed。`updated_at` 是进度真实更新时间；`heartbeat_at` 是实际执行者心跳，独立显示。无心跳更新只说明未知，不声称执行者结束。

同源登录 POST `/api/word-recovery`，要求现有 `x-xiaoyu-upload:1`，输入仅 target_kind、target_id、input_sha256、expected_version、intent。响应 recovery 与 external_actions_revoked=false。暂停服务端持久化，阻止安全边界以后的写入；已发出的动作仍需核对 receipt，不假称撤销。继续仅保留同篇输入/成果并等待执行器，不重发事件或消耗许可。

### 准备与 Word 处理的显示字段

`recovery.resource_class` 为可选的 `prepare`／`heavy`，分别表示当前执行权属于配图准备／Word 处理。`recovery.queue_reason` 为可选的 `total_capacity`／`heavy_capacity`／null，来自当前 owner、任务、冻结输入、认领和运行意图仍适用的持久等待记录，记录的是入队时缺少总处理位或 Word 处理位的事实；不能声称此刻资源仍满，不能由前端计时、旧更新时间或剩余步骤推断。UI 可兼容消费旧 `prepare_capacity` 值；真实 producer 使用前两个理由。旧响应没有这些字段时保持原有显示，不补造阶段或并行数。

没有有效执行权且确有持久等待记录时，`status=queued`，页面显示「等待处理位」或「等待 Word 处理位」，不表示空槽释放后已有执行器接手。此时当前步骤和无数量的动作标为上次记录；真实候选、已确认图片、已检查页数继续保留。`status=running`、`resource_class=prepare` 且 `queue_reason=heavy_capacity` 表示仍持有准备执行权、尚未取得 Word 处理位：页面显示「配图准备 · 等待 Word 处理位」，不能称七篇 Word 已启动。

可选 `recovery.queue_revision` 是服务端持久队列 INSERT／DELETE 在同一事务中递增的整数，不改变控制 version 或 epoch。前端按 `(recovery.version, queue_revision||0)` 的词典序接收同一任务的 props 和控制响应：更低控制版本，或同控制版本更低队列修订，均不能覆盖已读状态；二者相同时仍允许真实心跳、租约到期或最终读回投影刷新。WordProgress 自身的 version 独立保护步骤、数量和保存证据，不用控制版本替它决定新旧。文章／冻结输入切换重置两种保护，前任务的晚到操作回执仍由 scope/request 校验拒绝。页面不显示修订号。

同一 WordProgress version 下，严格更早的服务端 `read_at` 不覆盖已读投影；这只是回读顺序保护，不以时间推进步骤。`read_at` 在存储核验后生成，不能单独证明此前读取的数据库行较新。因此，同篇同输入且没有明确不同 output ID／SHA 时，已知 `save.cloud_ready=true` 的原生 finalize 不会被相同或更低 version 的未保存投影恢复成可执行任务。若冲突投影带更晚 `read_at`，保留原输出身份与 finalized 只读事实，同时撤下此前的字节确认，显示等待读回；不继续宣称当前成品可读。真正新的同一 finalized 输出若为 `readback_pending`、`independently_confirmed=false`，照实显示未确认；即使执行观察版本更低，较新同身份存储核验也可更新保存确认，步骤和数量仍保留较高版本。明确不同输出身份或不同文章／输入不套用旧成品保护。

已暂停、已取消、明确阻塞和保存确认优先于容量等待。网页断线只显示上次等待记录并注明后台情况未确认。已独立确认的成品不显示继续／暂停按钮；本地任务继续区分云端就绪与桌面落盘。队列没有自动派发，本轮 `automatic_dispatch_available=false`；页面不显示排队名次、预计时间、后台自动续跑承诺、lease 或 token。七和二是资源上限，不是实际执行数或性能验收结果。

## 执行者顺序

1. 读取同一任务、`read_word_progress`、已有输出 receipt 和 `read_word_recovery`。不要重做已完成步骤。
2. 持有现有有效 business claim 后，用真实新实例 UUID、一个稳定 request_key 和新随机 execution_token 调 `acquire_word_execution`。只存令牌指纹；令牌留在易失内存。丢失响应先读同 key 的 `read_word_execution_receipt`。过期 key/token 不得重新授权；新宿主无旧 business token 时须走原有正式认领/恢复流程，不能复活令牌或放宽平台许可。
3. lease 十分钟，真实执行期间在到期前 `heartbeat_word_execution`。本轮候选将有效执行权分为配图准备和 Word 处理：每 owner 的 article/local_word 共用总上限七个，其中 Word 处理至多两个；旧请求默认 Word 处理。配图准备仅允许原文读取和公开候选搜集，不可提交图片字节／像素核验、Word、逐页检查或保存。升级到 Word 处理须通过同一任务、同一执行者的原子转换，等待期间保留准备执行权和成果。旧协议未采用任务不计入该租约上限，租约也不证明旧宿主物理停止。仅 heartbeat 不更新 progress version。任何修改使用当前 execution_token；每一次最终数据库 CAS 都检查 epoch、输入、claim、意图、lease 的数据库当前时间。
4. 保存图片和完整 Word：稳定 asset_id 申报 SHA/size/65536-byte chunks，然后 `put_word_checkpoint_chunk`；未知结果回读 next_index 和每块 size/SHA，只续未收块。`finalize_word_checkpoint` 读取所有实际字节并验 whole SHA/size/raster 或 exact frozen Word text。ready 与 incomplete 明确区分，ready 不声称语义相关或逐页验收完成。跨实例用 `read_word_checkpoint_chunk` 找回已收字节。原生旧上传块也可用 `read_word_output_chunk` 读回；只有前缀、缺 suffix 时不声称可恢复整文件。
5. 有足够真实相关图片后冻结图序/锚点，再制作 Word。采用协议的任务，图清单必须关联 ready 的同源字节断点，申报原生 Word 输出前必须关联同 SHA/size 的完整 ready Word 断点；原生 outputID 永不替换。Word 仍经原有正文/图片/版式核验、native finalize、独立 read_word_progress 确认保存。
6. 每张失败单独 `record_word_image_result`；同 URL 只记一次结果，拒绝重复冲突。换源关联已失败候选，最多六个替代候选，不能更换客户端/代理/账号绕过拒绝。可用图片要求实际 ready checkpoint。可选 `declare_word_image_floor` 按实际图文要求冻结最低图片数，未满足不凑图；字节数量达标不证明语义质量。无历史目标不补造最低数。

暂时性超时/未知响应/429/服务暂不可用保留 retry_count、5/30/120 秒 backoff，最多三次重试；只有实际执行器可在条件满足后再次领取 Word lease，本候选没有后台自动调度。403/login/captcha/no-executor/明确结束/修复失败或未知均等待。共同故障按 owner/dependency/reason 归并 incident，不启动每篇修复风暴。当前没有可调用的真实 Codex 创建/启动/完成接口，故没有 cron、新订阅、收费模型、隐藏 RPC 或假自动修复；incident 的修复验收仍需平台/实际执行器。

## 兼容与边界

旧 article/local Word 执行者在没有 recovery row 时沿用协议。显式采用或用户暂停后所有 Word、进度及处理中的旧失败入口都受 Word fence；平台后段既有一次性 guard/host/bridge 保留。local 新执行实例验收改为当前 Word execution_id，未采用的任务仍核原 queue execution_id。已有最终 Word 只读。不会操作 Windows 源码。仅新手动 Word 实际图清单可建立当前冻结契约，不能给旧输出补历史。

断点 R2 key 在原有 article 前缀且使用严格资产/块/SHA 格式，复用永久删除前后与未知 put 响应的补偿。清空删除精确清理同 owner/article 的恢复和断点记录，保留其他任务。页面执行任务/最近文章分区和上传诊断、热文模块不变。

## 独审阻塞修复后的补充约束

新图片断点只接受实际转换后的非交错 8 位 RGB/RGBA PNG。执行者须保留真实来源和转换后图片 SHA，不得把 JPEG/WebP 改扩展名。PNG 校验解析完整结构、CRC、严格单一 zlib 流，并恢复全部行的全部像素样本；固定 16 KiB 解压块、512-byte 输入块、两个行缓冲，最多 4,000,000 像素、单边 8192、16 MiB filtered bytes 和 20 MiB 编码字节。JPEG/WebP 及其他 PNG profile 明确拒绝，不能被标 ready。既有未采用恢复协议的 Word 接口仍用原校验；Windows 代码未修改。

图片 verification 增加 `pixel_decode_verified:true`、`decode_version:1`、`format:'png'`、width、height。可用图片计数、最低图片数、冻结图清单、像素观察及首次采用协议后新申报输出的 native finalize 都必须关联这种实际字节验证。旧 state=ready 缓存缺该标记时，读取保留原 asset/SHA/块，不补历史，增加 `needs_pixel_verification:true`，不计入 ready_images；重复 begin 返回 needs_pixel_verification。持有当前有效租约的执行者可重新 finalize 同一缓存字节，成功后保留原身份继续。旧已完成 Word 仍只读。

自由文字、来源 URL/title、进度观察、执行摘要、失败说明，以及非授权的 request/event/asset/execution ID 均在写入前检查当前凭据和 owner 的历史凭据指纹。检查忽略大小写、最多展开四层百分号/JSON 转义；未知或不能可靠核对时拒绝，错误不回显原值。只有单向指纹入库。公开回读仅过滤这些元数据字段，数据库失败或有歧义时隐藏受影响文字；冻结原文、实际文件字节、摘要、数量、原始输出身份和正式 claim grant 不被重写。查询按实际候选 UUID 分批，不扫描或截断全部历史，悬挂查询有两个实际查询、32 个有界排队任务和一秒总等待界限，相同 pending 查询合并，完成结果不缓存。历史 ID 误存为凭据时，公开读取省略危险引用并标 identity_withheld；原始数据库身份和字节不改。

采用恢复协议后，local 的 fail_local_word_job 和 article 的处理中旧 record_article_status 不再把网络故障写成失效 claim 的终态；请求被明确拒绝并指向 report_word_interruption。该上报保留同一业务认领、输入和输出，依实际原因进入 backoff/blocked/等待状态，再由真实执行者续接。未采用协议的旧终态失败路径保留，且实际 SQL 防止检查后被并行采用时误写终态。


## 旧已申报输出的原字节续接

仅第一次采用协议（set_word_intent 的首次 INSERT，或 acquire_word_execution 的首次 INSERT），服务端可绑定当时已存在的原生 Word 申报。`legacy_output_binding` 只存 contract_version、output_id_sha256、原 sha256/size/chunks、原始 artifact_manifest 文本（含 null 区分）的 manifest_sha256、已保存 prefix_chunks 和整个原 parts 前缀 JSON 的 prefix_sha256；不复制原文、自由文字、原始 ID 或凭据。首次 SQL 在相同 owner/target/source/claim 下同时 CAS 当时的 output/result_meta 和 artifact_manifest，任何并行申报、追加块、改原计划或 claim 都使本次采用失败，须读取同一任务。这个字段由数据库触发器禁止改变，初次 null 后永远不补绑，暂停、重新领取 Word lease 或跨 epoch 不扩大范围。没有客户端 legacy 开关。

只有完整匹配此绑定的原 outputID、SHA、size、chunks、冻结输入、原 manifest 和全部已保存前缀，才能继续沿原 native 契约保存同一文件。旧 JPEG/WebP 或没有历史 manifest 的 article 输出可保留身份和原字节；不转换已冻结 SHA，不补计划，不替换 output，不新增业务 claim 或投稿许可。原分块/整 Word SHA、原文、原 manifest 以及 local 既有版式和执行回执仍实际检查，绑定核验使用组装完整 Word 与最终 CAS 的同一服务端行快照，避免另读数据混合两个快照；最终 CAS 再核当前 output_meta、原 artifact_manifest 和执行 fence，独立整文件读回仍是保存确认。绑定损坏或不匹配则拒绝，不采用更宽松 fallback。

这条续接仅证明旧原文件通过原生保存验收，不证明新的像素解码。最终原生输出元数据带固定 `recovery_verification:{contract:'legacy_declared_output_v1',pixel_history:'unrecorded'}`。缺少真实缓存像素证据时，步骤显示「旧任务已沿原文件保存；实际像素检查历史未知」，不补图片搜索、像素检查或逐页数量。JPEG/WebP checkpoint 仍不能 ready，已有坏缓存仍不能计可用；初次采用时没有旧已申报输出的新 Word 仍必须经过严格 PNG/Word 断点契约。已经保存的记录继续只读。
