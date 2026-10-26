package xyz.haoduoyu.personal;

import android.app.job.JobScheduler;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
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
import org.robolectric.shadows.ShadowAlertDialog;
import org.robolectric.shadows.ShadowPopupMenu;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.net.Proxy;
import java.net.ProxySelector;
import java.net.SocketAddress;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.cert.Certificate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import javax.net.ssl.HttpsURLConnection;

import xyz.haoduoyu.personal.offline.AndroidApiTransport;
import xyz.haoduoyu.personal.offline.ApiClient;
import xyz.haoduoyu.personal.offline.JsonUtil;
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
    private Object previousTransportFactory;
    private final List<URI> attemptedNetwork = new CopyOnWriteArrayList<>();

    @Before public void isolateRuntimeAndBlockNetwork() throws Exception {
        // Robolectric resets Android state; explicitly reset the process singleton
        // and its executor lifetimes too, so no test inherits another draft/account.
        OfflineRuntime old = singleton();
        if (old != null) closeRuntime(old);
        singletonField().set(null, null);
        previousTransportFactory = transportFactoryField().get(null);
        setTransportFactory(() -> (method, path, body) -> { throw new IOException("Synthetic offline transport"); });
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
        } finally {
            transportFactoryField().set(null, previousTransportFactory);
            ProxySelector.setDefault(previousProxy);
        }
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
        assertTrue("Injected offline transport must not open a physical connection", attemptedNetwork.isEmpty());
        assertEquals(0, webViews(activity.getWindow().getDecorView()));
    }

    @Test public void explicitLegacyHistoryIntentAndSavedBundleStillReachTheNativeEditorBeforeTheCompatibilityFix() throws Exception {
        Context context=RuntimeEnvironment.getApplication();
        Intent history=new Intent(context,OfflineActivity.class).setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER).addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY);
        Bundle restored=new Bundle();restored.putString("tab","memo");restored.putString("date","2026-10-26");
        restored.putString("draft","Synthetic old task restoration probe");
        controller=Robolectric.buildActivity(OfflineActivity.class,history);
        controller.create(restored).start().restoreInstanceState(restored).resume().visible();
        OfflineActivity activity=controller.get();OfflineRuntime runtime=awaitReady(activity);
        assertNotNull(runtime);assertFalse(activity.isFinishing());
        assertEquals("Synthetic old task restoration probe",field(activity,"composer",EditText.class).getText().toString());
        assertEquals(0,webViews(activity.getWindow().getDecorView()));
        assertNull(Shadows.shadowOf(activity).getNextStartedActivity());
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

    @Test public void legacyLocalWorkspacePullsPublicDataButKeepsItsQueueUntilAnActualConsentClick() throws Exception {
        final String date = "2026-10-24", slot = "composer:todo:" + date;
        final String localText = "Unsent todo from version 2.0", draft = "Unfinished version 2.0 draft";
        SqliteStateStore oldDisk = new SqliteStateStore(RuntimeEnvironment.getApplication());
        String entityId, operationId;
        try {
            LocalRepository old = new LocalRepository(oldDisk);
            entityId = old.create("todo", null, date, new JSONObject().put("text", localText));
            old.setDraft(slot, draft); old.setUiState("tab", "todo"); old.setUiState("date", date);
            JSONObject legacy = old.snapshot(); legacy.remove("workspace");
            operationId = legacy.getJSONArray("operations").getJSONObject(0).getString("op_id");
            assertEquals(1, legacy.getInt("schema"));
            assertEquals("", legacy.getString("account_id"));
            assertTrue(legacy.getJSONArray("operations").getJSONObject(0).isNull("wire"));
            oldDisk.write(legacy);
        } finally { oldDisk.close(); }

        PublicFixtureTransport server = new PublicFixtureTransport();
        setTransportFactory(() -> server);
        OfflineActivity activity = launch(null);
        OfflineRuntime runtime = awaitReady(activity);
        await("Anonymous discovery must finish a verified pull without a login", () ->
                "public_consent_required".equals(runtime.repository.snapshot().getJSONObject("status").optString("code")));
        drainWorkers(runtime);
        JSONObject target = runtime.repository.workspace();
        assertEquals("public", target.getString("mode"));
        assertEquals(ApiClient.ORIGIN, target.getString("origin"));
        assertFalse(target.getBoolean("upload_consented"));
        assertEquals(LocalRepository.publicAccountId(ApiClient.ORIGIN, target.getString("scope_id")), target.getString("account_id"));
        assertEquals(0, server.writes.size());
        assertFalse(server.paths.stream().anyMatch(path -> path.contains("/auth/login")));
        assertEquals(draft, field(activity, "composer", EditText.class).getText().toString());
        JSONObject before = readDisk();
        assertEquals(localText, before.getJSONObject("entities").getJSONObject(entityId).getJSONObject("local").getString("text"));
        assertEquals(operationId, before.getJSONArray("operations").getJSONObject(0).getString("op_id"));
        assertEquals("queued", before.getJSONArray("operations").getJSONObject(0).getString("status"));
        assertTrue(before.getJSONArray("operations").getJSONObject(0).isNull("wire"));
        assertNotNull(before.getJSONObject("entities").optJSONObject("todo:40000000-0000-4000-8000-000000000001"));

        Button more = buttonWithText(activity.getWindow().getDecorView(), "更多");
        assertNotNull(more); assertTrue(more.performClick());
        android.widget.PopupMenu menu = ShadowPopupMenu.getLatestPopupMenu();
        assertNotNull(menu);
        assertEquals("公开工作台与同步授权", menu.getMenu().findItem(1).getTitle().toString());
        assertTrue(menu.getMenu().performIdentifierAction(1, 0));
        AlertDialog consent = ShadowAlertDialog.getLatestAlertDialog();
        assertNotNull(consent);
        assertEquals("连接公开工作台", Shadows.shadowOf(consent).getTitle().toString());
        assertEquals("允许公开同步", consent.getButton(AlertDialog.BUTTON_POSITIVE).getText().toString());
        assertEquals(0, server.writes.size());
        assertTrue(consent.getButton(AlertDialog.BUTTON_POSITIVE).performClick());
        await("Only the explicit native consent click may release the old outbox", () ->
                runtime.repository.workspace().optBoolean("upload_consented") && !server.writes.isEmpty());
        drainWorkers(runtime);
        JSONObject after = readDisk(), op = after.getJSONArray("operations").getJSONObject(0);
        assertEquals(operationId, op.getString("op_id"));
        assertEquals("frozen", op.getString("status"));
        assertEquals(localText, op.getJSONObject("payload").getString("text"));
        assertEquals("public", op.getJSONObject("wire").getString("identity_mode"));
        assertEquals(target.getString("scope_id"), op.getJSONObject("wire").getString("scope_id"));
        assertEquals(draft, after.getJSONObject("drafts").getString(slot));
        assertEquals(localText, server.writes.get(0).getJSONObject("body").getString("text"));
        assertTrue(attemptedNetwork.isEmpty());
    }

    @Test public void actualTransportRequiresExplicitPublicIdentityAndConstructsThePublicWriteHeaders() throws Exception {
        List<FakeHttpsConnection> opened = new ArrayList<>();
        AndroidApiTransport.ConnectionFactory factory = url -> {
            String response = url.getPath().equals("/api/v1/auth/me")
                    ? "{\"data\":{\"id\":\"public-business\",\"publicBusiness\":true}}" : "{\"data\":{\"version\":1}}";
            FakeHttpsConnection connection = new FakeHttpsConnection(url, response); opened.add(connection); return connection;
        };
        AndroidApiTransport.CookieAccess noCookies = new AndroidApiTransport.CookieAccess() {
            @Override public String get() { return null; }
            @Override public void set(String value) { fail("Pinned sync must not mutate browser cookies"); }
            @Override public void flush() { fail("Pinned sync must not flush browser cookies"); }
        };
        AndroidApiTransport transport = new AndroidApiTransport(factory, noCookies);
        assertWriteRefused(transport); assertTrue(opened.isEmpty());
        transport.send("GET", "/api/v1/auth/me", null);
        JSONObject body = new JSONObject().put("id", "50000000-0000-4000-8000-000000000001").put("text", "Public native wire");
        transport.send("POST", "/api/v1/todos", body);
        assertEquals(2, opened.size());
        FakeHttpsConnection post = opened.get(1);
        assertEquals("POST", post.getRequestMethod());
        assertEquals(ApiClient.ORIGIN, post.getRequestProperty("Origin"));
        assertEquals("1", post.getRequestProperty("X-Public-Business"));
        assertNull(post.getRequestProperty("Cookie"));
        assertNull(post.getRequestProperty("Authorization"));
        assertNull(post.getRequestProperty("X-CSRF-Token"));
        assertEquals(body.toString(), new String(post.written.toByteArray(), StandardCharsets.UTF_8));
        assertTrue(post.disconnected);

        for (String me : new String[]{"{\"id\":\"public-business\",\"publicBusiness\":\"true\"}",
                "{\"id\":\"60000000-0000-4000-8000-000000000001\",\"csrfToken\":\"synthetic-private\"}"}) {
            List<FakeHttpsConnection> rejectedConnections = new ArrayList<>();
            AndroidApiTransport refused = new AndroidApiTransport(url -> {
                FakeHttpsConnection connection = new FakeHttpsConnection(url, "{\"data\":" + me + "}");
                rejectedConnections.add(connection); return connection;
            }, noCookies);
            refused.send("GET", "/api/v1/auth/me", null);
            assertWriteRefused(refused);
            assertEquals("An unverified/private identity must fail before opening a write connection", 1, rejectedConnections.size());
        }
        assertTrue(attemptedNetwork.isEmpty());
    }

    private static void assertWriteRefused(AndroidApiTransport transport) throws Exception {
        try { transport.send("POST", "/api/v1/todos", new JSONObject()); fail("Expected public identity gate"); }
        catch (IOException expected) { /* No connection is opened until strict public discovery. */ }
    }

    /** Replays real source-worker synthetic projections; writes deliberately fail before acknowledgement. */
    private static final class PublicFixtureTransport implements ApiClient.Transport {
        final JSONObject fixture;
        final List<String> paths = new CopyOnWriteArrayList<>();
        final List<JSONObject> writes = new CopyOnWriteArrayList<>();
        PublicFixtureTransport() throws Exception {
            try (InputStream input = NativeOfflineUiTest.class.getResourceAsStream("/public-workbench-contract.json")) {
                assertNotNull(input); fixture = new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
            }
            assertTrue(fixture.getBoolean("synthetic_public_fixture"));
        }
        @Override public ApiClient.Response send(String method, String path, JSONObject body) throws Exception {
            paths.add(path);
            if (!"GET".equals(method)) {
                writes.add(new JSONObject().put("path", path).put("body", new JSONObject(body.toString())));
                return new ApiClient.Response(503, new JSONObject().put("error", new JSONObject().put("code", "SYNTHETIC_OFFLINE")));
            }
            JSONObject captured, wire = fixture.getJSONObject("wire");
            if (path.equals("/api/v1/auth/me")) captured = wire.getJSONObject("me");
            else if (path.equals("/api/v1/workbench-snapshot/index")) captured = wire.getJSONObject("index");
            else if (path.startsWith("/api/v1/workbench-snapshot?date=")) {
                String date = path.substring(path.indexOf('=') + 1);
                if (date.equals(fixture.getJSONObject("daily").getString("date"))) captured = wire.getJSONObject("daily");
                else {
                    captured = new JSONObject(wire.getJSONObject("global_day").toString());
                    JSONObject data = captured.getJSONObject("body").getJSONObject("data"); data.put("date", date);
                    data.put("date_content_hash", JsonUtil.sha256(new JSONObject().put("scope_id", data.getString("scope_id")).put("entities", new JSONArray())));
                    data.put("content_hash", JsonUtil.sha256(new JSONObject().put("snapshot_format", data.getString("snapshot_format"))
                            .put("scope_id", data.getString("scope_id")).put("date", date).put("timezone", data.getString("timezone")).put("data", data.getJSONObject("data"))));
                }
            } else if (path.startsWith("/api/v1/articles")) captured = wire.getJSONObject("articles");
            else throw new AssertionError("Unexpected API call in public upgrade UI test: " + method + " " + path);
            return new ApiClient.Response(captured.getInt("status"), new JSONObject(captured.getJSONObject("body").toString()));
        }
    }

    private static final class FakeHttpsConnection extends HttpsURLConnection {
        final byte[] response;
        final ByteArrayOutputStream written = new ByteArrayOutputStream();
        boolean disconnected;
        FakeHttpsConnection(URL url, String response) { super(url); this.response = response.getBytes(StandardCharsets.UTF_8); }
        @Override public void disconnect() { disconnected = true; }
        @Override public boolean usingProxy() { return false; }
        @Override public void connect() { }
        @Override public int getResponseCode() { return 200; }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(response); }
        @Override public OutputStream getOutputStream() { return written; }
        @Override public Map<String, List<String>> getHeaderFields() { return Collections.emptyMap(); }
        @Override public String getHeaderField(String name) { return null; }
        @Override public String getCipherSuite() { return "SYNTHETIC"; }
        @Override public Certificate[] getLocalCertificates() { return null; }
        @Override public Certificate[] getServerCertificates() { return new Certificate[0]; }
    }

    private static Button buttonWithText(View view, String text) {
        if (view instanceof Button && text.contentEquals(((Button) view).getText())) return (Button) view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            Button found = buttonWithText(((ViewGroup) view).getChildAt(i), text); if (found != null) return found;
        }
        return null;
    }

    private static Field transportFactoryField() throws Exception {
        Field field = OfflineRuntime.class.getDeclaredField("transportFactory"); field.setAccessible(true); return field;
    }
    private static void setTransportFactory(Supplier<ApiClient.Transport> factory) throws Exception { transportFactoryField().set(null, factory); }

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
