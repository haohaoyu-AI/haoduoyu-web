package xyz.haoduoyu.personal.offline;

import org.json.JSONObject;
import org.junit.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

public final class LegacyMigrationCoordinatorTest {
    private static final String SCOPE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final class Source implements LegacyMigrationCoordinator.Source {
        byte[] raw; int writes; boolean fail;
        @Override public byte[] readRawPayload() { return raw == null ? null : raw.clone(); }
        @Override public JSONObject read() throws Exception { return raw == null ? null : LegacyArchive.state(raw); }
        @Override public void write(JSONObject value) throws Exception {
            if (fail) throw new IOException("synthetic full disk");
            writes++; raw = value.toString().getBytes(StandardCharsets.UTF_8);
        }
    }
    private static Source source(boolean consent) throws Exception {
        Source source = new Source(); LocalRepository repository = new LocalRepository(source);
        repository.discoverPublicTarget(ApiClient.ORIGIN, SCOPE);
        if (consent) repository.consentPublicUpload(ApiClient.ORIGIN, SCOPE);
        repository.create("note_entry", "life", "2026-10-26", new JSONObject().put("text", "私密合成原文🐟"));
        repository.setDraft("empty", ""); source.writes = 0; return source;
    }
    private static JSONObject target() throws Exception {
        return new JSONObject().put("origin", ApiClient.ORIGIN).put("scope_id", SCOPE).put("public_business", true);
    }
    private static void acknowledge(LocalRepository repository) throws Exception {
        JSONObject operation = repository.nextOperation(), state = repository.snapshot(), workspace = state.getJSONObject("workspace");
        String id = operation.getString("op_id");
        repository.freezeOperation(id, new JSONObject().put("identity_mode", "public").put("origin", ApiClient.ORIGIN)
                .put("scope_id", SCOPE).put("account_id", workspace.getString("account_id")));
        repository.acknowledge(id, JsonUtil.copy(operation.getJSONObject("payload")).put("version", 1));
    }

    @Test public void absentLegacyStateDoesNotInitializeDatabaseOrMakeRequests() {
        Source source = new Source(); AtomicInteger called = new AtomicInteger();
        LegacyMigrationCoordinator.Result result = new LegacyMigrationCoordinator().run(source,
                raw -> called.incrementAndGet(), () -> { called.incrementAndGet(); return target(); }, repository -> called.incrementAndGet());
        assertEquals("empty", result.code); assertEquals(0, source.writes); assertEquals(0, called.get());
    }

    @Test public void missingConsentMakesNoNetworkOrSourceWritesAndPreservesEmptyDraft() throws Exception {
        Source source = source(false); byte[] original = source.raw.clone(); AtomicInteger network = new AtomicInteger(), backup = new AtomicInteger();
        LegacyMigrationCoordinator.Result result = new LegacyMigrationCoordinator().run(source,
                raw -> { assertArrayEquals(original, raw); backup.incrementAndGet(); },
                () -> { network.incrementAndGet(); return target(); }, repository -> network.incrementAndGet());
        assertEquals("needs-consent", result.code); assertTrue(result.needsConsent); assertEquals(1, backup.get());
        assertEquals(0, network.get()); assertEquals(0, source.writes); assertArrayEquals(original, source.raw);
        assertEquals(1, result.pending); assertEquals(1, result.drafts); assertTrue(source.read().getJSONObject("drafts").has("empty"));
    }

    @Test public void differentRemoteScopeOrPrivateIdentityCannotUseAnOldPublicConsent() throws Exception {
        Source source = source(true); byte[] original = source.raw.clone(); AtomicInteger drain = new AtomicInteger();
        LegacyMigrationCoordinator coordinator = new LegacyMigrationCoordinator();
        LegacyMigrationCoordinator.Result scoped = coordinator.run(source, raw -> { },
                () -> target().put("scope_id", "changed"), repository -> drain.incrementAndGet());
        assertEquals("target-paused", scoped.code); assertEquals(0, drain.get()); assertEquals(0, source.writes);
        LegacyMigrationCoordinator.Result privateAccount = coordinator.run(source, raw -> { },
                () -> target().put("public_business", false), repository -> drain.incrementAndGet());
        assertEquals("target-paused", privateAccount.code); assertEquals(0, drain.get()); assertArrayEquals(original, source.raw);
    }

    @Test public void oldUnknownFrozenWireIsRetainedWithoutRewritingOrSendingIt() throws Exception {
        Source source = source(true); JSONObject state = source.read();
        state.getJSONArray("operations").getJSONObject(0).put("status", "frozen").put("wire",
                new JSONObject().put("identity_mode", "private").put("body", new JSONObject().put("save_id", "original")));
        source.raw = state.toString().getBytes(StandardCharsets.UTF_8); byte[] original = source.raw.clone();
        AtomicInteger requests = new AtomicInteger(); LegacyMigrationCoordinator.Result result = new LegacyMigrationCoordinator().run(source,
                raw -> { }, () -> { requests.incrementAndGet(); return target(); }, repository -> requests.incrementAndGet());
        assertEquals("identity-paused", result.code); assertEquals(0, requests.get()); assertEquals(0, source.writes); assertArrayEquals(original, source.raw);
    }

    @Test public void verifiedSameTargetDrainsOnlyThroughTheOldRepositoryAndKeepsAnExactPriorBackup() throws Exception {
        Source source = source(true); byte[] original = source.raw.clone(); final byte[][] backup = new byte[1][];
        LegacyMigrationCoordinator.Result result = new LegacyMigrationCoordinator().run(source, raw -> backup[0] = raw.clone(),
                LegacyMigrationCoordinatorTest::target, LegacyMigrationCoordinatorTest::acknowledge);
        assertEquals("recovered", result.code); assertEquals(0, result.pending); assertTrue(source.writes > 0);
        assertArrayEquals(original, backup[0]); assertEquals("", source.read().getJSONObject("drafts").getString("empty"));
        assertEquals(0, source.read().getJSONArray("operations").length());
    }

    @Test public void failedBackupOrStoreWritePreservesTheOriginalStateAndDoesNotClaimCompletion() throws Exception {
        Source source = source(true); byte[] original = source.raw.clone(); AtomicInteger drains = new AtomicInteger();
        LegacyMigrationCoordinator coordinator = new LegacyMigrationCoordinator();
        LegacyMigrationCoordinator.Result backupFailure = coordinator.run(source, raw -> { throw new IOException("backup failed"); },
                LegacyMigrationCoordinatorTest::target, repository -> drains.incrementAndGet());
        assertEquals("paused", backupFailure.code); assertEquals(0, drains.get()); assertEquals(0, source.writes); assertArrayEquals(original, source.raw);
        source.fail = true;
        LegacyMigrationCoordinator.Result writeFailure = coordinator.run(source, raw -> { }, LegacyMigrationCoordinatorTest::target,
                LegacyMigrationCoordinatorTest::acknowledge);
        assertEquals("paused", writeFailure.code); assertEquals(0, source.writes); assertArrayEquals(original, source.raw);
    }

    @Test public void concurrentOrReentrantOwnersCannotCreateASecondDrain() throws Exception {
        Source source = source(true); LegacyMigrationCoordinator coordinator = new LegacyMigrationCoordinator();
        AtomicInteger drains = new AtomicInteger(); LegacyMigrationCoordinator.Result outer = coordinator.run(source, raw -> { },
                LegacyMigrationCoordinatorTest::target, repository -> {
                    drains.incrementAndGet(); LegacyMigrationCoordinator.Result duplicate = coordinator.run(source, raw -> { },
                            LegacyMigrationCoordinatorTest::target, other -> drains.incrementAndGet());
                    assertEquals("busy", duplicate.code);
                });
        assertEquals("retained", outer.code); assertEquals(1, drains.get()); assertEquals(0, source.writes);
    }

    @Test public void aSourceChangeBetweenBackupAndWriteIsNeverOverwrittenByTheOldSnapshot() throws Exception {
        Source source = source(true); final byte[][] changed = new byte[1][];
        LegacyMigrationCoordinator.Result result = new LegacyMigrationCoordinator().run(source, raw -> { }, () -> {
            JSONObject state = source.read(); state.getJSONObject("drafts").put("new", "同时出现的私密草稿");
            source.raw = state.toString().getBytes(StandardCharsets.UTF_8); changed[0] = source.raw.clone(); return target();
        }, LegacyMigrationCoordinatorTest::acknowledge);
        assertEquals("paused", result.code); assertEquals(0, source.writes); assertArrayEquals(changed[0], source.raw);
    }
}
