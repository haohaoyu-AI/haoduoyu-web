# 阶段 4b：action 与 GET 生命周期（草稿交审，未部署）

基线 main：2e12147b700ac604d7cccf8e034374644ac99a03。
产品版本：b06ab44fe9b56efa1bf3acc76b51d3d6638bbecf。
PR：[21](https://github.com/haohaoyu-AI/haoduoyu-web/pull/21)。
产品提交 CI：[39842427352](https://github.com/haohaoyu-AI/haoduoyu-web/actions/runs/39842427352)，210/210，构建、八资产、双预览和扫描通过。扫描为 104 个内容提交、151 条既有精确历史例外后零未决，不能称历史原始零命中。最终文档/试验工具归档提交的精确 CI 状态以 PR 为准。

## 改动和行为边界

- actions.mjs 导出原名字到具名处理函数的注册表。43 个原键及处理体结构等价；点击前置判断、其余回调体、九个事件绑定顺序及 capture 选项保持。forms.mjs 独立分发，保留校验、写入参数、成功提示、焦点及错误/重复提交处理。
- 只合并同所有者、渲染周期、sessionEpoch/身份/权限状态、写入 generation 及有效选项下的 **pending GET**；完成结果不成为通用响应缓存。共享原始文本，每个消费者独立 JSON.parse，避免可变对象串用。HEAD 和写请求不合并、不自动重试。
- 页面、弹窗、后台分别拥有请求上下文。新页/刷新取消旧页 GET；关闭或替换弹窗处理自身读取。单个消费者取消只退订自身，最后一个消费者才中止 fetch。写请求不被换页取消。
- 保留 renderVersion、sessionEpoch、索引 generation 和身份守卫；当前真实 401 仍退出，旧会话 401 不影响同账号重新登录。成功写在读响应体前按原时机失效；旧在途索引不能重新填充新周期，完成的冻结索引仍按原会话缓存复用。
- 源码可读排版仅改变表达式/续行边界，所有模板 cooked 文本和空白保持。独审指出的词中切断已改为标签、属性空白、选择器逗号、文案标点或表达式边界。检查器拒绝词中续行、>160 字符行及 >80 行函数，覆盖全部 30 模块 / 349 函数，无忽略项。
- 后端、数据库、schema、runtime/hosting、CSS、内联样式和 CSP 均未改；4c 仍待执行。没有生产写入、部署、权限更改、合并或大基准重跑。

## 红灯、回归和数量

第一次红灯在未改产品基线上执行实际 bundle，6 项中 2 过、4 失败：重复 GET、取消身份、换页取消、刷新取消。98ea285 保存该检查点，688d15e 为 core 实现并完成本地全量 199/199。后续新增读体期间取消、最后消费者取消、真正 fetch/body/JSON 失败及分发/源码检查；最终产品 CI 为 210/210，不将阶段数量相加。

定向源码测试比较所有原处理体、原回调、模板 cooked 内容及事件顺序；未变模块做共同 esbuild 规范化后的声明 AST 对照。可读性修正前后完整 bundle AST 也相同，记录见 [排版证据](frontend-request-lifecycle-data/bundle-format-equivalence.json)。结构检查不冒充真实浏览器操作。

## 真实浏览器与合成库

Chromium 154.0.8037.57；375 / 390 / 768 / 1440，固定北京时区/时钟，两个独立本地 D1，真实 Cookie、CSRF 和服务器验证。没有 mock 认证、外部站点访问或真实凭据。

基线与候选分别完成 20 个检查点、29 个实际可信点击名字（含原清单全部 26 个必需 action）及 11 类表单成功/失败流程。43 注册表键由结构对照锁定；不声称 43 个名字都由浏览器点击。登录、保存视图、发布新增/编辑、快照、每日数据、账号新增/编辑停用、创建/复制一次性凭据、撤销、密码不一致/修改及真实重登均覆盖。断网注入保留输入，编辑冲突用真实本地 409。键盘、触屏菜单、焦点循环/返回、路由前进后退、CSV、docs 和安全原文链接也通过。

普通数据页首次加载（含认证/账号）保持 5 请求 / 17,121 B / 21 SQL / 0 D1 写；连续两次弹窗复用索引均为 0 GET。它是小合成库回归，不宣称本阶段减少正常首屏请求或生产性能。

请求探针只在合成服务器暴露实际 bundle 的测试入口，不进入产品资源。最终真实浏览器 18/18 候选检查通过；基线 18 项中 5 个预期新行为失败。核实：等价并发 GET 两次调用仅一次传输、不同选项隔离、单消费者取消不误伤、实际点击换页/刷新中止旧 HTTP、新页存活、写跨换页成功且写后不加入旧 pending、真实 404 不当取消、同账号旧 401 不清新会话、当前真实 401 仍退出。[完整回执](frontend-request-lifecycle-data/requests-browser.json)不保存请求体、Cookie、口令或 token。

## 图片与诊断

最终按原 manifest 对照 56 对，51 对严格逐像素相同；5 对不是严格相同：

| 视图 | 宽度 | 变化像素 | 最大通道差 |
|---|---:|---:|---:|
| 新发布表单 | 375 | 64 | 1 |
| 新发布表单 | 390 | 44 | 1 |
| 新发布表单 | 768 | 45 | 1 |
| 每日表单 | 390 | 72 | 1 |
| 凭据表单 | 1440 | 44 | 1 |

执行者实际查看了五组局部原图及放大差异，并查看代表完整图：差异落在控件圆角/边缘及背景控件边缘，未见文字、排版、位置或间距改变。可见 UI 等价与严格 PNG 失败分开报告，不降低阈值、不重拍到随机相同。三组安全原 PNG 与五组比较局部位于 [图片目录](frontend-request-lifecycle-images)，[原始像素与 hash 清单](frontend-request-lifecycle-data/pixel-comparison.json)完整保留。截图断言口令输入为空、无一次性凭据，仅合成内容。

正常流程未记录 pageerror/warning/CSP 违规；已有未登录/错误密码 401、刻意断网和真实 409 另列。候选普通全流程报告保留 19 条上述预期错误/断网诊断，不宣称全流程控制台字面零错误。[最终候选报告](frontend-request-lifecycle-data/candidate-browser.json)。

第一次浏览器 run 在 candidate daily / 768px 的 12 秒读取等待超时，当时保留 95 captures；基线已完成全部操作和表单，候选未完成。服务端请求最终为 200，但无法单凭该信息判定超时根因。保留 [失败原始 manifest](frontend-request-lifecycle-data/first-browser-attempt.json)，没有算通过。只对候选做一次清库、同协议、20 秒有界复跑，最终 56 captures / 20 检查点 / 11 表单完成；旧基线结果未冒充候选。

探针开发时另修了等待延迟响应的驱动死锁，以及刷新场景未先建立总览页头的选择器前提；都是测试驱动问题，失败记录仍留本地证据，不当成产品失败或已通过。最终完成的请求探针与页面协议互不污染合成库。

## 未通过和下一边界

- **体积未通过**：原已验 4a 106,865 B，core 112,496 B，首注册表 114,413 B，完整词段排版后 **115,029 B**，超过 100,000 B **15,029 B**。保持 UTF-8/ESM/不压缩；没有删功能、改阈值或绕分文件限额。
- **严格逐像素未全通过**：51/56，五组如上。没有复用 4a 的旧旧噪声证据来替代本次观察。
- CSP unsafe-inline 去除、后端整理、安全决策及整轮最终验收尚未执行。这里是阶段 4b 草稿交审，不是整轮完成或部署。

## 复现

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check:web
node scripts/frontend-build.mjs --check
npm test
npm run check:artifacts
npm run check:previews
# 新合成库，禁止与其他协议共用运行中的库
node tests/frontend-lifecycle-browser-server.mjs
python3 tests/browser-frontend-lifecycle-regression.py --part all
# 停止并重新启动服务器后，再单独运行
python3 tests/browser-request-lifecycle.py
```

大图片与原失败/中间记录保存在本地 artifacts/frontend-lifecycle 恢复包；本 PR 仅保存合成 JSON 和少量无秘密图片，未推旧私有历史或整个证据包。
