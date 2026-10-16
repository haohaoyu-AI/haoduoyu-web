# Word 六步与断点恢复修复独审说明

最终当前源码基线为 Sites 已保存 V132 / d17eb83c03354b891d0473dcade5db4731e29097；当时独立确认已上线 V131 / 563b651148cddea6ecede5afcf76d1ab06c9d197。最初从正式 V130 / c46cafc9c6a20be0b6e56c9522dc2292a975a876 合并，发布前追加 V131–V132 七个得到 native/bridge 文件并逐字节保留；本站官方短期 Git 源凭据取得当前精确源码，V131 独立部署状态 succeeded，V132 当时尚未部署；没有使用 GitHub 老 main。此前 V127 的冻结修复 999550af8b0f63b63f661d77eb5abe9ff0426fe7、0a6bcc3 及 d934c841 均保留，22 套冻结回归及两份独审已通过。本合并完整保留 V128–V132 得到大脑/native 和其他正式模块。用户已明确授权正常私人部署，发布前仍须按合并提交实际测试和独审，不把旧候选直接覆盖生产。

## 最终行为和关键修复

六步仍为读取原文、搜集图片、确定配图、生成 Word、逐页检查、保存成品。所有数量来自真实回写或实际本站证据，时钟与心跳不推进阶段。任务状态、冻结输入、执行回执、图片/Word 字节断点共享同一 article/job；有效 owner/claim/input/epoch/lease 在实际 CAS 再次核验，重复事件幂等，倒序及晚到写入拒绝。暂停持久化，继续等待真实执行器，automatic_dispatch_available=false。本站 native finalize 加独立完整 SHA/size 读回才确认保存；local cloud-ready 不表示桥接桌面已落盘。

冻结候选独审发现三种不可解码图片会被旧容器校验标 ready，及五个自由文字入口能持久化执行令牌。本修复的图片断点完整、有界解码 PNG 全部样本，并增加明确 verification flag；新可用计数、image floor、图清单、像素观察和新申报 Word 的 native finalize 必须关联该验证。旧 ready 缺 flag 不计可用，保留原 asset/SHA/块，标待像素复核，同身份缓存可重新校验。只支持真实转换的非交错 8 位 RGB/RGBA PNG，JPEG/WebP 和其他 PNG profile 明确拒绝，不改扩展名冒充。旧未采用恢复协议的格式校验保持原行为。

自由文字和非授权 nonce 在写入前检查 current/historical owner 指纹，公开读取只过滤相关元数据；大小写、百分号、JSON 转义、历史 token、ID 别名均覆盖。冻结正文、字节、摘要、数量、原输出身份及正式 claim grant 不重写。原生 D1 的 compound-select 限制已改为单 CTE SELECT/五个 EXISTS；查询最多 37 绑定，两个实际查询及 32 排队任务，一秒总 deadline，pending 同组合并，无完成结果缓存。无法核对时只隐藏受影响字段。

已采用协议的旧 local/article 终态失败入口明确拒绝并引导 report_word_interruption，保留同一业务认领、输入和输出。最终 SQL 拒绝检查后并发采用协议的终态失败及 restart_article_output，避免 claim/output 被替换。历史 nonce 误存为敏感 ID 时公开省略引用，不改 DB 原身份；旧未登记当前 claim 的读取也以实际 row token 保护。未采用旧任务继续原协议，完成记录只读，Windows/上传 guard/host/bridge 权限协议未改。

第二次冻结 0a6bcc3f9bc4e0047231fdb357ea6df8470eb923 的独审进一步证明：旧已申报 JPEG Word、以及没有历史 manifest 的旧 article 输出，在采用协议后无法保存原文件。本次再修复以首次采用时的不可变 hash-only legacy_output_binding 限定原输出、原计划和已保存前缀。初次 adoption 的实际 SQL CAS、后续禁止补绑、最终原 manifest CAS、整文件验收仍有效。旧文件可同 ID/SHA/字节续接，不转换或补造历史；新输出继续严格断点验证。最终输出固定标明旧像素历史未知，不能使 JPEG/WebP 缓存 ready 或增加可用图片数。0a6 及其独审反例保留在附录。

0041_dedao_native 已由正式 V130 使用。Word 恢复迁移重编号为 0042_word_recovery，new journal timestamp 大于 0041，metadata snapshot 包含正式 native 表。0000–0041 的 42 个正式 SQL 文件全部逐字节保留；没有历史回填或真实文章数据测试。

## 验证及范围

- 22 套相关最终回归均 exit 0，含原恢复 17 组、PNG/DOCX 7 组、真实 workerd D1 并发、六步/断线/刷新/失败续接/旧数据/只读/删除隔离、local Word 58 组、HTTP/MCP 77 检查、queue、claim recovery 34 组及得到模块。具体输出在审查包 logs。
- 新 PNG 21 组通过，覆盖五种过滤方式、RGB/RGBA 样本、CRC、坏 filter、Adler、截断、额外/串联压缩流、尺寸和解压膨胀；实际无 Node 兼容的 workerd 完整模块也通过。
- 新令牌边界真实 workerd D1 12 组通过，包含所有五个泄漏形态、历史/编码/别名、同 owner 负例、跨 owner、查询失败/超时/永久悬挂上限与正常并发。先验证负例才能排除查询全失败造成的假阳性。
- 新旧输出续接回归 29 组通过，使用真实本地 workerd D1 和合成 memory R2。JPEG/WebP × article/local 原 ID/SHA/字节保存并独立整文件读回、无历史 manifest、未知像素/搜索/逐页历史、旧坏缓存不计数、新严格 PNG 流程、不可变绑定及永久 null、16 个首次采用状态变化、8 个旧写入者双向竞争、跨 epoch/晚到拒绝、最终 manifest CAS 和同快照 ABA 均覆盖。
- 两项独立任务已对此前 0a6 冻结做字节/凭据/续接 10 组、CAS/旧身份/回读/grant 7 组定向实际复验，通过并同时证实旧输出兼容阻碍。修复后的新准确 commit/SHA 与实际复验结果另附独审报告；此前证据不能当作新候选的通过证明，也不能宣称生产兼容。
- 最新构建 npm run build、tsc --noEmit --incremental false、git diff --check 通过；drizzle-kit 对合并后的 0042 schema/snapshot 检查无新差异。
- 实际 Chromium + 最新构建本地 Worker/D1，无 route mocks：六步、暂停后刷新、同任务继续并保留已确认阶段、390px 无横向溢出、网页离线与执行者等待区别、lease 到期而 version/heartbeat 不变时刷新已挂载 UI，全部通过且 pageerror 0。root 查看实际截图确认布局。仅合成数据，不是生产验收。

早期失败日志保留。除代码修复外，旧 VM fixture 补标准 timer globals/真实新 boundary；旧固定过去日期改为当前 DB 时钟；optional execution_token schema、空 verification 和固定安全错误文案断言与真实契约对齐，没有跳过状态/权限或无写入断言。

合并 V130 后另外实际运行 26 套回归，全部 exit 0，含正式得到 native/bridge/vault。得到 UI 首次因服务未启动而连接拒绝，保留失败日志；启动最新构建 Worker 后原脚本通过。该项使用合成 API fixture，不能当作 Word 验收。Word 浏览器另用最新构建 Worker、本地 D1 及真实 Chromium，未设置 route mocks，七项断线/刷新/移动端检查通过，pageerror 0，实际截图已查看。正式 42 个 SQL 与既有迁移账本完整保留，本地 D1 从正式账本升级只新增 0042，一次执行和重复执行均通过，正式 native 合成记录未变。

## 未验收和阻碍

合并审查时尚未推送或部署，发布结果另以本站原生部署状态及独立线上能力读取为准。没有真实 Codex 启动/自动派单、真实逐页 Word 渲染、Windows 落盘、平台投稿或账号/许可变更。新的严格 PNG profile 是执行器采用恢复协议时的兼容约束，需要实际转换。

四篇实际任务（史泰龙、彭玉、陈楚生、吴奇隆）本次修复未写入、重认领或重试图片。最后可证明记录中四篇实际可用图片字节、像素检查、配图 Word 和最终保存均为 0；前两篇原文已实际核对，后两篇只取得冻结来源记录。有限公共图片抽样受正常代理 CONNECT 403 阻断，发生于目标 TLS/GET 前；已停止尝试，无代理/客户端/账号绕过，也未推断所有图片源失败。需平台正常图片字节通道恢复。官方云 CUA provider 未挂载，本地 Chromium 只验证本站 UI。

新版官方技能 c4/sites 在此执行者的 cloud/executor 列表为空，实际 skill read 返回不可用；/workspace 对应目录未找到，/root 受限目录为 PermissionError。没有把不可读当不存在。当前官方 Sites MCP 工具说明给出正常源码 Git 和私人保存发布路径，用户已明确授权，原生短期凭据成功且当前精确 V130 已取得；只在执行者易失内存传给正常 Git，无私接 API/未经授权 HTTP。最终发布必须基于当前 main、再次独审的合并提交及相同构建产物，保留私人访问；线上能力和实际四篇 Word 成品分别验收。

包不含 .git、.env、.wrangler、node_modules、数据库、缓存、真实原文/下载文件/有效凭据。浏览器合成 private fixture 不入包；没有通知、按钮或 mock 当成成品验收。
