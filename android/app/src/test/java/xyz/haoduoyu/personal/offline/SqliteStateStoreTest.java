package xyz.haoduoyu.personal.offline;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteException;

import org.json.JSONArray;
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
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;

/** Real AOSP-native SQLite coverage of restart, CursorWindow, integrity and rollback. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
@SQLiteMode(SQLiteMode.Mode.NATIVE)
public final class SqliteStateStoreTest {
    private static final String DATABASE = "haoduoyu-offline.db";
    private static final int CHUNK_BYTES = 256 * 1024;
    private Context context;
    private SqliteStateStore store;

    @Before public void setUp() {
        context = RuntimeEnvironment.getApplication();
        assertFalse("Robolectric must isolate each fixture database", context.getDatabasePath(DATABASE).exists());
        store = new SqliteStateStore(context);
    }

    @After public void close() { if (store != null) store.close(); }

    private static JSONObject largeDocument() throws Exception {
        StringBuilder text = new StringBuilder(2600000);
        while (text.length() < 2600000) text.append("0123456789 \u6c49\u5b57 \ud83d\udc1f /\n");
        return new JSONObject().put("schema", 1).put("account_id", "synthetic-owner")
                .put("payload", text.toString()).put("operations", new JSONArray().put(
                        new JSONObject().put("op_id", "stable-operation").put("status", "frozen")
                                .put("wire", new JSONObject().put("version", 7).put("text", "original request"))));
    }

    private long scalar(String sql) {
        try (Cursor result = store.getReadableDatabase().rawQuery(sql, null)) {
            assertTrue(result.moveToFirst());
            return result.getLong(0);
        }
    }

    private String manifestHash() {
        try (Cursor result = store.getReadableDatabase().rawQuery("SELECT sha256 FROM offline_manifest WHERE id=1", null)) {
            assertTrue(result.moveToFirst());
            return result.getString(0);
        }
    }

    private String journalMode() {
        try (Cursor result = store.getReadableDatabase().rawQuery("PRAGMA journal_mode", null)) {
            assertTrue(result.moveToFirst());
            return result.getString(0);
        }
    }

    private byte[] firstChunk() {
        try (Cursor result = store.getReadableDatabase().rawQuery("SELECT payload FROM offline_chunks WHERE chunk_index=0", null)) {
            assertTrue(result.moveToFirst());
            return result.getBlob(0);
        }
    }

    private void reopen() {
        store.close();
        store = new SqliteStateStore(context);
    }

    @Test public void largeUtf8StateReopensWithoutDependingOnOneGiantCursorRow() throws Exception {
        assertNull(store.read());
        JSONObject expected = largeDocument();
        int length = expected.toString().getBytes(StandardCharsets.UTF_8).length;
        assertTrue(length > 2 * 1024 * 1024);
        store.write(expected);
        assertEquals(length, scalar("SELECT length_bytes FROM offline_manifest WHERE id=1"));
        assertEquals((length + CHUNK_BYTES - 1) / CHUNK_BYTES, scalar("SELECT count(*) FROM offline_chunks"));
        assertTrue(scalar("SELECT max(length(payload)) FROM offline_chunks") <= CHUNK_BYTES);
        assertEquals(2, scalar("PRAGMA synchronous")); // FULL on the single durable connection.
        assertEquals("delete", journalMode());
        assertFalse(store.getReadableDatabase().isWriteAheadLoggingEnabled());
        reopen();
        JSONObject actual = store.read();
        assertEquals(2, scalar("PRAGMA synchronous"));
        assertEquals("delete", journalMode());
        assertEquals(expected.getString("payload"), actual.getString("payload"));
        assertEquals("synthetic-owner", actual.getString("account_id"));
        JSONObject operation = actual.getJSONArray("operations").getJSONObject(0);
        assertEquals("stable-operation", operation.getString("op_id"));
        assertEquals("original request", operation.getJSONObject("wire").getString("text"));
        assertEquals(7, operation.getJSONObject("wire").getInt("version"));
    }

    @Test public void fullSynchronizationIsNotLimitedToTheThreadThatOpenedTheDatabase() throws Exception {
        store.write(new JSONObject().put("draft", "must remain durable across executor changes"));
        ExecutorService reader = Executors.newSingleThreadExecutor();
        try {
            assertEquals(Long.valueOf(2), reader.submit(() -> { return scalar("PRAGMA synchronous"); }).get(10, TimeUnit.SECONDS));
            assertEquals("delete", reader.submit(() -> { return journalMode(); }).get(10, TimeUnit.SECONDS));
            assertEquals("must remain durable across executor changes",
                    reader.submit(() -> { return store.read().getString("draft"); }).get(10, TimeUnit.SECONDS));
        } finally { reader.shutdownNow(); }
        reopen();
        store.write(new JSONObject().put("draft", "second durable commit"));
        assertEquals(2, scalar("PRAGMA synchronous"));
        assertEquals("second durable commit", store.read().getString("draft"));
    }

    @Test public void missingChunkIsRejectedOnRestartAndNeverReinitialized() throws Exception {
        store.write(largeDocument());
        long count = scalar("SELECT count(*) FROM offline_chunks");
        String hash = manifestHash();
        assertEquals(1, store.getWritableDatabase().delete("offline_chunks", "chunk_index=1", null));
        reopen();
        assertThrows(IOException.class, () -> store.read());
        assertTrue(context.getDatabasePath(DATABASE).exists());
        assertEquals(hash, manifestHash());
        assertEquals(count - 1, scalar("SELECT count(*) FROM offline_chunks"));
        assertThrows(IOException.class, () -> new LocalRepository(store));
        assertEquals(count - 1, scalar("SELECT count(*) FROM offline_chunks"));
    }

    @Test public void checksumCorruptionRetainsTheCorruptBytesForRecovery() throws Exception {
        store.write(new JSONObject().put("text", "durable data, not a resettable cache"));
        String originalHash = manifestHash();
        byte[] corrupt = firstChunk();
        corrupt[corrupt.length / 2] ^= 1;
        ContentValues change = new ContentValues(); change.put("payload", corrupt);
        assertEquals(1, store.getWritableDatabase().update("offline_chunks", change, "chunk_index=0", null));
        reopen();
        assertThrows(IOException.class, () -> store.read());
        assertTrue(context.getDatabasePath(DATABASE).exists());
        assertEquals(originalHash, manifestHash());
        assertArrayEquals(corrupt, firstChunk());
    }

    @Test public void orphanedChunksCannotBeMistakenForAnEmptyNewInstall() throws Exception {
        SQLiteDatabase database = store.getWritableDatabase();
        ContentValues chunk = new ContentValues(); chunk.put("chunk_index", 0);
        chunk.put("payload", "{\"draft\":\"still present\"}".getBytes(StandardCharsets.UTF_8));
        database.insertOrThrow("offline_chunks", null, chunk);
        assertThrows(IOException.class, () -> store.read());
        assertEquals(0, scalar("SELECT count(*) FROM offline_manifest"));
        assertEquals(1, scalar("SELECT count(*) FROM offline_chunks"));
    }

    @Test public void malformedUtf8IsRejectedEvenWithAMatchingChecksum() throws Exception {
        store.write(new JSONObject().put("text", "valid"));
        byte[] malformed = new byte[]{'{', '"', 'x', '"', ':', '"', (byte) 0xc3, 0x28, '"', '}'};
        ContentValues bytes = new ContentValues(); bytes.put("payload", malformed);
        store.getWritableDatabase().update("offline_chunks", bytes, "chunk_index=0", null);
        ContentValues header = new ContentValues(); header.put("length_bytes", malformed.length);
        header.put("sha256", hex(MessageDigest.getInstance("SHA-256").digest(malformed)));
        store.getWritableDatabase().update("offline_manifest", header, "id=1", null);
        assertThrows(IOException.class, () -> store.read());
        assertArrayEquals(malformed, firstChunk());
    }

    @Test public void recoveryReadsOriginalVerifiedChunkBytesWithoutJsonNormalization() throws Exception {
        byte[] raw = " \n{\"schema\":1, \"unknown\":null, \"drafts\":{\"empty\":\"\",\"text\":\"中文🐟\"}}\n "
                .getBytes(StandardCharsets.UTF_8);
        SQLiteDatabase database = store.getWritableDatabase();
        ContentValues chunk = new ContentValues(); chunk.put("chunk_index", 0); chunk.put("payload", raw);
        database.insertOrThrow("offline_chunks", null, chunk);
        ContentValues manifest = new ContentValues(); manifest.put("id", 1); manifest.put("length_bytes", raw.length);
        manifest.put("chunk_count", 1); manifest.put("sha256", hex(MessageDigest.getInstance("SHA-256").digest(raw)));
        database.insertOrThrow("offline_manifest", null, manifest);
        String hash = manifestHash();
        assertArrayEquals(raw, store.readRawPayload());
        assertArrayEquals(raw, LegacyArchive.decode(LegacyArchive.encode(store.readRawPayload())).rawPayload());
        assertArrayEquals(raw, firstChunk()); assertEquals(hash, manifestHash());
        assertEquals("", store.read().getJSONObject("drafts").getString("empty"));
    }

    @Test public void midWriteSqlAbortRollsBackDeletedChunksAndManifestTogether() throws Exception {
        JSONObject committed = new JSONObject().put("draft", "committed before failure")
                .put("op_id", "must survive a failed replacement");
        store.write(committed);
        String hash = manifestHash();
        byte[] chunk = firstChunk();
        store.getWritableDatabase().execSQL("CREATE TEMP TRIGGER abort_second_chunk BEFORE INSERT ON offline_chunks "
                + "WHEN NEW.chunk_index=1 BEGIN SELECT RAISE(ABORT,'synthetic disk-write rejection'); END");
        assertThrows(SQLiteException.class, () -> store.write(largeDocument()));
        assertEquals(hash, manifestHash());
        assertArrayEquals(chunk, firstChunk());
        assertEquals(1, scalar("SELECT count(*) FROM offline_chunks"));
        JSONObject actual = store.read();
        assertEquals(committed.getString("draft"), actual.getString("draft"));
        assertEquals(committed.getString("op_id"), actual.getString("op_id"));
        reopen();
        assertEquals(committed.getString("draft"), store.read().getString("draft"));
    }

    @Test public void unreadableSqliteHeaderDoesNotInvokeDestructiveDefaultRecovery() throws Exception {
        store.write(new JSONObject().put("draft", "physical corruption must not erase this file"));
        store.close(); store = null;
        File file = context.getDatabasePath(DATABASE);
        assertTrue(file.exists());
        long originalLength = file.length();
        byte[] brokenHeader = "not a sqlite header - preserve".getBytes(StandardCharsets.US_ASCII);
        try (RandomAccessFile output = new RandomAccessFile(file, "rw")) { output.write(brokenHeader); }
        store = new SqliteStateStore(context);
        assertThrows(SQLiteException.class, () -> store.read());
        assertTrue("Corrupt data must remain available for recovery", file.exists());
        assertEquals(originalLength, file.length());
        byte[] retained = new byte[brokenHeader.length];
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) { input.readFully(retained); }
        assertTrue(Arrays.equals(brokenHeader, retained));
    }

    private static String hex(byte[] bytes) {
        StringBuilder value = new StringBuilder();
        for (byte item : bytes) value.append(String.format(java.util.Locale.ROOT, "%02x", item & 255));
        return value.toString();
    }
}
