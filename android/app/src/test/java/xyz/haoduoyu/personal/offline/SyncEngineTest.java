package xyz.haoduoyu.personal.offline;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.*;

public final class SyncEngineTest {
    private static final String ACCOUNT = ApiClient.PUBLIC_BUSINESS_ID;
    private static final String SCOPE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String DATE = "2026-10-26";
    private static final String STAMP = "2026-10-26T10:00:00.000Z";
    private static final String NOTE = "20000000-0000-4000-8000-000000000001";

    private static class Memory implements LocalRepository.Store {
        JSONObject state;
        public JSONObject read() throws Exception { return state == null ? null : cloneObject(state); }
        public void write(JSONObject value) throws Exception { state = cloneObject(value); }
    }

    private static JSONObject cloneObject(JSONObject value) throws Exception { return new JSONObject(value.toString()); }
    private static JSONObject content(String text) throws Exception { return new JSONObject().put("text", text); }
    private static JSONObject data(Object value) throws Exception { return new JSONObject().put("data", value); }
    private static String last(String path) { return path.substring(path.lastIndexOf('/') + 1); }
    private static LocalRepository repository(Memory memory) throws Exception {
        LocalRepository repository = new LocalRepository(memory);
        repository.discoverPublicTarget(ApiClient.ORIGIN, SCOPE);
        repository.consentPublicUpload(ApiClient.ORIGIN, SCOPE);
        return repository;
    }

    private static JSONObject note(String id, String date, String text, int version) throws Exception {
        JSONObject row = new JSONObject().put("entity_id", "note-entry:" + id).put("entity_type", "life_note")
                .put("source", "note_entry").put("source_id", id).put("category", "life").put("date", date)
                .put("text", text).put("version", version).put("change_seq", version)
                .put("created_at", STAMP).put("updated_at", STAMP).put("deleted_at", JSONObject.NULL);
        return hashed(row);
    }
    private static JSONObject todo(String id, String text, int version, boolean complete) throws Exception {
        return hashed(new JSONObject().put("entity_id", "todo:" + id).put("entity_type", "todo")
                .put("source", "todo").put("source_id", id).put("date", DATE).put("text", text)
                .put("completed", complete ? 1 : 0).put("version", version)
                .put("created_at", STAMP).put("updated_at", STAMP).put("deleted_at", JSONObject.NULL));
    }
    private static JSONObject hashed(JSONObject row) throws Exception {
        row.remove("content_hash");
        return row.put("content_hash", SyncEngine.hash(row));
    }

    private static final class Server implements ApiClient.Transport {
        final Map<String, JSONObject> rows = new LinkedHashMap<>();
        final Map<String, JSONObject> receipts = new HashMap<>();
        final List<JSONObject> bodies = new ArrayList<>();
        int puts, posts, patches, deletes, requests, indexReads;
        boolean lostReply, failBeforeApply, laterWebEdit, rejectWrites, corruptBody, articlesUnavailable;
        boolean changeAtThirdIndex;
        String scope = SCOPE;
        String currentAccount = ACCOUNT;
        boolean publicBusiness = true;

        @Override public ApiClient.Response send(String method, String path, JSONObject body) throws Exception {
            requests++;
            if (path.endsWith("/auth/me")) return ok(new JSONObject().put("id", currentAccount)
                    .put("username", "公开编辑").put("publicBusiness", publicBusiness));
            if (path.endsWith("/workbench-snapshot/index")) {
                indexReads++;
                if (changeAtThirdIndex && indexReads == 3) rows.put("note-entry:" + NOTE, note(NOTE, DATE, "web version", 2));
                return ok(index());
            }
            if (path.contains("/workbench-snapshot?date=")) {
                JSONObject result = day(path.substring(path.indexOf("date=") + 5));
                if (corruptBody && result.getJSONObject("data").getJSONArray("life_notes").length() > 0)
                    result.getJSONObject("data").getJSONArray("life_notes").getJSONObject(0).put("text", "tampered");
                return ok(result);
            }
            if (path.contains("/note-entries/operations/")) return ok(receipts.containsKey(last(path))
                    ? cloneObject(receipts.get(last(path))).put("found", true) : new JSONObject().put("found", false));
            if ("PUT".equals(method) && path.contains("/note-entries/")) {
                puts++; bodies.add(cloneObject(body));
                if (rejectWrites) return error(403, "FORBIDDEN");
                if (failBeforeApply) { failBeforeApply = false; throw new IOException("network before commit"); }
                String id = last(path), key = "note-entry:" + id;
                JSONObject old = rows.get(key);
                int version = old == null ? 0 : old.getInt("version");
                if (body.getInt("version") != version) return error(409, "VERSION_CONFLICT");
                JSONObject row = note(id, body.getString("date"), body.getString("text"), version + 1);
                rows.put(key, row);
                receipts.put(body.getString("save_id"), new JSONObject().put("id", id).put("version", version + 1)
                        .put("deleted_at", JSONObject.NULL).put("change_seq", version + 1).put("content_hash", "raw-row-hash"));
                if (lostReply) {
                    lostReply = false;
                    if (laterWebEdit) rows.put(key, note(id, body.getString("date"), "newer web text", version + 2));
                    throw new IOException("reply lost after commit");
                }
                return ok(new JSONObject().put("id", id).put("version", version + 1));
            }
            if ("DELETE".equals(method) && path.contains("/note-entries/")) {
                deletes++; bodies.add(cloneObject(body));
                String id = last(path), key = "note-entry:" + id;
                JSONObject current = rows.get(key);
                if (current == null) return error(404, "NOT_FOUND");
                if (body.getInt("version") != current.getInt("version")) return error(409, "VERSION_CONFLICT");
                JSONObject deleted = cloneObject(current).put("version", current.getInt("version") + 1)
                        .put("change_seq", current.getInt("version") + 1).put("deleted_at", STAMP);
                deleted.remove("text"); rows.put(key, hashed(deleted));
                receipts.put(body.getString("save_id"), new JSONObject().put("id", id)
                        .put("version", deleted.getInt("version")).put("deleted_at", STAMP)
                        .put("change_seq", deleted.getInt("version")).put("content_hash", "raw-deleted-row-hash"));
                if (lostReply) { lostReply = false; throw new IOException("lost delete reply after commit"); }
                return ok(new JSONObject().put("id", id).put("version", deleted.getInt("version")));
            }
            if ("POST".equals(method) && path.endsWith("/todos")) {
                posts++; bodies.add(cloneObject(body));
                String id = body.getString("id"), key = "todo:" + id;
                JSONObject row = rows.get(key);
                if (row == null) { row = todo(id, body.getString("text"), 1, false); rows.put(key, row); }
                if (lostReply) { lostReply = false; throw new IOException("lost todo create response"); }
                return ok(new JSONObject().put("version", row.getInt("version")));
            }
            if ("PATCH".equals(method) && path.contains("/todos/")) {
                patches++; bodies.add(cloneObject(body));
                String id = last(path), key = "todo:" + id;
                JSONObject row = rows.get(key);
                if (row == null || row.getInt("version") != body.getInt("version")) return error(409, "VERSION_CONFLICT");
                row = todo(id, row.getString("text"), row.getInt("version") + 1, body.getBoolean("completed"));
                rows.put(key, row);
                if (lostReply) {
                    lostReply = false;
                    if (laterWebEdit) rows.put(key, todo(id, row.getString("text"), row.getInt("version") + 1, false));
                    throw new IOException("lost todo complete response");
                }
                return ok(new JSONObject().put("version", row.getInt("version")));
            }
            if (path.endsWith("/articles")) {
                if (articlesUnavailable) return error(503, "UNAVAILABLE");
                return new ApiClient.Response(200, data(new JSONArray()).put("meta",
                        new JSONObject().put("pagination", "legacy").put("has_more", false)));
            }
            return error(404, "NOT_FOUND");
        }

        ApiClient.Response ok(JSONObject value) throws Exception { return new ApiClient.Response(200, data(value)); }
        ApiClient.Response error(int code, String name) throws Exception {
            return new ApiClient.Response(code, new JSONObject().put("error", new JSONObject().put("code", name).put("message", name)));
        }
        JSONArray descriptors() throws Exception {
            JSONArray values = new JSONArray();
            List<String> keys = new ArrayList<>(rows.keySet()); Collections.sort(keys);
            for (String key : keys) {
                JSONObject projection = new JSONObject(), row = rows.get(key);
                for (String field : new String[]{"entity_id", "entity_type", "date", "updated_at", "deleted_at", "content_hash"}) projection.put(field, row.get(field));
                values.put(projection);
            }
            return values;
        }
        JSONObject envelope() throws Exception {
            JSONArray all = descriptors(), global = new JSONArray();
            for (int i = 0; i < all.length(); i++) if (all.getJSONObject(i).isNull("date")) global.put(all.getJSONObject(i));
            String manifest = SyncEngine.hash(new JSONObject().put("snapshot_format", SyncEngine.FORMAT).put("scope_id", scope).put("entities", all));
            return new JSONObject().put("snapshot_format", SyncEngine.FORMAT).put("projection", "current").put("complete", true)
                    .put("scope_id", scope).put("timezone", "Asia/Shanghai").put("generated_at", STAMP)
                    .put("entities", all).put("manifest_hash", manifest)
                    .put("global_content_hash", SyncEngine.hash(new JSONObject().put("scope_id", scope).put("entities", global)));
        }
        JSONObject index() throws Exception {
            JSONObject value = envelope();
            Map<String, JSONArray> byDate = new java.util.TreeMap<>();
            JSONArray all = value.getJSONArray("entities");
            for (int i = 0; i < all.length(); i++) {
                JSONObject entry = all.getJSONObject(i);
                if (entry.isNull("date")) continue;
                String date = entry.getString("date");
                if (!byDate.containsKey(date)) byDate.put(date, new JSONArray());
                byDate.get(date).put(entry);
            }
            JSONArray dates = new JSONArray();
            for (Map.Entry<String, JSONArray> entry : byDate.entrySet()) dates.put(new JSONObject().put("date", entry.getKey())
                    .put("content_hash", SyncEngine.hash(new JSONObject().put("scope_id", scope).put("entities", entry.getValue()))));
            return value.put("dates", dates).put("index_hash", value.getString("manifest_hash"));
        }
        JSONObject day(String date) throws Exception {
            JSONObject value = envelope(), payload = new JSONObject();
            for (String collection : SyncEngine.COLLECTIONS) payload.put(collection, new JSONArray());
            JSONArray selected = new JSONArray(), descriptors = value.getJSONArray("entities");
            List<String> keys = new ArrayList<>(rows.keySet()); Collections.sort(keys);
            for (String key : keys) {
                JSONObject row = rows.get(key);
                if (!row.isNull("date") && !date.equals(row.getString("date"))) continue;
                String collection = "todo".equals(row.getString("source")) ? "todos" : "life_notes";
                payload.getJSONArray(collection).put(cloneObject(row));
            }
            for (int i = 0; i < descriptors.length(); i++) if (date.equals(descriptors.getJSONObject(i).optString("date"))) selected.put(descriptors.getJSONObject(i));
            return value.put("date", date).put("data", payload)
                    .put("date_content_hash", SyncEngine.hash(new JSONObject().put("scope_id", scope).put("entities", selected)))
                    .put("content_hash", SyncEngine.hash(new JSONObject().put("snapshot_format", SyncEngine.FORMAT)
                            .put("scope_id", scope).put("date", date).put("timezone", "Asia/Shanghai").put("data", payload)));
        }
    }

    @Test public void canonicalHashMatchesActualServerFixtureIncludingUnicodeAndSlash() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (InputStream stream = getClass().getResourceAsStream("/workbench-contract.json")) {
            assertNotNull(stream);
            byte[] chunk = new byte[4096]; int size;
            while ((size = stream.read(chunk)) != -1) bytes.write(chunk, 0, size);
        }
        JSONObject fixture = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        SyncEngine.verifyEnvelope(fixture.getJSONObject("index"), true);
        SyncEngine.verifyEnvelope(fixture.getJSONObject("daily"), false);
        assertEquals(2, SyncEngine.verifyDay(fixture.getJSONObject("daily")).size());
    }

    @Test public void lostCommittedNoteResponseUsesReceiptWithoutDuplicateWrite() throws Exception {
        Memory memory = new Memory(); LocalRepository repository = repository(memory);
        String key = repository.create("note_entry", "life", DATE, content("offline note"));
        Server server = new Server(); server.lostReply = true;
        new SyncEngine(repository, new ApiClient(server)).run();
        JSONObject frozen = repository.nextOperation();
        assertEquals("frozen", frozen.getString("status"));
        String opId = frozen.getString("op_id");
        repository = repository(memory); // Simulate process death.
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(1, server.puts);
        assertNull(repository.nextOperation());
        assertEquals("offline note", repository.confirmed(key).getString("text"));
        assertEquals(opId, server.bodies.get(0).getString("save_id"));
        assertEquals("synced", repository.snapshot().getJSONObject("status").getString("code"));
    }

    @Test public void attemptedPayloadIsReplayedExactlyAndLaterLocalEditIsSeparate() throws Exception {
        LocalRepository repository = repository(new Memory());
        String key = repository.create("note_entry", "life", DATE, content("first local"));
        Server server = new Server(); server.failBeforeApply = true;
        new SyncEngine(repository, new ApiClient(server)).run();
        repository.edit(key, content("second local"));
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(3, server.puts);
        assertEquals(SyncEngine.canonical(server.bodies.get(0)), SyncEngine.canonical(server.bodies.get(1)));
        assertNotEquals(server.bodies.get(1).getString("save_id"), server.bodies.get(2).getString("save_id"));
        assertEquals(1, server.bodies.get(2).getInt("version"));
        assertEquals("second local", repository.confirmed(key).getString("text"));
    }

    @Test public void receiptWithNewerWebVersionNeverRebasesQueuedLocalEditSilently() throws Exception {
        LocalRepository repository = repository(new Memory());
        String key = repository.create("note_entry", "life", DATE, content("first local"));
        Server server = new Server(); server.lostReply = true; server.laterWebEdit = true;
        new SyncEngine(repository, new ApiClient(server)).run();
        repository.edit(key, content("later local edit"));
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(1, server.puts);
        assertEquals("conflict", repository.snapshot().getJSONObject("status").getString("code"));
        assertEquals("later local edit", repository.snapshot().getJSONObject("entities").getJSONObject(key).getJSONObject("local").getString("text"));
        assertTrue(repository.snapshot().getJSONArray("conflicts").length() > 0);
        assertEquals("newer web text", server.rows.get(key).getString("text"));
    }

    @Test public void lostTodoCreateThenQueuedCompletionDoesNotCreateDuplicate() throws Exception {
        LocalRepository repository = repository(new Memory());
        String key = repository.create("todo", null, DATE, content("one task"));
        repository.setComplete(key, true);
        Server server = new Server(); server.lostReply = true;
        new SyncEngine(repository, new ApiClient(server)).run();
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(1, server.posts);
        assertEquals(1, server.patches);
        assertEquals(1, server.rows.size());
        assertEquals(2, repository.confirmed(key).getInt("version"));
        assertNull(repository.nextOperation());
    }

    @Test public void unknownTodoCompletionWithLaterWebChangeIsConflict() throws Exception {
        LocalRepository repository = repository(new Memory());
        Server server = new Server(); server.rows.put("todo:" + NOTE, todo(NOTE, "existing", 1, false));
        new SyncEngine(repository, new ApiClient(server)).run();
        repository.setComplete("todo:" + NOTE, true);
        server.lostReply = true; server.laterWebEdit = true;
        new SyncEngine(repository, new ApiClient(server)).run();
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(1, server.patches);
        assertEquals("conflict", repository.snapshot().getJSONObject("status").getString("code"));
        assertEquals(3, server.rows.get("todo:" + NOTE).getInt("version"));
    }

    @Test public void scopeOrAccountChangesNeverDispatchPendingWrite() throws Exception {
        LocalRepository repository = repository(new Memory());
        repository.bindScope(SCOPE);
        repository.create("note_entry", "life", DATE, content("private draft"));
        Server server = new Server(); server.scope = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(0, server.puts);
        assertEquals("scope_changed", repository.snapshot().getJSONObject("status").getString("code"));
        server.scope = SCOPE; server.currentAccount = "somebody-else";
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(0, server.puts);
        assertEquals("identity_not_supported", repository.snapshot().getJSONObject("status").getString("code"));
    }

    @Test public void unboundDraftsCanDiscoverPublicDataButNeverUploadBeforeConsent() throws Exception {
        LocalRepository repository = new LocalRepository(new Memory());
        repository.create("note_entry", "life", DATE, content("unbound draft"));
        Server server = new Server();
        new SyncEngine(repository, new ApiClient(server)).run();
        assertTrue(server.requests > 0);
        assertEquals(0, server.puts);
        assertEquals("public_consent_required", repository.snapshot().getJSONObject("status").getString("code"));
        assertEquals("public", repository.workspace().getString("mode"));
        assertFalse(repository.publicUploadAllowed(ApiClient.ORIGIN, SCOPE));
        assertEquals("queued", repository.nextOperation().getString("status"));
        assertTrue(repository.nextOperation().isNull("wire"));
    }

    @Test public void snapshotRaceAndTamperCannotPublishPartialData() throws Exception {
        LocalRepository repository = repository(new Memory());
        Server server = new Server(); server.rows.put("note-entry:" + NOTE, note(NOTE, DATE, "old", 1));
        server.changeAtThirdIndex = true;
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(0, repository.snapshot().getJSONObject("entities").length());
        assertEquals("snapshot_changed", repository.snapshot().getJSONObject("status").getString("code"));
        server.corruptBody = true;
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(0, repository.snapshot().getJSONObject("entities").length());
        assertEquals("needs_attention", repository.snapshot().getJSONObject("status").getString("code"));
    }

    @Test public void largeFirstBaselineStagesPrivatelyAndResumesWithinRequestBudget() throws Exception {
        LocalRepository repository = repository(new Memory()); Server server = new Server();
        for (int i = 0; i < 40; i++) {
            String id = String.format(java.util.Locale.ROOT, "20000000-0000-4000-8000-%012d", i);
            JSONObject row = note(id, java.time.LocalDate.of(2026, 1, 1).plusDays(i).toString(), "day " + i, 1);
            server.rows.put(row.getString("entity_id"), row);
        }
        new SyncEngine(repository, new ApiClient(server)).run();
        assertTrue(server.requests <= 32);
        assertEquals(0, repository.snapshot().getJSONObject("entities").length());
        assertTrue(repository.staging().getJSONObject("rows").length() > 0);
        assertEquals("syncing_more", repository.snapshot().getJSONObject("status").getString("code"));
        int before = server.requests;
        new SyncEngine(repository, new ApiClient(server)).run();
        assertTrue(server.requests - before <= 32);
        assertEquals(40, repository.snapshot().getJSONObject("entities").length());
        assertEquals(0, repository.staging().length());
    }

    @Test public void forbiddenWritePausesWithoutDiscardingOrPublicFallback() throws Exception {
        LocalRepository repository = repository(new Memory());
        repository.create("note_entry", "life", DATE, content("protected"));
        Server server = new Server(); server.rejectWrites = true;
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals("public_access_denied", repository.snapshot().getJSONObject("status").getString("code"));
        assertEquals("frozen", repository.nextOperation().getString("status"));
        assertEquals(1, server.puts);
    }

    @Test public void optionalArticleFailureDoesNotUndoCoreSnapshot() throws Exception {
        LocalRepository repository = repository(new Memory()); Server server = new Server();
        server.rows.put("note-entry:" + NOTE, note(NOTE, DATE, "real cached data", 1));
        server.articlesUnavailable = true;
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals("real cached data", repository.confirmed("note-entry:" + NOTE).getString("text"));
        assertEquals("synced_articles_stale", repository.snapshot().getJSONObject("status").getString("code"));
    }

    @Test public void repeatedNetworkFailureUsesPersistentExponentialBackoff() throws Exception {
        LocalRepository repository = repository(new Memory());
        ApiClient failing = new ApiClient((method, path, body) -> { throw new IOException("offline"); });
        new SyncEngine(repository, failing).run();
        long firstDelay = repository.snapshot().getJSONObject("status").getLong("retry_at") - System.currentTimeMillis();
        new SyncEngine(repository, failing).run();
        long secondDelay = repository.snapshot().getJSONObject("status").getLong("retry_at") - System.currentTimeMillis();
        assertTrue(firstDelay >= 25000 && firstDelay <= 30000);
        assertTrue(secondDelay >= 55000 && secondDelay <= 60000);
        assertEquals("2", repository.uiState("sync_failures", ""));
        new SyncEngine(repository, new ApiClient(new Server())).run();
        assertEquals("0", repository.uiState("sync_failures", ""));
    }

    @Test public void persistenceFailurePropagatesInsteadOfClaimingNetworkRetry() throws Exception {
        class FailingDisk extends Memory {
            boolean fail;
            @Override public void write(JSONObject state) throws Exception {
                if (fail) { fail = false; throw new IOException("disk full"); }
                super.write(state);
            }
        }
        FailingDisk disk = new FailingDisk(); LocalRepository repository = repository(disk);
        disk.fail = true; // Discovery/remote-state commit is durable before any remote write.
        try {
            new SyncEngine(repository, new ApiClient(new Server())).run();
            fail("Disk failure should be reported to the caller");
        } catch (IOException expected) { assertEquals("disk full", expected.getMessage()); }
        assertEquals(SCOPE, repository.snapshot().getString("scope_id"));
        assertEquals("local", repository.snapshot().getJSONObject("status").getString("code"));
    }

    @Test public void serverRetryAfterIsNotTruncatedAndManualEarlyPassDoesNotRequest() throws Exception {
        LocalRepository repository = repository(new Memory());
        final int[] calls = {0};
        ApiClient limited = new ApiClient((method, path, body) -> {
            calls[0]++;
            return new ApiClient.Response(429, new JSONObject().put("error",
                    new JSONObject().put("code", "RATE_LIMIT").put("message", "wait")), 3600000);
        });
        new SyncEngine(repository, limited).run();
        long delay = repository.snapshot().getJSONObject("status").getLong("retry_at") - System.currentTimeMillis();
        assertTrue(delay > 3500000);
        new SyncEngine(repository, limited).run();
        assertEquals(1, calls[0]);
        assertEquals("retry", repository.snapshot().getJSONObject("status").getString("code"));
    }

    @Test public void firstDiscoveryReadsExistingServerDataAndConsentEnablesOnlyThatTarget() throws Exception {
        LocalRepository repository = new LocalRepository(new Memory()); Server server = new Server();
        server.rows.put("note-entry:" + NOTE, note(NOTE, DATE, "already on website", 1));
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals("already on website", repository.confirmed("note-entry:" + NOTE).getString("text"));
        assertEquals("public_consent_required", repository.snapshot().getJSONObject("status").getString("code"));
        repository.edit("note-entry:" + NOTE, content("offline mobile change"));
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(0, server.puts);
        assertEquals("already on website", server.rows.get("note-entry:" + NOTE).getString("text"));
        repository.consentPublicUpload(ApiClient.ORIGIN, SCOPE);
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(1, server.puts);
        assertEquals("offline mobile change", server.rows.get("note-entry:" + NOTE).getString("text"));
        assertEquals("synced", repository.snapshot().getJSONObject("status").getString("code"));
        assertEquals(LocalRepository.publicAccountId(ApiClient.ORIGIN, SCOPE), repository.snapshot().getString("account_id"));
    }

    @Test public void publicIdentityAndHashesMatchActualAnonymousWorkerFixture() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (InputStream stream = getClass().getResourceAsStream("/public-workbench-contract.json")) {
            assertNotNull(stream);
            byte[] chunk = new byte[4096]; int size;
            while ((size = stream.read(chunk)) != -1) bytes.write(chunk, 0, size);
        }
        JSONObject fixture = new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        assertTrue(fixture.getBoolean("synthetic_public_fixture"));
        assertTrue(ApiClient.isPublicBusiness(fixture.getJSONObject("me")));
        SyncEngine.verifyEnvelope(fixture.getJSONObject("index"), true);
        SyncEngine.verifyEnvelope(fixture.getJSONObject("daily"), false);
        SyncEngine.verifyEnvelope(fixture.getJSONObject("global_day"), false);
        assertTrue(SyncEngine.verifyDay(fixture.getJSONObject("daily")).size() > 0);
        assertTrue(SyncEngine.verifyDay(fixture.getJSONObject("global_day")).size() > 0);
    }

    private JSONObject publicHttpFixture() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (InputStream stream = getClass().getResourceAsStream("/public-workbench-contract.json")) {
            assertNotNull(stream);
            byte[] chunk = new byte[4096]; int size;
            while ((size = stream.read(chunk)) != -1) bytes.write(chunk, 0, size);
        }
        return new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
    }

    @Test public void actualHttpSnapshotsHaveOneDataEnvelopeAndInnerDateCollections() throws Exception {
        JSONObject wire = publicHttpFixture().getJSONObject("wire");
        ApiClient api = new ApiClient((method, path, body) -> {
            JSONObject recorded = path.endsWith("/auth/me") ? wire.getJSONObject("me")
                    : path.endsWith("/index") ? wire.getJSONObject("index") : wire.getJSONObject("daily");
            // The worker's actual HTTP JSON is replayed verbatim; never wrap a fixture again.
            return new ApiClient.Response(recorded.getInt("status"), cloneObject(recorded.getJSONObject("body")));
        });
        JSONObject indexBody = wire.getJSONObject("index").getJSONObject("body");
        JSONObject dailyBody = wire.getJSONObject("daily").getJSONObject("body");
        assertFalse(indexBody.has("snapshot_format"));
        assertEquals(SyncEngine.FORMAT, indexBody.getJSONObject("data").getString("snapshot_format"));
        assertTrue(dailyBody.getJSONObject("data").getJSONObject("data").get("todos") instanceof JSONArray);
        assertTrue(ApiClient.isPublicBusiness(api.me()));
        JSONObject index = api.object("GET", "/api/v1/workbench-snapshot/index", null);
        JSONObject day = api.object("GET", "/api/v1/workbench-snapshot?date=2026-10-24", null);
        SyncEngine.verifyEnvelope(index, true); SyncEngine.verifyEnvelope(day, false);
        assertEquals(SyncEngine.FORMAT, day.getString("snapshot_format"));
        assertFalse(day.getJSONObject("data").has("snapshot_format"));
        assertTrue(SyncEngine.verifyDay(day).size() > 0);
    }

    @Test public void firstPullReplaysActualCompleteWorkerHttpBodiesWithoutManualWrapping() throws Exception {
        JSONObject recorded = publicHttpFixture().getJSONObject("wire_pull");
        LocalRepository repository = new LocalRepository(new Memory());
        final int[] writes = {0};
        ApiClient api = new ApiClient((method, path, body) -> {
            if (!"GET".equals(method)) { writes[0]++; fail("First public pull must not write before consent"); }
            String name;
            if (path.endsWith("/auth/me")) name = "me";
            else if (path.endsWith("/workbench-snapshot/index")) name = "index";
            else if (path.equals("/api/v1/workbench-snapshot?date=2026-10-24")) name = "daily";
            else if (path.endsWith("/articles")) name = "articles";
            else throw new IOException("Unexpected fixture route: " + path);
            JSONObject response = recorded.getJSONObject(name);
            return new ApiClient.Response(response.getInt("status"), cloneObject(response.getJSONObject("body")));
        });
        new SyncEngine(repository, api).run();
        assertEquals(0, writes[0]);
        assertEquals("public_consent_required", repository.snapshot().getJSONObject("status").getString("code"));
        int entityCount = recorded.getJSONObject("index").getJSONObject("body").getJSONObject("data").getJSONArray("entities").length();
        assertEquals(3, entityCount);
        assertEquals(entityCount, repository.snapshot().getJSONObject("entities").length());
        assertEquals("Existing public website todo", repository.confirmed("todo:40000000-0000-4000-8000-000000000001").getString("text"));
        assertEquals("Existing public life note", repository.confirmed("note-entry:40000000-0000-4000-8000-000000000002").getString("text"));
        assertEquals("Existing public work note", repository.confirmed("note-entry:40000000-0000-4000-8000-000000000003").getString("text"));
    }

    @Test public void nonPublicSessionCannotBecomePublicFallback() throws Exception {
        LocalRepository repository = new LocalRepository(new Memory());
        String key = repository.create("note_entry", "life", DATE, content("private device draft"));
        Server server = new Server(); server.publicBusiness = false; server.currentAccount = NOTE;
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(0, server.puts);
        assertEquals(0, server.indexReads);
        assertEquals("identity_not_supported", repository.snapshot().getJSONObject("status").getString("code"));
        assertEquals("", repository.snapshot().getString("account_id"));
        assertEquals("private device draft", repository.snapshot().getJSONObject("entities").getJSONObject(key).getJSONObject("local").getString("text"));
        assertFalse(ApiClient.isPublicBusiness(new JSONObject().put("id", ApiClient.PUBLIC_BUSINESS_ID).put("publicBusiness", "true")));
    }

    @Test public void legacyTwoPointZeroUnboundStateSurvivesRestartAndUploadsOnlyAfterConsent() throws Exception {
        Memory memory = new Memory(); LocalRepository oldApp = new LocalRepository(memory);
        String key = oldApp.create("note_entry", "life", DATE, content("saved in 2.0.0"));
        String operationId = oldApp.nextOperation().getString("op_id");
        oldApp.setDraft("composer:life:" + DATE, "unsaved draft stays");
        oldApp.setUiState("selected_date", DATE);
        JSONObject oldState = oldApp.snapshot(); oldState.remove("workspace"); memory.state = oldState;
        LocalRepository updated = new LocalRepository(memory); Server server = new Server();
        server.rows.put("note-entry:" + NOTE, note(NOTE, DATE, "server prior record", 1));
        new SyncEngine(updated, new ApiClient(server)).run();
        assertEquals(0, server.puts);
        assertEquals(operationId, updated.nextOperation().getString("op_id"));
        assertEquals("queued", updated.nextOperation().getString("status"));
        assertEquals("unsaved draft stays", updated.draft("composer:life:" + DATE));
        assertEquals(DATE, updated.uiState("selected_date", ""));
        assertEquals("server prior record", updated.confirmed("note-entry:" + NOTE).getString("text"));
        updated.consentPublicUpload(ApiClient.ORIGIN, SCOPE);
        updated = new LocalRepository(memory);
        new SyncEngine(updated, new ApiClient(server)).run();
        assertEquals(1, server.puts);
        assertEquals(operationId, server.bodies.get(0).getString("save_id"));
        assertEquals("saved in 2.0.0", updated.confirmed(key).getString("text"));
        assertEquals("unsaved draft stays", updated.draft("composer:life:" + DATE));
    }

    @Test public void legacyPrivateFrozenRequestIsNeverRetargetedToPublic() throws Exception {
        Memory memory = new Memory(); LocalRepository oldApp = new LocalRepository(memory);
        String key = oldApp.create("note_entry", "life", DATE, content("private attempted body"));
        JSONObject legacy = oldApp.snapshot(); legacy.remove("workspace");
        legacy.put("account_id", NOTE).put("scope_id", SCOPE);
        JSONObject operation = legacy.getJSONArray("operations").getJSONObject(0);
        JSONObject wire = new JSONObject().put("account_id", NOTE).put("scope_id", SCOPE)
                .put("method", "PUT").put("path", "/api/v1/note-entries/" + key.substring(key.indexOf(':') + 1))
                .put("expected_version", 0).put("action", "upsert").put("entity_id", key)
                .put("payload", operation.getJSONObject("payload"))
                .put("body", new JSONObject().put("text", "private attempted body").put("category", "life")
                        .put("date", DATE).put("version", 0).put("save_id", operation.getString("op_id")));
        operation.put("wire", wire).put("status", "frozen"); memory.state = legacy;
        LocalRepository updated = new LocalRepository(memory); Server server = new Server();
        new SyncEngine(updated, new ApiClient(server)).run();
        assertEquals(0, server.puts);
        assertEquals(NOTE, updated.snapshot().getString("account_id"));
        assertEquals(SyncEngine.canonical(wire), SyncEngine.canonical(updated.nextOperation().getJSONObject("wire")));
        assertEquals("identity_not_supported", updated.snapshot().getJSONObject("status").getString("code"));
        // An old attempted request with no recorded account is equally unsafe to retarget.
        legacy.put("account_id", ""); wire.put("account_id", "");
        legacy.getJSONArray("operations").getJSONObject(0).put("wire", cloneObject(wire));
        memory.state = cloneObject(legacy);
        updated = new LocalRepository(memory);
        new SyncEngine(updated, new ApiClient(server)).run();
        assertEquals(0, server.puts);
        assertEquals("", updated.snapshot().getString("account_id"));
        assertEquals(SyncEngine.canonical(wire), SyncEngine.canonical(updated.nextOperation().getJSONObject("wire")));
        assertEquals("identity_not_supported", updated.snapshot().getJSONObject("status").getString("code"));
    }

    @Test public void publicDeleteLostReplyRecoversByReceiptWithoutResurrection() throws Exception {
        Memory memory = new Memory(); LocalRepository repository = repository(memory); Server server = new Server();
        String key = "note-entry:" + NOTE;
        server.rows.put(key, note(NOTE, DATE, "to be deleted", 1));
        new SyncEngine(repository, new ApiClient(server)).run();
        repository.remove(key); server.lostReply = true;
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals("frozen", repository.nextOperation().getString("status"));
        assertEquals("public", repository.nextOperation().getJSONObject("wire").getString("identity_mode"));
        repository = new LocalRepository(memory);
        new SyncEngine(repository, new ApiClient(server)).run();
        new SyncEngine(repository, new ApiClient(server)).run();
        assertEquals(1, server.deletes);
        assertEquals(0, server.puts);
        assertNull(repository.nextOperation());
        assertFalse(repository.confirmed(key).isNull("deleted_at"));
        assertEquals(2, repository.confirmed(key).getInt("version"));
    }
}
