# 阶段7：审计截图的相同输入局部补证

本次只调查原4c审计页的四处差异，没有修改产品、样式、验收阈值或既有基线，也没有部署。产品前端固定于主分支 `6544c716cff413b35defc5c633ee8e541805924c`，与4c `dc598ac1c1b53303500e2313965c3f980d94d0ad` 的 `web/`、app.js、style.css、index.html 全部逐字节相同。

## 结论与范围

- 原始 [56对/47对相同的记录](strict-style-data/pixels.json)及9处差异全部保留，不改写或覆盖。
- 原候选[中断记录](strict-style-data/candidate-partial.json)已完成375宽审计图后失败，再登录继续时，合成库新增第二条登录。旧图显示“登录网站 ×1”，候选为“×2”和时间范围，是可见输入差异，不能称像素噪声。
- 本次启动两套**全新**合成D1；各执行一次真实浏览器登录和Cookie会话认证，逐项断言仅1条`auth.login`、同一固定时间、actor确为当前用户，并比较去除随机记录/用户ID后的完整可见审计输入。没有在登录后删除日志或改截图文字。
- 375/390/768/1440四对新图均严格相同：变化像素0、最大通道差0。正常流程pageerror和CSP事件均0。比较器的相同图正例、单像素单通道差1的反例均通过，不使用容差。
- 这是相同输入下的**独立4对局部结果**，不能与原47对拼成一次“51/56”或“56/56”。其余5处原生控件边缘差异没有重拍，严格全套PNG指标仍未通过。

证据：[完整JSON/请求回执](audit-visual-closure-data/aligned.json)、[失败记录](audit-visual-closure-data/failed-attempts.json)、[八张原图](audit-visual-closure-data/)。各图文件名及SHA256在JSON中；都是仅显示虚构账号和固定测试日期的审计页，不含密码、Cookie、CSRF或一次性凭据。执行者查看了1440宽原图，并由严格比较器逐一检查八张图。

## 可复现方法

[有界工具](../tests/browser-audit-visual.py)复用原[4c服务适配器](../tests/frontend-style-browser-server.mjs)，没有删除“只允许D5差异”的后端冻结守卫。服务用固定4c快照运行，基线送出4b的JS/CSS/CSP，候选送出4c的JS/CSS/CSP，两边后端相同。当前前端与4c的无变化链在工具中执行断言；这不是当前后端的重新验收或生产截图。

在独立目录准备固定快照，使用已有锁文件依赖，然后执行：

```sh
git worktree add --detach /tmp/haoduoyu-audit-snapshot dc598ac1c1b53303500e2313965c3f980d94d0ad
# 在快照中使用已有匹配依赖，执行 npm run build；不复用不明产物。
# 回到当前主分支/本证据分支 checkout：
python tests/browser-audit-visual.py --snapshot-root /tmp/haoduoyu-audit-snapshot \
  --output artifacts/audit-visual-closure/new-run
```

本次执行目录为`/workspace/haoduoyu-audit-closure-snapshot`，Node24.19.0、系统Chromium154.0.8037.57、现有Playwright/Pillow；未安装浏览器或依赖。输出目录必须不存在，8835/8836必须无活跃监听者；关闭后的TIME_WAIT按Node一致的SO_REUSEADDR策略处理。浏览器仅允许两个指定本地origin，各context只允许自身origin，其他请求全部阻断。真实登录/页面API通过本地Worker和合成D1，不mock会话，不访问生产。

固定时钟为2026-10-22T08:00:00.000Z，视口高度900、Asia/Shanghai、reduced-motion。每次导航还要求实际`/audit`响应200、页面非busy、仅一个审计分组、文字“登录网站 ×1”和“我”、无密码输入/新令牌及横向溢出，字体和两次动画帧就绪后全页截图。输出保存工具/适配器/Worker/资源hash与各次请求状态，不保存认证头或请求体。

### 失败没有删除或混成通过

首次驱动把既有文案误写成“登录 ×1”，实际为“登录网站 ×1”，在基线上失败，已修正测试断言；不是产品修复。随后端口预检把TIME_WAIT误认作监听者，确认无监听者后按Node策略修正。

第一轮有效页面执行完成基线4图、候选375图后，在候选390宽等待非busy超时20秒；无pageerror/CSP记录，内存cgroup当时OOM/oom_kill计数均0，**根因未证实**。原报告和5图hash保留于失败证据。只允许了一次有界补测，增加实际audit响应断言与失败请求回执，未放宽20秒等待/像素阈值；最终4对通过不能证明该超时原因已消除。Pillow产生的getdata弃用警告属于本地比较工具，不是站点console事件。

## 能力记录更正及真正剩余项

原发布执行器只探测Playwright默认缓存路径，却写成“缺Chromium”，范围过宽。系统`/usr/bin/chromium`实际存在，本次已成功用于本地合成验收。发布JSON保留原探测文字，并追加能力更正；生产HTTPS CONNECT403仍保留，没有换通道绕过，也没有借本次补证声称生产ETag/CSP/requestID已由执行器核验。

| 剩余项 | 当前性质与最小下一步 |
| --- | --- |
| 115637 B高于100000 B | 已知未通过；两次失败重用实验保留。没有已验证的可维护达标方案，本次不重做实验或放宽指标。 |
| 其余5处严格PNG差异 | 原始边缘差异保留、可见UI已限定签收；本次没有改变渲染，不宣称严格全套通过。 |
| 完整isolate内存峰值 | 平台证据缺失；16MiB是逻辑账，原Inspector采样错误仍在，需受支持的目标运行时指标。 |
| 可信IP来源 | 平台全入口防伪契约未知；TRUST_CF_CONNECTING_IP继续关闭，不凭本地模拟启用。 |
| main必要检查 | 用户已批准，但现有能力缺管理权限；需现有管理员把build-test、secret-scan设为main必要合并检查，不创建或扩权凭据。 |
| 生产响应头独立核验 | 执行器代理403、父端浏览器不暴露头；需获准且支持读取头的正常入口，不绕过限制。 |
| 已披露错误边界 | stream读体后置失败与既有显式500 message反射保持原合同；改变它们需要另立窄范围修复，不能把本次纯证据工作说成已修。 |

本次没有发现需修改产品的确定性缺陷。新证据须独立审查，不能因“尽快收尾”自动合并或再次部署。
