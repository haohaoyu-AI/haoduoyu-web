# Home 未知回执与正式恢复围栏

离线候选基于 `35b306acba5672a6b6dae9e4909f95da3a91d89b`，分支 `codex/home-unknown-fence-20261014`。只修改 Home、精确客户端测试及本说明；不修改 API、lib、SQL、claim/reserve/consume、平台或真实账本。此前三项补修保留，不把本候选表述为已上线。

原稿 POST 丢回执或返回损坏的 200 JSON 后，原 Home 补读 GET 若失败，仍保留同一文件并重新开放上传。实际 `createArticle` 普通网页路径没有预定文章 ID；同一文件的第二次调用会生成第二个 ID。另一个可达路径是提交期间已有轮询在途，错误处理的 `await load()` 被读取锁直接跳过，旧上传状态又能立即发送第二次同文章通知。

## 原稿上传

Home 对实际文件字节计算 SHA-256，并在 POST 前保存本人范围下的未确认指纹。成功且格式有效的文章 ID 回执移除本次临时指纹；401/403 的认证拒绝移除该次指纹并使整个私有视图失效。丢回执、损坏 JSON、无效 ID 或其他不能证明未写入的失败保留指纹。成功列表读取、文件改名、重新选择相同字节和旧 handler 均不能再次 POST 同一份未确认原稿。

本网页入口没有上传 operation ID/request key 的正式回查合同，因此列表缺少记录、相似标题、相同文件名均不用于认定本次请求没有写入或已经结束。用户仍可只读核对列表并使用已有文章；成功重新核验本人列表后，可显式选择另一份不同字节的原稿正常上传。候选没有增加未知上传的强制解锁或新 attempt 入口；需要额外授权或新的正式回查合同的情况继续保留未知，由父级处理。

可用时，sessionStorage 只保存按本人范围分开的 64 位十六进制 SHA 数组，不保存正文、文件名或凭据。它覆盖当前浏览器会话的正常刷新及 POST 在途时的重新挂载。存储失败不会解除当前挂载页的内存围栏；跨设备、新会话、存储丢失或不可用后的重新挂载不具备持久防重保证；存储无法删除的旧指纹在重新挂载后也可能保守保留，当前页面不会把已经收到成功 ID 回执的指纹重新加入。指纹保护的是相同文件字节，不声明语义去重或后台 exactly-once。

## 同一文章通知

提交围栏保留文章 ID 和读取序号。只有未知结果之后新发出的、成功核验同一本人并包含同一 ID 的真实列表读取，才可能解除围栏。当前服务端 `recovery.can_notify === true && recovery.can_retry === true` 是原正式同任务显式重试许可，包括旧 unknown、过期 sending 和当前可重试故障；不要求通知时间戳变化，不将它解释为执行者已结束。旧轮询、读取锁 no-op、读取失败、uploaded/null 或记录消失均不作该确认。服务端原通知 CAS、执行认领和文件消费门禁不变；恢复只由用户再次点击，没有自动 POST、换文章或重传文件。

路由唯一精确的 409“文章处理连接尚未启用，文章已安全保存”是在通知写入前的正式拒绝。它必须经拒绝之后新发出的同本人、同 ID、connected=true 读取才恢复普通求助。其他 409 保留未知围栏。未知提交围栏目前只保留在挂载页内；没有添加跨刷新通知任务持久化。

## Word 回读与认证

Home 向 Word 组件传入 `onAuthRequired`、`readback` 和 `readbackStartedAt`。认证回调捕获渲染时的 owner scope，旧本人的回调不能清除新本人视图。`readback` 只能来自实际成功且仍适用的 `/api/articles/:id/word-progress` 原始 DTO；列表返回中的同名字段被剥离，列表合并不制造或更新这个回读据。

`readbackStartedAt` 在真正派发 per-card GET 前用浏览器 `performance.now()` 记录。旧测试运行器没有 performance 时仅兼容回退到 Date.now；它只表达客户端请求顺序，不表示服务器执行时间、执行者结束、取消成功或消费许可。Word 组件的范围、未知控制回读和认证处理由另一独立补修提交完成，组合后须再做 TypeScript、构建和浏览器验收。Home 单独分支的 TypeScript 退出 2，仅报告旧 Word 组件缺少约定的 readback prop；没有将这个待组合检查称为通过。

## 离线证据

- `node tests/home-unknown-result-fence-ui.mjs`：实际源码 24 案，35 基线 8 通过/16 失败，本候选 24 通过；包括丢回执/200 坏 JSON/无效 ID、GET503、改名同字节、不同文件合法上传、会话恢复、存储失败、旧 poll/no-op、正常 unknown/故障/过期 sending 显式重试、精确已拒绝 409、未知 409、本人失效和独立 Word GET 回读来源。
- `node tests/home-article-owner-scope-ui.mjs`：11 案通过。只适配文件 SHA 的异步等待与真实 SHA 合成依赖，原身份/API 场景不变。
- `node tests/word-progress-read-ui.mjs`、`node tests/article-workspace-pagination.mjs`、`node tests/article-data-owner-pages.mjs`、`node tests/offline-eight-interactions-ui.mjs` 均退出 0。分别保留 24 个 Home 读取场景、22 个范围/分页场景和 19 个交互场景；ArticleData 原 owner 场景通过。本轮额外只读 ArticleData 8 个失败恢复场景也通过，没有据此增加新功能。
- `git diff --check` 退出 0。定向 lint 与基线均有相同的 Home 两条旧错误和一条旧警告；新测试没有新 lint 问题，不称全 lint 通过。

完整 probe、命令结果、基线红与修后绿在 `/workspace/scratch/haoduoyu-independent35-20261014/remaining`。检查全部使用合成文件、身份、API 和存储；真实网络、provider、CUA、平台操作和生产写入均为 0。没有安装依赖、部署、生产 SQL、Library 或计划操作。生产 V160 失败的精确 SQL/消费包/账本、真实执行者结束和实际 24 小时指标仍不能由本补修解决；原模型未切换，没有容量循环。

## 后续完整 Word DTO 围栏

独审实际复现了额外失败：同文章、同输入、6 steps、合法 read/version 的 GET 若缺 execution 或 save，Home 原浅校验仍接受，随后实际 Home/Word 摘要渲染报 TypeError。即使 Word 组件自身防御，列表里的同类坏 DTO 也会先进入 Home 的 publishStatus/articleHandlingSummary 而崩溃。

Home 现在从 Word 前端组件导入共享 `validateWordProgressDto`。Per-card GET 必须通过完整结构校验及原 article/target 关联才写进 raw readback；坏 GET 保留原有效观察并标不可用。列表在进入 Home 摘要之前校验所有非 null/undefined 的进度，坏 DTO 置 null、unavailable=true、deferred=false；有原有效进度则保留为 stale，不能开放控制或制造新的 raw readback。已有 GET 可正常恢复同一任务，没有新增业务动作、lib/API 合同或数据库改动。

新专项增加4场景后共28案：原 e983 页面24绿/2个坏 GET 红；接 GET 校验后26绿/2个坏列表红；完成两入口校验后28/28绿。坏列表场景还核对 prior valid 观察与旧 raw/stamp 保留、控制撤下和正常 GET 恢复。验证通过 `HAODUOYU_HOME_WORD_SOURCE=/workspace/sites/haoduoyu-word-auth-unknown/components/word-stage-progress.tsx node tests/home-unknown-result-fence-ui.mjs` 加载实际配套前端模块，未把该组件文件混入 Home 提交。

原 Home owner11、Word读取24均保持原断言，临时 scratch runner 仅将 Word 模块路径映射到这个实际配套组件，全部退出0；新测试 lint及diff-check退出0。普通无环境变量命令由父级在组合 Word 提交后再运行。前述 e983 的24案记录和 TypeScript 待组合记录保留，不改写为当时已经组合通过。桌面只读 GET 独立新测试由专属测试任务交给 Word 提交，不包含在 Home 提交。
