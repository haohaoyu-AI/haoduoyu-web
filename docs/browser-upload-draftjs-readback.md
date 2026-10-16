# 知乎 Draft.js 只读回读适配

本增量只改变DOM读取，不改变任何上传、账号、许可、状态写入、修复或恢复门禁。自动正文改稿/漏图仍禁用，头条当前18图与历史22图差异不修改。没有新的浏览器调用、编辑、上传、保存、发布、模型或费用。

`inspectObservedDraftJs` 是自包含、可序列化的官方只读evaluate回调。`ui.body.dom_kind='zhihu_draftjs_v1'` 仅在知乎启用；已有p结构路径维持原门禁。源代码发射器同步移除两个函数export，不依赖页面内imports或未文档化接口。

## 原句与段落边界

- 只接受实读 `div.public-DraftEditor-content[contenteditable=true][role=textbox]`，正文为 `div.Editable-unstyled[data-block=true]` 或 `h2.Editable-styled[data-block=true]`。
- 读取实际 `textContent`，不用可能受屏幕宽度影响的`innerText`。实测40块里的真实LF对应55个原段；LF分隔仅在冻结原段逐项精确匹配时消费。
- 冻结原段本身包含LF时，先整段匹配，再识别段间分隔；不会把原段内部换行拆成新段。所有输出正文字符串都取自实际DOM子串，不从baseline替代缺字。
- 任何丢段、加字、换序、重复段、未知含字节点/内嵌字段都产生不符证据，原`bodyAnalysis`拒绝验收。空编辑页仍可被识别为真正空页，但空页永远不能通过全文回读。

## 图注与图片

仅当同时满足以下实读契约，才把图注当UI空占位：FIGCAPTION同时含`Image-caption`、`Image-captionV2`、`is-placeholder`，文字逐字为“添加图片注释，不超过 140 字（可选）”，归属于实际`figure.Editable-styled[data-block=true][contenteditable=false]`，没有未知嵌入内容。缺class、换文案、非空真图注、textarea/input value、图内裸文本依旧阻断；不能全局忽略figcaption。所有图注先递归检查子树，textContent为空不能掩盖INPUT/TEXTAREA值或额外IMG；表单控件、额外图片、未知子结构即使没有文字也会阻断，额外图片会进入图序证据，不漏计。

所有图按实际figure顺序读取，数量、加载、资产身份和Word标题0锚点仍由原验收门禁检查。实测当时22图仅2图加载，fixture保留该事实，测试不得把离线图加载当线上成功。测试资源URL明确用fixture.invalid合成，未伪称实际CDN资源。

## 证据与边界

`tests/fixtures/zhihu-observed-blocks.json` 是此前成功只读捕获的确切tag/class/textContent/innerText/BR元数据，不是原始HTML全量dump。测试按已捕获父子结构重建DOM对象，没有宣称未捕获的HTML属性已实测。`zhihu-observed-image-order.json` 从此前实际AX正文/figure顺序无损对齐得到22个图锚点，没有新读浏览器。

`tests/draftjs-dom-readback.mjs` 覆盖实测55段/22图顺序、视觉折行、原段LF、真/假图注、未知节点、textarea值、裸文本、缺段/换序/重复及真实runtime分支；同时回归原20mock、14安全负例、当前articleCall/SQLite桥接、租约与schema。

本次加固候选未在官方Cua会话载入，也未平台E2E投递验收。确切控件可见性/属性之前被拒绝的读取不再重试或换路线；该缺项仍需用户授权。账号菜单、导入/封面trigger真实动作与完整懒加载证明不因本离线DOM解析而被视为通过。
