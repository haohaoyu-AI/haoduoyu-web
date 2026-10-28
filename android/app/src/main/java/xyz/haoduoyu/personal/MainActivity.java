package xyz.haoduoyu.personal;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Rect;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.ServiceWorkerController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.ArrayList;
import java.util.List;
import xyz.haoduoyu.personal.offline.LegacyRecoveryRuntime;
import xyz.haoduoyu.personal.offline.LegacyMigrationCoordinator;

public final class MainActivity extends Activity {
    private int nextFileRequest = 1000;
    private int activeFileRequest;
    private static final int PAPER = Color.rgb(247, 239, 231);
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<WebView> popups = new ArrayList<>();
    private final ExecutorService fileChecks = Executors.newSingleThreadExecutor();
    private String backScript;
    private WebView web;
    private FrameLayout webFrame;
    private LinearLayout errorPanel;
    private TextView errorText;
    private Button continueButton;
    private ProgressBar progress;
    private ValueCallback<Uri[]> fileCallback;
    private String fileDocumentUrl;
    private int documentGeneration;
    private int fileGeneration;
    private int loadGeneration;
    private int backGeneration;
    private boolean failed;
    private boolean backPending;
    private long lastBack;
    private String retryUrl = UrlPolicy.HOME;
    private android.window.OnBackInvokedCallback backCallback;
    private LegacyRecoveryRuntime legacy;
    private final Runnable legacyListener = this::refreshLegacy;
    private ConnectivityManager connectivity;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean foreground, observedNetwork;

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        if (savedState != null && savedState.containsKey("legacyRecoveryPending"))
            getIntent().putExtra("legacyRecoveryPending", savedState.getBoolean("legacyRecoveryPending"));
        buildLayout();
        backScript = readBackScript();
        createWebView();
        legacy = LegacyRecoveryRuntime.get(this);
        refreshLegacy();
        registerNativeNetwork();
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        // Configuration changes keep this activity alive. Process recreation restores navigation only;
        // the website remains responsible for any saved draft, never an offline write queue.
        Bundle browserState = savedState == null ? null : savedState.getBundle("browser");
        String savedUrl = savedState == null ? null : savedState.getString("trustedUrl");
        if (browserState == null || !UrlPolicy.isTrustedWebsite(savedUrl) || web.restoreState(browserState) == null) {
            web.loadUrl(UrlPolicy.HOME);
        }
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private void buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(PAPER);
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return WindowInsets.CONSUMED;
            });
            root.requestApplyInsets();
        } else {
            root.setFitsSystemWindows(true);
        }
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(16), 0, dp(6), 0);
        TextView title = new TextView(this);
        title.setText(BuildConfig.DEBUG ? "好多鱼 · 调试自用版" : "好多鱼");
        title.setTextSize(16);
        title.setGravity(Gravity.CENTER_VERTICAL);
        title.setTextColor(Color.rgb(76, 48, 34));
        toolbar.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1));
        Button more = new Button(this);
        more.setText("更多");
        more.setContentDescription("好多鱼应用菜单");
        toolbar.addView(more, new LinearLayout.LayoutParams(dp(76), dp(48)));
        more.setOnClickListener(v -> showMenu(more));
        root.addView(toolbar);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));
        webFrame = new FrameLayout(this);
        root.addView(webFrame, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(24), dp(24), dp(24), dp(24));
        errorPanel.setBackgroundColor(PAPER);
        errorPanel.setClickable(true);
        errorText = new TextView(this);
        errorText.setTextSize(17);
        errorText.setTextColor(Color.rgb(76, 48, 34));
        errorText.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        errorPanel.addView(errorText);
        Button retry = new Button(this);
        retry.setText("重新加载");
        retry.setOnClickListener(v -> confirmReload(retryUrl));
        errorPanel.addView(retry, new LinearLayout.LayoutParams(-1, dp(52)));
        Button wait = new Button(this);
        continueButton = wait;
        wait.setText("返回页面 / 继续等待");
        wait.setOnClickListener(v -> errorPanel.setVisibility(View.GONE));
        errorPanel.addView(wait, new LinearLayout.LayoutParams(-1, dp(52)));
        Button browser = new Button(this);
        browser.setText("在浏览器打开");
        browser.setOnClickListener(v -> openExternal(retryUrl));
        errorPanel.addView(browser, new LinearLayout.LayoutParams(-1, dp(52)));
        errorPanel.setVisibility(View.GONE);
        webFrame.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createWebView() {
        web = new WebView(this);
        web.setBackgroundColor(PAPER);
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        webFrame.addView(web, 0, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true); // Required by the existing first-party ES module application.
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Read only files explicitly selected through the system picker.
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        // IndexedDB/Service Workers use the same persistent first-party WebView profile, not a second native store.
        ServiceWorkerController.getInstance().getServiceWorkerWebSettings().setCacheMode(WebSettings.LOAD_DEFAULT);
        ServiceWorkerController.getInstance().getServiceWorkerWebSettings().setAllowFileAccess(false);
        ServiceWorkerController.getInstance().getServiceWorkerWebSettings().setAllowContentAccess(false);
        ServiceWorkerController.getInstance().getServiceWorkerWebSettings().setBlockNetworkLoads(false);
        WebView.setWebContentsDebuggingEnabled(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new BrowserClient());
        web.setWebChromeClient(new ChromeClient());
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> {
            if (UrlPolicy.externalScheme(url).isEmpty()) {
                showMessage("此类网页下载暂不支持，请从应用菜单选择“在浏览器打开”。");
                return;
            }
            new AlertDialog.Builder(this).setTitle("在浏览器下载")
                    .setMessage("下载将交给浏览器处理，浏览器可能需要重新登录。")
                    .setPositiveButton("打开", (dialog, which) -> openExternal(url))
                    .setNegativeButton("取消", null).show();
        });
    }

    private void showMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(0, 1, 0, "每日待办");
        menu.getMenu().add(0, 2, 1, "重新加载当前页面");
        menu.getMenu().add(0, 3, 2, "在浏览器打开");
        menu.getMenu().add(0, 4, 3, "关于自用版");
        menu.getMenu().add(0, 5, 4, "设置");
        menu.setOnMenuItemClickListener(item -> {
            if (item.getItemId() == 1) confirmReload(UrlPolicy.HOME);
            if (item.getItemId() == 2) confirmReload(currentUrl());
            if (item.getItemId() == 3) openExternal(currentUrl());
            if (item.getItemId() == 4) new AlertDialog.Builder(this).setTitle("好多鱼自用版")
                    .setMessage("版本 " + BuildConfig.VERSION_NAME
                            + "\n共用 haoduoyu.xyz 同一前端；离线范围与网站当前实际版本一致。没有独立原生业务页面或新同步队列。"
                            + "\n旧库保留；未获原有上传同意的本机记录仅本地查看、复制或导出。下载文件交系统浏览器。"
                            + (BuildConfig.DEBUG ? "\n这是调试签名预览包，不是正式发布包。" : ""))
                    .setPositiveButton("知道了", null).show();
            if (item.getItemId() == 5) showAppSettings();
            return true;
        });
        menu.show();
    }

    private void showAppSettings() {
        boolean pending = getIntent().getBooleanExtra("legacyRecoveryPending", false);
        String[] choices = pending
                ? new String[]{"旧版本机记录（查看 / 导出）", "返回未保全恢复页"}
                : new String[]{"旧版本机记录（查看 / 导出）"};
        new AlertDialog.Builder(this).setTitle("设置").setItems(choices, (dialog, index) -> {
            if (index == 0) startActivity(new Intent(this, LegacyRecoveryActivity.class));
            else if (pending && index == 1) returnToRecovery();
        }).setNegativeButton("关闭", null).show();
    }

    private String currentUrl() {
        String url = web == null ? null : web.getUrl();
        return UrlPolicy.isTrustedWebsite(url) ? url : retryUrl;
    }

    private void registerNativeNetwork() {
        connectivity = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (connectivity == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override public void onAvailable(Network network) {
                handler.post(() -> {
                    observedNetwork = true;
                    if (foreground) { emitNative(NativeBridgeScripts.online()); if (legacy != null) legacy.request(); }
                });
            }
        };
        try { connectivity.registerDefaultNetworkCallback(networkCallback); }
        catch (SecurityException unavailable) { networkCallback = null; }
    }
    private void emitNative(String script) {
        if (web != null && !isDestroyed() && NativeBridgeScripts.allowedDocument(web.getUrl())) web.evaluateJavascript(script, null);
    }
    private void refreshLegacy() {
        if (legacy == null || isDestroyed()) return;
        LegacyMigrationCoordinator.Result state = legacy.result();
        if (state == null) return;
        emitNative(NativeBridgeScripts.legacy(state.pending, state.conflicts, state.needsConsent));
    }
    private void returnToRecovery() {
        getIntent().removeExtra("legacyRecoveryPending");
        startActivity(new Intent(this, OfflineActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT));
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent); refreshLegacy();
    }

    private void confirmReload(String target) {
        final String safeTarget = UrlPolicy.isTrustedWebsite(target) ? target : UrlPolicy.HOME;
        new AlertDialog.Builder(this).setTitle("重新打开页面")
                .setMessage("页面中尚未保存的输入可能丢失。确认继续？")
                .setPositiveButton("继续", (dialog, which) -> {
                    if (web == null) createWebView();
                    web.loadUrl(safeTarget); // A deliberate GET, never replay a failed POST or an API write.
                }).setNegativeButton("取消", null).show();
    }

    private boolean route(String url, boolean userGesture) {
        if (UrlPolicy.isTrustedWebsite(url)) return false;
        if (userGesture && !UrlPolicy.externalScheme(url).isEmpty()) openExternal(url);
        else showMessage("此链接未在应用内打开，可从菜单使用浏览器。");
        return true;
    }

    private void openExternal(String url) {
        String scheme = UrlPolicy.externalScheme(url);
        if (scheme.isEmpty()) { showMessage("不支持此链接。"); return; }
        String action = "tel".equals(scheme) ? Intent.ACTION_DIAL
                : "mailto".equals(scheme) ? Intent.ACTION_SENDTO : Intent.ACTION_VIEW;
        Intent intent = new Intent(action, Uri.parse(url));
        if (Intent.ACTION_VIEW.equals(action)) intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try { startActivity(intent); }
        catch (ActivityNotFoundException | SecurityException error) { showMessage("没有可打开此链接的应用。"); }
    }

    private void showMessage(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }

    private void showError(String message) {
        if (isFinishing() || isDestroyed()) return;
        errorText.setText(message + "\n\n可检查网络后手动重试；本应用需要联网。");
        continueButton.setVisibility(web == null ? View.GONE : View.VISIBLE);
        errorPanel.setVisibility(View.VISIBLE);
        progress.setVisibility(View.GONE);
    }

    private final class BrowserClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Subframes never dispatch native apps. Top-level first-party HTTPS stays in WebView.
            if (!request.isForMainFrame()) return !UrlPolicy.isTrustedWebsite(request.getUrl().toString());
            return route(request.getUrl().toString(), request.hasGesture());
        }

        @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
            if (!UrlPolicy.isTrustedWebsite(url)) {
                view.stopLoading();
                failed = true;
                showError("页面跳转被阻止。");
                return;
            }
            cancelFileChooser();
            documentGeneration++;
            backGeneration++;
            backPending = false;
            lastBack = 0;
            retryUrl = url;
            failed = false;
            errorPanel.setVisibility(View.GONE);
            progress.setVisibility(View.VISIBLE);
            final int ticket = ++loadGeneration;
            handler.postDelayed(() -> {
                if (web == view && ticket == loadGeneration && !failed) {
                    showError("页面加载较慢，可继续等待或手动重新加载。");
                }
            }, 30000);
        }

        @Override public void onPageFinished(WebView view, String url) {
            if (web != view || !UrlPolicy.isTrustedWebsite(url)) return;
            CookieManager.getInstance().flush();
            if (failed) return; // WebView can call onPageFinished even after a network/TLS failure.
            final int ticket = ++loadGeneration;
            progress.setVisibility(View.GONE);
            errorPanel.setVisibility(View.GONE);
            refreshLegacy();
            if (observedNetwork && foreground) emitNative(NativeBridgeScripts.online());
            handler.postDelayed(() -> {
                if (web != view || ticket != loadGeneration || failed) return;
                view.evaluateJavascript("Boolean(document.querySelector('#app .initial-loading'))", result -> {
                    if (web == view && ticket == loadGeneration && "true".equals(result)) {
                        showError("网页内容尚未打开，可能是脚本或网络加载失败。");
                    }
                });
            }, 12000);
        }

        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            failed = true;
            ++loadGeneration;
            showError("网络连接失败，页面没有完成加载。");
        }

        @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (!request.isForMainFrame()) return;
            failed = true;
            ++loadGeneration;
            showError("网站暂时无法打开（HTTP " + response.getStatusCode() + "）。");
        }

        @Override public void onReceivedSslError(WebView view, SslErrorHandler ssl, SslError error) {
            ssl.cancel(); // Never bypass certificate errors or modify device trust settings.
            failed = true;
            ++loadGeneration;
            showError("安全连接验证失败，请检查网络、设备日期或在浏览器确认网站状态。");
        }

        @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            cancelFileChooser();
            ++loadGeneration;
            ++backGeneration;
            backPending = false;
            webFrame.removeView(view);
            view.destroy();
            if (web == view) web = null;
            failed = true;
            showError("网页进程已结束。可手动重新打开页面；未保存内容可能未同步。");
            return true;
        }
    }

    private final class ChromeClient extends WebChromeClient {
        @Override public void onProgressChanged(WebView view, int value) {
            if (web == view && !failed) progress.setProgress(value);
        }

        @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
        @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            callback.invoke(origin, false, false);
        }

        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            cancelFileChooser();
            if (web != view || !UrlPolicy.isTrustedWebsite(view.getUrl())) {
                callback.onReceiveValue(null);
                return true;
            }
            fileCallback = callback;
            fileDocumentUrl = view.getUrl();
            fileGeneration = documentGeneration;
            activeFileRequest = nextFileRequest++;
            if (nextFileRequest > 65000) nextFileRequest = 1000;
            Intent picker = params.createIntent();
            picker.addCategory(Intent.CATEGORY_OPENABLE);
            picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try { startActivityForResult(picker, activeFileRequest); }
            catch (ActivityNotFoundException | SecurityException error) {
                cancelFileChooser();
                showMessage("无法打开系统文件选择器。");
            }
            return true;
        }

        @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message message) {
            if (!isUserGesture || !UrlPolicy.isTrustedWebsite(view.getUrl())) return false;
            WebView popup = new WebView(MainActivity.this);
            popup.getSettings().setAllowFileAccess(false);
            popup.getSettings().setAllowContentAccess(false);
            popups.add(popup);
            final long expires = SystemClock.elapsedRealtime() + 4000;
            final boolean[] consumed = {false};
            Runnable cleanup = () -> destroyPopup(popup);
            handler.postDelayed(cleanup, 4000);
            popup.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest request) {
                    if (!request.isForMainFrame()) return true;
                    if (consumed[0] || SystemClock.elapsedRealtime() >= expires) {
                        handler.post(cleanup);
                        return true;
                    }
                    String url = request.getUrl().toString();
                    if ("about:blank".equals(url)) return false;
                    consumed[0] = true;
                    if (UrlPolicy.isTrustedWebsite(url)) {
                        if (web != null) web.loadUrl(url);
                    } else {
                        // Only the first main-frame target of this short-lived, user-created transport.
                        openExternal(url);
                    }
                    handler.post(cleanup);
                    return true;
                }
                @Override public void onPageStarted(WebView child, String url, android.graphics.Bitmap icon) {
                    if (!"about:blank".equals(url)) {
                        // POST and other navigations can bypass shouldOverrideUrlLoading. Never forward them.
                        consumed[0] = true;
                        child.stopLoading();
                        handler.post(cleanup);
                    }
                }
                @Override public boolean onRenderProcessGone(WebView child, RenderProcessGoneDetail detail) {
                    destroyPopup(child);
                    return true;
                }
            });
            popup.setWebChromeClient(new WebChromeClient() {
                @Override public void onCloseWindow(WebView child) { handler.post(cleanup); }
            });
            ((WebView.WebViewTransport) message.obj).setWebView(popup);
            message.sendToTarget();
            return true;
        }
    }

    private void destroyPopup(WebView popup) {
        if (popups.remove(popup)) popup.destroy();
    }

    private void cancelFileChooser() {
        ValueCallback<Uri[]> pending = fileCallback;
        fileCallback = null;
        fileDocumentUrl = null;
        if (pending != null) pending.onReceiveValue(null);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != activeFileRequest || fileCallback == null) return;
        if (result != RESULT_OK) { cancelFileChooser(); return; }
        final ValueCallback<Uri[]> pending = fileCallback;
        final String originUrl = fileDocumentUrl;
        final int originGeneration = fileGeneration;
        final Uri[] candidates = WebChromeClient.FileChooserParams.parseResult(result, data);
        if (candidates == null || candidates.length == 0 || candidates.length > 16) {
            cancelFileChooser();
            return;
        }
        // A document provider can be slow. Validate only explicitly selected read-only URIs off the UI thread.
        fileChecks.execute(() -> {
            boolean readable = true;
            for (Uri uri : candidates) {
                if (uri == null || !"content".equals(uri.getScheme())) { readable = false; break; }
                try (android.content.res.AssetFileDescriptor fd = getContentResolver().openAssetFileDescriptor(uri, "r")) {
                    if (fd == null) { readable = false; break; }
                } catch (IOException | RuntimeException error) { readable = false; break; }
            }
            final boolean valid = readable;
            handler.post(() -> {
                if (fileCallback != pending) return; // Navigation/cancel/destroy already completed this callback.
                boolean sameDocument = web != null && originGeneration == documentGeneration
                        && UrlPolicy.isTrustedWebsite(web.getUrl())
                        && originUrl != null && originUrl.equals(web.getUrl());
                fileCallback = null;
                fileDocumentUrl = null;
                pending.onReceiveValue(valid && sameDocument ? candidates : null);
                if (!valid && !isDestroyed()) showMessage("无法读取所选文件，请重新选择。");
            });
        });
    }

    private String readBackScript() {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                getAssets().open("android-back.js"), StandardCharsets.UTF_8))) {
            StringBuilder script = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) script.append(line).append('\n');
            return script.toString();
        } catch (IOException error) {
            return "(function(){return false;})()";
        }
    }

    private boolean hideKeyboard() {
        View focus = getCurrentFocus();
        if (focus == null) return false;
        boolean visible;
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsets insets = focus.getRootWindowInsets();
            visible = insets != null && insets.isVisible(WindowInsets.Type.ime());
        } else {
            Rect rect = new Rect();
            focus.getWindowVisibleDisplayFrame(rect);
            visible = focus.getRootView().getHeight() - rect.bottom > dp(150);
        }
        if (!visible) return false;
        InputMethodManager input = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (input != null) input.hideSoftInputFromWindow(focus.getWindowToken(), 0);
        return true;
    }

    private void handleBack() {
        if (hideKeyboard()) { lastBack = 0; return; }
        if (backPending) return;
        if (errorPanel.getVisibility() == View.VISIBLE && web != null) {
            errorPanel.setVisibility(View.GONE);
            lastBack = 0;
            return;
        }
        if (web == null || !UrlPolicy.isTrustedWebsite(web.getUrl())) { backOrMinimize(); return; }
        final WebView current = web;
        backPending = true;
        final int ticket = ++backGeneration;
        // Reuse the website's own Escape handler instead of mutating its DOM or bypassing draft guards.
        current.evaluateJavascript(backScript, result -> {
            if (ticket != backGeneration || web != current) return;
            backPending = false;
            if ("true".equals(result)) lastBack = 0;
            else backOrMinimize();
        });
        handler.postDelayed(() -> {
            if (ticket == backGeneration) { ++backGeneration; backPending = false; }
        }, 1000);
    }

    private void backOrMinimize() {
        if (web != null && web.canGoBack()) { lastBack = 0; web.goBack(); return; }
        long now = SystemClock.elapsedRealtime();
        if (now - lastBack < 2200) { moveTaskToBack(true); lastBack = 0; }
        else { lastBack = now; showMessage("再次返回收起好多鱼"); }
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { handleBack(); }

    @Override protected void onSaveInstanceState(Bundle state) {
        state.putBoolean("legacyRecoveryPending", getIntent().getBooleanExtra("legacyRecoveryPending", false));
        if (web != null && UrlPolicy.isTrustedWebsite(web.getUrl())) {
            Bundle browserState = new Bundle();
            web.saveState(browserState);
            state.putBundle("browser", browserState);
            state.putString("trustedUrl", web.getUrl());
        }
        super.onSaveInstanceState(state);
    }

    @Override protected void onPause() {
        foreground = false;
        if (legacy != null) legacy.unlisten(legacyListener);
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        foreground = true;
        if (web != null) web.onResume();
        if (legacy != null) { legacy.listen(legacyListener); legacy.request(); refreshLegacy(); }
        if (observedNetwork) emitNative(NativeBridgeScripts.online());
    }

    @Override protected void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (legacy != null) legacy.unlisten(legacyListener);
        if (connectivity != null && networkCallback != null) {
            try { connectivity.unregisterNetworkCallback(networkCallback); }
            catch (IllegalArgumentException unavailable) { /* Registration already ended; no extra bridge owner. */ }
        }
        cancelFileChooser();
        fileChecks.shutdownNow();
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        for (WebView popup : popups) popup.destroy();
        popups.clear();
        if (web != null) {
            webFrame.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
