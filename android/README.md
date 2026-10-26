# 好多鱼 Android 自用预览版

本目录是独立 Android 工程，基于网站已存在的手机布局，默认打开 https://haoduoyu.xyz/?page=todos 。生活/工作碎碎念、长期备忘录、图文数据和每日工作提醒均继续由线上网页与原有 API 提供。没有第二套后端、数据迁移、设备远程安装、商店账号或付费 SDK。

## 隔离与当前交付状态

- 网站只读参考基线：16ff80ef2d857676d81b7c219110c820de5af72b。
- 独立工作分支：android/personal-v1；仅新增 android/ 与专用构建检查 workflow，不修改网站文件，不更新 main 或 opt/workbench-ui-round6，不部署。
- 启动任务时 Windows 执行环境转为 unavailable。本机 JDK、SDK、Gradle、ADB 尚无法核验，本地祖先 AGENTS.md 与 .agents/skills 也无法读取；远端基线完整目录没有 AGENTS.md 或 .agents/。没有在公司电脑安装工具。
- 此文档是实现与交接说明，不是已生成、已签名、已安装或已实机验收 APK 的证明。精确提交的 Actions 运行结果才是编译证据。
- 专用 workflow 只在公共仓库的标准 ubuntu-24.04 runner 编译、单测、lint 和校验签名，不上传 Actions artifact、不建 cache、不发布 release、不引用 secrets。这样不引入有可能超额计费的二进制存储。runner 的临时 APK 会随 job 清理，不能据此宣称交付安装包。
- 本机恢复后，应取同一独立分支进行本地编译，校验 APK 与签名，再通过受支持 Library 上传并核对字节。没有 Library ID 之前不算完成安装包交付。

## 编译

兼容工具链为 JDK 17、Gradle 8.9、Android SDK Platform 35 与 Build Tools 35.0.0；不需要 Android Studio、NDK 或 Kotlin。minSdk 26（Android 8.0），target/compileSdk 35。需要手机安装可用且较新的系统 Android WebView；Android 8.0 是安装下限，不是所有旧版 WebView 的功能保证。

本地工具已具备时，在独立 checkout 的 android/ 运行：

~~~text
gradle --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
~~~

项目没有提交不透明 wrapper JAR。使用已安装的 Gradle 8.9；专用 runner 仅在临时目录下载并按官方固定 SHA-256 核验 Gradle 8.9。预览输出为 app/build/outputs/apk/debug/app-debug.apk。release 构建默认未签名，不能直接安装，不得当成正式发布包。

~~~text
apksigner verify --verbose --print-certs app/build/outputs/apk/debug/app-debug.apk
aapt dump badging app/build/outputs/apk/debug/app-debug.apk
~~~

使用系统文件哈希工具计算 SHA-256，交付时记录构建提交、类型、文件大小、APK SHA-256、签名证书 SHA-256 与最低系统版本。不要输出或上传任何 keystore、密码、恢复口令。

## 已实现的原生行为

- 正常冷启动进入每日待办；切回后台中的现有任务保持页面。屏幕旋转不重建 Activity。系统回收后仅尝试恢复可信导航，网页草稿保存能力仍以原网站为准。
- 启用第一方 Cookie 与 DOM storage，不复制桌面浏览器会话；首次登录可能需在 App 内重新完成。不清理网站存储，也不改动网站的 Cookie/CSRF。
- Android 返回先收键盘，再交给已核对的网站 Escape 逻辑关闭弹窗/菜单；待办日历和常用管理使用原网页历史后退，避免关闭操作新增历史造成循环；根页面连续两次返回收起 App。异步返回有导航代次与超时保护。
- API 30+ 处理系统栏、刘海与 IME inset；旧系统使用 adjustResize。保留触控、长按、缩放和网站自己的手机导航，不对网页覆盖全局 CSS。
- 系统文件选择器支持网页上传，拒绝任意 file: URI；只接受本次同源文档发起且已在后台检查可读的 content: 返回。无存储、相机、麦克风或定位权限。
- 只有精确 HTTPS haoduoyu.xyz（默认端口或 443，无 userinfo）可作为 App 主页面。用户点击的普通 http/https 外链交给浏览器；tel 只拨号界面，mailto 只邮件撰写入口；不解析 intent:，不加 JavaScriptInterface。
- 主文档网络/HTTP 失败、TLS 验证失败、渲染进程退出、加载过慢和首页脚本启动失败均有原生说明与手动恢复入口。只手动 GET 重新加载，不自动重放业务写入。TLS 错误直接取消，明文与混合内容禁用。

导航规则不等于网络防火墙；例如 WebView 的导航回调不覆盖所有 POST 或子资源。网页本身仍由网站的安全策略约束。

## 已知边界与待验收

- App 不改变网络线路，不能承诺解决域名、运营商、公司网络或服务端故障；没有新增离线同步、后台写入队列、推送或系统定时通知。每日工作提醒复用网站页面。
- 普通文件下载交给外部浏览器，可能需单独登录；blob: 导出下载暂不支持 App 内保存。需要导出时使用“更多 → 在浏览器打开”。
- Android 回收页面、重新加载、卸载或清除数据都可能丢失尚未同步的输入；以网页保存提示为准。
- debug 包有独立 applicationId xyz.haoduoyu.personal.debug，并显示“调试”。临时 runner 每次生成不同的 debug key，不能可靠覆盖升级；不可建议通过卸载强行覆盖而忽略未同步草稿。长期自用交付需要稳定私有签名密钥及安全备份，密钥不得进入源码或聊天。
- 单元测试覆盖域名混淆、端口、userinfo、危险 URI、允许的浏览器/邮件/拨号规则；编译/lint 不等于真实 Android 使用验收。
- 还需实体手机验证：默认入口、五类模块读取/保存、中文拼音输入与键盘遮挡、返回和弹窗、旋转/进后台草稿、文件选择取消与上传、外链、新窗口、断网恢复、登录保持及系统回收。使用测试数据；不自动对生产记录写入。
- 当前 web 工具无法访问生产网址，不能据此判断手机网络可用或线上页面验收通过。

## 安装步骤（仅在实际收到经校验的 APK 后执行）

1. 核对交付文件名、构建类型和 SHA-256；先确认是调试预览还是稳定私有签名版。
2. 将 APK 下载到自己的 Android 8.0+ 手机后，由本人点击文件安装；本任务不会远程连接或安装手机。
3. 若手机阻止安装，由本人按设备提示决定是否给予当前文件来源安装权限；公司管控或设备策略阻止时停止，不绕过、不关闭安全扫描。
4. 打开好多鱼，核对默认每日待办，按需在 App 内登录。浏览器与 App 登录态相互独立。
5. 在真实保存确认后再退出或更新；不要为绕过签名不一致直接卸载 App。

## 官方依据

- WebView 与加载/错误处理：https://developer.android.com/develop/ui/views/layout/webapps/webview
- 安全 URI 加载：https://developer.android.com/privacy-and-security/risks/unsafe-uri-loading
- 文件选择：https://developer.android.com/reference/android/webkit/WebChromeClient#onShowFileChooser(android.webkit.WebView,%20android.webkit.ValueCallback%3Candroid.net.Uri[]%3E,%20android.webkit.WebChromeClient.FileChooserParams)
- API 35 系统栏：https://developer.android.com/develop/ui/views/layout/edge-to-edge
- AGP 8.7/JDK17/Gradle8.9 兼容：https://developer.android.com/build/releases/agp-8-7-0-release-notes
- Gradle 官方校验值：https://gradle.org/release-checksums/
- 公共标准 runner 免费与 artifact/cache 计费边界：https://docs.github.com/en/billing/concepts/product-billing/github-actions
