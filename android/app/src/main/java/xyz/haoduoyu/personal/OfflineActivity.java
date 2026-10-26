package xyz.haoduoyu.personal;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import xyz.haoduoyu.personal.offline.LegacyRecoveryRuntime;
import xyz.haoduoyu.personal.offline.LegacyRestoredDraft;

/** Old task/component compatibility; never starts the editable native workspace. */
public final class OfflineActivity extends Activity {
    private static final int EXPORT = 81;
    private LegacyRecoveryRuntime recovery;
    private LegacyRestoredDraft retained;
    private TextView status;
    private Button retry;
    private String tab, date, draft, exportText;
    private final String attemptedAt = Instant.now().toString();
    private boolean hasDraft, durable, busy, openedWeb;
    private android.window.OnBackInvokedCallback backCallback;

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        hasDraft = saved != null && saved.containsKey("draft");
        if (!hasDraft) { openWeb(); finish(); return; }
        tab = saved.getString("tab"); date = saved.getString("date"); draft = saved.getString("draft");
        try { retained = LegacyRestoredDraft.capture(tab, date, draft); }
        catch (Exception unavailable) { /* Original Bundle strings remain available below if encoding fails. */ }
        buildRecoveryView();
        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::keepRecoveryVisible;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        recovery = LegacyRecoveryRuntime.get(this);
        preserve();
    }
    private void buildRecoveryView() {
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(16, 16, 16, 16); root.setFitsSystemWindows(true); setContentView(root);
        TextView heading = new TextView(this); heading.setText("恢复的启动草稿 · 只读"); heading.setTextSize(20); root.addView(heading);
        status = new TextView(this); status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        status.setText("正在私密保全恢复内容；旧数据库未更改，内容不会发送到网页或上传。"); root.addView(status);
        ScrollView scroll = new ScrollView(this); TextView content = new TextView(this); content.setTextIsSelectable(true);
        content.setText(LegacyViewerPolicy.preview(recoveryText())); scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        button(root, "复制恢复内容", () -> {
            String text = recoveryText();
            if (!LegacyViewerPolicy.clipboardAllowed(text)) { status.setText("恢复内容较大，请使用完整文件导出；当前文本仍保留。"); return; }
            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
            if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("恢复的启动草稿", text));
        });
        button(root, "导出完整恢复内容", this::export);
        retry = button(root, "重试私密保全", this::preserve);
        button(root, "进入网页，保留此恢复页", this::openWeb);
    }
    private Button button(LinearLayout root, String label, Runnable action) {
        Button button = new Button(this); button.setText(label);
        button.setMinHeight(Math.round(44 * getResources().getDisplayMetrics().density));
        button.setOnClickListener(view -> action.run()); root.addView(button); return button;
    }
    private String recoveryText() {
        try {
            if (retained != null) return retained.textExport();
            return escapeUnpaired(new JSONObject().put("format", "haoduoyu-legacy-restored-draft")
                    .put("recovered_at", attemptedAt).put("draft_present", true)
                    .put("tab", tab == null ? JSONObject.NULL : tab).put("date", date == null ? JSONObject.NULL : date)
                    .put("draft", draft == null ? JSONObject.NULL : draft).toString(2));
        } catch (Exception unavailable) {
            return escapeUnpaired("恢复时间：" + attemptedAt + "\ntab: " + (tab == null ? "null" : JSONObject.quote(tab))
                    + "\ndate: " + (date == null ? "null" : JSONObject.quote(date))
                    + "\ndraft: " + (draft == null ? "null" : JSONObject.quote(draft)));
        }
    }
    private static String escapeUnpaired(String value) {
        StringBuilder text = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char unit = value.charAt(i);
            if (Character.isHighSurrogate(unit) && i + 1 < value.length() && Character.isLowSurrogate(value.charAt(i + 1))) {
                text.append(unit).append(value.charAt(++i));
            } else if (Character.isSurrogate(unit)) text.append(String.format(java.util.Locale.ROOT, "\\u%04x", (int) unit));
            else text.append(unit);
        }
        return text.toString();
    }
    private void preserve() {
        if (busy || durable || recovery == null) return;
        busy = true; retry.setEnabled(false); status.setText("正在私密保全恢复内容…");
        recovery.submit(() -> recovery.retainRestoredDraft(retained == null ? LegacyRestoredDraft.capture(tab, date, draft) : retained),
                (value, failure) -> {
                    if (isDestroyed() || isFinishing()) return;
                    busy = false; retry.setEnabled(true);
                    if (failure != null) {
                        status.setText("私密保全尚未成功；请保留此页，可复制、完整导出或重试。" + failure.getMessage()); return;
                    }
                    retained = value; durable = true;
                    openWeb();
                    finish();
                });
    }
    private void openWeb() {
        Intent target = new Intent(this, MainActivity.class);
        if (durable || !hasDraft) target.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (hasDraft && !durable) target.putExtra("legacyRecoveryPending", true);
        else if (openedWeb) target.putExtra("legacyRecoveryPending", false);
        // A failed save stays below a new web Activity; CLEAR_TOP would remove this recovery page.
        startActivity(target); openedWeb = true;
    }
    private void export() {
        exportText = recoveryText();
        Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType("text/plain").putExtra(Intent.EXTRA_TITLE, "haoduoyu-restored-draft.txt");
        try { startActivityForResult(picker, EXPORT); }
        catch (android.content.ActivityNotFoundException | SecurityException unavailable) { status.setText("无法打开系统保存位置；恢复内容仍在此页。"); }
    }
    @Override protected void onActivityResult(int request, int result, Intent intent) {
        super.onActivityResult(request, result, intent);
        Uri destination = intent == null ? null : intent.getData();
        if (request != EXPORT || result != RESULT_OK || destination == null) return;
        if (!"content".equals(destination.getScheme()) || exportText == null) { status.setText("未确认系统所选保存位置；恢复内容仍保留。"); return; }
        String selected = exportText; exportText = null;
        recovery.submit(() -> {
            try (OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
                if (output == null) throw new IOException("无法写入所选位置"); output.write(selected.getBytes(StandardCharsets.UTF_8));
            }
            return true;
        }, (saved, failure) -> {
            if (!isDestroyed()) status.setText(failure == null ? "已写入所选位置；此恢复页与旧库仍保留。" : "导出未完成；恢复内容仍在此页。" + failure.getMessage());
        });
    }
    private void keepRecoveryVisible() { Toast.makeText(this, "恢复草稿尚未确认私密保全；可复制、导出，或进入网页后返回此页。", Toast.LENGTH_LONG).show(); }
    @Override public void onBackPressed() {
        if (hasDraft && !durable) keepRecoveryVisible(); else super.onBackPressed();
    }
    @Override protected void onSaveInstanceState(Bundle out) {
        if (hasDraft) { out.putString("tab", tab); out.putString("date", date); out.putString("draft", draft); }
        super.onSaveInstanceState(out);
    }
    @Override protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        super.onDestroy();
    }
}
