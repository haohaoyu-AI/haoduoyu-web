# 第二轮 UI：6 项验收修复

基线为 `e284dd5031a195fd8cff549a5b34fbdcce195cef`（包含 f405 工作台和只读文章对账），分支 `opt/workbench-ui-round2`。未部署或创建 PR。

| 项目 | 当前结果与证据 |
| --- | --- |
| 1 指定导航滚动条与倒三角 | **完成。** 按父级实际看图后的精确定位，仅隐藏全站导航列表内滚动条、轨道、上下箭头与图文标题右侧小 v。保留滚轮、触屏和键盘滚动，以及标题展开/收起和同步的 aria-expanded。实测滚轮/End 键及展开状态通过。 |
| 2 历史日期没有事项 | **完成。** 原因是历史视图隐藏了整个 `todo-main`，而真实日期数据和事项列表都在此容器中。历史现在保留选中日期列表，显示全部未完成和已完成事项；不更改今日的“隐藏已完成”偏好，不假定数据丢失，也未改 API。 |
| 3 常用项显示今日已添加 | **完成。** 标签依据北京时间当天已经读取或写入确认的 `template_id` 关联事项推导；请求未确认时不假报，真实软删除后消失，刷新与重新添加后同步。常用面板从历史打开仍作用于实际今天。 |
| 4 取消分组 UI、简洁＋与× | **完成。** 平铺展示所有旧分组中的有效笔记，不迁移、不删除分组或真实内容。＋直接新建并聚焦输入；空工作区内部沿用既有分组接口，无分组操作 UI。×直接软删除，无确认弹框；输入尚在保存时先确认保存，未知结果或冲突时保留草稿并提示，不误删。设置回收站保留，包括旧已删除分组中的笔记恢复。 |
| 5 正文全屏 | **完成。** 使用原生 modal dialog 的顶层展示，同一编辑节点进入/退出全屏，文字、选区、滚动、焦点及保存状态保留；按钮与 Escape 均可退出。桌面、375/390 宽实测，背景不透出底层文字。 |
| 6 全站导航白线拖动 | **完成。** 全站导航与主内容边界支持拖动，键盘方向键16px、Shift加大步长、Home/End到上下限。宽桌面200–420px，窄桌面至少88px且主内容至少420px；本机保存偏好。Escape/指针取消恢复原宽度，刷新/换模块保留；375/390手机仍单栏/抽屉且隐藏调节器，恢复桌面取回偏好。 |

图片定位已解除：本机官方流程初次及一次重试均下载失败。随后父级成功取得并实际查看第1、6张原图，核对上述目标，并明确授权无需再次本机下载即可实现；未再重试，未冒充本机已看图。

## 验证

- `tests/browser-workbench-round2.py`：真实本地 Worker、临时合成 D1；1440/375/390 三种宽度，10 项通过，12 张截图，0 JS 异常、无文档横向溢出。覆盖延迟保存期间全屏、保留同一 DOM 节点和选区、点击退出/Escape、保存中点击删除、软删除恢复、旧分组全部笔记与正文保留。
- 73 项定向 Node 检查全部通过：待办 UI、备忘录状态、匿名业务保护、文章/备忘录边界及准确变更投影。新增变更只以当前整合基线的准确文件 SHA-256 清单认可；额外代码仍被拒绝。
- `tests/browser-workbench-sidebar.py`：导航专项6项通过，覆盖真实滚动、展开ARIA、全站拖动、键盘上下限、刷新/跨页、取消恢复、900/761窄窗、375/390移动端及无效偏好。两组共16项浏览器验收、0 JS异常、15张原始截图，报告精选11张。
- 52 模块 / 881 函数样式检查、源码与 bundle 一致性、11 项资源哈希与 Worker 嵌入检查通过；两个本地预览通过。
- 完整远端 CI 由该独立分支 push 触发，状态以实际 run 及交付消息为准，不在此预先宣称成功。

`src/` 中受版本控制的后端业务源码、`db/`、`drizzle/`、`shared/`、运行配置、依赖、凭据和扫描配置均相对 e284 不变；生成的资源嵌入正常随前端更新。仍为 18 表 / v7 / 7 次迁移，不改生产数据，不碰其他自动化。

## 证据与候选包

- [全站白线调宽后的设置页](workbench-round2-images/sidebar-settings-1440.png)
- [900宽导航](workbench-round2-images/sidebar-expanded-900.png)、[375抽屉](workbench-round2-images/sidebar-drawer-375.png)
- [导航专项报告](workbench-round2-images/sidebar-report.json)
- [历史完整事项](workbench-round2-images/history-1440.png)
- [常用今日状态](workbench-round2-images/templates-1440.png)
- [平铺笔记列表](workbench-round2-images/flat-notes-1440.png)
- [桌面正文全屏](workbench-round2-images/fullscreen-1440.png)
- [375 列表](workbench-round2-images/flat-notes-375.png)、[375 全屏](workbench-round2-images/fullscreen-375.png)
- [390 列表](workbench-round2-images/flat-notes-390.png)、[390 全屏](workbench-round2-images/fullscreen-390.png)
- [浏览器逐项报告](workbench-round2-images/report.json)
- [Worker / 包字节与哈希、配置零变化证据](workbench-round2-build.json)

所有提交截图均为一次性合成夹具，未包含用户原图或用户正文。完整候选包名 `haoduoyu-workbench-round2.tar`，保留所有既有功能和6项修复；此前名称含 partial 的四项包已被此包取代，不用于发布。
