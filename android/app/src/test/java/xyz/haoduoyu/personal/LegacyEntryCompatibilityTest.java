package xyz.haoduoyu.personal;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.PopupMenu;
import android.widget.TextView;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.shadows.ShadowAlertDialog;
import org.robolectric.shadows.ShadowPopupMenu;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import org.robolectric.annotation.SQLiteMode;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.Field;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import xyz.haoduoyu.personal.offline.ApiClient;
import xyz.haoduoyu.personal.offline.LegacyRecoveryRuntime;
import xyz.haoduoyu.personal.offline.LegacyRestoredDraft;
import xyz.haoduoyu.personal.offline.LegacyRestoredDraftFiles;
import xyz.haoduoyu.personal.offline.LocalRepository;
import xyz.haoduoyu.personal.offline.OfflineRuntime;
import xyz.haoduoyu.personal.offline.SqliteStateStore;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, shadows = UnifiedShellTest.ServiceWorkers.class)
@LooperMode(LooperMode.Mode.PAUSED)
@SQLiteMode(SQLiteMode.Mode.NATIVE)
public final class LegacyEntryCompatibilityTest {
    private ActivityController<OfflineActivity> legacy;
    private ActivityController<MainActivity> web;
    private ActivityController<LegacyRecoveryActivity> viewer;
    private SqliteStateStore disk;
    private Object previousOldTransport, previousRecoveryTransport;
    private final AtomicInteger requests = new AtomicInteger();
    private static Field field(Class<?> type, String name) throws Exception {
        Field result = type.getDeclaredField(name); result.setAccessible(true); return result;
    }
    @Before public void isolate() throws Exception {
        resetRecovery(); assertNull(field(OfflineRuntime.class, "instance").get(null));
        previousOldTransport = field(OfflineRuntime.class, "transportFactory").get(null);
        previousRecoveryTransport = field(LegacyRecoveryRuntime.class, "transportFactory").get(null);
        Supplier<ApiClient.Transport> transport = () -> (method, path, body) -> {
            requests.incrementAndGet(); throw new IOException("Synthetic restoration test blocks all network");
        };
        field(OfflineRuntime.class, "transportFactory").set(null, transport);
        field(LegacyRecoveryRuntime.class, "transportFactory").set(null, transport);
        files(false);
    }
    private File directory() { return new File(RuntimeEnvironment.getApplication().getNoBackupFilesDir(), "legacy-recovery/restored-drafts"); }
    private void files(boolean fail) throws Exception {
        field(LegacyRecoveryRuntime.class, "restoredDrafts").set(LegacyRecoveryRuntime.get(RuntimeEnvironment.getApplication()),
                new LegacyRestoredDraftFiles(directory(), path -> { if (fail) throw new IOException("synthetic directory sync failure"); }));
    }
    private void settle() throws Exception {
        LegacyRecoveryRuntime runtime = LegacyRecoveryRuntime.get(RuntimeEnvironment.getApplication());
        ((ExecutorService) field(LegacyRecoveryRuntime.class, "worker").get(runtime)).submit(() -> { }).get(10, TimeUnit.SECONDS);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
    }
    private Bundle saved(String text) {
        Bundle value = new Bundle(); value.putString("tab", "memo"); value.putString("date", "2026-10-26"); value.putString("draft", text); return value;
    }
    private OfflineActivity restore(Bundle state) {
        Context context = RuntimeEnvironment.getApplication();
        Intent history = new Intent(context, OfflineActivity.class).setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER).addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY)
                .putExtra("untrusted_route", "must-not-be-forwarded");
        legacy = Robolectric.buildActivity(OfflineActivity.class, history);
        if (state == null) legacy.create().start().resume().visible();
        else legacy.create(state).start().restoreInstanceState(state).resume().visible();
        return legacy.get();
    }
    private Intent redirected(OfflineActivity activity) {
        Intent result = Shadows.shadowOf(activity).getNextStartedActivity(); assertNotNull(result);
        assertEquals(MainActivity.class.getName(), result.getComponent().getClassName()); assertNull(result.getExtras());
        assertEquals(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP,
                result.getFlags() & (Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP)); return result;
    }
    private void startWeb(Intent target) throws Exception {
        web = Robolectric.buildActivity(MainActivity.class, target).setup(); settle();
        WebView view = (WebView) field(MainActivity.class, "web").get(web.get());
        assertEquals(UrlPolicy.HOME, Shadows.shadowOf(view).getLastLoadedUrl());
        ViewGroup root = (ViewGroup) ((View) view.getParent()).getParent();
        assertEquals("No legacy notice consumes a native content row", 3, root.getChildCount());
        assertNull(field(OfflineRuntime.class, "instance").get(null)); assertEquals(0, requests.get());
    }
    @Test public void explicitOldHistoryComponentWithoutADraftGoesToTheSharedWebShellWithoutOpeningAnOldStore() throws Exception {
        OfflineActivity activity = restore(null); assertTrue(activity.isFinishing());
        assertEquals(0, editors(activity.getWindow().getDecorView())); startWeb(redirected(activity));
        assertFalse(RuntimeEnvironment.getApplication().getDatabasePath("haoduoyu-offline.db").exists());
    }
    @Test public void restoredDraftAndDifferentOldDatabaseDraftBothSurviveWithoutChangingTheOriginalBytes() throws Exception {
        disk = new SqliteStateStore(RuntimeEnvironment.getApplication()); LocalRepository old = new LocalRepository(disk);
        String slot = "composer:memo:2026-10-26"; old.setDraft(slot, "Original persisted slot text"); old.setDraft("empty", "");
        byte[] original = disk.readRawPayload(); String recovered = "Different Bundle-only text 中文🐟";
        OfflineActivity activity = restore(saved(recovered)); settle(); assertTrue(activity.isFinishing());
        assertEquals(0, editors(activity.getWindow().getDecorView())); startWeb(redirected(activity));
        List<LegacyRestoredDraft> values = LegacyRecoveryRuntime.get(activity).restoredDrafts();
        assertEquals(1, values.size()); assertEquals(recovered, values.get(0).draft());
        assertEquals("memo",values.get(0).tab());assertEquals("2026-10-26",values.get(0).date());
        assertEquals("Original persisted slot text", disk.read().getJSONObject("drafts").getString(slot));
        assertArrayEquals(original, disk.readRawPayload());
        viewer = Robolectric.buildActivity(LegacyRecoveryActivity.class).setup(); settle();
        assertNotNull(find(viewer.get().getWindow().getDecorView(), "恢复的启动草稿 · 恢复时间", true));
        legacy.pause().saveInstanceState(new Bundle()).stop().destroy(); legacy = null;
        assertArrayEquals(original, disk.readRawPayload()); assertEquals(0, requests.get());
    }
    @Test public void absentDatabaseStillRetainsAnEmptyDraftAndANullDraftAsDifferentReadOnlyRecords() throws Exception {
        OfflineActivity first = restore(saved("")); settle(); assertTrue(first.isFinishing()); redirected(first);
        legacy.pause().stop().destroy(); legacy = null;
        OfflineActivity second = restore(saved(null)); settle(); assertTrue(second.isFinishing()); Intent target=redirected(second);
        List<LegacyRestoredDraft> values = LegacyRecoveryRuntime.get(second).restoredDrafts();
        assertEquals(2, values.size()); boolean empty = false, nullValue = false;
        for (LegacyRestoredDraft value : values) { empty |= "".equals(value.draft()); nullValue |= value.draft() == null; }
        assertTrue(empty); assertTrue(nullValue); assertTrue(LegacyRecoveryRuntime.get(second).hasLegacyRecords());
        startWeb(target); openSettingsAndSelect(0);
        Intent recovery=Shadows.shadowOf(web.get()).getNextStartedActivity();
        assertEquals(LegacyRecoveryActivity.class.getName(),recovery.getComponent().getClassName());
        viewer=Robolectric.buildActivity(LegacyRecoveryActivity.class).setup();settle();
        assertNotNull(find(viewer.get().getWindow().getDecorView(),"恢复的启动草稿 · 恢复时间",true));
        assertFalse(RuntimeEnvironment.getApplication().getDatabasePath("haoduoyu-offline.db").exists()); assertEquals(0, requests.get());
    }
    @Test public void failedPrivatePersistenceKeepsAReadableCopyExportAndRetryPathWithoutPretendingToRedirect() throws Exception {
        files(true); String text = "Bundle-only private draft while storage fails";
        OfflineActivity activity = restore(saved(text)); settle(); assertFalse(activity.isFinishing());
        assertEquals(0, editors(activity.getWindow().getDecorView()));
        assertTrue(((TextView) field(OfflineActivity.class, "status").get(activity)).getText().toString().contains("尚未成功"));
        assertNull(Shadows.shadowOf(activity).getNextStartedActivity()); assertNull(field(OfflineRuntime.class, "instance").get(null));
        find(activity.getWindow().getDecorView(), "复制恢复内容", false).performClick();
        ClipboardManager clipboard = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
        assertTrue(clipboard.getPrimaryClip().getItemAt(0).getText().toString().contains(text));
        find(activity.getWindow().getDecorView(), "导出完整恢复内容", false).performClick();
        Intent picker=Shadows.shadowOf(activity).getNextStartedActivityForResult().intent;
        assertEquals(Intent.ACTION_CREATE_DOCUMENT,picker.getAction());assertEquals("text/plain",picker.getType());
        while(Shadows.shadowOf(activity).getNextStartedActivity()!=null){ }
        Bundle next = new Bundle(); legacy.saveInstanceState(next); assertTrue(next.containsKey("draft")); assertEquals(text, next.getString("draft"));
        activity.onBackPressed(); assertFalse(activity.isFinishing());
        find(activity.getWindow().getDecorView(), "进入网页，保留此恢复页", false).performClick();
        Intent target = Shadows.shadowOf(activity).getNextStartedActivity(); assertEquals(MainActivity.class.getName(), target.getComponent().getClassName());
        assertEquals(0, target.getFlags() & Intent.FLAG_ACTIVITY_CLEAR_TOP); assertFalse(activity.isFinishing());
        assertTrue(target.getBooleanExtra("legacyRecoveryPending",false));startWeb(target);assertFalse(activity.isFinishing());
        openSettingsAndSelect(1);
        Intent returnIntent=Shadows.shadowOf(web.get()).getNextStartedActivity();
        assertEquals(OfflineActivity.class.getName(),returnIntent.getComponent().getClassName());
        assertEquals(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,returnIntent.getFlags() & Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        assertNull(returnIntent.getExtras());assertFalse(activity.isFinishing());
        WebView existing=(WebView)field(MainActivity.class,"web").get(web.get());existing.loadUrl("https://haoduoyu.xyz/?page=memos");
        files(false); find(activity.getWindow().getDecorView(), "重试私密保全", false).performClick(); settle();
        assertTrue(activity.isFinishing()); assertEquals(text, LegacyRecoveryRuntime.get(activity).restoredDrafts().get(0).draft());
        Intent confirmed=Shadows.shadowOf(activity).getNextStartedActivity();assertNotNull(confirmed);
        assertFalse(confirmed.getBooleanExtra("legacyRecoveryPending",true));web.get().onNewIntent(confirmed);
        assertEquals("https://haoduoyu.xyz/?page=memos",Shadows.shadowOf(existing).getLastLoadedUrl());
        openSettings();
        assertEquals(1, ShadowAlertDialog.getLatestAlertDialog().getListView().getCount());
        assertFalse(RuntimeEnvironment.getApplication().getDatabasePath("haoduoyu-offline.db").exists()); assertEquals(0, requests.get());
    }
    private void openSettings() {
        View more=find(web.get().getWindow().getDecorView(), "更多", false);
        assertNotNull(more); assertTrue(more.performClick());
        PopupMenu menu=ShadowPopupMenu.getLatestPopupMenu(); assertNotNull(menu);
        assertEquals("设置",menu.getMenu().findItem(5).getTitle().toString());
        assertTrue(menu.getMenu().performIdentifierAction(5,0));
        assertNotNull(ShadowAlertDialog.getLatestAlertDialog());
    }
    private void openSettingsAndSelect(int index) {
        openSettings(); AlertDialog dialog=ShadowAlertDialog.getLatestAlertDialog();
        android.widget.ListView list=dialog.getListView();
        assertTrue(index < list.getCount());
        list.performItemClick(list.getAdapter().getView(index,null,list),index,list.getAdapter().getItemId(index));
    }
    private static View find(View view, String text, boolean prefix) {
        if (view instanceof TextView) { String value = ((TextView) view).getText().toString(); if (prefix ? value.startsWith(text) : value.equals(text)) return view; }
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            View match = find(((ViewGroup) view).getChildAt(i), text, prefix); if (match != null) return match;
        }
        return null;
    }
    private static int editors(View view) {
        int count = view instanceof EditText ? 1 : 0;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) count += editors(((ViewGroup) view).getChildAt(i)); return count;
    }
    private static void resetRecovery() throws Exception {
        Object value = field(LegacyRecoveryRuntime.class, "instance").get(null);
        if (value != null) {
            ((android.os.Handler) field(LegacyRecoveryRuntime.class, "main").get(value)).removeCallbacksAndMessages(null);
            ExecutorService worker = (ExecutorService) field(LegacyRecoveryRuntime.class, "worker").get(value); worker.shutdownNow(); worker.awaitTermination(10, TimeUnit.SECONDS);
            SqliteStateStore source = (SqliteStateStore) field(LegacyRecoveryRuntime.class, "source").get(value); if (source != null) source.close();
        }
        field(LegacyRecoveryRuntime.class, "instance").set(null, null);
    }
    @After public void close() throws Exception {
        try {
            if (viewer != null) viewer.pause().stop().destroy(); if (web != null) web.pause().stop().destroy(); if (legacy != null) legacy.pause().stop().destroy();
            resetRecovery(); if (disk != null) disk.close();
            OfflineRuntime old = (OfflineRuntime) field(OfflineRuntime.class, "instance").get(null);
            if (old != null) {
                old.local.shutdownNow(); ((ExecutorService) field(OfflineRuntime.class, "network").get(old)).shutdownNow();
                field(OfflineRuntime.class, "instance").set(null, null);
            }
        } finally {
            field(OfflineRuntime.class, "transportFactory").set(null, previousOldTransport);
            field(LegacyRecoveryRuntime.class, "transportFactory").set(null, previousRecoveryTransport);
        }
    }
}
