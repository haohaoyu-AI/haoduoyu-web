package xyz.haoduoyu.personal.offline;

import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.ArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

public final class LegacyRestoredDraftTest {
    @Rule public final TemporaryFolder temporary = new TemporaryFolder();
    private interface Attempt { void run() throws Exception; }
    private static void rejected(Attempt attempt) throws Exception {
        try { attempt.run(); fail("Expected recovery rejection"); }
        catch (IOException | org.json.JSONException expected) { }
    }
    private static byte[] bytes(JSONObject value) { return value.toString().getBytes(StandardCharsets.UTF_8); }
    private static byte[] signed(JSONObject value) throws Exception {
        value.remove("record_sha256"); value.put("record_sha256", JsonUtil.sha256(value)); return bytes(value);
    }

    @Test public void fullUtf8DraftAndRecoveryOnlyMetadataRoundTripWithoutChangingItsBody() throws Exception {
        Instant before = Instant.now(); String body = "  中文🐟\r\n第二行\u0000\n";
        LegacyRestoredDraft record = LegacyRestoredDraft.capture("memo", "2026-10-24", body);
        Instant after = Instant.now(), recovered = Instant.parse(record.recoveredAt);
        assertFalse(recovered.isBefore(before)); assertFalse(recovered.isAfter(after));
        LegacyRestoredDraft loaded = LegacyRestoredDraft.decode(record.encode());
        assertEquals(record.recoveryId, loaded.recoveryId); assertEquals(record.recoveredAt, loaded.recoveredAt);
        assertEquals("memo", loaded.tab()); assertEquals("2026-10-24", loaded.date());
        assertArrayEquals(body.getBytes(StandardCharsets.UTF_8), loaded.draft().getBytes(StandardCharsets.UTF_8));
        assertTrue(loaded.textExport().contains("不是原记录发生时间")); assertTrue(loaded.textExport().endsWith(body));
    }

    @Test public void presentNullEmptyAndNullSlotMetadataRemainDistinctSemanticRecords() throws Exception {
        LegacyRestoredDraft empty = LegacyRestoredDraft.capture(null, null, ""), nil = LegacyRestoredDraft.capture(null, null, null);
        LegacyRestoredDraft emptySlot = LegacyRestoredDraft.capture("", "", "");
        assertNotEquals(empty.recoveryId, nil.recoveryId); assertNotEquals(empty.recoveryId, emptySlot.recoveryId);
        assertEquals("", LegacyRestoredDraft.decode(empty.encode()).draft()); assertNull(LegacyRestoredDraft.decode(nil.encode()).draft());
        assertNull(LegacyRestoredDraft.decode(nil.encode()).tab()); assertEquals("", LegacyRestoredDraft.decode(emptySlot.encode()).tab());
        assertTrue(empty.textExport().contains("\"draft_value_type\": \"string\""));
        assertTrue(nil.textExport().contains("\"draft_value_type\": \"null\""));
    }

    @Test public void splitImeSurrogatesPreserveEveryOriginalUtf16CodeUnitAndHaveALosslessTextEncoding() throws Exception {
        String draft = "半个emoji:\ud83d;另半:\udc1f;完整🐟", tab = "work\ud800";
        LegacyRestoredDraft record = LegacyRestoredDraft.capture(tab, null, draft);
        LegacyRestoredDraft loaded = LegacyRestoredDraft.decode(record.encode());
        assertArrayEquals(draft.toCharArray(), loaded.draft().toCharArray()); assertArrayEquals(tab.toCharArray(), loaded.tab().toCharArray());
        String text = loaded.textExport();
        assertTrue(text.contains("\\ud83d")); assertTrue(text.contains("\\udc1f")); assertTrue(text.contains("完整🐟"));
        assertTrue(text.contains("utf16le-base64")); assertTrue(text.contains("完整原值保存在 payload 编码中"));
        StandardCharsets.UTF_8.newEncoder().onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).encode(java.nio.CharBuffer.wrap(text));
    }

    @Test public void sameSlotDifferentBodiesStayIndependentAndRepeatedPayloadKeepsItsFirstRecoveryTime() throws Exception {
        File directory = temporary.newFolder(); AtomicInteger syncs = new AtomicInteger();
        LegacyRestoredDraftFiles files = new LegacyRestoredDraftFiles(directory, ignored -> syncs.incrementAndGet());
        LegacyRestoredDraft first = files.save(LegacyRestoredDraft.capture("life", "2026-10-24", "第一份"));
        byte[] original = Files.readAllBytes(new File(directory, "restored-" + first.recoveryId + ".json").toPath());
        JSONObject later = new JSONObject(new String(first.encode(), StandardCharsets.UTF_8));
        later.put("recovered_at", Instant.parse(first.recoveredAt).plusSeconds(1).toString());
        LegacyRestoredDraft repeated = files.save(LegacyRestoredDraft.decode(signed(later)));
        assertEquals(first.recoveredAt, repeated.recoveredAt); assertArrayEquals(original, repeated.encode());
        LegacyRestoredDraft second = files.save(LegacyRestoredDraft.capture("life", "2026-10-24", "第二份"));
        assertNotEquals(first.recoveryId, second.recoveryId); List<LegacyRestoredDraft> all = files.list();
        assertEquals(2, all.size());
        if (first.recoveredAt.equals(second.recoveredAt)) assertTrue(all.get(0).recoveryId.compareTo(all.get(1).recoveryId) < 0);
        else { assertEquals(first.recoveryId, all.get(0).recoveryId); assertEquals(second.recoveryId, all.get(1).recoveryId); }
        assertTrue(syncs.get() >= 3); assertEquals(2, directory.list().length);
        assertFalse(new File(directory, "haoduoyu-offline.db").exists());
    }

    @Test public void corruptTruncatedWrongVersionInvalidUtf8AndChangedMetadataAreRejected() throws Exception {
        byte[] valid = LegacyRestoredDraft.capture("work", "2026-10-24", "保留🐟").encode();
        rejected(() -> LegacyRestoredDraft.decode(Arrays.copyOf(valid, valid.length - 1)));
        rejected(() -> LegacyRestoredDraft.decode(new byte[]{(byte) 0xc3, 0x28}));
        JSONObject wrong = new JSONObject(new String(valid, StandardCharsets.UTF_8)); wrong.put("format_version", 2);
        rejected(() -> LegacyRestoredDraft.decode(bytes(wrong)));
        JSONObject changed = new JSONObject(new String(valid, StandardCharsets.UTF_8)); changed.put("recovered_at", "2020-01-01T00:00:00Z");
        rejected(() -> LegacyRestoredDraft.decode(bytes(changed)));
        JSONObject damaged = new JSONObject(new String(valid, StandardCharsets.UTF_8)); damaged.getJSONObject("payload").put("base64", "AAAA");
        rejected(() -> LegacyRestoredDraft.decode(signed(damaged)));
        JSONObject large = new JSONObject(new String(valid, StandardCharsets.UTF_8));
        large.getJSONObject("payload").put("length_bytes", (long) LegacyRestoredDraft.MAX_PAYLOAD_BYTES + 1);
        rejected(() -> LegacyRestoredDraft.decode(signed(large)));
        rejected(() -> LegacyRestoredDraft.decode(new byte[LegacyRestoredDraft.MAX_RECORD_BYTES + 1]));
    }

    @Test public void aFailedDirectorySyncCannotBeAcknowledgedByAnExistingFileShortcut() throws Exception {
        File directory = temporary.newFolder(); AtomicInteger syncs = new AtomicInteger(); AtomicBoolean failing = new AtomicBoolean(true);
        LegacyRestoredDraftFiles files = new LegacyRestoredDraftFiles(directory, ignored -> {
            if (ignored.equals(directory)) { syncs.incrementAndGet(); if (failing.get()) throw new IOException("synthetic directory fsync failure"); }
        });
        LegacyRestoredDraft original = LegacyRestoredDraft.capture("memo", null, "只读保留");
        rejected(() -> files.save(original)); assertEquals(1, directory.list().length);
        rejected(() -> files.save(LegacyRestoredDraft.capture("memo", null, "只读保留"))); assertEquals(2, syncs.get());
        failing.set(false); LegacyRestoredDraft retained = files.save(LegacyRestoredDraft.capture("memo", null, "只读保留"));
        assertEquals(3, syncs.get()); assertEquals(original.recoveredAt, retained.recoveredAt); assertEquals(1, files.list().size());

        File ancestor = new File(temporary.getRoot(), "new-root"), middle = new File(ancestor, "child"), leaf = new File(middle, "restored");
        AtomicBoolean parentFailure = new AtomicBoolean(true); List<File> synced = new ArrayList<>();
        LegacyArchiveFiles.DirectorySync sync = current -> {
            synced.add(current);
            if (current.equals(ancestor) && parentFailure.getAndSet(false)) throw new IOException("synthetic ancestor entry fsync failure");
        };
        rejected(() -> new LegacyRestoredDraftFiles(leaf, sync).save(original));
        assertTrue(middle.isDirectory()); assertFalse(leaf.exists());
        int previous = synced.size(); new LegacyRestoredDraftFiles(leaf, sync).save(original);
        assertTrue(synced.subList(previous, synced.size()).contains(ancestor));
        assertTrue(synced.subList(previous, synced.size()).contains(middle));
        assertTrue(synced.subList(previous, synced.size()).contains(leaf));
    }

    @Test public void readbackAndListingRejectCorruptionWithoutReplacingTheFileOrCreatingADatabase() throws Exception {
        File directory = temporary.newFolder(); LegacyRestoredDraft record = LegacyRestoredDraft.capture("life", null, "完整正文");
        File target = new File(directory, "restored-" + record.recoveryId + ".json");
        LegacyRestoredDraftFiles sabotaged = new LegacyRestoredDraftFiles(directory, current -> {
            if (current.equals(directory)) Files.write(target.toPath(), new byte[]{'{'});
        });
        rejected(() -> sabotaged.save(record)); byte[] damaged = Files.readAllBytes(target.toPath());
        LegacyRestoredDraftFiles files = new LegacyRestoredDraftFiles(directory, ignored -> { });
        rejected(files::list); rejected(() -> files.save(record)); assertArrayEquals(damaged, Files.readAllBytes(target.toPath()));
        assertFalse(new File(directory, "haoduoyu-offline.db").exists());
        File absent = new File(temporary.getRoot(), "not-created");
        assertTrue(new LegacyRestoredDraftFiles(absent, ignored -> { }).list().isEmpty()); assertFalse(absent.exists());
    }
}
