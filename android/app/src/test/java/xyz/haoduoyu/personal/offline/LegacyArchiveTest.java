package xyz.haoduoyu.personal.offline;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

public final class LegacyArchiveTest {
    @Rule public final TemporaryFolder temporary = new TemporaryFolder();
    private interface Attempt { void run() throws Exception; }
    private static void rejected(Attempt attempt) throws Exception {
        try { attempt.run(); fail("Expected archive rejection"); }
        catch (java.io.IOException | org.json.JSONException expected) { }
    }
    private static byte[] bytes(String text) { return text.getBytes(StandardCharsets.UTF_8); }
    private static byte[] archive(JSONObject json) { return bytes(json.toString()); }

    @Test public void rawMultiChunkPayloadRetainsUnknownFieldsWhitespaceEmojiEmptyDraftsAndFrozenWire() throws Exception {
        StringBuilder text = new StringBuilder(); for (int i = 0; i < 50000; i++) text.append("中文🐟\n");
        String raw = " \n{\"schema\":1,\"future\":{\"null\":null,\"unknown\":[3,2,1]},\"drafts\":{\"empty\":\"\"},"
                + "\"entities\":{\"old\":{\"local\":{\"text\":" + JSONObject.quote(text.toString()) + ",\"deleted_at\":null}}},"
                + "\"operations\":[{\"op_id\":\"one\",\"wire\":{\"body\":{\"save_id\":\"stable\",\"text\":\"原文\"}}},"
                + "{\"op_id\":\"two\"}],\"conflicts\":[{\"resolved\":true},{\"resolved\":false}],"
                + "\"ui\":{\"position\":\"12\"},\"workspace\":{\"upload_consented\":false},\"retry\":99}\n ";
        byte[] original = bytes(raw); assertTrue(original.length > 262144);
        LegacyArchive decoded = LegacyArchive.decode(LegacyArchive.encode(original));
        assertArrayEquals(original, decoded.rawPayload()); assertEquals(LegacyArchive.sha256(original), decoded.payloadHash);
        JSONObject state = decoded.state(); assertTrue(state.getJSONObject("drafts").has("empty"));
        assertEquals("", state.getJSONObject("drafts").getString("empty")); assertTrue(state.getJSONObject("future").isNull("null"));
        assertEquals("one", state.getJSONArray("operations").getJSONObject(0).getString("op_id"));
        assertEquals("two", state.getJSONArray("operations").getJSONObject(1).getString("op_id"));
        assertEquals("stable", state.getJSONArray("operations").getJSONObject(0).getJSONObject("wire").getJSONObject("body").getString("save_id"));
        assertTrue(decoded.textExport().endsWith(raw));
        byte[] detached = decoded.rawPayload(); detached[0] = '!'; assertArrayEquals(original, decoded.rawPayload());
    }

    @Test public void corruptionTruncationWrongVersionsAndUnsupportedSourcesCannotBecomeAnArchive() throws Exception {
        byte[] valid = LegacyArchive.encode(bytes("{\"schema\":1,\"unknown\":null}"));
        rejected(() -> LegacyArchive.decode(Arrays.copyOf(valid, valid.length - 1)));
        JSONObject changed = new JSONObject(new String(valid, StandardCharsets.UTF_8)); changed.put("format_version", 2);
        rejected(() -> LegacyArchive.decode(archive(changed)));
        changed.put("format_version", 1).getJSONObject("source").put("state_schema", 2);
        rejected(() -> LegacyArchive.decode(archive(changed)));
        JSONObject hash = new JSONObject(new String(valid, StandardCharsets.UTF_8)); hash.getJSONObject("payload").put("sha256", new String(new char[64]).replace('\0', '0'));
        rejected(() -> LegacyArchive.decode(archive(hash)));
        JSONObject source = new JSONObject(new String(valid, StandardCharsets.UTF_8)); source.getJSONObject("source").put("package", "other.app");
        rejected(() -> LegacyArchive.decode(archive(source)));
        rejected(() -> LegacyArchive.encode(bytes("{\"schema\":2}")));
        rejected(() -> LegacyArchive.encode(bytes("{\"schema\":1} trailing")));
        rejected(() -> LegacyArchive.encode(new byte[]{(byte) 0xc3, 0x28}));
    }

    @Test public void sizesAndCanonicalBase64AreValidatedBeforeAcceptingPayload() throws Exception {
        byte[] valid = LegacyArchive.encode(bytes("{\"schema\":1}"));
        JSONObject length = new JSONObject(new String(valid, StandardCharsets.UTF_8));
        length.getJSONObject("payload").put("length_bytes", (long) LegacyArchive.MAX_PAYLOAD_BYTES + 1);
        rejected(() -> LegacyArchive.decode(archive(length)));
        JSONObject truncated = new JSONObject(new String(valid, StandardCharsets.UTF_8));
        String encoded = truncated.getJSONObject("payload").getString("base64");
        truncated.getJSONObject("payload").put("base64", encoded.substring(1));
        rejected(() -> LegacyArchive.decode(archive(truncated)));
        rejected(() -> LegacyArchive.encode(new byte[LegacyArchive.MAX_PAYLOAD_BYTES + 1]));
        rejected(() -> LegacyArchive.decode(new byte[LegacyArchive.MAX_ARCHIVE_BYTES + 1]));
        byte[] read = LegacyArchive.readBounded(new ByteArrayInputStream(valid)); assertArrayEquals(valid, read);
    }

    @Test public void originalBackupIsVerifiedDurableAndReusedAcrossAcknowledgementOnlyPasses() throws Exception {
        File directory = temporary.newFolder(); AtomicInteger syncs = new AtomicInteger();
        LegacyArchiveFiles files = new LegacyArchiveFiles(directory, ignored -> syncs.incrementAndGet());
        JSONObject state = new JSONObject().put("schema", 1).put("workspace", new JSONObject().put("upload_consented", true))
                .put("operations", new JSONArray().put(new JSONObject().put("op_id", "one").put("payload", new JSONObject().put("text", "保留"))))
                .put("drafts", new JSONObject().put("empty", ""));
        byte[] original = bytes(state.toString()); files.ensure(original); assertTrue(syncs.get() >= 2);
        String[] initial = directory.list((dir, name) -> name.startsWith("recovery-")); assertEquals(1, initial.length);
        assertArrayEquals(original, LegacyArchive.decode(Files.readAllBytes(new File(directory, initial[0]).toPath())).rawPayload());
        state.put("operations", new JSONArray()); files.ensure(bytes(state.toString()));
        assertEquals(1, directory.list((dir, name) -> name.startsWith("recovery-")).length);
        state.getJSONObject("drafts").put("new", "后来的草稿"); files.ensure(bytes(state.toString()));
        assertEquals(2, directory.list((dir, name) -> name.startsWith("recovery-")).length);
    }

    @Test public void duplicateImportIsReadOnlyIdempotentAndNeverCreatesAnExecutableCheckpoint() throws Exception {
        File directory = temporary.newFolder(); LegacyArchiveFiles files = new LegacyArchiveFiles(directory, ignored -> { });
        byte[] archive = LegacyArchive.encode(bytes("{\"schema\":1,\"workspace\":{\"upload_consented\":true}}"));
        File first = files.importReadOnly(archive); assertEquals(first, files.importReadOnly(archive));
        assertArrayEquals(archive, Files.readAllBytes(first.toPath())); assertFalse(new File(directory, "checkpoint.json").exists());
        JSONObject altered = new JSONObject(new String(archive, StandardCharsets.UTF_8)); altered.put("unexpected_metadata", "changed");
        rejected(() -> files.importReadOnly(archive(altered))); assertArrayEquals(archive, Files.readAllBytes(first.toPath()));
    }

    @Test public void failedDirectoryDurabilityDoesNotClaimAUsableBackup() throws Exception {
        File directory = temporary.newFolder(); LegacyArchiveFiles files = new LegacyArchiveFiles(directory,
                ignored -> { throw new java.io.IOException("synthetic directory fsync failure"); });
        rejected(() -> files.ensure(bytes("{\"schema\":1,\"operations\":[],\"drafts\":{}}")));
        assertFalse(new File(directory, "checkpoint.json").exists());
    }
}
