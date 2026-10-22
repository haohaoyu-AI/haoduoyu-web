# 阶段 4c：严格 style CSP（待独立验收、未部署）

基线：a1babd8558d7869ab61fe6bc463615a04eec6eb9。
分支：opt/phase4c-strict-style-csp。本阶段不部署、不合并。

范围仅为 D5：发布量柱高/颜色和图例圆点由模板 style 属性改为
转义后的元素数据；渲染后只以 CSSOM setProperty 写入受控 CSS 变量。
CSS 引用变量，CSP 的 style-src 仅删除 unsafe-inline；其余策略保持。

已清查两处模板 style 输出。浮层 left/top、弹窗 body overflow 和入场
延迟本来就通过 CSSOM 设置，不能把其 DOM 序列化 style 属性误称为模板
注入，也不能将它们改成 setAttribute/style.cssText。

先锁定真实基线红灯：图表渲染仍输出 style 属性；响应策略仍含
style-src unsafe-inline。之后将检查 HTML/静态资源/API/304/错误路径的
完整安全头、真实浏览器 securitypolicyviolation、computed styles、
柱尺寸/颜色/图例、换周期/换页以及四宽相关场景。反向控制必须能触发
被阻止的 inline style，并与正常零违规分开保留，不过滤掉违规报告。

高度仅接受 0～80 的有限数值，颜色仅允许现有四个平台 CSS 变量；
合法原数据的输出几何和颜色不变。异常值不会拼接 CSS、URL 或 NaN。
所有 HTML 动态值继续转义。保持源码 160 字符/80 行与未压缩构建；
既有 115029 B 超过 100000 B 的缺口仍未获豁免，不扩大本阶段凑体积。

参考 CSSOM 与 CSP 的区别：
https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src
及 https://www.w3.org/TR/CSP3/ 。最终结果以真实浏览器证据为准。

## 恢复后的实现检查点

原环境断开后已恢复同一工作区。未提交实现先归档，无 reset/清理。
图表两处模板改为转义数据属性，replacePageContent 在写入 HTML 后、
动画前用 CSSOM 设置白名单颜色和 0～80 有限高度；CSS 读取变量。
worker 仅删除 style-src 的 unsafe-inline，未改路由或业务。

中断前定向 65 项为 64 过/1 失败；唯一失败进一步定位为故障请求漏传 SITE_ORIGIN，进入配置检查
返回 503，误期待 500。修正请求上下文并在真实鉴权后注入账号读取
故障，保留原失败日志，不改产品错误码。旧契约比较只显式投影这一条
已授权 CSP 令牌变化，并仍断言整条策略只能是准确旧版或准确严格版，
不删除或忽略安全头。模板结构比较只允许两处已知属性替换及一个明确
的 CSSOM hook，其余模板/回调/声明仍锁定。

现有 GitHub App 是保存通道；CLI 凭据无效，不再重试、不新建 token。
当前可读 bundle 115637 B，超 100000 B 仍未通过。真实浏览器、computed
styles、正常零 CSP 违规及反向控制尚待完成，不能据定向测试宣称验收。

## 测试工具检查点

恢复后的定向测试 65/65、八资产与双预览通过；产品提交
c66948bef03a5438792db6f7e2979a8d588f6eda 的 CI 已通过。CSS 使用本阶段
私有的 --h / --plot-color，水合总是先同步设置受控值再进入动画；不对
整份 CSS 压缩，最终仍为 28000 B。

浏览器比较独立合成库中的原版 JS/CSS/原 CSP 与候选版；后端守卫只
允许 CSP 单令牌差异和两个准确 CSS 声明差异。记录所有实际
securitypolicyviolation，并用故意被拒绝的 style 属性验证通道有效，
与正常流程零违规分开，不以过滤器屏蔽正常违规。每次图表渲染读取
computed 尺寸、背景色、SVG stroke/fill、四宽原图及 DOM 样式属性审计。
此工具保存时仍在运行，尚未把未完成的浏览器结果标为通过。

## 浏览器驱动的有限修正

首轮基线已完成 56 图和 11 表单；随后固定四图例断言与表单新增账号
互相冲突。保留失败原始记录，将只读图表检查移至写入前，断言仍是
准确四图例，不放松成非空。基线补充图表/周期/指标/日期/导航及正常
动画 CSSOM 检查已经完成。

候选第一次在第 11 张图后，详情抽屉 body overflow 审计失败；Chrome
把 shorthand 枚举成 overflow-x/y。仅允许 body 的对应长属性且必须
为 hidden，其他白名单及所有 CSP 事件监听不变。该时正常违规为零，
不把未完成的候选流程或这项驱动错误标为产品通过。

## 最终本地浏览器与计算样式证据

产品源码固定 c66948bef03a5438792db6f7e2979a8d588f6eda；后续提交只改测试工具、证据及文档。
真实 Chromium 154.0.8037.57，两个独立本地 Miniflare D1，真实 Cookie/CSRF；
无生产连接、账号或数据。最终候选执行提交 d4e96f18fed098471aa27bee491a55ef1c4a348e。

- 候选完整流程：56 张 PNG、26 个必需 data-action 全覆盖（实际 31 个名字）、11 类表单、
  键盘及触屏；正常 securitypolicyviolation 为 0，pageerror / warning 为 0。
- 反向控制：候选 setAttribute(style) 被真实浏览器阻止，恰有 1 条 style-src-attr 事件；
  新节点 CSSOM setProperty 生效且无新增事件。旧宽松策略允许属性，没有该事件。
- 13 个 computed 状态按 (name,width,同名出现次序) 精确配对：四宽 7d、周期切换/隐藏、
  指标切换、发布标签、日期切换与换页返回。逐项比较所有已采集柱高/宽/背景/矩形/title、
  图例及 SVG stroke/fill/geometry，13/13 完全相同，无舍入或容差。
- tests/style-evidence.mjs 是可执行比较器，不以“采集完成”替代等价断言；两个正式单测
  证明缺样/重复/错误状态及细小尺寸/颜色/SVG/hidden 改变会失败。旧未完成候选输入的
  真实红灯保留为 computed-incomplete-red.json，不把失败尝试拼接为完整成功流程。

公共纯合成 JSON 位于 strict-style-data/，是原始 JSON 仅去除排版空白后的同值副本，
provenance.json 保留原文件 SHA256 和发布副本 SHA256；没有响应正文、Cookie、CSRF、
口令或一次性 token。完整 PNG 留在本地 artifacts/strict-style，少量可审原图及 diff
在 strict-style-images/，其 manifest 保留原始 SHA256。截图前均检查密码输入为空、
一次性凭据未出现。合成账号名称可见，不代表真实用户。

重现 computed 比较：

```sh
node tests/style-evidence.mjs --baseline-visual docs/strict-style-data/baseline-original.json \
  --baseline-style docs/strict-style-data/baseline-style.json \
  --candidate docs/strict-style-data/candidate-final.json --output /tmp/strict-style-computed.json
```

四宽 56 对 PNG 中 47 对逐像素相同，dashboard 四宽全部相同。其余 9 对全部保留：
4 对 audit 因候选首次驱动失败后再次登录，合成库中登录记录由 ×1 变为 ×2（同一固定时间
显示成范围），对应 372 像素/最大色差 219；这是测试库被重试登录改变的可见内容差异，
不能将该页称严格截图相同。两次登录可由保留的 candidate-partial 与 candidate-final
执行顺序核实，不为追求相同而删除日志或重拍。
另 5 对 account-new/key/snapshot 控件边缘差异为 13～32 像素、最大色差 1；已逐组
查看原图和放大 diff，位于原生控件圆角，没有文字、布局或间距变化。没有声称旧旧复现。
严格 PNG 全相等未通过；有限看图与计算样式证据支持图表及可见布局保持。

原始基线流程 status=failed：56 图与 11 表单已完成后额外固定四图例检查受到新增账号
影响，补充 style-only 在干净对应库中完成；不把它改写为整轮 complete。候选早期 body
overflow 审计失败亦保留。最终候选 complete 是修正驱动后一次完整执行。
正常已登录流程无页面脚本错误；未登录/错误密码 401、主动断网/真实 409 与刻意 CSP
拦截的控制台诊断单独保留，因此不宣称字面全流程控制台零错误。

## 最终边界

最终未压缩 app.js 为 115637 B，仍超过 100000 B，整体体积目标未通过；
CSS 为 28000 B。源码检查 30 模块 / 350 函数通过 160 字符 / 80 行门槛。
原先 115649 B 是中间实现，不能作为最终值。新增动态属性继续经 e() 转义；
水合 CSS 变量只接受四个平台令牌和 0～80 有限数值。

本阶段只删除 CSP 的一个既定 style-src 令牌，其他安全头通过完整比较，
覆盖 HTML、资源、API、304、401、400 与注入 500。未修改数据库、鉴权、接口、
生产配置或权限。生产仍为 Sites v7；此 PR 尚待独立验收，不自动上线。
