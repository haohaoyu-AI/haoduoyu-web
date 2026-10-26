package xyz.haoduoyu.personal;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import xyz.haoduoyu.personal.offline.LegacyArchive;
import xyz.haoduoyu.personal.offline.LegacyRecoveryRuntime;

/** Local recovery is deliberately separate from the shared web application and has no editing/upload action. */
public final class LegacyRecoveryActivity extends Activity {
    private static final int OPEN = 10, JSON = 11, TEXT = 12, ORIGINAL = 13, RECORD = 14;
    private LegacyRecoveryRuntime runtime;
    private TextView status;
    private LinearLayout listing;
    private Snapshot snapshot;
    private String recordExport = "";
    private int pendingExport;
    private String exportArchiveId;
    private int shown;
    private static final class Entry {
        final String section, key; final int index;
        Entry(String section, String key, int index) { this.section = section; this.key = key; this.index = index; }
    }
    private static final class Snapshot {
        final byte[] encoded; final LegacyArchive archive; final List<Entry> entries = new ArrayList<>();
        Snapshot(byte[] bytes) throws Exception {
            encoded = bytes; archive = LegacyArchive.decode(bytes); JSONObject state = archive.state();
            for (String section : new String[]{"entities", "drafts"}) {
                JSONObject values = state.optJSONObject(section);
                if (values != null) {
                    List<String> keys = new ArrayList<>(); values.keys().forEachRemaining(keys::add); java.util.Collections.sort(keys);
                    for (String key : keys) entries.add(new Entry(section, key, -1));
                }
            }
            for (String section : new String[]{"operations", "conflicts"}) {
                JSONArray values = state.optJSONArray(section);
                if (values != null) for (int i = 0; i < values.length(); i++) entries.add(new Entry(section, "", i));
            }
            entries.add(new Entry("raw", "", -1));
        }
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); runtime = LegacyRecoveryRuntime.get(this);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(16, 16, 16, 16);
        root.setFitsSystemWindows(true); setContentView(root);
        TextView title = new TextView(this); title.setText("旧版本机记录 · 只读"); title.setTextSize(20); root.addView(title);
        TextView notice = new TextView(this); notice.setText("未获同意的记录不会自动上传。查看或打开备份不授予同步权限，也不导入网页队列。"); root.addView(notice);
        LinearLayout actions = row(root); button(actions, "返回网页", this::finish); button(actions, "打开备份（只读）", this::openBackup);
        LinearLayout exports = row(root); button(exports, "导出完整 JSON", () -> export(JSON)); button(exports, "导出完整文本", () -> export(TEXT));
        LinearLayout raw = row(root); button(raw, "导出原始库文件", () -> export(ORIGINAL));
        status = new TextView(this); status.setText("正在读取本机保留状态…"); status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE); root.addView(status);
        ScrollView scroll = new ScrollView(this); listing = new LinearLayout(this); listing.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(listing); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        runtime.submit(() -> new Snapshot(runtime.currentArchive()), (value, failure) -> {
            if (!live()) return;
            if (failure != null) { status.setText(failure.getMessage() + "。可保留或导出原始库文件。"); return; }
            display(value, "旧库当前只读快照");
        });
    }
    private boolean live() { return !isFinishing() && !isDestroyed(); }
    private LinearLayout row(LinearLayout parent) {
        LinearLayout row = new LinearLayout(this); parent.addView(row); return row;
    }
    private void button(LinearLayout parent, String text, Runnable action) {
        Button button = new Button(this); button.setText(text); button.setMinHeight(Math.round(44 * getResources().getDisplayMetrics().density));
        button.setOnClickListener(view -> action.run()); parent.addView(button, new LinearLayout.LayoutParams(0, -2, 1));
    }
    private void display(Snapshot value, String label) {
        snapshot = value; shown = 0; listing.removeAllViews(); status.setText(label + "；备份身份 " + value.archive.archiveId); more();
    }
    private void more() {
        int end = Math.min(shown + 100, snapshot.entries.size());
        for (; shown < end; shown++) {
            Entry entry = snapshot.entries.get(shown); Button item = new Button(this);
            item.setText("raw".equals(entry.section) ? "完整原始状态（包括未知字段）" : entry.section + " · " + (entry.index < 0 ? entry.key : entry.index + 1));
            item.setOnClickListener(view -> inspect(entry)); listing.addView(item);
        }
        if (shown < snapshot.entries.size()) {
            Button more = new Button(this); more.setText("继续显示"); listing.addView(more);
            more.setOnClickListener(view -> { listing.removeView(more); more(); });
        }
    }
    private void inspect(Entry entry) {
        Snapshot selected = snapshot;
        runtime.submit(() -> {
            if ("raw".equals(entry.section)) return selected.archive.textExport();
            JSONObject state = selected.archive.state(); Object value = entry.index < 0 ?
                    state.getJSONObject(entry.section).get(entry.key) : state.getJSONArray(entry.section).get(entry.index);
            return value instanceof JSONObject ? ((JSONObject) value).toString(2) : value instanceof String ?
                    JSONObject.quote((String) value) : String.valueOf(value);
        }, (text, failure) -> {
            if (!live()) return;
            if (failure != null) { status.setText(failure.getMessage()); return; }
            ScrollView scroll = new ScrollView(this); TextView content = new TextView(this); content.setTextIsSelectable(true); content.setPadding(16, 16, 16, 16);
            content.setText(LegacyViewerPolicy.preview(text)); scroll.addView(content);
            boolean small = LegacyViewerPolicy.clipboardAllowed(text);
            new AlertDialog.Builder(this).setTitle("只读保留内容").setView(scroll)
                    .setPositiveButton(small ? "复制这条" : "导出这条", (dialog, which) -> {
                        if (small) {
                            ClipboardManager clipboard = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                            if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText("旧版本机记录", text));
                        } else { recordExport = text; export(RECORD); }
                    }).setNegativeButton("关闭", null).show();
        });
    }
    private void openBackup() {
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
        try { startActivityForResult(picker, OPEN); }
        catch (android.content.ActivityNotFoundException | SecurityException unavailable) { status.setText("没有可用的系统文件选择器；旧库保留。"); }
    }
    private void export(int kind) {
        if (kind != ORIGINAL && kind != RECORD && snapshot == null) { status.setText("尚无可验证快照；可导出原始库文件。"); return; }
        String suffix = kind == ORIGINAL ? ".zip" : kind == JSON ? ".json" : ".txt";
        Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                .setType(kind == ORIGINAL ? "application/zip" : kind == JSON ? "application/json" : "text/plain")
                .putExtra(Intent.EXTRA_TITLE, "haoduoyu-legacy-retained" + suffix);
        try {
            startActivityForResult(picker, kind);
            pendingExport = kind;
            exportArchiveId = snapshot == null ? null : snapshot.archive.archiveId;
        }
        catch (android.content.ActivityNotFoundException | SecurityException unavailable) { status.setText("没有可用的系统文件保存位置；旧库保留。"); }
    }
    @Override protected void onActivityResult(int request, int result, Intent intent) {
        super.onActivityResult(request, result, intent);
        Uri destination = intent == null ? null : intent.getData();
        if (result != RESULT_OK || destination == null) return;
        if (!"content".equals(destination.getScheme())) { status.setText("仅接受系统文件提供方所选的内容位置；旧库未更改。"); return; }
        if (request == OPEN) {
            runtime.submit(() -> {
                byte[] bytes;
                try (InputStream input = getContentResolver().openInputStream(destination)) {
                    if (input == null) throw new java.io.IOException("未读取到所选备份"); bytes = LegacyArchive.readBounded(input);
                }
                Snapshot opened = new Snapshot(bytes); runtime.retainImportedArchive(bytes); return opened;
            }, (value, failure) -> {
                if (!live()) return;
                if (failure != null) status.setText(failure.getMessage()); else display(value, "历史备份（只读；未导入队列）");
            });
        } else if (request == JSON || request == TEXT || request == ORIGINAL || request == RECORD) {
            if (request != pendingExport || (request != ORIGINAL && (snapshot == null
                    || !snapshot.archive.archiveId.equals(exportArchiveId))) || (request == RECORD && recordExport.isEmpty())) {
                status.setText("导出选择已失效，请重新选择当前内容和保存位置；旧库未更改。"); return;
            }
            pendingExport = 0;
            Snapshot selected = snapshot; String selectedRecord = recordExport;
            runtime.submit(() -> {
                try (OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
                    if (output == null) throw new java.io.IOException("无法写入所选位置");
                    if (request == ORIGINAL) runtime.exportOriginalFiles(output);
                    else output.write(request == JSON ? selected.encoded : (request == RECORD ? selectedRecord : selected.archive.textExport()).getBytes(StandardCharsets.UTF_8));
                }
                return true;
            }, (saved, failure) -> { if (live()) Toast.makeText(this, failure == null ? "已写入所选位置；旧库仍保留" : failure.getMessage(), Toast.LENGTH_LONG).show(); });
        }
    }
}
