# 得到原稿与同稿配图尝试

本轮以正式 V136 / `7ccd3547e91d35cf14a4b318dc787dfd1ff8252e` 为精确基线。使用正常 Sites 源码取得、独立合成测试和私有发布流程，不读取 GitHub 老 main。迁移 `0046_word_serial_attempts` 在核对 0045 为最新已有迁移后生成；既有 SQL 不改。以下字段用于执行者和简洁 UI，不是后台已经启动的证明。

## 来源分支

普通上传仍须 canonical `articles/<id>/source`、本人旧 processing claim、冻结原文和原提交链。得到导入使用独立严格分支：全局只有一个关联 item，同 owner 的 completed batch，stage=11/uploaded/submitted，实际 handoff 同 owner/article，原 help acquisition/event/claim hash 与当前 claim 的不可变恢复链一致。旧 claim 只能由真实原持有者的结束回执或原 Codex 回合的精确终态、映射及 settled 证据恢复。得到批次完成不证明后续 Word 执行结束。

下载记录必须与 batch executor、item title/final ref、实际文章标题/文件名、确认的下载 action 与 finalize action 一致。历史 chunks 要保持有序、size/SHA 正确；实际历史字节和 canonical R2 原稿均完整读取核验，重新检查 version/etag。原稿通过同一个 `parseArticle` 解析器，序列化 paragraphs 必须与 frozen input 精确一致。正文、下载路径、浏览器标识和凭据不进入公开 provenance。writing/editorial/outline 以及实际热文生成关联仍排除。

支持范围有意保守：历史下载 executor 必须与已完成 batch 当前 executor 一致。中途换执行者而下载仍绑定前 executor、历史 chunks 已清理或缺失的记录会等待来源核验，当前版本不能声称这些历史均可恢复。

完整恢复 fingerprint 纳入 item、batch、actions、chunks、help、claim 恢复历史和 attempt/serial 状态。最终 D1 CAS 重新比较；异步原稿检查后再核 R2 version。跨 R2/D1 没有额外原子事务，原稿沿用既有不可变写入协议。证据缺失或对象失踪只阻断恢复，保留原稿和成果，不自动重下载、重提交或清 claim。普通 claim/旧平台恢复不能绕过这一限制。

## 串行占用与尝试

`word_serial_slots` 每 owner 至多一行，article/local Word 共用；7/2 prepare/heavy 资源池保留。排队只记录等待，不生成 executor。原 grant 对应 `attempt_id`、冻结 input、claim hash、execution id、token hash 和 epoch。租约过期、用户暂停、网页断开、心跳无更新及超时均不删除占用，旧执行者未证明停止时不能并行派发下一篇。

`word_attempts` 保留每一代，`word_attempt_requests` 保存不可变幂等请求及审计。公开 `attempt` 字段为：

| 字段 | 含义 |
| --- | --- |
| attempt_id / generation | 同稿当前尝试与代数，和执行 lease epoch 不同 |
| state | queued/running/waiting_safe_stop/paused_safe/ended/saved |
| started_at | 实际数据库 grant 时间，排队时 null |
| active_elapsed_ms / active_started_at | 已关闭活动段累计与当前活动段起点；UI 加到真实 read_at 后计时 |
| read_at / timeout_ms / timeout_due | 当前读回时点、3600000ms 边界、严格大于边界是否需要停止 |
| stop_requested_at / reason | 持久停止请求与原因，不能用来宣称外部进程已停止 |
| restarts_used / max_restarts | 新素材重配已用次数，默认最多两次、共三代 |

计时在第一份实际 grant 开始，同一尝试从 prepare 升级 heavy 不重置。排队不计时；断网时若旧执行未安全停止仍计时。实际结束且全部已发动作 settled 后，`paused_safe` 关闭当前活动段，后续同代正常 grant 从累计值继续。严格大于 60 分钟只请求安全停止并 fence 后续写入。本站无真实外部 stop tool 时 `automatic_external_stop_available=false`，状态为 waiting_safe_stop，不声称已停止或重启。

旧控制已有不可变 grant 而缺少 attempt 时，不补造历史活动累计，也不能用当前 now 重新起算。它必须先取得真实原执行结束及 settled 证据，通过同稿 claim 恢复后才可产生新的实际 grant。其他尚未证明结束的同 owner 旧 article/local Word holder 仍是串行阻碍；不把它们改 claim 或伪装为已排队。

本迁移新增四张表：`word_attempts`、`word_attempt_requests`、`word_serial_slots`、`word_claim_origins`。最后一张保存不可变的真实首次认领来源：owner、target_kind、target_id、claim_hash、origin、proof_reference、created；`articles.word_claim_origin_hash` 绑定当前主 claim。仅正常 queued/null claim 的实际认领 CAS 与该凭据同批成功时登记，不从进度 control、排队请求或旧 processing 记录补造。来源凭据不是原文认证，实际 grant 仍另行锁定 frozen input SHA。0045 已核实终态和全部 settled 的恢复链可绑定 successor claim。旧未知 holder 包括目标自身，创建首个 intent 或 0/0 queue 都不能解除保护。

主 claim 不是配图执行许可；任何图片搜索、配图工作和 Word 写入前必须取得正常 `acquire_word_execution` grant。原生 Word 写入也要求当前实际 attempt 和执行 token，不能沿未采用协议的旧接口绕过串行占用。没有采用协议的旧本地服务会安全等待，需要既有执行方加载相同协议；本任务不修改 Windows 服务。过期 local 主 claim 不轮换，原持有者与已有成果保留。普通 article 非首次主 claim 轮换清空首次来源绑定，不沿旧凭据豁免未知执行。

## 正常工具与执行顺序

1. `read_word_attempt` 与原 read progress/recovery/output 读取同一文章、冻结原文、当前代和保留成果；已完成记录保持只读。
2. `acquire_word_execution` 原子取得资源池与单执行占用后才开始活动计时。执行者使用当前 token/epoch 写入阶段、候选和断点，旧代晚到拒绝。未知 grant 响应读同 key receipt，不重新发事件。
3. `request_word_safe_stop` 使用同 attempt/input 与稳定 key；timeout 必须严格超过边界。暂停/取消来自实际用户控制。停止请求保留 serial 占用，不授予新执行。
4. 原持有者 `acknowledge_word_attempt_stopped` 携带原 claim/execution token/id/epoch、真实终态及 settled 引用，或原 Word 恢复协议用严格绑定的外部终态证明。此为原持有者/owner 观察证明，不是网站认证远端进程。没有证据则继续等待安全停止。
5. `restart_word_attempt` 只有在实际结束、全部 settled、已读取原成果、同 frozen input、不同素材策略时创建下一代排队记录；不创建新文章，不重复原提交、不 grant。策略 hash/reference 入审计。最多两次重配；403、登录、验证码阻碍保留，不能切账号、代理或客户端绕过。

换源预算仍为每个 job 历史总计最多 6 个 replacement 候选，不按新代重置。已经出现 403、要求登录或验证码的同一 URL 不因换代再次下载；所有代的依赖阻碍保留，当前图片数量和 readiness 只取当前代。

任何原生 declared Word（包括尚未收到一个 part）、final Word 或任何 Word checkpoint 均禁止新代重制。沿旧输出 identity/SHA/size/parts 回读续接。已冻结 images/layout 在新的合法代清除当前 layout 引用，旧 manifest、images、候选、checkpoint、events 和实际文件全部保留审计；当前阶段仅从当前代可信证据投影。无历史不补造图片搜索或页面数量。

本轮明确的续接限制：同代安全暂停后、实际活动累计未超过 60 分钟时，可由新的正常 grant 沿原文件继续。累计超过 60 分钟且已有 Word identity/checkpoint 时，既不能重配覆盖，也不能通过重领重置计时；当前只读保留成果，尚无独立受审的限权原文件续上传模式，不能承诺自动完成这类任务。

本站保存成功仅在原 native finalize 后实际独立读取整文件 SHA/size 一致时确认，并释放占用。local cloud ready 与既有桥接桌面落盘分别展示；网页读回不证明 Windows 已落盘。投草稿箱不进入六步。

## UI 和验证边界

六步为读取原文、搜集图片、确定配图、生成 Word、逐页检查、保存成品。只显示真实数量，没有可靠计数就显示动作。当前尝试计时与最后真实进度更新时间分开；时间流逝不推进步骤或百分比。紧凑列表保留既有设计、任务/最近文章分离和清空入口。queued 显示排队中；网络断开保留最近读回，后台未知；waiting_safe_stop 优先于普通暂停，不显示已经恢复。

合成 workerd/D1/R2、实际 TypeScript、React rendering/hook 测试用于验证协议与 UI 行为，不能当作实际浏览器视觉验收。当前真实文章只读核验不计算新图片或新 Word；正式发布也不等于真实任务恢复成功。最终独审包应同时保留测试日志、完整 patch/manifest、精确 commit、发布回读和未解决实际执行阻碍。
