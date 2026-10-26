package xyz.haoduoyu.personal.offline;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * The local data source is authoritative for the UI. A save and its outbox entry
 * commit together before this class exposes success. Requests become immutable
 * before transport; a lost response is never a reason to invent a new operation.
 */
public final class LocalRepository {
    public interface Store {
        JSONObject read() throws Exception;
        void write(JSONObject state) throws Exception;
    }

    private interface Change { void apply(JSONObject candidate) throws Exception; }
    private static final int MAX_STATE_BYTES = 32 * 1024 * 1024;
    private static final int MAX_OPERATIONS = 10000;
    private final Store store;
    private JSONObject state;

    public LocalRepository(Store store) throws Exception {
        this.store = store;
        JSONObject loaded = store.read();
        if (loaded == null) {
            loaded = new JSONObject().put("schema", 1).put("account_id", "").put("scope_id", "")
                    .put("entities", new JSONObject()).put("operations", new JSONArray())
                    .put("conflicts", new JSONArray()).put("drafts", new JSONObject())
                    .put("ui", new JSONObject()).put("manifest", new JSONObject()).put("sync_stage", new JSONObject())
                    .put("status", new JSONObject().put("code", "local").put("message", "本机已就绪，尚未同步").put("retry_at", 0));
            store.write(JsonUtil.copy(loaded));
        }
        validateState(loaded);
        state = JsonUtil.copy(loaded);
    }

    private static void validateState(JSONObject value) {
        if (value.optInt("schema", -1) != 1 || !(value.opt("account_id") instanceof String)
                || !(value.opt("scope_id") instanceof String) || value.optJSONObject("entities") == null
                || value.optJSONArray("operations") == null || value.optJSONArray("conflicts") == null
                || value.optJSONObject("drafts") == null || value.optJSONObject("ui") == null
                || value.optJSONObject("manifest") == null || value.optJSONObject("status") == null)
            throw new IllegalStateException("本机数据格式无法识别，原数据保留，未重置");
        Set<String> operationIds = new HashSet<>();
        JSONArray operations = value.optJSONArray("operations");
        JSONObject entities = value.optJSONObject("entities");
        for (String key : JsonUtil.keys(entities)) {
            JSONObject entry = entities.optJSONObject(key);
            if (entry == null || entry.optJSONObject("local") == null || !entry.has("server")
                    || !key.equals(entry.optJSONObject("local").optString("entity_id"))
                    || !(entry.opt("dirty") instanceof Boolean)
                    || !entry.isNull("server") && entry.optJSONObject("server") == null)
                throw new IllegalStateException("本机实体记录损坏，原数据保留");
        }
        for (int index = 0; index < operations.length(); index++) {
            JSONObject operation = operations.optJSONObject(index);
            if (operation == null || !operationIds.add(operation.optString("op_id"))
                    || operation.optString("op_id").isEmpty()
                    || !entities.has(operation.optString("entity_id"))
                    || operation.optJSONObject("payload") == null
                    || !isOneOf(operation.optString("status"), "queued", "frozen", "conflict"))
                throw new IllegalStateException("本机同步队列损坏，原数据保留");
            if ("frozen".equals(operation.optString("status")) && operation.optJSONObject("wire") == null)
                throw new IllegalStateException("已提交操作缺少原请求，原数据保留");
        }
    }

    private synchronized void change(Change change) throws Exception {
        JSONObject candidate = JsonUtil.copy(state);
        change.apply(candidate);
        validateState(candidate);
        if (candidate.toString().getBytes(StandardCharsets.UTF_8).length > MAX_STATE_BYTES)
            throw new IllegalStateException("本机数据已达安全容量，本次更改未保存；请先同步并导出保留副本");
        store.write(JsonUtil.copy(candidate));
        state = candidate;
    }

    public synchronized JSONObject snapshot() { return JsonUtil.copy(state); }

    public synchronized void bindAccount(String accountId) throws Exception {
        change(candidate -> pin(candidate, "account_id", accountId));
    }

    public synchronized void bindScope(String scopeId) throws Exception {
        change(candidate -> pin(candidate, "scope_id", scopeId));
    }

    private static void pin(JSONObject candidate, String field, String value) throws Exception {
        if (value == null || value.isEmpty()) throw new IllegalArgumentException("数据身份不能为空");
        String existing = candidate.getString(field);
        if (!existing.isEmpty() && !existing.equals(value))
            throw new IllegalStateException("数据身份或范围已变化，已暂停同步；本机数据和待同步操作全部保留");
        candidate.put(field, value);
    }

    public synchronized String create(String source, String category, String date, JSONObject content) throws Exception {
        final String[] key = new String[1];
        change(candidate -> key[0] = createIn(candidate, source, category, date, content));
        return key[0];
    }

    /** Composer success and clearing its recoverable draft are one database commit. */
    public synchronized String createFromDraft(String source, String category, String date, JSONObject content, String draftSlot) throws Exception {
        final String[] key = new String[1];
        change(candidate -> {
            key[0] = createIn(candidate, source, category, date, content);
            candidate.getJSONObject("drafts").remove(draftSlot);
        });
        return key[0];
    }

    public synchronized JSONObject staging() {
        JSONObject stage = state.optJSONObject("sync_stage");
        return stage == null ? new JSONObject() : JsonUtil.copy(stage);
    }

    public synchronized void staging(JSONObject stage) throws Exception {
        if (stage == null) throw new IllegalArgumentException("同步暂存无效");
        change(candidate -> candidate.put("sync_stage", JsonUtil.copy(stage)));
    }

    private static String createIn(JSONObject candidate, String source, String category, String date, JSONObject content) throws Exception {
        if (!isOneOf(source, "todo", "note_entry", "memo_group", "memo_note"))
            throw new IllegalArgumentException("此类记录不支持本机新建");
        String id = UUID.randomUUID().toString(), key = keyFor(source, category, id);
        String time = Instant.now().toString();
        JSONObject row = new JSONObject().put("entity_id", key).put("source_id", id).put("source", source)
                .put("entity_type", typeFor(source, category)).put("date", date == null ? JSONObject.NULL : date)
                .put("version", 0).put("created_at", time).put("updated_at", time).put("deleted_at", JSONObject.NULL);
        if ("note_entry".equals(source)) row.put("category", category);
        overlayEditable(row, content, source);
        if ("todo".equals(source)) row.put("completed", false);
        validateRow(row);
        candidate.getJSONObject("entities").put(key, new JSONObject().put("server", JSONObject.NULL).put("local", row).put("dirty", true));
        enqueue(candidate, row, "upsert");
        return key;
    }

    public synchronized void edit(String key, JSONObject content) throws Exception {
        change(candidate -> editIn(candidate, key, content));
    }

    /** Commit an editor save and clearing its two recoverable draft fields atomically. */
    public synchronized void editFromDraft(String key, JSONObject content, String bodyDraftSlot, String titleDraftSlot) throws Exception {
        change(candidate -> {
            editIn(candidate, key, content);
            if (bodyDraftSlot != null) candidate.getJSONObject("drafts").remove(bodyDraftSlot);
            if (titleDraftSlot != null) candidate.getJSONObject("drafts").remove(titleDraftSlot);
        });
    }

    private static void editIn(JSONObject candidate, String key, JSONObject content) throws Exception {
        JSONObject entry = editableEntry(candidate, key), row = JsonUtil.copy(entry.getJSONObject("local"));
        String source = row.getString("source");
        if ("memo_note".equals(source) && content.has("group_id")
                && !row.getString("group_id").equals(content.getString("group_id")))
            throw new IllegalArgumentException("已有备忘录不可直接移动分组，请保留原文并新建副本");
        if ("todo".equals(source)) {
            if (!entry.isNull("server") || hasFrozen(candidate, key))
                throw new IllegalStateException("线上待办内容不可直接改名，请新建一条待办；原内容已保留");
            // A completion operation carries an older text too; do not reorder that dependency.
            if (hasAction(candidate, key, "complete"))
                throw new IllegalStateException("此待办已有完成操作，请同步后新建更名记录");
        }
        overlayEditable(row, content, source);
        row.put("updated_at", Instant.now().toString());
        validateRow(row);
        entry.put("local", row).put("dirty", true);
        enqueue(candidate, row, "upsert");
    }

    public synchronized void setComplete(String key, boolean completed) throws Exception {
        change(candidate -> {
            JSONObject entry = editableEntry(candidate, key), row = JsonUtil.copy(entry.getJSONObject("local"));
            if (!"todo".equals(row.getString("source"))) throw new IllegalArgumentException("此记录没有完成状态");
            if (completed(row) == completed) return;
            row.put("completed", completed).put("updated_at", Instant.now().toString());
            entry.put("local", row).put("dirty", true);
            enqueue(candidate, row, "complete");
        });
    }

    public synchronized void remove(String key) throws Exception {
        change(candidate -> {
            JSONObject entry = editableEntry(candidate, key), row = JsonUtil.copy(entry.getJSONObject("local"));
            if ("memo_group".equals(row.getString("source"))) {
                for (String otherKey : JsonUtil.keys(candidate.getJSONObject("entities"))) {
                    JSONObject other = candidate.getJSONObject("entities").getJSONObject(otherKey).getJSONObject("local");
                    if ("memo_note".equals(other.optString("source"))
                            && row.getString("source_id").equals(other.optString("group_id")) && !deleted(other))
                        throw new IllegalStateException("请先处理组内笔记；本机首版不批量删除备忘录组");
                }
            }
            row.put("deleted_at", Instant.now().toString()).put("updated_at", Instant.now().toString());
            entry.put("local", row);
            if (entry.isNull("server") && !hasFrozen(candidate, key)) {
                removeOperations(candidate, key);
                entry.put("dirty", false).put("local_only_deleted", true);
            } else {
                entry.put("dirty", true);
                enqueue(candidate, row, "delete");
            }
        });
    }

    public synchronized void setDraft(String slot, String text) throws Exception {
        if (slot == null || slot.isEmpty() || text == null) throw new IllegalArgumentException("草稿不能为空");
        change(candidate -> candidate.getJSONObject("drafts").put(slot, text));
    }

    public synchronized String draft(String slot) { return state.optJSONObject("drafts").optString(slot, ""); }

    /** An explicitly emptied editor is a draft too; only a successful submit consumes its slot. */
    public synchronized boolean containsDraft(String slot) {
        return slot != null && state.optJSONObject("drafts").has(slot);
    }

    public synchronized void setUiState(String key, String value) throws Exception {
        if (key == null || value == null) throw new IllegalArgumentException("界面状态无效");
        change(candidate -> candidate.getJSONObject("ui").put(key, value));
    }

    public synchronized String uiState(String key, String fallback) { return state.optJSONObject("ui").optString(key, fallback); }

    public synchronized JSONObject nextOperation() {
        JSONArray operations = state.optJSONArray("operations");
        if (operations.length() == 0) return null;
        JSONObject first = operations.optJSONObject(0);
        return "conflict".equals(first.optString("status")) ? null : JsonUtil.copy(first);
    }

    public synchronized JSONObject confirmed(String key) {
        JSONObject entry = state.optJSONObject("entities").optJSONObject(key);
        return entry == null ? null : JsonUtil.copy(entry.optJSONObject("server"));
    }

    public synchronized JSONObject freezeOperation(String opId, JSONObject wire) throws Exception {
        final JSONObject[] result = new JSONObject[1];
        if (wire == null) throw new IllegalArgumentException("同步请求不能为空");
        change(candidate -> {
            JSONArray operations = candidate.getJSONArray("operations");
            JSONObject operation = findOperation(candidate, opId);
            if (operation == null) throw new IllegalArgumentException("同步操作不存在");
            if (operations.length() == 0 || !opId.equals(operations.getJSONObject(0).getString("op_id")))
                throw new IllegalStateException("同步操作必须依次提交");
            if ("conflict".equals(operation.getString("status"))) throw new IllegalStateException("请先处理冲突");
            JSONObject existing = operation.optJSONObject("wire");
            if (existing != null && !JsonUtil.equal(existing, wire))
                throw new IllegalStateException("已尝试的同步请求不可改变；请保留原操作并核对结果");
            operation.put("wire", JsonUtil.copy(wire)).put("status", "frozen");
            result[0] = JsonUtil.copy(operation);
        });
        return result[0];
    }

    public synchronized void acknowledge(String opId, JSONObject serverRow) throws Exception {
        change(candidate -> {
            JSONObject operation = findOperation(candidate, opId);
            if (operation == null) return; // Repeated completion notifications cannot acknowledge another request.
            JSONArray queue = candidate.getJSONArray("operations");
            if (queue.length() == 0 || !opId.equals(queue.getJSONObject(0).getString("op_id"))
                    || operation.optJSONObject("wire") == null)
                throw new IllegalStateException("只可确认已冻结且依次提交的操作");
            String key = operation.getString("entity_id");
            if (serverRow == null || !key.equals(serverRow.optString("entity_id")))
                throw new IllegalArgumentException("同步收据身份不匹配");
            JSONObject entry = candidate.getJSONObject("entities").getJSONObject(key);
            if (serverRow.optLong("version", -1) < 1) throw new IllegalArgumentException("同步收据版本无效");
            long oldVersion = entry.optJSONObject("server") == null ? 0 : entry.getJSONObject("server").optLong("version");
            if (serverRow.getLong("version") < oldVersion) throw new IllegalArgumentException("同步收据比已确认数据更旧");
            entry.put("server", JsonUtil.copy(serverRow));
            JSONArray operations = candidate.getJSONArray("operations");
            for (int index = 0; index < operations.length(); index++)
                if (opId.equals(operations.getJSONObject(index).getString("op_id"))) { operations.remove(index); break; }
            boolean more = hasPending(candidate, key);
            entry.put("dirty", more);
            if (!more) entry.put("local", JsonUtil.copy(serverRow));
        });
    }

    public synchronized void markConflict(String opId, JSONObject remoteOrNull, String reason) throws Exception {
        change(candidate -> {
            JSONObject operation = findOperation(candidate, opId);
            if (operation == null) return;
            markConflictIn(candidate, operation, remoteOrNull, reason);
        });
    }

    private static void markConflictIn(JSONObject candidate, JSONObject operation, JSONObject remote, String reason) throws Exception {
        String key = operation.getString("entity_id");
        JSONObject entry = candidate.getJSONObject("entities").getJSONObject(key);
        if (remote != null && !key.equals(remote.optString("entity_id")))
            throw new IllegalArgumentException("冲突数据身份不匹配");
        JSONObject conflict = unresolvedConflict(candidate, key);
        if (conflict == null) {
            conflict = new JSONObject().put("op_id", operation.getString("op_id")).put("entity_id", key)
                    .put("baseline", entry.isNull("server") ? JSONObject.NULL : JsonUtil.copy(entry.getJSONObject("server")))
                    .put("local", JsonUtil.copy(entry.getJSONObject("local"))).put("operation", JsonUtil.copy(operation))
                    .put("created_at", Instant.now().toString()).put("resolved", false);
            candidate.getJSONArray("conflicts").put(conflict);
        }
        conflict.put("remote", remote == null ? JSONObject.NULL : JsonUtil.copy(remote)).put("reason", reason == null ? "线上版本已变化" : reason);
        operation.put("status", "conflict");
        entry.put("dirty", true);
    }

    public synchronized void resolveUsingServer(String opId) throws Exception {
        change(candidate -> resolveIn(candidate, opId));
    }

    private static JSONObject resolveIn(JSONObject candidate, String opId) throws Exception {
        JSONObject conflict = conflictByOperation(candidate, opId);
        if (conflict == null || conflict.optBoolean("resolved")) throw new IllegalArgumentException("待处理冲突不存在");
        String key = conflict.getString("entity_id");
        JSONObject entry = candidate.getJSONObject("entities").getJSONObject(key);
        JSONObject desired = JsonUtil.copy(entry.getJSONObject("local"));
        conflict.put("local", JsonUtil.copy(desired)).put("retained_operations", operationsFor(candidate, key))
                .put("resolved", true).put("resolved_at", Instant.now().toString()).put("resolution", "server_with_local_archive");
        removeOperations(candidate, key);
        JSONObject remote = conflict.optJSONObject("remote");
        if (remote == null) {
            JSONObject tombstone = JsonUtil.copy(desired).put("deleted_at", Instant.now().toString()).put("remote_missing", true);
            entry.put("server", JSONObject.NULL).put("local", tombstone).put("dirty", false);
        } else entry.put("server", JsonUtil.copy(remote)).put("local", JsonUtil.copy(remote)).put("dirty", false);
        return desired;
    }

    public synchronized String resolveWithCopy(String opId) throws Exception {
        final String[] result = new String[1];
        change(candidate -> {
            JSONObject conflict = conflictByOperation(candidate, opId);
            if (conflict == null || conflict.optBoolean("resolved")) throw new IllegalArgumentException("待处理冲突不存在");
            JSONObject desired = candidate.getJSONObject("entities").getJSONObject(conflict.getString("entity_id")).getJSONObject("local");
            String source = desired.getString("source");
            if ("legacy_daily_note".equals(source)) source = "note_entry";
            if ("memo_note".equals(source)) {
                JSONObject parent = candidate.getJSONObject("entities").optJSONObject("memo-group:" + desired.optString("group_id"));
                if (parent == null || deleted(parent.getJSONObject("local")))
                    throw new IllegalStateException("原备忘录组不可用；本地内容仍保留，请先新建或选择有效分组");
            }
            JSONObject content = JsonUtil.copy(desired);
            resolveIn(candidate, opId);
            result[0] = createIn(candidate, source, desired.optString("category", null),
                    desired.isNull("date") ? null : desired.optString("date", null), content);
            conflict.put("resolution", "new_identity_with_local_archive").put("copy_entity_id", result[0]);
            if ("todo".equals(source) && completed(desired)) {
                JSONObject entry = candidate.getJSONObject("entities").getJSONObject(result[0]);
                JSONObject completed = JsonUtil.copy(entry.getJSONObject("local")).put("completed", true);
                entry.put("local", completed);
                enqueue(candidate, completed, "complete");
            }
        });
        return result[0];
    }

    /**
     * Applies only a verified COMPLETE workbench manifest. A partial download must
     * never call this method. Article reads are intentionally outside this set.
     */
    public synchronized void applyRemote(String accountId, String scopeId, JSONArray normalizedRows, JSONObject manifest) throws Exception {
        if (normalizedRows == null || manifest == null || !manifest.optBoolean("complete")
                || !"haoduoyu-workbench-snapshot-v1".equals(manifest.optString("snapshot_format")))
            throw new IllegalArgumentException("未取得完整快照，本机数据保持不变");
        change(candidate -> {
            pin(candidate, "account_id", accountId);
            pin(candidate, "scope_id", scopeId);
            if (!scopeId.equals(manifest.optString("scope_id"))) throw new IllegalArgumentException("快照身份范围不一致");
            JSONObject entities = candidate.getJSONObject("entities");
            Set<String> seen = new HashSet<>();
            for (int index = 0; index < normalizedRows.length(); index++) {
                JSONObject remote = JsonUtil.copy(normalizedRows.getJSONObject(index));
                String key = remote.getString("entity_id");
                if (!seen.add(key) || key.startsWith("article:") || remote.optLong("version", 0) < 1)
                    throw new IllegalArgumentException("快照实体无效或重复");
                JSONObject existing = entities.optJSONObject(key);
                if (existing == null) {
                    entities.put(key, new JSONObject().put("server", remote).put("local", JsonUtil.copy(remote)).put("dirty", false));
                    continue;
                }
                JSONObject baseline = existing.optJSONObject("server");
                if (baseline != null && remote.getLong("version") < baseline.optLong("version", 0))
                    throw new IllegalStateException("收到比已确认数据更旧的快照，保留本机数据并暂停本次对账");
                if (!existing.optBoolean("dirty")) {
                    existing.put("server", remote).put("local", JsonUtil.copy(remote)).put("dirty", false);
                } else if (baseline == null || !sameRemote(baseline, remote)) {
                    JSONObject first = firstFor(candidate, key);
                    if (first != null) markConflictIn(candidate, first, remote, deleted(remote)
                            ? "线上记录已删除，未恢复或覆盖；本地内容仍保留" : "线上记录已更新，本地修改保留待核对");
                } else existing.put("server", JsonUtil.copy(remote)); // Upgrade a receipt placeholder to the exact verified row.
            }
            for (String key : JsonUtil.keys(entities)) {
                if (seen.contains(key) || key.startsWith("article:")) continue;
                JSONObject entry = entities.getJSONObject(key);
                if (entry.isNull("server")) continue; // New offline records are not missing server rows.
                JSONObject first = firstFor(candidate, key);
                if (first != null) markConflictIn(candidate, first, null, "完整清单中已无此记录，本地内容保留，未重新创建");
                else {
                    JSONObject tombstone = JsonUtil.copy(entry.getJSONObject("local"))
                            .put("deleted_at", Instant.now().toString()).put("remote_missing", true);
                    entry.put("local", tombstone).put("dirty", false);
                }
            }
            candidate.put("manifest", JsonUtil.copy(manifest)).put("last_pull_at", Instant.now().toString()).put("sync_stage", new JSONObject());
        });
    }

    public synchronized void cacheArticles(JSONArray rows, long fetchedAt) throws Exception {
        if (rows == null) throw new IllegalArgumentException("图文记录无效");
        change(candidate -> {
            JSONObject entities = candidate.getJSONObject("entities");
            for (int index = 0; index < rows.length(); index++) {
                JSONObject row = JsonUtil.copy(rows.getJSONObject(index));
                String id = row.optString("source_id", row.optString("id"));
                if (id.isEmpty()) throw new IllegalArgumentException("图文记录缺少身份");
                String key = "article:" + id;
                row.put("entity_id", key).put("source", "article").put("source_id", id).put("entity_type", "article")
                        .put("cached_at", fetchedAt).put("read_only", true);
                entities.put(key, new JSONObject().put("server", JsonUtil.copy(row)).put("local", row).put("dirty", false));
            }
            candidate.put("articles_fetched_at", fetchedAt);
        });
    }

    public synchronized void status(String code, String message, long retryAt) throws Exception {
        change(candidate -> candidate.put("status", new JSONObject().put("code", code == null ? "" : code)
                .put("message", message == null ? "" : message).put("retry_at", retryAt)));
    }

    private static JSONObject editableEntry(JSONObject candidate, String key) throws Exception {
        JSONObject entry = candidate.getJSONObject("entities").optJSONObject(key);
        if (entry == null) throw new IllegalArgumentException("本机记录不存在");
        JSONObject row = entry.getJSONObject("local");
        if (isOneOf(row.optString("source"), "article", "work_reminder")) throw new IllegalStateException("此类离线副本只读");
        if (deleted(row)) throw new IllegalStateException("已删除记录不可直接修改；原数据保留");
        if (unresolvedConflict(candidate, key) != null) throw new IllegalStateException("请先处理这条记录的同步冲突");
        return entry;
    }

    private static void enqueue(JSONObject candidate, JSONObject row, String action) throws Exception {
        JSONArray operations = candidate.getJSONArray("operations");
        String key = row.getString("entity_id");
        JSONObject last = operations.length() == 0 ? null : operations.optJSONObject(operations.length() - 1);
        // Only work that provably never left the process may change. Frozen requests are immutable.
        if (last != null && key.equals(last.optString("entity_id")) && action.equals(last.optString("action"))
                && "queued".equals(last.optString("status")) && last.isNull("wire")) {
            last.put("payload", JsonUtil.copy(row));
            return;
        }
        if (operations.length() >= MAX_OPERATIONS) throw new IllegalStateException("待同步操作过多，请先同步或处理冲突；本次更改未保存");
        operations.put(new JSONObject().put("op_id", UUID.randomUUID().toString()).put("entity_id", key)
                .put("action", action).put("payload", JsonUtil.copy(row)).put("status", "queued")
                .put("wire", JSONObject.NULL).put("created_at", Instant.now().toString()));
    }

    private static boolean sameRemote(JSONObject left, JSONObject right) {
        if (left.optLong("version", -1) != right.optLong("version", -2)) return false;
        String leftHash = left.optString("content_hash"), rightHash = right.optString("content_hash");
        if (!leftHash.isEmpty() && !rightHash.isEmpty()) return leftHash.equals(rightHash);
        // A receipt may omit timestamps or source-only fields. Version is a CAS
        // version, but effective memo-parent tombstones also need comparison.
        if (deleted(left) != deleted(right)) return false;
        if (!left.isNull("deleted_at") && !right.isNull("deleted_at")
                && !left.optString("deleted_at").equals(right.optString("deleted_at"))) return false;
        for (String field : new String[]{"text", "title", "body", "group_id", "position", "category", "date"}) {
            if (left.has(field) && right.has(field) && !JsonUtil.equal(left.opt(field), right.opt(field))) return false;
        }
        if (left.has("completed") && right.has("completed")
                && completed(left) != completed(right)) return false;
        return true;
    }

    private static boolean completed(JSONObject row) {
        Object value = row.opt("completed");
        return Boolean.TRUE.equals(value) || value instanceof Number && ((Number) value).intValue() == 1;
    }

    private static JSONObject findOperation(JSONObject candidate, String id) throws Exception {
        JSONArray operations = candidate.getJSONArray("operations");
        for (int index = 0; index < operations.length(); index++) {
            JSONObject operation = operations.getJSONObject(index);
            if (id.equals(operation.getString("op_id"))) return operation;
        }
        return null;
    }

    private static JSONObject firstFor(JSONObject candidate, String key) throws Exception {
        JSONArray operations = candidate.getJSONArray("operations");
        for (int index = 0; index < operations.length(); index++)
            if (key.equals(operations.getJSONObject(index).getString("entity_id"))) return operations.getJSONObject(index);
        return null;
    }

    private static boolean hasPending(JSONObject candidate, String key) throws Exception { return firstFor(candidate, key) != null; }

    private static boolean hasFrozen(JSONObject candidate, String key) throws Exception {
        JSONArray operations = candidate.getJSONArray("operations");
        for (int index = 0; index < operations.length(); index++) {
            JSONObject operation = operations.getJSONObject(index);
            if (key.equals(operation.getString("entity_id")) && operation.optJSONObject("wire") != null) return true;
        }
        return false;
    }

    private static boolean hasAction(JSONObject candidate, String key, String action) throws Exception {
        JSONArray operations = candidate.getJSONArray("operations");
        for (int index = 0; index < operations.length(); index++) {
            JSONObject operation = operations.getJSONObject(index);
            if (key.equals(operation.getString("entity_id")) && action.equals(operation.getString("action"))) return true;
        }
        return false;
    }

    private static JSONArray operationsFor(JSONObject candidate, String key) throws Exception {
        JSONArray result = new JSONArray(), operations = candidate.getJSONArray("operations");
        for (int index = 0; index < operations.length(); index++)
            if (key.equals(operations.getJSONObject(index).getString("entity_id"))) result.put(JsonUtil.copy(operations.getJSONObject(index)));
        return result;
    }

    private static void removeOperations(JSONObject candidate, String key) throws Exception {
        JSONArray operations = candidate.getJSONArray("operations");
        for (int index = operations.length() - 1; index >= 0; index--)
            if (key.equals(operations.getJSONObject(index).getString("entity_id"))) operations.remove(index);
    }

    private static JSONObject unresolvedConflict(JSONObject candidate, String key) throws Exception {
        JSONArray conflicts = candidate.getJSONArray("conflicts");
        for (int index = 0; index < conflicts.length(); index++) {
            JSONObject conflict = conflicts.getJSONObject(index);
            if (key.equals(conflict.optString("entity_id")) && !conflict.optBoolean("resolved")) return conflict;
        }
        return null;
    }

    private static JSONObject conflictByOperation(JSONObject candidate, String opId) throws Exception {
        JSONArray conflicts = candidate.getJSONArray("conflicts");
        for (int index = 0; index < conflicts.length(); index++)
            if (opId.equals(conflicts.getJSONObject(index).optString("op_id"))) return conflicts.getJSONObject(index);
        return null;
    }

    private static void overlayEditable(JSONObject row, JSONObject content, String source) throws Exception {
        if (content == null) throw new IllegalArgumentException("内容不能为空");
        String[] fields;
        switch (source) {
            case "todo": fields = new String[]{"text"}; break;
            case "note_entry": case "legacy_daily_note": fields = new String[]{"text"}; break;
            case "memo_group": fields = new String[]{"title", "position"}; break;
            case "memo_note": fields = new String[]{"title", "position", "group_id", "body"}; break;
            default: throw new IllegalArgumentException("此类记录只读");
        }
        for (String field : fields) if (content.has(field)) row.put(field, content.get(field));
    }

    private static void validateRow(JSONObject row) throws Exception {
        String source = row.getString("source");
        if (isOneOf(source, "todo", "note_entry", "legacy_daily_note")) {
            String text = row.getString("text");
            plain(text);
            text = "todo".equals(source) ? webTrim(text) : text.replace("\r\n", "\n").replace('\r', '\n');
            row.put("text", text);
            if ("todo".equals(source) && (text.trim().isEmpty() || text.length() > 500))
                throw new IllegalArgumentException("待办内容需为 1–500 字");
            if (text.getBytes(StandardCharsets.UTF_8).length > 65536)
                throw new IllegalArgumentException("内容超过 64 KiB，草稿保留，请拆分记录");
            String date = row.getString("date");
            try { java.time.LocalDate.parse(date); } catch (RuntimeException error) { throw new IllegalArgumentException("日期无效", error); }
            if ("note_entry".equals(source) && !isOneOf(row.optString("category"), "life", "work"))
                throw new IllegalArgumentException("碎碎念分类无效");
        }
        if (isOneOf(source, "memo_group", "memo_note")) {
            String title = webTrim(row.getString("title"));
            plain(title);
            if (title.isEmpty() || title.codePointCount(0, title.length()) > 120
                    || title.indexOf('\n') >= 0 || title.indexOf('\r') >= 0 || title.indexOf('\t') >= 0)
                throw new IllegalArgumentException("备忘录标题需为 1–120 字的单行文本");
            row.put("title", title);
            long position = row.getLong("position");
            if (position < 0 || position > 1000000) throw new IllegalArgumentException("备忘录顺序无效");
            if ("memo_note".equals(source)) {
                String body = row.getString("body"); plain(body);
                body = body.replace("\r\n", "\n").replace('\r', '\n');
                row.put("body", body);
                if (body.getBytes(StandardCharsets.UTF_8).length > 65536) throw new IllegalArgumentException("备忘录正文超过 64 KiB，草稿保留");
                UUID.fromString(row.getString("group_id"));
            }
        }
    }

    private static void plain(String value) {
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character < 0x20 && character != '\n' && character != '\r' && character != '\t' || character == 0x7f)
                throw new IllegalArgumentException("内容包含不支持的控制字符");
            if (Character.isHighSurrogate(character)) {
                if (index + 1 >= value.length() || !Character.isLowSurrogate(value.charAt(++index))) throw new IllegalArgumentException("文本编码不完整");
            } else if (Character.isLowSurrogate(character)) throw new IllegalArgumentException("文本编码不完整");
        }
    }

    /** Match ECMAScript String.trim used by the shared server input validators. */
    private static String webTrim(String value) {
        int start = 0, end = value.length();
        while (start < end && webSpace(value.charAt(start))) start++;
        while (end > start && webSpace(value.charAt(end - 1))) end--;
        return value.substring(start, end);
    }

    private static boolean webSpace(char value) {
        return value >= '\t' && value <= '\r' || value == ' ' || value == '\u00a0' || value == '\u1680'
                || value >= '\u2000' && value <= '\u200a' || value == '\u2028' || value == '\u2029'
                || value == '\u202f' || value == '\u205f' || value == '\u3000' || value == '\ufeff';
    }

    private static boolean deleted(JSONObject row) { return row.has("deleted_at") && !row.isNull("deleted_at") || row.optBoolean("deleted"); }

    private static String keyFor(String source, String category, String id) {
        switch (source) {
            case "todo": return "todo:" + id;
            case "note_entry": return "note-entry:" + id;
            case "legacy_daily_note": return "legacy-" + category + ":" + id;
            case "memo_group": return "memo-group:" + id;
            case "memo_note": return "memo-note:" + id;
            default: throw new IllegalArgumentException("不支持的本机实体类型");
        }
    }

    private static String typeFor(String source, String category) {
        if ("note_entry".equals(source) || "legacy_daily_note".equals(source)) return category + "_note";
        return source;
    }

    private static boolean isOneOf(String value, String... allowed) {
        for (String option : allowed) if (option.equals(value)) return true;
        return false;
    }
}
