package xyz.haoduoyu.personal;

import android.app.job.JobScheduler;
import android.content.Context;
import android.os.Bundle;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.EditText;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.LooperMode;
import org.robolectric.annotation.SQLiteMode;

import java.io.IOException;
import java.lang.reflect.Field;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

import xyz.haoduoyu.personal.offline.LocalRepository;
import xyz.haoduoyu.personal.offline.OfflineRuntime;
import xyz.haoduoyu.personal.offline.SqliteStateStore;

import static org.junit.Assert.*;

/** Native widgets, real local SQLite and lifecycle transitions, with all outbound networking blocked. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
@LooperMode(LooperMode.Mode.PAUSED)
@SQLiteMode(SQLiteMode.Mode.NATIVE)
public final class NativeOfflineUiTest {
    private ActivityController<OfflineActivity> controller;
    private ProxySelector previousProxy;
    private final List<URI> attemptedNetwork = new CopyOnWriteArrayList<>();

    @Before public void isolateRuntimeAndBlockNetwork() throws Exception {
        // Robolectric resets Android state; explicitly reset the process singleton
        // and its executor lifetimes too, so no test inherits another draft/account.
        OfflineRuntime old = singleton();
        if (old != null) closeRuntime(old);
        singletonField().set(null, null);
        previousProxy = ProxySelector.getDefault();
        ProxySelector.setDefault(new ProxySelector() {
            @Override public List<Proxy> select(URI target) {
                attemptedNetwork.add(target);
                throw new SecurityException("Outbound networking is forbidden in native offline UI tests");
            }
            @Override public void connectFailed(URI target, SocketAddress address, IOException failure) { }
        });
    }

    @After public void stopOwnedWorkersAndRestoreNetworkPolicy() throws Exception {
        try {
            if (controller != null) destroyCurrent(null);
            OfflineRuntime runtime = singleton();
            if (runtime != null) closeRuntime(runtime);
            singletonField().set(null, null);
            JobScheduler jobs = (JobScheduler) RuntimeEnvironment.getApplication().getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (jobs != null) jobs.cancelAll();
            Shadows.shadowOf(Looper.getMainLooper()).idle();
        } finally { ProxySelector.setDefault(previousProxy); }
    }

    @Test public void firstScreenAcceptsNativeTextWithoutLoadingARemoteWebDocument() throws Exception {
        OfflineActivity activity = launch(null);
        EditText composer = field(activity, "composer", EditText.class);
        assertTrue(composer.isEnabled());
        assertEquals(0, webViews(activity.getWindow().getDecorView()));
        // Type before the asynchronous local-store startup callback is drained.
        composer.setText("Write immediately, even before the local workspace is ready");
        OfflineRuntime runtime = awaitReady(activity);
        String slot = field(activity, "slot", String.class);
        await("Early native input must be durably recovered", () ->
                composer.getText().toString().equals(runtime.repository.draft(slot)));
        assertEquals("", runtime.repository.snapshot().getString("account_id"));
        assertEquals(0, runtime.repository.snapshot().getJSONObject("entities").length());
        runtime.requestSync();
        drainWorkers(runtime);
        assertTrue("An unbound local workspace must not touch any remote API", attemptedNetwork.isEmpty());
        assertEquals(0, webViews(activity.getWindow().getDecorView()));
    }

    @Test public void actualAddAndRoundCompletionClicksCommitToSQLiteWithoutAnAccount() throws Exception {
        OfflineActivity activity = launch(null);
        OfflineRuntime runtime = awaitReady(activity);
        EditText composer = field(activity, "composer", EditText.class);
        Button save = field(activity, "save", Button.class);
        String text = "Native todo persisted before sync";
        composer.setText(text);
        assertTrue(save.performClick());
        await("The native add button must commit one todo before clearing the composer", () ->
                todoCount(runtime.repository.snapshot()) == 1 && save.isEnabled() && composer.length() == 0);
        await("A round native completion control must be present", () ->
                completionButton(field(activity, "rows", View.class), text) != null);
        Button circle = completionButton(field(activity, "rows", View.class), text);
        assertNotNull(circle);
        assertEquals(circle.getLayoutParams().width, circle.getLayoutParams().height);
        assertTrue(circle.performClick());
        await("The actual completion click must update the local entity", () -> completed(todo(runtime.repository.snapshot())));
        drainWorkers(runtime);
        JSONObject disk = readDisk();
        assertEquals(1, todoCount(disk));
        assertTrue(completed(todo(disk)));
        assertEquals(text, todo(disk).getString("text"));
        JSONArray operations = disk.getJSONArray("operations");
        assertEquals(2, operations.length());
        assertEquals("upsert", operations.getJSONObject(0).getString("action"));
        assertEquals("complete", operations.getJSONObject(1).getString("action"));
        assertNotEquals(operations.getJSONObject(0).getString("op_id"), operations.getJSONObject(1).getString("op_id"));
        assertEquals("", disk.getString("account_id"));
        assertTrue(attemptedNetwork.isEmpty());
    }

    @Test public void draftRecreationAndSaveInFlightBundleDoNotDuplicateACommittedTodo() throws Exception {
        OfflineActivity first = launch(null);
        OfflineRuntime runtime = awaitReady(first);
        String draft = "Keep this native draft through recreation";
        field(first, "composer", EditText.class).setText(draft);
        String slot = field(first, "slot", String.class);
        await("A draft must reach local SQLite", () -> draft.equals(runtime.repository.draft(slot)));
        Bundle ordinary = new Bundle();
        destroyCurrent(ordinary);
        OfflineActivity restored = launch(ordinary);
        awaitReady(restored);
        assertEquals(draft, field(restored, "composer", EditText.class).getText().toString());
        assertEquals(0, todoCount(runtime.repository.snapshot()));

        // Hold the local executor, click the real save button, then recreate
        // before its durable transaction can complete. This deterministically
        // exercises the old-Activity-save/new-Activity-restore ordering.
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        runtime.local.submit(() -> {
            entered.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Bounded test storage gate timed out");
            return null;
        });
        assertTrue(entered.await(5, TimeUnit.SECONDS));
        Bundle savingState = new Bundle();
        try {
            assertTrue(field(restored, "save", Button.class).performClick());
            assertFalse(field(restored, "composer", EditText.class).isEnabled());
            destroyCurrent(savingState);
            assertFalse("A save-in-flight Bundle must not resurrect the pre-commit composer", savingState.containsKey("draft"));
        } finally { release.countDown(); }
        drainWorkers(runtime);
        assertEquals(1, todoCount(readDisk()));

        OfflineActivity afterSave = launch(savingState);
        awaitReady(afterSave);
        assertEquals("", field(afterSave, "composer", EditText.class).getText().toString());
        assertEquals(1, todoCount(runtime.repository.snapshot()));
        assertEquals(1, runtime.repository.snapshot().getJSONArray("operations").length());
        assertTrue(attemptedNetwork.isEmpty());
    }

    private OfflineActivity launch(Bundle state) {
        controller = Robolectric.buildActivity(OfflineActivity.class);
        if (state == null) controller.create().start().resume().visible();
        else controller.create(state).start().restoreInstanceState(state).resume().visible();
        return controller.get();
    }

    private void destroyCurrent(Bundle state) throws Exception {
        OfflineActivity activity = controller.get();
        controller.pause();
        if (state != null) controller.saveInstanceState(state);
        controller.stop().destroy(); controller = null;
        ExecutorService startup = field(activity, "startupAndLogin", ExecutorService.class);
        assertTrue("Activity-owned startup worker must stop", startup.awaitTermination(5, TimeUnit.SECONDS));
    }

    private static OfflineRuntime awaitReady(OfflineActivity activity) throws Exception {
        await("Native local workspace did not finish bounded startup", () ->
                field(activity, "runtime", OfflineRuntime.class) != null && field(activity, "save", Button.class).isEnabled());
        return field(activity, "runtime", OfflineRuntime.class);
    }

    private static void await(String message, Callable<Boolean> ready) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        do {
            Shadows.shadowOf(Looper.getMainLooper()).idle();
            if (ready.call()) return;
            Thread.sleep(10);
        } while (System.nanoTime() < deadline);
        fail(message);
    }

    private static void drainWorkers(OfflineRuntime runtime) throws Exception {
        runtime.local.submit(() -> { }).get(5, TimeUnit.SECONDS);
        field(runtime, "network", ExecutorService.class).submit(() -> { }).get(5, TimeUnit.SECONDS);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
        runtime.local.submit(() -> { }).get(5, TimeUnit.SECONDS);
        Shadows.shadowOf(Looper.getMainLooper()).idle();
    }

    private static JSONObject readDisk() throws Exception {
        SqliteStateStore disk = new SqliteStateStore(RuntimeEnvironment.getApplication());
        try { return disk.read(); } finally { disk.close(); }
    }

    private static JSONObject todo(JSONObject state) throws Exception {
        JSONObject entities = state.getJSONObject("entities");
        for (java.util.Iterator<String> keys = entities.keys(); keys.hasNext();) {
            JSONObject row = entities.getJSONObject(keys.next()).getJSONObject("local");
            if ("todo".equals(row.optString("source"))) return row;
        }
        throw new AssertionError("Expected a real locally stored todo");
    }

    private static int todoCount(JSONObject state) throws Exception {
        int count = 0; JSONObject entities = state.getJSONObject("entities");
        for (java.util.Iterator<String> keys = entities.keys(); keys.hasNext();) {
            if ("todo".equals(entities.getJSONObject(keys.next()).getJSONObject("local").optString("source"))) count++;
        }
        return count;
    }

    private static boolean completed(JSONObject row) { return row.optBoolean("completed", row.optInt("completed") == 1); }

    private static int webViews(View view) {
        int count = view instanceof WebView ? 1 : 0;
        if (view instanceof ViewGroup) for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++)
            count += webViews(((ViewGroup) view).getChildAt(index));
        return count;
    }

    private static Button completionButton(View view, String text) {
        if (view instanceof Button && view.getContentDescription() != null
                && view.getContentDescription().toString().contains(text)) return (Button) view;
        if (view instanceof ViewGroup) for (int index = 0; index < ((ViewGroup) view).getChildCount(); index++) {
            Button found = completionButton(((ViewGroup) view).getChildAt(index), text);
            if (found != null) return found;
        }
        return null;
    }

    private static Field singletonField() throws Exception {
        Field field = OfflineRuntime.class.getDeclaredField("instance"); field.setAccessible(true); return field;
    }

    private static OfflineRuntime singleton() throws Exception { return (OfflineRuntime) singletonField().get(null); }

    private static <T> T field(Object target, String name, Class<T> type) throws Exception {
        Field field = target.getClass().getDeclaredField(name); field.setAccessible(true); return type.cast(field.get(target));
    }

    private static void closeRuntime(OfflineRuntime runtime) throws Exception {
        drainWorkers(runtime);
        runtime.local.shutdown();
        ExecutorService network = field(runtime, "network", ExecutorService.class); network.shutdown();
        if (!runtime.local.awaitTermination(5, TimeUnit.SECONDS)) runtime.local.shutdownNow();
        if (!network.awaitTermination(5, TimeUnit.SECONDS)) network.shutdownNow();
        Field storage = LocalRepository.class.getDeclaredField("store"); storage.setAccessible(true);
        ((SqliteStateStore) storage.get(runtime.repository)).close();
    }
}
