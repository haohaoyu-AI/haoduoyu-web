package xyz.haoduoyu.personal.offline;

import android.content.Context;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.SQLiteMode;

import java.io.File;
import java.io.IOException;
import java.util.Arrays;

import static org.junit.Assert.*;

/** Actual old SQLite samples with the existing synthetic remote, never a production endpoint. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
@SQLiteMode(SQLiteMode.Mode.NATIVE)
public final class LegacyMigrationSqliteTest {
    private static final String SCOPE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private Context context;
    private SqliteStateStore store;
    @Before public void open() { context = RuntimeEnvironment.getApplication(); store = new SqliteStateStore(context); }
    @After public void close() { store.close(); }
    private LocalRepository seed(boolean consent) throws Exception {
        LocalRepository repository = new LocalRepository(store); repository.discoverPublicTarget(ApiClient.ORIGIN, SCOPE);
        if (consent) repository.consentPublicUpload(ApiClient.ORIGIN, SCOPE);
        repository.create("note_entry", "life", "2026-10-26", new JSONObject().put("text", "合成旧库正文🐟"));
        repository.setDraft("empty", ""); return repository;
    }
    private LegacyMigrationCoordinator.Result run(SyncEngineTest.Server server, LegacyMigrationCoordinator.Backup backup) {
        return new LegacyMigrationCoordinator().run(store, backup, () -> new JSONObject().put("origin", ApiClient.ORIGIN)
                .put("scope_id", server.scope).put("public_business", server.publicBusiness),
                repository -> new SyncEngine(repository, new ApiClient(server)).run());
    }

    @Test public void successfulOldSqliteSampleDrainsOnceAndRetainsRawArchiveAndDatabase() throws Exception {
        LocalRepository old = seed(true); String operation = old.nextOperation().getString("op_id");
        byte[] original = store.readRawPayload(); final byte[][] backup = new byte[1][];
        SyncEngineTest.Server server = new SyncEngineTest.Server();
        LegacyMigrationCoordinator.Result result = run(server, raw -> backup[0] = LegacyArchive.encode(raw));
        assertEquals("recovered", result.code); assertEquals(0, result.pending); assertEquals(1, server.puts);
        assertEquals(operation, server.bodies.get(0).getString("save_id"));
        assertArrayEquals(original, LegacyArchive.decode(backup[0]).rawPayload());
        assertTrue(context.getDatabasePath("haoduoyu-offline.db").exists());
        assertFalse(context.getDatabasePath("haoduoyu-offline.legacy.db").exists());
        store.close(); store = new SqliteStateStore(context); assertEquals("", store.read().getJSONObject("drafts").getString("empty"));
        run(server, raw -> { }); assertEquals(1, server.puts);
    }

    @Test public void partialResponseLossKeepsOriginalQueueOrderAndResumesByReceiptWithoutDuplicateWrite() throws Exception {
        LocalRepository old = seed(true);
        old.create("note_entry", "work", "2026-10-26", new JSONObject().put("text", "第二条仍在原队列"));
        String firstId = old.nextOperation().getString("op_id"); byte[] original = store.readRawPayload();
        SyncEngineTest.Server server = new SyncEngineTest.Server(); server.lostReply = true;
        LegacyMigrationCoordinator.Result first = run(server, raw -> assertArrayEquals(original, raw));
        assertEquals("retained", first.code); assertEquals(2, first.pending); assertEquals(1, server.puts);
        JSONObject frozen = store.read().getJSONArray("operations").getJSONObject(0);
        assertEquals(firstId, frozen.getString("op_id")); assertEquals("frozen", frozen.getString("status"));
        String wire = frozen.getJSONObject("wire").toString();
        store.close(); store = new SqliteStateStore(context);
        assertEquals(wire, store.read().getJSONArray("operations").getJSONObject(0).getJSONObject("wire").toString());
        LegacyMigrationCoordinator.Result resumed = run(server, raw -> { });
        assertEquals("recovered", resumed.code); assertEquals(0, resumed.pending); assertEquals(2, server.puts);
        assertEquals(firstId, server.bodies.get(0).getString("save_id"));
        assertEquals("", store.read().getJSONObject("drafts").getString("empty"));
    }

    @Test public void unconsentedOldSqliteSampleMakesNoRequestsAndFailedBackupOrSqlWriteLeavesBytesUnchanged() throws Exception {
        seed(false); byte[] original = store.readRawPayload(); SyncEngineTest.Server server = new SyncEngineTest.Server();
        LegacyMigrationCoordinator.Result noConsent = run(server, raw -> { });
        assertEquals("needs-consent", noConsent.code); assertEquals(0, server.requests); assertArrayEquals(original, store.readRawPayload());
        LocalRepository repository = new LocalRepository(store); repository.consentPublicUpload(ApiClient.ORIGIN, SCOPE);
        original = store.readRawPayload();
        assertEquals("paused", run(server, raw -> { throw new IOException("synthetic backup failure"); }).code);
        assertEquals(0, server.requests); assertArrayEquals(original, store.readRawPayload());
        store.getWritableDatabase().execSQL("CREATE TEMP TRIGGER reject_recovery BEFORE INSERT ON offline_chunks "
                + "BEGIN SELECT RAISE(ABORT,'synthetic full disk'); END");
        assertEquals("paused", run(server, raw -> { }).code);
        assertArrayEquals(original, store.readRawPayload()); assertEquals(0, server.puts);
    }
}
