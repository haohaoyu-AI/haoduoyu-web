package xyz.haoduoyu.personal.offline;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.*;

public final class LocalRepositoryTest {
    private static final String ACCOUNT = "11111111-1111-4111-8111-111111111111";
    private static final String SCOPE = "scope-one";
    private static final String DATE = "2026-10-26";

    private static final class MemoryStore implements LocalRepository.Store {
        String persisted;
        boolean failNextWrite;
        int writes;
        @Override public JSONObject read() throws Exception { return persisted == null ? null : new JSONObject(persisted); }
        @Override public void write(JSONObject value) throws Exception {
            if (failNextWrite) { failNextWrite = false; throw new java.io.IOException("disk full"); }
            persisted = value.toString(); writes++;
        }
    }

    private interface Attempt { void run() throws Exception; }
    private static void rejected(Attempt attempt) throws Exception {
        try { attempt.run(); fail("Expected rejection"); }
        catch (IllegalArgumentException | IllegalStateException | java.io.IOException expected) { /* Expected, content must remain inspectable. */ }
    }
    private static JSONObject note(String text) throws Exception { return new JSONObject().put("text", text); }
    private static JSONObject entry(LocalRepository repository, String key) throws Exception {
        return repository.snapshot().getJSONObject("entities").getJSONObject(key);
    }
    private static JSONObject wire(String value) throws Exception { return new JSONObject().put("method", "PUT").put("body", note(value)); }
    private static JSONObject manifest() throws Exception {
        return new JSONObject().put("complete", true).put("snapshot_format", "haoduoyu-workbench-snapshot-v1").put("scope_id", SCOPE);
    }
    private static JSONObject row(String key, String text, long version) throws Exception {
        JSONObject row = new JSONObject().put("entity_id", key).put("entity_type", "life_note")
                .put("source", "note_entry").put("source_id", key.substring("note-entry:".length()))
                .put("category", "life").put("date", DATE).put("text", text).put("version", version)
                .put("created_at", "2026-10-26T00:00:00Z").put("updated_at", "2026-10-26T01:00:00Z").put("deleted_at", JSONObject.NULL);
        return row.put("content_hash", JsonUtil.sha256(row));
    }
    private static String fixedKey() { return "note-entry:22222222-2222-4222-8222-222222222222"; }
    private static LocalRepository remoteRepository(MemoryStore store, JSONObject... rows) throws Exception {
        LocalRepository repository = new LocalRepository(store);
        JSONArray incoming = new JSONArray();
        for (JSONObject row : rows) incoming.put(row);
        repository.applyRemote(ACCOUNT, SCOPE, incoming, manifest());
        return repository;
    }

    @Test public void dataAndOutboxSurviveRestartTogether() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String key = repository.create("note_entry", "life", DATE, note("离线中文内容"));
        JSONObject before = repository.snapshot();
        LocalRepository reopened = new LocalRepository(store);
        assertTrue(JsonUtil.equal(before, reopened.snapshot()));
        assertEquals("离线中文内容", entry(reopened, key).getJSONObject("local").getString("text"));
        assertEquals(key, reopened.nextOperation().getString("entity_id"));
        assertEquals(0, reopened.nextOperation().getJSONObject("payload").getLong("version"));
    }

    @Test public void failedAtomicComposerKeepsDraftAndNoPhantomEntityOrOperation() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.setDraft("todo-composer", "未保存的输入");
        String prior = store.persisted;
        store.failNextWrite = true;
        rejected(() -> repository.createFromDraft("todo", null, DATE, note("离线待办"), "todo-composer"));
        assertEquals(prior, store.persisted);
        assertEquals("未保存的输入", repository.draft("todo-composer"));
        assertEquals(0, repository.snapshot().getJSONObject("entities").length());
        assertNull(repository.nextOperation());
        assertEquals("未保存的输入", new LocalRepository(store).draft("todo-composer"));
    }

    @Test public void composerSuccessClearsOnlyItsDraftInSameCommit() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.setDraft("composer", "pending");
        repository.setDraft("other", "leave");
        int writes = store.writes;
        String key = repository.createFromDraft("todo", null, DATE, note("已保存"), "composer");
        assertEquals(writes + 1, store.writes);
        assertEquals("", repository.draft("composer"));
        assertFalse(repository.containsDraft("composer"));
        assertEquals("leave", repository.draft("other"));
        assertEquals(key, repository.nextOperation().getString("entity_id"));
    }

    @Test public void editorSaveClearsBodyAndTitleDraftsInOneCommit() throws Exception {
        MemoryStore store = new MemoryStore();
        String key = fixedKey();
        LocalRepository repository = remoteRepository(store, row(key, "baseline", 1));
        repository.setDraft("body", "local edited text");
        repository.setDraft("title", "edited title");
        int priorWrites = store.writes;
        repository.editFromDraft(key, note("local edited text"), "body", "title");
        assertEquals(priorWrites + 1, store.writes);
        assertEquals("", repository.draft("body"));
        assertEquals("", repository.draft("title"));
        assertFalse(repository.containsDraft("body"));
        assertFalse(repository.containsDraft("title"));
        assertEquals("local edited text", entry(repository, key).getJSONObject("local").getString("text"));
        assertEquals(key, repository.nextOperation().getString("entity_id"));
    }

    @Test public void failedEditorSaveRetainsBothDraftsAndOriginalData() throws Exception {
        MemoryStore store = new MemoryStore();
        String key = fixedKey();
        LocalRepository repository = remoteRepository(store, row(key, "baseline", 1));
        repository.setDraft("body", "local edited text");
        repository.setDraft("title", "edited title");
        String before = store.persisted;
        store.failNextWrite = true;
        rejected(() -> repository.editFromDraft(key, note("local edited text"), "body", "title"));
        assertEquals(before, store.persisted);
        assertEquals("local edited text", repository.draft("body"));
        assertEquals("edited title", repository.draft("title"));
        assertEquals("baseline", entry(repository, key).getJSONObject("local").getString("text"));
        assertNull(repository.nextOperation());
    }

    @Test public void explicitEmptyDraftSurvivesRestartAndSuccessfulSubmitConsumesItsSlot() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.setDraft("composer", "");
        LocalRepository reopened = new LocalRepository(store);
        assertTrue(reopened.containsDraft("composer"));
        assertEquals("", reopened.draft("composer"));
        assertFalse(reopened.containsDraft("missing"));
        assertEquals("", reopened.draft("missing"));
        String key = reopened.createFromDraft("note_entry", "life", DATE, note("saved content"), "composer");
        LocalRepository afterCreate = new LocalRepository(store);
        assertFalse(afterCreate.containsDraft("composer"));
        assertEquals("", afterCreate.draft("composer"));
        afterCreate.setDraft("editor-body", "");
        afterCreate.setDraft("editor-title", "");
        LocalRepository beforeEdit = new LocalRepository(store);
        assertTrue(beforeEdit.containsDraft("editor-body"));
        assertTrue(beforeEdit.containsDraft("editor-title"));
        beforeEdit.editFromDraft(key, note("edited content"), "editor-body", "editor-title");
        LocalRepository afterEdit = new LocalRepository(store);
        assertFalse(afterEdit.containsDraft("editor-body"));
        assertFalse(afterEdit.containsDraft("editor-title"));
        assertEquals("edited content", entry(afterEdit, key).getJSONObject("local").getString("text"));
    }

    @Test public void frozenOperationIdentityAndWireCannotChangeAfterRestart() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.create("note_entry", "life", DATE, note("原输入"));
        String operationId = repository.nextOperation().getString("op_id");
        JSONObject originalWire = wire("原输入");
        repository.freezeOperation(operationId, originalWire);
        LocalRepository reopened = new LocalRepository(store);
        assertEquals(operationId, reopened.nextOperation().getString("op_id"));
        assertTrue(JsonUtil.equal(originalWire, reopened.nextOperation().getJSONObject("wire")));
        String before = store.persisted;
        rejected(() -> reopened.freezeOperation(operationId, wire("不同输入")));
        assertEquals(before, store.persisted);
        assertEquals("frozen", reopened.nextOperation().getString("status"));
    }

    @Test public void neverAttemptedAdjacentEditsCanCoalesceButFrozenOneCannot() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String key = repository.create("note_entry", "life", DATE, note("一"));
        String firstId = repository.nextOperation().getString("op_id");
        repository.edit(key, note("二"));
        assertEquals(1, repository.snapshot().getJSONArray("operations").length());
        assertEquals(firstId, repository.nextOperation().getString("op_id"));
        repository.freezeOperation(firstId, wire("二"));
        repository.edit(key, note("三"));
        assertEquals(2, repository.snapshot().getJSONArray("operations").length());
        assertEquals("二", repository.nextOperation().getJSONObject("payload").getString("text"));
        assertEquals("三", entry(repository, key).getJSONObject("local").getString("text"));
    }

    @Test public void acknowledgementPreservesLaterEditAndDuplicateCannotConsumeIt() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String key = repository.create("note_entry", "life", DATE, note("first"));
        String firstId = repository.nextOperation().getString("op_id");
        repository.freezeOperation(firstId, wire("first"));
        repository.edit(key, note("later"));
        repository.acknowledge(firstId, row(key, "first", 1));
        String secondId = repository.nextOperation().getString("op_id");
        assertNotEquals(firstId, secondId);
        assertEquals("later", entry(repository, key).getJSONObject("local").getString("text"));
        assertEquals("first", repository.confirmed(key).getString("text"));
        assertTrue(entry(repository, key).getBoolean("dirty"));
        repository.acknowledge(firstId, row(key, "first", 1));
        assertEquals(secondId, repository.nextOperation().getString("op_id"));
    }

    @Test public void outOfOrderFreezeCannotReorderQueue() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.create("note_entry", "life", DATE, note("first"));
        repository.create("note_entry", "work", DATE, note("second"));
        String second = repository.snapshot().getJSONArray("operations").getJSONObject(1).getString("op_id");
        String persisted = store.persisted;
        rejected(() -> repository.freezeOperation(second, wire("second")));
        assertEquals(persisted, store.persisted);
    }

    @Test public void unattemptedOrOutOfOrderAcknowledgementCannotConsumeQueue() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String firstKey = repository.create("note_entry", "life", DATE, note("first"));
        String first = repository.nextOperation().getString("op_id");
        String secondKey = repository.create("note_entry", "life", DATE, note("second"));
        String second = repository.snapshot().getJSONArray("operations").getJSONObject(1).getString("op_id");
        String before = store.persisted;
        rejected(() -> repository.acknowledge(first, row(firstKey, "first", 1)));
        assertEquals(before, store.persisted);
        rejected(() -> repository.acknowledge(second, row(secondKey, "second", 1)));
        assertEquals(before, store.persisted);
    }

    @Test public void versionConflictRetainsBaselineLocalRemoteAndQueueAfterRestart() throws Exception {
        MemoryStore store = new MemoryStore();
        String key = fixedKey();
        LocalRepository repository = remoteRepository(store, row(key, "base", 1));
        repository.edit(key, note("local change"));
        JSONObject remote = row(key, "other device", 2);
        repository.applyRemote(ACCOUNT, SCOPE, new JSONArray().put(remote), manifest());
        LocalRepository reopened = new LocalRepository(store);
        assertNull(reopened.nextOperation());
        assertEquals("local change", entry(reopened, key).getJSONObject("local").getString("text"));
        JSONObject conflict = reopened.snapshot().getJSONArray("conflicts").getJSONObject(0);
        assertEquals("base", conflict.getJSONObject("baseline").getString("text"));
        assertEquals("local change", conflict.getJSONObject("local").getString("text"));
        assertEquals("other device", conflict.getJSONObject("remote").getString("text"));
        assertFalse(conflict.getBoolean("resolved"));
        assertEquals(1, reopened.snapshot().getJSONArray("operations").length());
    }

    @Test public void effectiveParentTombstoneConflictsEvenWithoutVersionIncrement() throws Exception {
        MemoryStore store = new MemoryStore();
        String key = "memo-note:22222222-2222-4222-8222-222222222222";
        JSONObject baseline = new JSONObject().put("entity_id", key).put("entity_type", "memo_note")
                .put("source", "memo_note").put("source_id", key.substring("memo-note:".length()))
                .put("date", JSONObject.NULL).put("title", "标题").put("body", "原文").put("position", 0)
                .put("group_id", "33333333-3333-4333-8333-333333333333").put("version", 1)
                .put("created_at", "2026-10-26T00:00:00Z").put("updated_at", "2026-10-26T00:00:00Z")
                .put("deleted_at", JSONObject.NULL).put("content_hash", "old");
        LocalRepository repository = remoteRepository(store, baseline);
        repository.edit(key, new JSONObject().put("body", "本机修改"));
        JSONObject effectiveDelete = JsonUtil.copy(baseline).put("deleted_at", "2026-10-26T02:00:00Z").put("content_hash", "deleted");
        effectiveDelete.remove("title"); effectiveDelete.remove("body");
        repository.applyRemote(ACCOUNT, SCOPE, new JSONArray().put(effectiveDelete), manifest());
        assertNull(repository.nextOperation());
        assertEquals("本机修改", entry(repository, key).getJSONObject("local").getString("body"));
        assertEquals(1, repository.snapshot().getJSONArray("conflicts").length());
    }

    @Test public void confirmedTombstoneCannotBeEditedOrResurrectedByMissingRead() throws Exception {
        MemoryStore store = new MemoryStore();
        String key = fixedKey();
        JSONObject removed = row(key, "已删除内容", 2).put("deleted_at", "2026-10-26T02:00:00Z");
        LocalRepository repository = remoteRepository(store, removed);
        rejected(() -> repository.edit(key, note("revive")));
        repository.applyRemote(ACCOUNT, SCOPE, new JSONArray(), manifest());
        assertFalse(entry(repository, key).getJSONObject("local").isNull("deleted_at"));
        assertNull(repository.nextOperation());
    }

    @Test public void olderSnapshotCannotRollBackConfirmedTombstoneOrContent() throws Exception {
        MemoryStore store = new MemoryStore();
        String key = fixedKey();
        JSONObject removed = row(key, "confirmed", 3).put("deleted_at", "2026-10-26T02:00:00Z");
        LocalRepository repository = remoteRepository(store, removed);
        String before = store.persisted;
        rejected(() -> repository.applyRemote(ACCOUNT, SCOPE, new JSONArray().put(row(key, "old active", 2)), manifest()));
        assertEquals(before, store.persisted);
        assertFalse(entry(repository, key).getJSONObject("local").isNull("deleted_at"));
    }

    @Test public void differentAccountOrScopeDoesNotChangeAnyLocalData() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = remoteRepository(store, row(fixedKey(), "base", 1));
        repository.edit(fixedKey(), note("private local draft"));
        String persisted = store.persisted;
        rejected(() -> repository.bindAccount("different-user"));
        assertEquals(persisted, store.persisted);
        rejected(() -> repository.bindScope("different-scope"));
        assertEquals(persisted, store.persisted);
        JSONObject otherManifest = manifest().put("scope_id", "different-scope");
        rejected(() -> repository.applyRemote(ACCOUNT, "different-scope", new JSONArray(), otherManifest));
        assertEquals(persisted, store.persisted);
        rejected(() -> repository.applyRemote("different-user", SCOPE, new JSONArray(), manifest()));
        assertEquals(persisted, store.persisted);
    }

    @Test public void adoptingServerArchivesLocalAndEveryAffectedOperation() throws Exception {
        MemoryStore store = new MemoryStore();
        String key = fixedKey();
        LocalRepository repository = remoteRepository(store, row(key, "base", 1));
        repository.edit(key, note("local one"));
        String op = repository.nextOperation().getString("op_id");
        repository.freezeOperation(op, wire("local one"));
        repository.edit(key, note("local two"));
        repository.markConflict(op, row(key, "remote", 2), "conflict");
        repository.resolveUsingServer(op);
        assertNull(repository.nextOperation());
        assertEquals("remote", entry(repository, key).getJSONObject("local").getString("text"));
        JSONObject archive = repository.snapshot().getJSONArray("conflicts").getJSONObject(0);
        assertTrue(archive.getBoolean("resolved"));
        assertEquals("local two", archive.getJSONObject("local").getString("text"));
        assertEquals(2, archive.getJSONArray("retained_operations").length());
        assertEquals("local two", new LocalRepository(store).snapshot().getJSONArray("conflicts")
                .getJSONObject(0).getJSONObject("local").getString("text"));
    }

    @Test public void keepBothMakesNewIdentityInsteadOfRestoringDeletedRecord() throws Exception {
        MemoryStore store = new MemoryStore();
        String key = fixedKey();
        LocalRepository repository = remoteRepository(store, row(key, "base", 1));
        repository.edit(key, note("valuable local"));
        String op = repository.nextOperation().getString("op_id");
        repository.markConflict(op, row(key, "", 2).put("deleted_at", "2026-10-26T03:00:00Z"), "deleted");
        String copy = repository.resolveWithCopy(op);
        assertNotEquals(key, copy);
        assertTrue(copy.startsWith("note-entry:"));
        assertEquals("valuable local", entry(repository, copy).getJSONObject("local").getString("text"));
        assertEquals(0, entry(repository, copy).getJSONObject("local").getLong("version"));
        assertFalse(entry(repository, key).getJSONObject("local").isNull("deleted_at"));
        assertEquals(copy, repository.nextOperation().getString("entity_id"));
    }

    @Test public void unsentLocalDeleteCancelsOnlyItsOutboxAndRetainsTombstone() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String first = repository.create("note_entry", "life", DATE, note("first"));
        String second = repository.create("note_entry", "work", DATE, note("second"));
        repository.remove(first);
        assertEquals(second, repository.nextOperation().getString("entity_id"));
        assertEquals("first", entry(repository, first).getJSONObject("local").getString("text"));
        assertFalse(entry(repository, first).getJSONObject("local").isNull("deleted_at"));
        assertFalse(entry(repository, first).getBoolean("dirty"));
    }

    @Test public void completionAfterOfflineCreateKeepsPostAndPatchSeparate() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String key = repository.create("todo", null, DATE, note("待办"));
        repository.setComplete(key, true);
        JSONArray queue = repository.snapshot().getJSONArray("operations");
        assertEquals(2, queue.length());
        assertEquals("upsert", queue.getJSONObject(0).getString("action"));
        assertFalse(queue.getJSONObject(0).getJSONObject("payload").getBoolean("completed"));
        assertEquals("complete", queue.getJSONObject(1).getString("action"));
        assertTrue(queue.getJSONObject(1).getJSONObject("payload").getBoolean("completed"));
        assertTrue(entry(repository, key).getJSONObject("local").getBoolean("completed"));
    }

    @Test public void localInputsUseTheSameCanonicalTextAsServerBeforeFreezing() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String todo = repository.create("todo", null, DATE, note("\u3000 做一件事 \u00a0"));
        assertEquals("做一件事", entry(repository, todo).getJSONObject("local").getString("text"));
        assertEquals("做一件事", repository.nextOperation().getJSONObject("payload").getString("text"));
        String note = repository.create("note_entry", "life", DATE, note("第一行\r\n第二行\r第三行"));
        assertEquals("第一行\n第二行\n第三行", entry(repository, note).getJSONObject("local").getString("text"));
    }

    @Test public void numericSnapshotCompletionCanBeUncheckedOffline() throws Exception {
        MemoryStore store = new MemoryStore();
        String key = "todo:22222222-2222-4222-8222-222222222222";
        JSONObject todo = new JSONObject().put("entity_id", key).put("entity_type", "todo").put("source", "todo")
                .put("source_id", key.substring(5)).put("date", DATE).put("text", "done").put("completed", 1)
                .put("version", 1).put("deleted_at", JSONObject.NULL);
        LocalRepository repository = remoteRepository(store, todo);
        repository.setComplete(key, false);
        assertEquals("complete", repository.nextOperation().getString("action"));
        assertFalse(repository.nextOperation().getJSONObject("payload").getBoolean("completed"));
    }

    @Test public void receiptPlaceholderUpgradesWithoutConflictingWithLaterEdit() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String key = repository.create("note_entry", "life", DATE, note("first"));
        String first = repository.nextOperation().getString("op_id");
        repository.freezeOperation(first, wire("first"));
        repository.edit(key, note("later"));
        JSONObject placeholder = new JSONObject().put("entity_id", key).put("version", 1).put("deleted_at", JSONObject.NULL);
        repository.acknowledge(first, placeholder);
        JSONObject actual = row(key, "first", 1);
        repository.applyRemote(ACCOUNT, SCOPE, new JSONArray().put(actual), manifest());
        assertNotNull(repository.nextOperation());
        assertEquals(0, repository.snapshot().getJSONArray("conflicts").length());
        assertEquals(actual.getString("content_hash"), repository.confirmed(key).getString("content_hash"));
        assertEquals("later", entry(repository, key).getJSONObject("local").getString("text"));
    }

    @Test public void articleAndReminderCopiesCannotBecomeQueuedWrites() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.cacheArticles(new JSONArray().put(new JSONObject().put("id", "article-one").put("title", "metadata")), 1234);
        rejected(() -> repository.edit("article:article-one", note("wrong")));
        rejected(() -> repository.remove("article:article-one"));
        assertNull(repository.nextOperation());
        assertEquals(1234, entry(repository, "article:article-one").getJSONObject("local").getLong("cached_at"));
        JSONObject reminder = new JSONObject().put("entity_id", "work-reminder:one").put("source_id", "one")
                .put("source", "work_reminder").put("entity_type", "work_reminder").put("version", 1)
                .put("date", DATE).put("summary", "真实摘要").put("deleted_at", JSONObject.NULL);
        repository.applyRemote(ACCOUNT, SCOPE, new JSONArray().put(reminder), manifest());
        rejected(() -> repository.edit("work-reminder:one", note("wrong")));
        assertTrue(repository.snapshot().getJSONObject("entities").has("article:article-one"));
    }

    @Test public void draftsUiAndHiddenStagingSurviveButDoNotBecomeVisibleRecords() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.setDraft("composer", "尚未保存的完整草稿");
        repository.setUiState("date", DATE);
        repository.staging(new JSONObject().put("manifest_hash", "in-progress").put("rows", new JSONArray().put(row(fixedKey(), "not yet visible", 1))));
        LocalRepository reopened = new LocalRepository(store);
        assertEquals("尚未保存的完整草稿", reopened.draft("composer"));
        assertEquals(DATE, reopened.uiState("date", ""));
        assertEquals(0, reopened.snapshot().getJSONObject("entities").length());
        assertEquals("in-progress", reopened.staging().getString("manifest_hash"));
        reopened.applyRemote(ACCOUNT, SCOPE, new JSONArray().put(row(fixedKey(), "verified", 1)), manifest());
        assertEquals(0, reopened.staging().length());
        assertEquals("verified", entry(reopened, fixedKey()).getJSONObject("local").getString("text"));
    }

    @Test public void incompleteOrDuplicateSnapshotLeavesEntireDatabaseUnchanged() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String before = store.persisted;
        rejected(() -> repository.applyRemote(ACCOUNT, SCOPE, new JSONArray(), manifest().put("complete", false)));
        assertEquals(before, store.persisted);
        JSONObject row = row(fixedKey(), "test", 1);
        rejected(() -> repository.applyRemote(ACCOUNT, SCOPE, new JSONArray().put(row).put(row), manifest()));
        assertEquals(before, store.persisted);
    }

    @Test public void corruptStoreFailsWithoutResettingOrOverwritingAnything() throws Exception {
        MemoryStore store = new MemoryStore();
        store.persisted = "{\"schema\":99,\"data\":\"retain\"}";
        String before = store.persisted;
        rejected(() -> new LocalRepository(store));
        assertEquals(before, store.persisted);
        assertEquals(0, store.writes);
    }

    @Test public void gettersAreDetachedAndCannotModifyPersistedOrLiveData() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String key = repository.create("note_entry", "life", DATE, note("real"));
        JSONObject snapshot = repository.snapshot();
        snapshot.getJSONObject("entities").getJSONObject(key).getJSONObject("local").put("text", "mutated");
        repository.nextOperation().getJSONObject("payload").put("text", "mutated");
        assertEquals("real", entry(repository, key).getJSONObject("local").getString("text"));
        assertEquals("real", repository.nextOperation().getJSONObject("payload").getString("text"));
        assertEquals("real", entry(new LocalRepository(store), key).getJSONObject("local").getString("text"));
    }

    private static final String ORIGIN = "https://haoduoyu.xyz";

    private static JSONObject publicWire(String scope, String text) throws Exception {
        return wire(text).put("identity_mode", "public").put("origin", ORIGIN).put("scope_id", scope)
                .put("account_id", LocalRepository.publicAccountId(ORIGIN, scope));
    }

    private static void legacySchemaOne(MemoryStore store, String account, String scope) throws Exception {
        JSONObject saved = new JSONObject(store.persisted);
        saved.remove("workspace");
        saved.put("account_id", account).put("scope_id", scope);
        store.persisted = saved.toString();
    }

    @Test public void publicIdentityIncludesOriginAndScopeRatherThanStaticWebsiteLabel() {
        String target = LocalRepository.publicAccountId(ORIGIN, SCOPE);
        assertTrue(target.startsWith("public:"));
        assertNotEquals("public-business", target);
        assertEquals(target, LocalRepository.publicAccountId("https://HAODUOYU.XYZ:443/", SCOPE));
        assertNotEquals(target, LocalRepository.publicAccountId(ORIGIN, "another-scope"));
        assertNotEquals(target, LocalRepository.publicAccountId("https://another.example", SCOPE));
    }

    @Test public void oldUnboundSchemaOneMigratesAtomicallyWithoutLosingLocalCollections() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository old = new LocalRepository(store);
        String key = old.create("todo", null, DATE, note("尚未联网的旧待办"));
        old.setDraft("composer", "旧草稿");
        old.setDraft("intentionally-empty", "");
        old.setUiState("scroll:todo", "236");
        old.setUiState("tab", "todo");
        legacySchemaOne(store, "", "");
        LocalRepository upgraded = new LocalRepository(store);
        JSONObject before = upgraded.snapshot();
        JSONObject target = upgraded.discoverPublicTarget(ORIGIN, SCOPE);
        JSONObject after = upgraded.snapshot();
        assertEquals(1, after.getInt("schema"));
        for (String field : new String[]{"entities", "operations", "drafts", "ui", "conflicts", "manifest", "sync_stage"})
            assertTrue("Preserve " + field, JsonUtil.equal(before.get(field), after.get(field)));
        assertEquals(before.getJSONArray("operations").getJSONObject(0).getString("op_id"),
                after.getJSONArray("operations").getJSONObject(0).getString("op_id"));
        assertEquals("public", target.getString("mode"));
        assertEquals(ORIGIN, target.getString("origin"));
        assertEquals(LocalRepository.publicAccountId(ORIGIN, SCOPE), after.getString("account_id"));
        assertFalse(target.getBoolean("upload_consented"));
        assertFalse(upgraded.publicUploadAllowed(ORIGIN, SCOPE));
        assertEquals("尚未联网的旧待办", entry(upgraded, key).getJSONObject("local").getString("text"));
        LocalRepository restarted = new LocalRepository(store);
        assertTrue(restarted.containsDraft("intentionally-empty"));
        assertEquals("旧草稿", restarted.draft("composer"));
        assertEquals("236", restarted.uiState("scroll:todo", ""));
        assertFalse(restarted.publicUploadAllowed(ORIGIN, SCOPE));
    }

    @Test public void anonymousPullCanPopulateWorkspaceBeforeAnyUploadConsent() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        String localKey = repository.create("note_entry", "life", DATE, note("本地未授权上传"));
        String originalOperation = repository.nextOperation().getString("op_id");
        repository.discoverPublicTarget(ORIGIN, SCOPE);
        repository.applyRemote(LocalRepository.publicAccountId(ORIGIN, SCOPE), SCOPE,
                new JSONArray().put(row(fixedKey(), "公开工作台已有数据", 2)), manifest());
        assertEquals("公开工作台已有数据", repository.confirmed(fixedKey()).getString("text"));
        assertEquals("本地未授权上传", entry(repository, localKey).getJSONObject("local").getString("text"));
        assertEquals(originalOperation, repository.nextOperation().getString("op_id"));
        assertFalse(repository.publicUploadAllowed(ORIGIN, SCOPE));
        String before = store.persisted;
        rejected(() -> repository.freezeOperation(originalOperation, publicWire(SCOPE, "本地未授权上传")));
        assertEquals(before, store.persisted);
        assertEquals("queued", repository.nextOperation().getString("status"));
        assertTrue(repository.nextOperation().isNull("wire"));
    }

    @Test public void explicitPublicConsentSurvivesRestartAndAllowsOnlyTheExactFrozenTarget() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.create("note_entry", "life", DATE, note("确认上传"));
        repository.discoverPublicTarget(ORIGIN, SCOPE);
        JSONObject detached = repository.workspace();
        detached.put("upload_consented", true);
        assertFalse(repository.publicUploadAllowed(ORIGIN, SCOPE));
        repository.consentPublicUpload(ORIGIN, SCOPE);
        LocalRepository restarted = new LocalRepository(store);
        assertTrue(restarted.publicUploadAllowed(ORIGIN, SCOPE));
        assertFalse(restarted.publicUploadAllowed(ORIGIN, "another-scope"));
        assertFalse(restarted.publicUploadAllowed("https://another.example", SCOPE));
        String operation = restarted.nextOperation().getString("op_id");
        String before = store.persisted;
        rejected(() -> restarted.freezeOperation(operation, wire("missing identity")));
        assertEquals(before, store.persisted);
        JSONObject correct = publicWire(SCOPE, "确认上传");
        restarted.freezeOperation(operation, correct);
        JSONObject rediscovered = restarted.discoverPublicTarget(ORIGIN, SCOPE);
        assertTrue(rediscovered.getBoolean("upload_consented"));
        assertTrue(JsonUtil.equal(correct, restarted.nextOperation().getJSONObject("wire")));
    }

    @Test public void publicConsentIsScopedAndStorageFailureDoesNotGrantIt() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.discoverPublicTarget(ORIGIN, SCOPE);
        String before = store.persisted;
        rejected(() -> repository.consentPublicUpload(ORIGIN, "other"));
        assertEquals(before, store.persisted);
        rejected(() -> repository.consentPublicUpload("https://another.example", SCOPE));
        assertEquals(before, store.persisted);
        store.failNextWrite = true;
        rejected(() -> repository.consentPublicUpload(ORIGIN, SCOPE));
        assertEquals(before, store.persisted);
        assertFalse(repository.publicUploadAllowed(ORIGIN, SCOPE));
        assertFalse(new LocalRepository(store).publicUploadAllowed(ORIGIN, SCOPE));
    }

    @Test public void failedPublicMigrationPreservesTheWholeLegacyDocument() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository old = new LocalRepository(store);
        old.create("todo", null, DATE, note("old"));
        old.setDraft("composer", "retain");
        legacySchemaOne(store, "", "");
        LocalRepository upgraded = new LocalRepository(store);
        String before = store.persisted;
        store.failNextWrite = true;
        rejected(() -> upgraded.discoverPublicTarget(ORIGIN, SCOPE));
        assertEquals(before, store.persisted);
        assertEquals("", upgraded.snapshot().getString("account_id"));
        assertEquals(0, upgraded.workspace().length());
        assertEquals("retain", upgraded.draft("composer"));
    }

    @Test public void privateBindingCannotBeReclassifiedAsAnonymousPublicWorkspace() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository old = remoteRepository(store, row(fixedKey(), "private baseline", 3));
        old.edit(fixedKey(), note("private pending"));
        old.setDraft("private", "do not publish");
        legacySchemaOne(store, ACCOUNT, SCOPE);
        LocalRepository upgraded = new LocalRepository(store);
        String before = store.persisted;
        rejected(() -> upgraded.discoverPublicTarget(ORIGIN, SCOPE));
        assertEquals(before, store.persisted);
        assertEquals(ACCOUNT, upgraded.snapshot().getString("account_id"));
        assertEquals("do not publish", upgraded.draft("private"));
    }

    @Test public void oldUnboundFrozenWireCannotBeRetargetedOrRewritten() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository old = new LocalRepository(store);
        old.create("note_entry", "life", DATE, note("unknown result"));
        String operation = old.nextOperation().getString("op_id");
        JSONObject original = wire("unknown result");
        old.freezeOperation(operation, original);
        legacySchemaOne(store, "", "");
        LocalRepository upgraded = new LocalRepository(store);
        String before = store.persisted;
        rejected(() -> upgraded.discoverPublicTarget(ORIGIN, SCOPE));
        assertEquals(before, store.persisted);
        assertTrue(JsonUtil.equal(original, upgraded.nextOperation().getJSONObject("wire")));
        assertEquals("", upgraded.snapshot().getString("account_id"));
    }

    @Test public void changedPublicOriginOrScopeNeverRetargetsExistingData() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.create("todo", null, DATE, note("belongs here"));
        repository.discoverPublicTarget(ORIGIN, SCOPE);
        repository.consentPublicUpload(ORIGIN, SCOPE);
        String before = store.persisted;
        rejected(() -> repository.discoverPublicTarget(ORIGIN, "other-scope"));
        assertEquals(before, store.persisted);
        rejected(() -> repository.discoverPublicTarget("https://another.example", SCOPE));
        assertEquals(before, store.persisted);
        assertTrue(repository.publicUploadAllowed(ORIGIN, SCOPE));
    }

    @Test public void unboundConfirmedPrivateBaselineRequiresManualIdentityRecovery() throws Exception {
        MemoryStore store = new MemoryStore();
        remoteRepository(store, row(fixedKey(), "unidentified baseline", 4));
        legacySchemaOne(store, "", "");
        LocalRepository upgraded = new LocalRepository(store);
        String before = store.persisted;
        rejected(() -> upgraded.discoverPublicTarget(ORIGIN, SCOPE));
        assertEquals(before, store.persisted);
        assertEquals("unidentified baseline", upgraded.confirmed(fixedKey()).getString("text"));
    }

    @Test public void legacyPublicLabelRequiresMatchingPinnedScopeAndNoFrozenWire() throws Exception {
        MemoryStore store = new MemoryStore();
        remoteRepository(store, row(fixedKey(), "known public snapshot", 2));
        legacySchemaOne(store, "public-business", SCOPE);
        LocalRepository upgraded = new LocalRepository(store);
        upgraded.discoverPublicTarget(ORIGIN, SCOPE);
        assertEquals("known public snapshot", upgraded.confirmed(fixedKey()).getString("text"));
        assertEquals(LocalRepository.publicAccountId(ORIGIN, SCOPE), upgraded.snapshot().getString("account_id"));
        assertFalse(upgraded.publicUploadAllowed(ORIGIN, SCOPE));
    }

    @Test public void knownPublicWorkspaceRejectsAnOlderIdentitylessFrozenRequest() throws Exception {
        MemoryStore store = new MemoryStore();
        LocalRepository repository = new LocalRepository(store);
        repository.create("note_entry", "work", DATE, note("still retained"));
        repository.discoverPublicTarget(ORIGIN, SCOPE);
        repository.consentPublicUpload(ORIGIN, SCOPE);
        // Model an old client document: the request is frozen but has no target identity tags.
        JSONObject document = repository.snapshot();
        document.getJSONArray("operations").getJSONObject(0).put("status", "frozen").put("wire", wire("still retained"));
        store.persisted = document.toString();
        LocalRepository reopened = new LocalRepository(store);
        String before = store.persisted;
        rejected(() -> reopened.discoverPublicTarget(ORIGIN, SCOPE));
        assertEquals(before, store.persisted);
        assertEquals("still retained", reopened.nextOperation().getJSONObject("wire").getJSONObject("body").getString("text"));
    }
}
