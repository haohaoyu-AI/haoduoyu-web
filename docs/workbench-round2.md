# 第二轮 UI 验收：4 项完成、2 项图片定位阻塞

基线为 `e284dd5031a195fd8cff549a5b34fbdcce195cef`（包含 f405 工作台和只读文章对账），分支 `opt/workbench-ui-round2`。未部署或创建 PR。

| 项目 | 当前结果与证据 |
| --- | --- |
| 1 指定滚动条与倒三角 | **阻塞，未改动指定目标。** 六张 Library 图片读取仅返回引用，官方 `prepare_materialize` 与 `library_file_transfer.py materialize` 初次及一次重新准备后的下载均失败，输出 `library file transfer failed: download failed`，本机没有可读像素。未猜 URL、未绕过权限，未以 OCR 或父级描述冒充看图。 |
| 2 历史日期没有事项 | **完成。** 原因是历史视图隐藏了整个 `todo-main`，而真实日期数据和事项列表都在此容器中。历史现在保留选中日期列表，显示全部未完成和已完成事项；不更改今日的“隐藏已完成”偏好，不假定数据丢失，也未改 API。 |
| 3 常用项显示今日已添加 | **完成。** 标签依据北京时间当天已经读取或写入确认的 `template_id` 关联事项推导；请求未确认时不假报，真实软删除后消失，刷新与重新添加后同步。常用面板从历史打开仍作用于实际今天。 |
| 4 取消分组 UI、简洁＋与× | **完成。** 平铺展示所有旧分组中的有效笔记，不迁移、不删除分组或真实内容。＋直接新建并聚焦输入；空工作区内部沿用既有分组接口，无分组操作 UI。×直接软删除，无确认弹框；输入尚在保存时先确认保存，未知结果或冲突时保留草稿并提示，不误删。设置回收站保留，包括旧已删除分组中的笔记恢复。 |
| 5 正文全屏 | **完成。** 使用原生 modal dialog 的顶层展示，同一编辑节点进入/退出全屏，文字、选区、滚动、焦点及保存状态保留；按钮与 Escape 均可退出。桌面、375/390 宽实测，背景不透出底层文字。 |
| 6 指定白线拖动比例 | **阻塞，未猜目标。** 必须先实际查看截图指定的线条；图片传输失败与第 1 项相同。尚未实现未知分隔线拖动。 |

## 验证

- `tests/browser-workbench-round2.py`：真实本地 Worker、临时合成 D1；1440/375/390 三种宽度，10 项通过，12 张截图，0 JS 异常、无文档横向溢出。覆盖延迟保存期间全屏、保留同一 DOM 节点和选区、点击退出/Escape、保存中点击删除、软删除恢复、旧分组全部笔记与正文保留。
- 59 项定向 Node 检查全部通过：待办 UI、备忘录状态、匿名业务保护、文章/备忘录边界及准确变更投影。新增变更只以当前整合基线的准确文件 SHA-256 清单认可；额外代码仍被拒绝。
- 52 模块 / 866 函数样式检查、源码与 bundle 一致性、11 项资源哈希与 Worker 嵌入检查通过；两个本地预览通过。
- 完整远端 CI 由该独立分支 push 触发，状态以实际 run 及交付消息为准，不在此预先宣称成功。

`src/` 中受版本控制的后端业务源码、`db/`、`drizzle/`、`shared/`、运行配置、依赖、凭据和扫描配置均相对 e284 不变；生成的资源嵌入正常随前端更新。仍为 18 表 / v7 / 7 次迁移，不改生产数据，不碰其他自动化。

## 证据与候选包

- [历史完整事项](workbench-round2-images/history-1440.png)
- [常用今日状态](workbench-round2-images/templates-1440.png)
- [平铺笔记列表](workbench-round2-images/flat-notes-1440.png)
- [桌面正文全屏](workbench-round2-images/fullscreen-1440.png)
- [375 列表](workbench-round2-images/flat-notes-375.png)、[375 全屏](workbench-round2-images/fullscreen-375.png)
- [390 列表](workbench-round2-images/flat-notes-390.png)、[390 全屏](workbench-round2-images/fullscreen-390.png)
- [浏览器逐项报告](workbench-round2-images/report.json)
- [Worker / 包字节与哈希、配置零变化证据](workbench-round2-build.json)

所有提交截图均为一次性合成夹具，未包含用户原图或用户正文。候选包名 `haoduoyu-workbench-round2-partial.tar`，仅表示已经完成的第 2/3/4/5 项及既有整合功能；第 1/6 项仍待可读截图，不应误称六项全部完成。
