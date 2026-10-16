# 本地求助小鱼：独立 Word-only 接口

此补丁供正常本人登录的网站页面连接桌面批次。源码完成不代表已经部署、连接订阅或完成真实小鱼执行。离线测试只使用合成稿、合成图片、模拟执行回执和网络/R2，不调用模型、平台或真实文章。

## 不可变终点

`local_word_jobs` 独立于 `articles`；任务 ID 是 `localword_<UUID>`。数据库 CHECK 和输入不可变触发器固定 `source_kind=local_desktop`、`output_mode=word_only`、`destinations_json=[]`，完整输入及来源 SHA 不可改写。旧 article API/MCP 的 UUID 校验和 owner-scoped `articles` 查询均不能认领此 ID。此流程从不创建文章表记录、平台尝试或平台交付，也不发送 `article.submitted`。

状态为 `queued → processing → word_completed` 或 `failed`。`word_completed` 是独立终点，无头条草稿链接条件；终态数据受数据库触发器保护。失败只结束该单篇。相同 owner/request_key 重放只读取同一冻结任务；内容变化拒绝。租约和 CAS 防止同时执行，expired claim 的旧 token 失效。已经声明输出时，后继只能续传同一大小/SHA/分块身份，不能重新生成不同 Word。

## 网页 API 与桌面分工

身份只来自 Sites 正规本人登录。新增 API 不接受 cookie、owner 头或 app-owned 云 token；不能让桌面伪造平台身份。所有写请求要求同源 Origin 和 `x-xiaoyu-upload: 1`。浏览器页面与短时本地批次 nonce 的桥接由页面/桌面代码处理，不属于 core 的身份机制。

`POST /api/local-word-jobs` 接收 application/json，最大 512000 字节，严格字段：

```json
{
  "request_key": "本篇固定 UUID，未知响应重用",
  "filename": "源文件.docx",
  "source_sha256": "原始源文件 SHA256 小写 64hex",
  "title": "完整冻结标题",
  "leading_blank_paragraphs": 2,
  "paragraphs": ["原正文第一段", "", "01 原子标题", "原正文末段"],
  "subheading_indices": [2],
  "original_sha256": "SHA256(UTF8 JSON.stringify([...Array(leading_blank_paragraphs).fill(''),title,...paragraphs]))"
}
```

仅文件基名 `.docx/.txt/.md`。paragraphs 包含正文内部空段，至少一段非空；标题与总正文上限 10 万字符。subheading_indices 按原 body 数组从 0 计数，包含空段。源文件解析和原图支持范围由桌面端核验；本 API 冻结传入的确切文本，不声称亲自读取了 Windows 原文件或核验了 source_sha256 对应字节。带原图片的源 DOCX 当前桌面范围需明确拒绝，不能悄悄删图。

响应 `{job,reused,connection_ready}`；GET `/api/local-word-jobs/<id>` 只读返回 `{job,connection_ready}`。connection_ready 仅查询本人此专用事件的当前有效订阅，不创建或续期订阅，更不证明执行已经发生。未连接时页面应保存本篇 job 交接信息并明确停止继续上传后续正文，原云 queued 任务保留。job 含固定 scope、原文 hash、状态、dispatch_state、claim_expires、错误，以及完成时的 word `{ready,size,sha256,filename,download_path}`。状态 API 不返回正文、token 或 R2 路径。

GET `/api/local-word-jobs/<id>/download` 仅本人可读，并重新校验完整文件大小/SHA，返回 DOCX bytes、Content-Length、X-Word-SHA256 和具名 `.docx`。网页正常下载字节后通过本地受限桥接返回；本地验证、同名独占保存、断线恢复和批次结束由桌面完成。桌面不能通过普通 urllib 伪造本人身份直接调用此接口。

POST `/api/local-word-jobs/<id>/dispatch` 是明确重试未确认通知的操作；响应 `{dispatch,job,connection_ready}`，只派同一事件 ID，60 秒冷却。已经 accepted 的通知不自动补发，GET/poll 永不派送。accepted 只说明回调接受，必须看实际 processing/word_completed 执行证据。

Title-leading blank paragraphs are frozen explicitly. `leading_blank_paragraphs` is optional on POST, defaults to 0, and must be a safe integer from 0 to 4998; the full sequence length `leading_blank_paragraphs + 1 + paragraphs.length` must not exceed 5000. Only exactly empty leading paragraphs are representable by this count; the desktop parser rejects leading whitespace-only paragraphs rather than changing their text. Canonical immutable input and the status job both return this number. The original SHA256 covers compact UTF-8 JSON for `[...Array(n).fill(''), title, ...paragraphs]`, including leading and body empty strings. Omitted and explicit zero use the same canonical input. `subheading_indices` remain zero-based body indices; the actual DOCX Heading1 position is `n + 1 + bodyIndex`. Image `after_paragraph` still counts non-empty text including title at 0. Actual DOCX verification rejects omitted or added leading blanks and wrongly shifted Heading1. The published 0032 migration and snapshot include the default-0 integer CHECK and immutable-column trigger; no applied migration is changed.

## 真正的小鱼执行上下文

新增事件 `local_word.requested`，payload 严格 `{job_id}`，eventId 稳定为 `local_word_evt_<job_id>`。`events/list`、订阅 allowlist、独立 sender 和安全日志一同扩展。其余订阅、旧事件和自动任务不变。

新增 MCP 工具：`read_local_word_job`、`claim_local_word_job`、`record_local_word_images`、`begin_local_word_output`、`put_local_word_output_chunk`、`finalize_local_word_output`、`fail_local_word_job`、`retry_local_word_dispatch`，以及 `claim_pending_local_word_job`、`read_local_word_claim_receipt`。协议范围 local-word-only-v1，仍使用现有 stateless `/mcp` 与平台 OAuth。部署后必须刷新实际工具/事件发现，当前运行任务里的旧 callable catalog 不会因本地源码新增自动获得能力。

真实外部小鱼有该次 **data.job_id** 时，按精确 ID 读冻结原文后认领，用真实公开来源研究相关图片并检查图片，制作和逐页渲染真实 DOCX，再调用新工具上传并完成。禁止 paid provider、正文重写、任何平台/发布/定时操作。job_id 缺失时按下节独立持久队列接手，不猜最新稿、批量扫 articles、手动别稿替代或反复重派。

图片计划先冻结实际嵌入原图 SHA、公开来源 URL/title、顺序与位置；`after_paragraph` 按非空文本段（标题为 0）计数。服务器验证精确正文（包括原空段）、指定 Heading1、图片 SHA/顺序/锚点、有效 PNG/JPEG/WebP 容器、行内布局、无 OOXML 裁剪、图片比例与绘制 extent 一致。语义相关性、来源真实性/许可、逐页视觉效果仍由实际助手研究和核验；回执明确是执行者报告，不能当成服务器证明。不得虚构版权许可。

finalize 必须附真实执行的 `{executor:'xiaoyu_agent',execution_id,model,rendered_pages,verification_summary}`；不预填用户偏好来冒充实际 model，也不承诺加速倍率。成功后正文、Word、图清单和执行记录保留；不做旧文章 cleanup。

## 无事件 ID 的独立持久接手（v110 后候选）

用户已明确要求「网页版就不需要具体id，本地版也不需要啊」。专用 `local_word.requested` 是唤醒；payload 未注入时执行者可以领取本人已经明确提交的 Word-only 任务，不需要用户另报 job ID。API 的正常本人同源 POST 是持久交接意图；完整 `local_desktop_frozen_source` manifest 和冻结输入是任务来源证据，不拿回调 accepted 当执行证据。

两工具都接受且只接受 `{claim_request_key, execution_id}`。领取 key 是本次领取稳定的非凭证 UUID，必须与源 `input.request_key` 分开。execution_id 是当前宿主实际 task/run ID，可含字母、数字、点、下划线、冒号、斜线、短横线，长度 1–200；复制实际 ID，不能生成随机 UUID 假装真实执行者。回读也必须传 execution_id，否则无法约束同一执行者。Sites owner 只由正规鉴权产生，参数不接受 owner。

1. 有精确 event job_id 时，仍调用 `read_local_word_job` → `claim_local_word_job`；不走兜底选择。
2. 无 job_id 时，对本次执行生成并保留一个 claim_request_key，调用 `claim_pending_local_word_job`。只挑最早 `created,id` 的本人 local_desktop、word_only、destinations=[]、queued、从未认领、无错误、无图片计划、无输出/成品的完整冻结提交。输入字段、规范输入 SHA、原文 SHA、标题前空段、子标题索引和 manifest 来源全部核对；不是历史 task 恢复接口。
3. D1 同一事务保存不可变收据、原子更新既有六小时租约并核验 CAS 成功；失败全部回滚。一个 owner/key 永远绑定一个 job 或 empty，收据禁止 UPDATE/DELETE。并发只有一个 `claimed=true AND new_execution_grant=true` 赢家可以开始新的图片/Word 制作。不同 key 恰好抢到同一预核验候选时，输家固定 empty，不默默扩大到下一篇。
4. 回复未知/丢失先调用 `read_local_word_claim_receipt`，保留原 key 和真实 execution_id。`not_recorded` 表示未知，只能同 key/execution 重试领取；`empty` 永远为空，后来有新稿也不扩大。换 execution_id 明确拒绝；跨 owner 回读不返回 job/token。相同 key 再次 claim 也只是回读原收据。
5. 收据只回读仍有效、未替换且同 hash/期限/input 的原许可；没有续租和新 grant。回读 `new_execution_grant=false`，即使 `claimed=true` 也只是原赢家同执行器恢复，不授权开始一轮新生成。有效执行者、过期但未知原执行、failed/completed，以及已有配图/输出的任务不由队列重跑。已冻结 Word 用原独立 job 认领/续传接口恢复同 bytes/SHA/分块；不可用队列生成替代文件。

`local_word_queue_claims` 完全独立于 articles、article_help_queue_claims、写作、平台与订阅。记录 owner/key/execution、job/input hash、原 claim hash/到期和密封 token；empty 不含任何 job 或许可。token 不写明文到 D1、日志、状态 API，仅在符合上述约束的响应中回到执行者内存。AES-GCM 密封键由原 owner/key/execution 审计绑定导出，**不是额外长期秘密或权限边界**，不能声称防数据库管理员；授权边界仍是 Sites owner 和现有租约。没有新长期凭据或事件接收器。

执行 ID 是 caller 对真实宿主 ID 的声明和收据一致性校验，平台当前请求没有提供可核验 task 身份签名，不能声称服务器独立认证了执行身份。拿不到真实 ID 应报告上下文阻塞，不能填随机角色 ID。队列授出的租约在 finalize 要求执行回执 execution_id 与原收据一致；原精确事件路径继续保持已有 UUID 回执校验。工具 discovery 中 finalize 的 execution_id 扩为上述字符串，以容纳真实宿主 ID；其它原参数和事件 payload 不变。

主线程合并部署后，仅更新现有 localWord 自动化 prompt 使用这些工具：有准确 ID 用原路径，否则稳定 key + 真实宿主 execution_id 领取；未知响应原 key 回读；只新 grant 赢家执行，terminal/empty/unknown 不重新生成或换 key 扩大。此源码补丁不新建、停用、重建或更改任何订阅，也不自行部署。

本地合成验收：`node tests/local-word-queue-d1.mjs` 使用实际 workerd/D1 和完整迁移，覆盖同 key/不同 key/不同执行者并发、丢回复、跨 owner、有效/过期执行者保护、失败/完成不重跑、目的地拒绝、非完整冻结输入、已有冻结输出、empty 不扩大、收据不可变、事务回滚及精确事件路径。HTTP/MCP、Word 完整产物校验、样式合同和实际 non-local 工具/事件元数据另做回归。只使用隔离合成 fixture，测试不认领、修改或删除真实任务、不发送事件、不跑模型或真实配图、不平台投递、不碰用户电脑。

## 集成和验收

当前无事件 ID 队列补丁核对官方私有 Site `appgprj_6ac1907e61a48191a067ce3c30b21265` v110，基线为 `80715ec1706168c6d7d12907f066c3d9a23f05e2`；既有 Word 表迁移是已部署 `0032_local_word_only_jobs.sql`，新增候选迁移为 `0035_local_word_queue.sql` 与对应 Drizzle metadata。合并时若网站主分支已占新迁移号，需从最新 schema 重新生成未应用的增量，保持已有迁移不可改写。此候选不部署，不将旧本地网站源码覆盖主站。

真实闭环至少要验收：本人登录授权页面 → 单篇指定合成稿创建 → 正常平台订阅/执行宿主将精确 event/job_id 交给真实小鱼 → 真正选图和 DOCX 生成/逐页检查 → 新工具上传与 word_completed → 网页授权下载 → 同一 Windows 批次落盘。不能用回调 2xx、合成执行回执或通过类型检查替代这项验收。源/执行结果都保持可恢复审计。

## 历史独立合同修复交付 profile（2026-10-08）

本节来自独立 `web-desktop-word-contract-fix` 的旧 feature 副本，基线 checkpoint 为 `f3d440e`，不是 c869/v102 集成或发布证明。当时 c869 源码未合法恢复，因此该旧候选不生成新 migration，也不变更订阅、普通 article 通道或任务。当前来源和无 ID 队列以以上 v110 契约为准。修复只收紧实际 Word 产物验收，8 个 local-word 工具参数 schema 和既有事件 payload 不变。

实际执行者应按下面的稳定 OOXML 子集生成 Word，然后渲染并逐页检查：

- 完整源序列包含所有标题前空段、标题和正文空段；只能指定 `subheading_indices` 对应的正文段直接使用 `Heading1`。标题使用 `Title` 或 `Normal` 等非 heading 样式。标题、前导空段、图片段和其它正文段均不得有额外 heading、outline 或隐藏文字；旧标题 `Heading1` 例外禁止回流。
- `word/styles.xml` 必须存在且为真实 Word 命名空间。指定 `Heading1` 定义唯一、`type=paragraph`、`customStyle` 省略或 `0/false/off`；名字只允许 canonical `heading 1`/`heading1`（大小写不敏感，无额外空格），直接 `outlineLvl=0`。`basedOn` 可省略；出现时须存在、类型正确、无循环，祖先不含 heading/outline/隐藏属性。实际应用的 `pStyle/rStyle` 引用、普通段、run、paragraph/character default、docDefaults 同样检查；未应用的正常内置 Heading2–9 定义可保留。
- 原生 `word/_rels/document.xml.rels` 必须有唯一标准内部 styles 关系：Type `http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles`、Target **恰为 `styles.xml`**、TargetMode 省略或 `Internal`、非空唯一 ID，并指向实际 styles part。只有放入 styles.xml 而未关联，不能视作实际加载该定义。`stylesWithEffects.xml` 当前 writer profile 不支持且拒绝，避免只检查 primary 样式遗漏覆盖。
- 文档 body 仅直接 `w:p/w:sectPr`；段仅直接 `w:pPr/w:r`；run 仅 `w:rPr/w:t/w:tab/w:br/w:cr/w:drawing`。tab、br、cr 要精确保真源中的制表符/换行。禁止表格、嵌套段、字段、修订、隐藏内容及无法证明原文保真的包装；所有原生命名空间须真实。图片必须为独立段中的直接单个 `wp:inline`，不得混入指定 Heading1 段或正文文本。
- **任何 `a:srcRect` 出现即拒绝**，包括全 0、空节点；不裁剪、不拉伸。outer `wp:extent` 和 inner `a:xfrm/a:ext` 均必需，坐标为正十进制整数、至多 `2^53-1`。用任意精度整数校验 `abs(cx * pixelHeight - cy * pixelWidth) <= pixelWidth + pixelHeight`；两个框每轴差至多 1 EMU。公式容差是量化误差，不是 0.1% 比例容差。无实际旋转/翻转：rotation 省略或整数值 0 可接受，flip 省略或 `0/false/off` 可接受，其它值拒绝。
- 原生 image relationship 的 Type 恰为 `http://schemas.openxmlformats.org/officeDocument/2006/relationships/image`，非空唯一 ID、内部 TargetMode。Target 采用 `media/<ASCII名字>.<png/jpg/jpeg/webp>`；basename 首字符为字母或数字，其余仅字母、数字、点、下划线、短横线。拒 `%` 编码、query/fragment、绝对路径、`./../`、反斜线和路径歧义；实际 media part 必须存在。两端使用相同直接字符串规则，不做 URI 解码或猜测。

以下是正文和图片尺寸的可生成方法（示例不是模型执行或真实图片研究证明）：

```python
from docx import Document
from docx.shared import Emu
from PIL import Image

doc = Document()  # python-docx 产生标准 styles part/relationship
for _ in range(frozen.leading_blank_paragraphs):
    doc.add_paragraph("")
doc.add_paragraph(frozen.title, style="Title")
heading_indices = set(frozen.subheading_indices)
for i, original_text in enumerate(frozen.paragraphs):
    doc.add_paragraph(original_text, style="Heading 1" if i in heading_indices else "Normal")
    # 若此锚点有已研究/检查的真实原图，在独立段内插入；不要改 original_text。
    if i in inspected_image_paths:
        image_path = inspected_image_paths[i]
        with Image.open(image_path) as image:
            pixel_width, pixel_height = image.size
        cx = 5_000_000
        cy = (cx * pixel_height + pixel_width // 2) // pixel_width
        doc.add_picture(image_path, width=Emu(cx), height=Emu(cy))
doc.save(output_path)
```

执行者必须再核定冻结 image manifest 的非空段锚点和嵌入原图 SHA。对已有 Word writer 的转换只放在 Word-only 专用 adapter：将标题改成 Title/Normal、确保唯一 native Heading1、補标准 styles relation，并保留原全文及图片字节；不得改变 legacy docxio 或普通模块行为。产物须通过两端校验并实际渲染检查后才能 finalize；不能靠修改验收哈希或删正文来通过。

共享 v1 合成语料的 5 个正例曾暴露实际 writer 缺 styles relationship，不能靠放宽后端掩盖。修正应生成新 v2 目录/manifest，两端逐文件验证同 bytes/SHA；旧 v1 和原 21 文件补丁保持冻结。此次旧 feature 的非 local-word MCP tools/events 使用实际源模块离线加载，过滤 8 个新增工具/专用事件后与 f3d440e 深比较；此结果不代表无法获取的当前 hot/上传/布局源码已经保留。
