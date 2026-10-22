# 阶段 4c：严格 style CSP（初始红灯检查点）

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
