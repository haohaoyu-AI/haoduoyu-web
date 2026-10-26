# App 3.0 网页桥接协议 v1

状态：2026-10-26 草案与实施契约；只约定网页与原生薄壳边界，不表示离线模块或 APK 已上线。

## 共同前端

App 加载 `https://haoduoyu.xyz/?page=todos`，使用同一 `web/` 构建、手机断点和 IndexedDB。不得按 User-Agent 或 App 标记分叉业务、样式、权限。安全区使用浏览器标准 `env(safe-area-inset-*)`；当前公开业务编辑和后台保护保持原样。

## 网络恢复通知

原生仅在当前顶层文档 origin 严格为 `https://haoduoyu.xyz` 时执行固定脚本：

```js
window.dispatchEvent(new CustomEvent('haoduoyu:native-online', {
  detail: {protocol: 1, reason: 'network-restored'}
}));
```

网页与标准 `online`、`visibilitychange` 共用幂等唤醒函数。此事件只是请求核对和重试，不认定网络可用、不切换身份、不赋予编辑权限。离线未接入时事件可安全忽略。禁止通过桥接注入请求体、cookie、token、CSRF、任意 URL、任意 JS 或数据库写入指令。

## 旧版未同步记录

旧库与旧同步引擎由 Android 负责。仅沿用每条记录既有上传同意与身份范围；未授权内容不自动发到公开工作台。旧库保留，不因网页加载成功而改名或删除。

若有未同步内容，原生可向受信 origin 派发只含计数的固定事件：

```js
window.dispatchEvent(new CustomEvent('haoduoyu:legacy-status', {
  detail: {protocol: 1, pending: 3, conflicts: 1, needsConsent: true}
}));
```

计数必须是 0–100000 的整数。网页仅显示温和提示；查看或导出由原生已有安全入口处理。正文不经此事件传递，不提供“点击即公开上传”的通用桥。若当前壳不能安全提供查看入口，则保留原生通知与导出能力，并在报告标未集成，不制造无效链接。

## 返回、文件和链接

- 返回复用 `android-back.js`：先关弹窗/菜单，再路由返回，首页再次返回收起。网页历史仍为标准 history API。
- 文件选择使用系统 WebView chooser；下载与外部链接交系统浏览器。只允许 `haoduoyu.xyz` 顶层页面留在壳内。
- 不新增可被任意 frame 调用的 `addJavascriptInterface` 通用执行器。不得把签名密钥、凭据或本地私密库暴露给网页。
- 协议未知版本忽略。事件重复、启动早于网页监听或无网络都不得导致数据删除或重复发送。
