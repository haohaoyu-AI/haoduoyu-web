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
当前可读 bundle 115649 B，超 100000 B 仍未通过。真实浏览器、computed
styles、正常零 CSP 违规及反向控制尚待完成，不能据定向测试宣称验收。
