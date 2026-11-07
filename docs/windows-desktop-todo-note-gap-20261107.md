# 待办备注与转碎碎念：后续差距审计

后续状态：私有待办备注已在[阶段14](windows-desktop-stage14-20261107.md)按固定合同实现，本机验证通过并保存远端fc9b122，正常Windows CI42364695346执行中。以下保留实施前的合同和差距审计，不代表当前备注功能仍未开发；待办转碎碎念仍无已核实原子合同。

2026-11-07，只读核对固定候选网站源 `34bff302e128c92f46f00e76d59f9b44b9b7242e` 与已保存桌面源 `a73c74cd943048623d779378cefe35d89995ec7a`。本页没有实现功能、运行新测试、访问生产记录或重开阶段13冻结文件；随阶段13交接证据保存。固定候选存在不等于已证明当前线上 Worker 精确 SHA，也没有验证生产迁移状态。

## 结论与优先项

下一项最有价值且有明确合同的云端开发是：**登录管理账号的原生待办备注编辑**。它能保存未完成原因和补充资料，沿用同一待办的 CAS，不改原事项、完成状态、日期或历史关联。需要专用备注草稿类型、保留精确文字、覆盖合法空值省略和共享资源围栏；这是尚未实现的产品工作，不是实机阻塞，也不称已完成。

候选源的公开业务 allowlist **没有放行待办备注 PATCH**。不能把公开模式当作可写、修改服务端权限或改用另一身份绕过。桌面可继续读取公开 GET 已有备注，但公开身份的备注写入必须明确不可用；离线私有草稿重新联网后仍需登录原账号和核对 scope。

在所审候选的前端待办菜单、动作映射、`src/todos.mjs` 全部 operation 分派及 note-entries 路由中，**没有找到待办转碎碎念的正式转换流程或原子接口**。不能猜测 `/to-note` 等 URL，也不能把两个独立写请求包装成转换后删除旧待办。若以后提供“复制到碎碎念草稿”，必须明确是复制、原待办保留、目标日期和权限另核；这不是本轮已发现的转换合同。

## 固定来源及 SHA256

下表全部属于上述 `34bff302` 候选，行号用于源码接续，不指向当前桌面分支中较旧的网站文件。

| 文件与关键行 | SHA256 |
| --- | --- |
| [src/todos.mjs:120](https://github.com/haohaoyu-AI/haoduoyu-web/blob/34bff302e128c92f46f00e76d59f9b44b9b7242e/src/todos.mjs#L120)，路由分派180–199 | `8e87d53031b6f9f3e510de25733cacbeea6b9049a8a871123da5108f1c3de6bc` |
| [src/public-business.mjs:8](https://github.com/haohaoyu-AI/haoduoyu-web/blob/34bff302e128c92f46f00e76d59f9b44b9b7242e/src/public-business.mjs#L8)，公开路由与44–87认证绑定 | `2b3e1496961ce660f6d87539488841aa6eaad6fa163c1286a3eb0ed4d58f5bc8` |
| [web/pages/todo-actions.mjs:37](https://github.com/haohaoyu-AI/haoduoyu-web/blob/34bff302e128c92f46f00e76d59f9b44b9b7242e/web/pages/todo-actions.mjs#L37)，备注表单/提交；菜单23–35 | `cdbdd042f8228b089db48fed58e184f97baa35c6cbf006b1c71dafe1e46824c3` |
| [src/note-entries.mjs:108](https://github.com/haohaoyu-AI/haoduoyu-web/blob/34bff302e128c92f46f00e76d59f9b44b9b7242e/src/note-entries.mjs#L108)，普通碎碎念写入；86–98精确保存收据 | `6e15550a62036df768414c73628681b6af51d393fe9aa2098da8b142e9eabffa` |
| [src/note-entry-validation.mjs:28](https://github.com/haohaoyu-AI/haoduoyu-web/blob/34bff302e128c92f46f00e76d59f9b44b9b7242e/src/note-entry-validation.mjs#L28) | `7722345e648be29c90d0963a13a535aded2d2793e47778392083c8ad470c2e84` |
| [src/public-note-access.mjs:5](https://github.com/haohaoyu-AI/haoduoyu-web/blob/34bff302e128c92f46f00e76d59f9b44b9b7242e/src/public-note-access.mjs#L5) | `70bddf4960df9010e033c0d1c6b4e3786b4e599bfd3811b86c21728530c9ac6b` |

## 待办备注的实际合同

- 正式动作是 `PATCH /api/v1/todos/{UUID}/note`，请求仅 `{note,version}`，无 query、date、save_id 或其他字段（`src/todos.mjs:120–133,184–196`）。UUID须匹配该文件`:27–30`的版本/variant规则；version为正安全整数，严格小于 `Number.MAX_SAFE_INTEGER`。
- note 必须是良构 UTF-16 字符串，`.length <= 4000`；允许空串、空白、TAB、LF、CR，禁止其余所列控制字符和 DEL。服务端**不 trim、不改换行、不做 Unicode 归一化**。4000不是 UTF-8 字节数，不能复用按字节限长或自动换行规范化的碎碎念 builder。
- 按当前 actor、原 UUID 读同一未删除待办；不存在或已软删返回404。正常匹配版本时只更新 note、updated_at、version+1，即使文字与旧值相同也会加1。若当前版本恰为请求版本+1，且 note 逐字相同，则无写返回当前记录。其他版本409。这与模板归档同版本 no-op 不同：备注成功响应的版本只能是请求版本+1。
- 成功返回 `linkedItem` 的完整待办及原模板关联；原 text、date、completed、template link 不改变。`item()` 在`:10–13`会**省略空 note 字段**；清空备注成功时响应没有 note，不是 `note:null`，不得误判为失败或保留旧备注。
- `handleTodos` 通过 business-access 认证、管理 session、Origin/CSRF 两次核查后进入 mutate。其他用户不能写该 actor 之外的记录。API key 虽可能有 write，仍不能通过 requireAdmin；匿名公开请求因 public-business PATCH allowlist不包含这个子路径而没有公开 actor。这里只能据固定源确认合同，不据此探测生产写入。
- 该动作没有 save_id 保存收据或专属 GET receipt，也不读取客户端 Idempotency-Key 做精确回执存储。普通 `GET /todos?date=...` 的当前内容/版本相同，不能证明某次超时请求提交。Unknown 保留原请求、字节、版本和同资源围栏，不自动确认、重发或换键。

数据库字段来自 `drizzle/0019_todo_notes_archives.sql:1` 的 `note NOT NULL DEFAULT ''`，阶段13已有该固定迁移的审计；桌面不得执行生产迁移。`src/business-snapshot.mjs:45`、`src/snapshot-projection.mjs:78,111–116` 和 `src/workbench-snapshot.mjs:59` 已读取 note；原快照未知字段不能因新 UI 遗失。`tests/todo-notes-archives.test.mjs:21–29,34,40–55` 已有 session保存、重放、冲突、历史和备份默认值源码断言，但备注权限/边界的完整新隔离矩阵仍待实现后验证，**本次未运行这些测试**。

## 普通碎碎念不是待办转换

`src/note-entries.mjs:108–174` 的 `PUT /note-entries/{UUID}` 是独立记录写入，需要 `{category,date,text,version,save_id}` 与可选 labels；新建为 version0，只能新建北京时间当天记录，分类/日期对既有记录不可改，正文为规范换行后的最多64KiB UTF-8。noteEditor 的 owner 是单独配置的 notes owner，session须与其相同；不能因能写自己的待办就推断能写该碎碎念 owner。

其精确收据路径 `/note-entries/operations/{save_id}` 及 actor/key/hash/version合同只覆盖这次碎碎念保存，不证明旧待办已移动或删除。没有同时更新 todo 和 note-entry 的事务合同、来源唯一约束或转换收据。因此不能自动复用待办 UUID、历史日期、删除原待办，或把一个 note-entry 成功响应当作原待办操作完成。

## 桌面实际差距与必要集成

以下为 `a73c74c` 桌面源中的接续位置，阶段13文件保持冻结：

1. `Haoduoyu.Windows/BusinessPages.cs:29–63` 待办菜单没有备注入口，列表只显示 text；`Editors.cs:15,188–196` 的 todo 类型始终构造 POST 创建，不能拿它更新既有备注。需专用 `todo-note` 草稿/表单，保留原 UUID、日期、版本与完整基线；草稿 key 与原 todo 创建稿分开，排队 ResourceKey 仍为原 `/api/v1/todos/{id}`。不能覆盖创建稿，或改 ResourceKey 躲开完成、删除、Unknown 等同资源围栏。
2. `Haoduoyu.Api/RoutePolicy.cs:16–18` 与 `ApiRequests.cs:31–38` 尚无 note 子路径/builder。仅开放该 PATCH 和精确二字段；私有身份离线续编重新发送前仍要求原 session、scope。公开身份不可静默排入明知不支持的写入。
3. `MutationVerifier.cs:105–130` 通用 PATCH 的版本+1要求适用；但 foreach 强制返回 note 字段会拒绝合法清空。需要窄动作校验：仅请求 note==空串时，成功响应的 note 缺席可解释为明确空；非空缺席、null、错类型、错UUID/日期/版本仍拒绝。不要将模板归档的 same-version 宽容扩到备注。
4. `SyncEngine.cs:533–547` 的版本目标解析不识别 note，且`:412–413`假设带 action 的依赖写都是 POST。若支持“创建确认后写备注”，必须仅对 todo-note 使用 PATCH，从真实同资源父回执取得版本再冻结请求，不能硬编码1或改旧已尝试请求。
5. `MainWindow.cs:372–418` 的确认后 draft rebase/目标表、`RecoveryPages.cs:26–38`继续草稿、搜索 kind 与日期发现均需认识专用类型；date不能塞入正式 PATCH body。`ReadOperationEntityAsync`当前按 ResourceKey 找日期，独立备注稿须保留并核对原日期，不能猜今天。`Reconciliation.cs:15–24` 已将无收据接口保持 Unconfirmed；新备注仍应如此。
6. `WorkspaceProjection` 可按 todo 原 UUID 合并 note 子动作，但成功“省略空字段”必须清掉已有旧 note，不能从旧基线补回来。`TodoHistory.cs:312–319`能识别 todo 子路径的未决操作，但界面、日期历史、只读详情/导出需呈现备注及 Queued/Unknown 来源；备注不改变完成统计、原 text、模板关联或日期。补字段校验时要兼容旧缓存缺 note 和新快照的明确空值语义。

后续必要隔离验证应使用另存的精确 `34bff302` Worker 与临时 D1、零外部请求：session保存/清空/原样空白CRLF/4000边界与非法UTF-16控制符；相同版本相同正文仍+1、旧版本相同正文重放不写、不同正文及并发冲突；公开/key/其他owner/CSRF/Origin拒绝；清空响应字段省略；同 todo 的创建→备注依赖、完成/删除围栏、Unknown回执丢失与恢复；跨身份、取消/超预算保全；原生窗口离线重开及草稿原键/原文。本阶段未实施备注功能或新增其测试，后续可据此独立继续云端开发；无需猜测新转换接口。
