package xyz.haoduoyu.personal.offline;

import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONException;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Conservative offline reconciliation over the existing versioned APIs.
 * No client-clock cursor, last-write-wins, identity fallback, or blind write replay.
 */
public final class SyncEngine {
    static final String FORMAT = "haoduoyu-workbench-snapshot-v1";
    static final String[] COLLECTIONS = {"todos", "life_notes", "work_notes", "work_reminders", "memo_groups", "memos"};
    private static final int MAX_REQUESTS = 32;
    private static final int MAX_WRITES = 4;
    private static final long MAX_PASS_MILLIS = 60000;
    private static final String UUID = "[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}";
    private final LocalRepository repository;
    private final ApiClient api;
    private long started;
    private int requests;
    private String account;

    private static final class MoreWork extends Exception { }
    private static final class ProtocolProblem extends IOException {
        final String code;
        ProtocolProblem(String code, String text) { super(text); this.code = code; }
    }

    public SyncEngine(LocalRepository repository, ApiClient api) {
        this.repository = repository;
        this.api = api;
    }

    /** Expected network/auth/conflict outcomes are stored; persistence failures propagate. */
    public synchronized void run() throws Exception {
        started = System.currentTimeMillis();
        requests = 0;
        account = repository.snapshot().optString("account_id", "");
        long serverRetryUntil;
        try { serverRetryUntil = Long.parseLong(repository.uiState("server_retry_until", "0")); }
        catch (NumberFormatException invalidRetry) { serverRetryUntil = 0; }
        if (serverRetryUntil > System.currentTimeMillis()) {
            repository.status("retry", "服务端要求稍后重试，本地内容与队列已保留", serverRetryUntil);
            return;
        }
        try {
            JSONObject me = get("/auth/me");
            if (!ApiClient.isPublicBusiness(me)) {
                throw new ProtocolProblem("identity_not_supported", "当前接口返回的不是免登录公共工作台身份；本版本不会切换账号或重放旧队列，本地内容均已保留");
            }
            JSONObject initialIndex = readIndex();
            JSONObject oldWorkspace = repository.workspace();
            if ("public".equals(oldWorkspace.optString("mode"))
                    && (!ApiClient.ORIGIN.equals(oldWorkspace.optString("origin"))
                    || !initialIndex.getString("scope_id").equals(oldWorkspace.optString("scope_id")))) {
                throw new ProtocolProblem("scope_changed", "公共工作台目标范围发生变化，已暂停同步；旧队列与本地内容保留，原公开上传同意不适用于新目标");
            }
            JSONObject workspace;
            try {
                workspace = repository.discoverPublicTarget(ApiClient.ORIGIN, initialIndex.getString("scope_id"));
            } catch (IllegalStateException incompatibleLegacyIdentity) {
                throw new ProtocolProblem("identity_not_supported", "本机保留了旧版私有账号或已尝试的原身份操作；未迁移这些操作，也未上传到公共工作台，请先核对保留数据");
            }
            account = workspace.getString("account_id");
            require("public".equals(workspace.optString("mode"))
                    && ApiClient.ORIGIN.equals(workspace.optString("origin"))
                    && initialIndex.getString("scope_id").equals(workspace.optString("scope_id"))
                    && LocalRepository.publicAccountId(ApiClient.ORIGIN, initialIndex.getString("scope_id")).equals(account),
                    "公共工作台身份与已核验范围不一致");
            checkScope(initialIndex);
            if (!repository.publicUploadAllowed(ApiClient.ORIGIN, initialIndex.getString("scope_id"))) {
                // Discovery and downloads are read-only. Consent is a separate explicit UI action.
                pull();
                try { cachePublishedArticles(); }
                catch (MoreWork more) { throw more; }
                catch (InterruptedIOException interrupted) { throw interrupted; }
                catch (Exception optionalReadFailure) {
                    // Optional published metadata never turns a verified core pull into a partial apply.
                    if (optionalReadFailure instanceof ApiClient.ApiException
                            && ((ApiClient.ApiException) optionalReadFailure).retryAfterMillis > 0) {
                        long wait = System.currentTimeMillis() + Math.min(86400000L,
                                ((ApiClient.ApiException) optionalReadFailure).retryAfterMillis);
                        repository.setUiState("server_retry_until", Long.toString(wait));
                    }
                }
                repository.setUiState("sync_failures", "0");
                repository.status("public_consent_required", "已读取公共工作台；本地修改尚未公开上传，请确认此目标后启用自动同步", 0);
                return;
            }
            int writes = 0;
            // Recover an attempted request before pulling its own committed result as a conflict.
            JSONObject head = repository.nextOperation();
            while (head != null && "frozen".equals(head.optString("status")) && writes < MAX_WRITES) {
                if (!sendOperation(head)) { reportConflict(); return; }
                writes++;
                pull();
                head = repository.nextOperation();
            }
            pull();
            while ((head = repository.nextOperation()) != null && writes < MAX_WRITES) {
                if (!sendOperation(head)) { reportConflict(); return; }
                writes++;
                // A later local edit never receives a fresh version without a remote comparison.
                pull();
            }
            if (repository.nextOperation() != null) throw new MoreWork();
            if (hasConflict()) { reportConflict(); return; }
            try {
                cachePublishedArticles();
                repository.setUiState("sync_failures", "0");
                repository.setUiState("server_retry_until", "0");
                repository.status("synced", "已与网页版同步；本地数据可离线使用", 0);
            } catch (MoreWork more) {
                throw more;
            } catch (InterruptedIOException interrupted) {
                throw interrupted;
            } catch (Exception optionalReadFailure) {
                repository.setUiState("sync_failures", "0");
                if (optionalReadFailure instanceof ApiClient.ApiException
                        && ((ApiClient.ApiException) optionalReadFailure).retryAfterMillis > 0) {
                    long wait = System.currentTimeMillis() + Math.min(86400000L,
                            ((ApiClient.ApiException) optionalReadFailure).retryAfterMillis);
                    repository.setUiState("server_retry_until", Long.toString(wait));
                }
                repository.status("synced_articles_stale", "工作台已同步；图文记录暂未刷新，仍显示此前实际缓存", 0);
            }
        } catch (MoreWork more) {
            repository.status("syncing_more", "正在分批同步，本地内容已保存；将自动继续", System.currentTimeMillis() + 5000);
        } catch (ProtocolProblem problem) {
            repository.status(problem.code, problem.getMessage(),
                    "snapshot_changed".equals(problem.code) ? System.currentTimeMillis() + 10000 : 0);
        } catch (ApiClient.ApiException failure) {
            if (failure.status == 401 || failure.status == 403) {
                repository.status("public_access_denied", "公共工作台暂不可访问或无编辑权限；本地队列已保留，不会改用其他身份上传", 0);
            } else if (failure.status == 429 || failure.status >= 500) {
                repository.status("retry", "网络或服务暂不可用，本地内容已保存，将自动重试", retryAt(failure.retryAfterMillis));
            } else {
                repository.status("needs_attention", "同步暂时停止（" + failure.code + "），本地内容已保留", 0);
            }
        } catch (InterruptedIOException interrupted) {
            repository.status("retry", "同步已暂停，本地内容和原操作均已保留", System.currentTimeMillis() + 30000);
        } catch (ApiClient.TransportException network) {
            repository.status("retry", "当前无法连接，本地内容已保存，将在网络恢复后重试", retryAt(0));
        } catch (JSONException malformedResponse) {
            repository.status("needs_attention", "接口数据格式与离线协议不符；本地内容和原操作已保留", 0);
        }
    }

    private long retryAt(long requestedDelay) throws Exception {
        int failures;
        try { failures = Integer.parseInt(repository.uiState("sync_failures", "0")); }
        catch (NumberFormatException invalidCount) { failures = 0; }
        failures = Math.max(1, Math.min(10, failures + 1));
        repository.setUiState("sync_failures", Integer.toString(failures));
        long now = System.currentTimeMillis();
        long serverDelay = Math.min(86400000L, Math.max(0, requestedDelay));
        if (serverDelay > 0) repository.setUiState("server_retry_until", Long.toString(now + serverDelay));
        long delay = Math.max(serverDelay, Math.min(900000, 30000L << (failures - 1)));
        return now + delay;
    }

    private boolean hasConflict() {
        JSONArray operations = repository.snapshot().optJSONArray("operations");
        if (operations != null) for (int i = 0; i < operations.length(); i++) {
            if ("conflict".equals(operations.optJSONObject(i).optString("status"))) return true;
        }
        return false;
    }

    private void reportConflict() throws Exception {
        repository.status("conflict", "本地修改与线上版本需要核对；两份内容均已保留，不会自动覆盖", 0);
    }

    private void beforeRequest() throws Exception {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Sync interrupted");
        if (requests >= MAX_REQUESTS || System.currentTimeMillis() - started >= MAX_PASS_MILLIS) throw new MoreWork();
        requests++;
    }

    private JSONObject get(String path) throws Exception {
        beforeRequest();
        return api.object("GET", ApiClient.PREFIX + path, null);
    }

    private JSONObject request(String method, String path, JSONObject body) throws Exception {
        beforeRequest();
        return api.object(method, path, body);
    }

    private JSONObject readIndex() throws Exception {
        JSONObject index = get("/workbench-snapshot/index");
        verifyEnvelope(index, true);
        return index;
    }

    private void checkScope(JSONObject envelope) throws Exception {
        String pinned = repository.snapshot().optString("scope_id", "");
        String incoming = envelope.getString("scope_id");
        if (!pinned.isEmpty() && !pinned.equals(incoming)) {
            throw new ProtocolProblem("scope_changed", "线上数据归属范围变化，已暂停同步；本地内容和队列保留，请先核对工作台与数据归属");
        }
        if (pinned.isEmpty()) repository.bindScope(incoming);
    }

    /** Cache verified pieces privately; atomically publish only a complete stable manifest. */
    private void pull() throws Exception {
        JSONObject index = readIndex();
        checkScope(index);
        Map<String, JSONObject> descriptors = descriptorMap(index);
        Map<String, JSONObject> staged = new LinkedHashMap<>();
        JSONObject entities = repository.snapshot().optJSONObject("entities");
        if (entities != null) for (Iterator<String> it = entities.keys(); it.hasNext();) {
            String key = it.next();
            JSONObject wrapper = entities.optJSONObject(key);
            JSONObject row = wrapper == null ? null : wrapper.optJSONObject("server");
            if (row != null && descriptors.containsKey(key)
                    && row.optString("content_hash").equals(descriptors.get(key).optString("content_hash"))) {
                verifyRow(row, descriptors.get(key));
                staged.put(key, copy(row));
            }
        }
        JSONObject previousStage = repository.staging();
        if (index.getString("scope_id").equals(previousStage.optString("scope_id"))) {
            JSONObject rows = previousStage.optJSONObject("rows");
            if (rows != null) for (Iterator<String> it = rows.keys(); it.hasNext();) {
                String key = it.next();
                JSONObject row = rows.optJSONObject(key);
                if (row != null && descriptors.containsKey(key)
                        && row.optString("content_hash").equals(descriptors.get(key).optString("content_hash"))) {
                    verifyRow(row, descriptors.get(key));
                    staged.put(key, copy(row));
                }
            }
        }
        Set<String> dates = new LinkedHashSet<>();
        for (Map.Entry<String, JSONObject> item : descriptors.entrySet()) if (!staged.containsKey(item.getKey())) {
            dates.add(item.getValue().isNull("date") ? today() : item.getValue().getString("date"));
        }
        // Empty baselines are still validated by both index bookends.
        for (String date : dates) {
            JSONObject day = get("/workbench-snapshot?date=" + date);
            verifyEnvelope(day, false);
            require(date.equals(day.optString("date")), "快照响应日期与原请求不一致");
            sameManifest(index, day);
            for (JSONObject row : verifyDay(day)) staged.put(row.getString("entity_id"), copy(row));
            persistStage(index, staged);
        }
        require(staged.size() == descriptors.size(), "快照缺少记录正文，未应用部分数据");
        JSONArray all = new JSONArray();
        for (Map.Entry<String, JSONObject> item : descriptors.entrySet()) {
            JSONObject row = staged.get(item.getKey());
            require(row != null, "快照正文不完整");
            verifyRow(row, item.getValue());
            all.put(row);
        }
        JSONObject end = readIndex();
        sameManifest(index, end);
        repository.applyRemote(account, index.getString("scope_id"), all, index);
    }

    private void persistStage(JSONObject index, Map<String, JSONObject> staged) throws Exception {
        JSONObject rows = new JSONObject();
        for (Map.Entry<String, JSONObject> item : staged.entrySet()) rows.put(item.getKey(), item.getValue());
        JSONObject value = new JSONObject().put("scope_id", index.getString("scope_id"))
                .put("manifest_hash", index.getString("manifest_hash")).put("rows", rows);
        require(value.toString().getBytes(StandardCharsets.UTF_8).length <= 8 * 1024 * 1024, "本机快照暂存超过安全预算");
        repository.staging(value);
    }

    private boolean sendOperation(JSONObject original) throws Exception {
        String operationId;
        JSONObject wire;
        boolean recovered;
        // UI edits may coalesce an unattempted tail. Read/build/freeze under the same
        // repository monitor so that a just-saved edit cannot fall between those steps.
        synchronized (repository) {
            if (!repository.publicUploadAllowed(ApiClient.ORIGIN, repository.snapshot().optString("scope_id"))) {
                throw new ProtocolProblem("public_consent_required", "尚未同意向此公共工作台上传，本地操作已保留");
            }
            original = repository.nextOperation();
            if (original == null) return !hasConflict();
            operationId = original.getString("op_id");
            wire = original.optJSONObject("wire");
            recovered = wire != null;
            if (wire == null) {
                try {
                    wire = makeWire(original);
                } catch (ProtocolProblem invalidLocalOperation) {
                    repository.markConflict(operationId, repository.confirmed(original.getString("entity_id")), invalidLocalOperation.getMessage());
                    return false;
                }
                original = repository.freezeOperation(operationId, wire);
                // Store returns the operation; always use the durable request.
                JSONObject persisted = original.optJSONObject("wire");
                if (persisted != null) wire = persisted;
            }
        }
        if (!"public".equals(wire.optString("identity_mode"))
                || !ApiClient.ORIGIN.equals(wire.optString("origin"))
                || !account.equals(wire.optString("account_id"))) {
            throw new ProtocolProblem("identity_not_supported", "原请求属于不同身份或旧版签发范围，已暂停；不会改写原请求后重放");
        }
        if (!repository.snapshot().optString("scope_id").equals(wire.optString("scope_id"))) {
            throw new ProtocolProblem("scope_changed", "操作的原数据范围发生变化，已暂停同步");
        }
        String receiptPath = wire.optString("receipt_path", "");
        if (recovered && !receiptPath.isEmpty()) {
            JSONObject receipt = request("GET", receiptPath, null);
            if (receipt.optBoolean("found", false)) return acceptReceipt(original, wire, receipt);
        }
        if (recovered && receiptPath.isEmpty()) {
            JSONObject current = currentEntity(wire.getJSONObject("payload"));
            if (isExactApplied(wire, current)) {
                repository.acknowledge(operationId, current);
                return true;
            }
            long expected = wire.getLong("expected_version");
            if (current != null && (current.getLong("version") != expected || isDeleted(current))) {
                repository.markConflict(operationId, current, "原请求结果无法安全重放；线上版本已变化，本地内容已保留");
                return false;
            }
            if (expected > 0 && current == null) {
                repository.markConflict(operationId, null, "线上记录已不再可读取，本地操作不会重新创建它");
                return false;
            }
        }
        try {
            JSONObject response = request(wire.getString("method"), wire.getString("path"), wire.getJSONObject("body"));
            long version = response.optLong("version", -1);
            require(version >= wire.getLong("expected_version") && version <= wire.getLong("expected_version") + 1,
                    "保存响应版本不符合原请求，已保留操作");
            return acknowledgeKnown(original, wire, version);
        } catch (ApiClient.ApiException failure) {
            if (failure.status == 401 || failure.status == 403 || failure.status == 429 || failure.status >= 500) throw failure;
            if (failure.status == 409 && !receiptPath.isEmpty()) {
                JSONObject receipt = request("GET", receiptPath, null);
                if (receipt.optBoolean("found", false)) return acceptReceipt(original, wire, receipt);
            }
            if (failure.status == 400 || failure.status == 404 || failure.status == 409
                    || failure.status == 410 || failure.status == 413) {
                JSONObject current = currentEntity(wire.getJSONObject("payload"));
                if ((failure.status == 409 || failure.status == 410) && receiptPath.isEmpty() && isExactApplied(wire, current)) {
                    repository.acknowledge(operationId, current);
                    return true;
                }
                repository.markConflict(operationId, current, "线上拒绝原操作（" + failure.code + "）；本地内容已保留，请核对后处理");
                return false;
            }
            throw failure;
        }
    }

    private boolean acceptReceipt(JSONObject operation, JSONObject wire, JSONObject receipt) throws Exception {
        JSONObject payload = wire.getJSONObject("payload");
        require(payload.getString("source_id").equals(receipt.optString("id")), "操作收据实体不匹配");
        long expected = wire.getLong("expected_version") + 1;
        require(receipt.optLong("version", -1) == expected, "操作收据版本不匹配");
        if ("memo_group".equals(payload.getString("source"))) require("groups".equals(receipt.optString("kind")), "分组收据类型错误");
        if ("memo_note".equals(payload.getString("source"))) require("notes".equals(receipt.optString("kind")), "笔记收据类型错误");
        return acknowledgeKnown(operation, wire, expected);
    }

    private boolean acknowledgeKnown(JSONObject operation, JSONObject wire, long version) throws Exception {
        JSONObject current = currentEntity(wire.getJSONObject("payload"));
        if (current == null || current.getLong("version") != version || !matchesDesired(wire, current)) {
            repository.markConflict(operation.getString("op_id"), current,
                    "原操作已有回应，但线上内容随后发生变化；本地修改与线上版本均已保留");
            return false;
        }
        repository.acknowledge(operation.getString("op_id"), current);
        return true;
    }

    /** A single-date snapshot gives tombstones too; a normal list endpoint does not. */
    private JSONObject currentEntity(JSONObject payload) throws Exception {
        String date = payload.isNull("date") ? today() : payload.optString("date", today());
        require(validDay(date), "本地记录日期无效");
        JSONObject day = get("/workbench-snapshot?date=" + date);
        verifyEnvelope(day, false);
        require(date.equals(day.optString("date")), "记录核对响应日期与原请求不一致");
        checkScope(day);
        for (JSONObject row : verifyDay(day)) if (payload.getString("entity_id").equals(row.getString("entity_id"))) return row;
        return null;
    }

    private boolean isExactApplied(JSONObject wire, JSONObject current) throws Exception {
        if (current == null || !matchesDesired(wire, current)) return false;
        long version = current.getLong("version"), expected = wire.getLong("expected_version");
        if (version == expected + 1) return true;
        // Legacy daily-note PUT may intentionally be a no-op and has no receipt endpoint.
        return "legacy_daily_note".equals(wire.getJSONObject("payload").getString("source"))
                && "upsert".equals(wire.getString("action")) && version == expected;
    }

    private boolean matchesDesired(JSONObject wire, JSONObject current) throws Exception {
        JSONObject payload = wire.getJSONObject("payload");
        String action = wire.getString("action"), source = payload.getString("source");
        if ("delete".equals(action)) return isDeleted(current);
        if (isDeleted(current)) return false;
        if ("todo".equals(source)) {
            if (!payload.optString("date").equals(current.optString("date"))
                    || !payload.optString("text").trim().equals(current.optString("text"))) return false;
            return completed(current) == ("complete".equals(action) && completed(payload));
        }
        if ("note_entry".equals(source)) return payload.optString("text").equals(current.optString("text"))
                && payload.optString("category").equals(current.optString("category"))
                && payload.optString("date").equals(current.optString("date"));
        if ("legacy_daily_note".equals(source)) return payload.optString("text").equals(current.optString("text"));
        if ("memo_group".equals(source) || "memo_note".equals(source)) {
            if (!payload.optString("title").trim().equals(current.optString("title"))
                    || payload.optInt("position", 0) != current.optInt("position", -1)) return false;
            return !"memo_note".equals(source) || payload.optString("body").equals(current.optString("body"))
                    && payload.optString("group_id").equals(current.optString("group_id"));
        }
        return false;
    }

    private JSONObject makeWire(JSONObject operation) throws Exception {
        String operationId = operation.getString("op_id"), key = operation.getString("entity_id");
        require(operationId.matches(UUID), "本地操作标识无效");
        JSONObject payload = copy(operation.getJSONObject("payload"));
        String source = payload.getString("source"), id = payload.getString("source_id");
        String action = operation.getString("action");
        JSONObject confirmed = repository.confirmed(key);
        long version = confirmed == null ? 0 : confirmed.getLong("version");
        if (confirmed != null && isDeleted(confirmed)) throw new ProtocolProblem("conflict", "线上已删除的记录不会自动恢复");
        JSONObject body = new JSONObject();
        String path, method, receipt = "";
        if ("todo".equals(source)) {
            require(id.matches(UUID) && validDay(payload.optString("date")), "待办标识或日期无效");
            if ("delete".equals(action)) {
                require(version > 0, "待办尚未建立线上基线");
                method = "DELETE"; path = "/todos/" + id;
                body.put("date", payload.getString("date")).put("version", version);
            } else if ("complete".equals(action)) {
                require(version > 0, "待办创建操作尚未确认");
                method = "PATCH"; path = "/todos/" + id;
                body.put("completed", completed(payload)).put("version", version);
            } else {
                require(version == 0, "当前待办接口不支持修改已保存的标题，请复制为新待办");
                method = "POST"; path = "/todos";
                body.put("id", id).put("date", payload.getString("date")).put("text", payload.getString("text").trim());
            }
        } else if ("note_entry".equals(source)) {
            require(id.matches(UUID), "碎碎念标识无效");
            method = "delete".equals(action) ? "DELETE" : "PUT"; path = "/note-entries/" + id;
            body.put("version", version).put("save_id", operationId);
            if ("PUT".equals(method)) body.put("category", payload.getString("category"))
                    .put("date", payload.getString("date")).put("text", payload.getString("text"));
            receipt = "/note-entries/operations/" + operationId;
        } else if ("legacy_daily_note".equals(source)) {
            require(validDay(id) && ("life".equals(payload.optString("category")) || "work".equals(payload.optString("category"))), "兼容日记标识无效");
            method = "delete".equals(action) ? "DELETE" : "PUT";
            path = "/daily-notes/" + id + "?category=" + payload.getString("category");
            body.put("version", version).put("save_id", operationId);
            if ("PUT".equals(method)) body.put("text", payload.getString("text"));
        } else if ("memo_group".equals(source) || "memo_note".equals(source)) {
            require(id.matches(UUID), "备忘录标识无效");
            if ("memo_group".equals(source) && "delete".equals(action)) throw new ProtocolProblem("conflict", "首版保留分组删除在网页版进行，避免未经确认级联处理笔记");
            method = "delete".equals(action) ? "DELETE" : "PUT";
            path = "/memos/" + ("memo_group".equals(source) ? "groups/" : "notes/") + id;
            body.put("version", version).put("save_id", operationId);
            if ("PUT".equals(method)) {
                body.put("title", payload.getString("title").trim()).put("position", payload.optInt("position", 0));
                if ("memo_note".equals(source)) {
                    String parentId = payload.getString("group_id");
                    require(parentId.matches(UUID), "笔记分组标识无效");
                    JSONObject parent = repository.confirmed("memo-group:" + parentId);
                    require(parent != null && !isDeleted(parent), "笔记分组尚未同步或已被删除");
                    body.put("group_id", parentId).put("body", payload.getString("body"));
                }
            }
            receipt = "/memos/operations/" + operationId;
        } else throw new ProtocolProblem("conflict", "该类数据在离线首版中只读");
        return new JSONObject().put("method", method).put("path", ApiClient.PREFIX + path).put("body", body)
                .put("receipt_path", receipt.isEmpty() ? "" : ApiClient.PREFIX + receipt)
                .put("expected_version", version).put("entity_id", key).put("action", action)
                .put("payload", payload).put("account_id", account)
                .put("identity_mode", "public").put("origin", ApiClient.ORIGIN)
                .put("scope_id", repository.snapshot().getString("scope_id"));
    }

    private void cachePublishedArticles() throws Exception {
        beforeRequest();
        JSONObject response = api.request("GET", ApiClient.PREFIX + "/articles", null).body;
        JSONArray rows = response.optJSONArray("data");
        JSONObject meta = response.optJSONObject("meta");
        require(rows != null && rows.length() <= 4000 && meta != null
                && !meta.optBoolean("has_more", true) && "legacy".equals(meta.optString("pagination")), "图文列表不完整，保留此前缓存");
        JSONArray normalized = new JSONArray();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < rows.length(); i++) {
            JSONObject row = copy(rows.getJSONObject(i));
            String id = row.getString("id");
            require(id.matches(UUID) && seen.add(id), "图文列表实体标识无效");
            row.put("entity_id", "article:" + id).put("entity_type", "article").put("source", "article")
                    .put("source_id", id).put("date", JSONObject.NULL).put("deleted_at", JSONObject.NULL);
            normalized.put(row);
        }
        repository.cacheArticles(normalized, System.currentTimeMillis());
    }

    static void verifyEnvelope(JSONObject envelope, boolean index) throws Exception {
        require(FORMAT.equals(envelope.optString("snapshot_format")) && envelope.optBoolean("complete", false)
                && "current".equals(envelope.optString("projection")) && "Asia/Shanghai".equals(envelope.optString("timezone")), "快照协议或完整性标志不正确");
        String scope = envelope.optString("scope_id"), manifest = envelope.optString("manifest_hash");
        require(isHash(scope) && isHash(manifest) && isHash(envelope.optString("global_content_hash")), "快照校验字段不正确");
        JSONArray entities = envelope.optJSONArray("entities");
        require(entities != null && entities.length() <= 4000, "快照实体清单超过预算或缺失");
        JSONArray globals = new JSONArray();
        Map<String, JSONArray> dates = new LinkedHashMap<>();
        String previous = "";
        for (int i = 0; i < entities.length(); i++) {
            JSONObject descriptor = entities.getJSONObject(i);
            require(keys(descriptor).equals(new HashSet<>(Arrays.asList("entity_id", "entity_type", "date", "updated_at", "deleted_at", "content_hash"))), "快照实体清单字段不正确");
            String id = descriptor.getString("entity_id");
            require(id.compareTo(previous) > 0 && isHash(descriptor.optString("content_hash")), "快照实体重复、顺序或校验值不正确");
            previous = id;
            if (descriptor.isNull("date")) globals.put(descriptor);
            else {
                String date = descriptor.getString("date");
                require(validDay(date), "快照日期无效");
                if (!dates.containsKey(date)) dates.put(date, new JSONArray());
                dates.get(date).put(descriptor);
            }
        }
        require(dates.size() <= 1000, "快照日期超过预算");
        require(hash(new JSONObject().put("snapshot_format", FORMAT).put("scope_id", scope).put("entities", entities)).equals(manifest), "快照总清单校验失败");
        require(hash(new JSONObject().put("scope_id", scope).put("entities", globals)).equals(envelope.getString("global_content_hash")), "快照备忘录清单校验失败");
        if (index) {
            require(manifest.equals(envelope.optString("index_hash")), "快照索引校验失败");
            JSONArray dateIndex = envelope.optJSONArray("dates");
            require(dateIndex != null && dateIndex.length() == dates.size(), "快照日期清单不完整");
            List<String> ordered = new ArrayList<>(dates.keySet()); Collections.sort(ordered);
            for (int i = 0; i < dateIndex.length(); i++) {
                JSONObject value = dateIndex.getJSONObject(i);
                String date = ordered.get(i);
                require(date.equals(value.optString("date")) && hash(new JSONObject().put("scope_id", scope)
                        .put("entities", dates.get(date))).equals(value.optString("content_hash")), "快照日期清单校验失败");
            }
        } else {
            String date = envelope.optString("date");
            require(validDay(date), "快照请求日期无效");
            JSONArray selected = dates.containsKey(date) ? dates.get(date) : new JSONArray();
            require(hash(new JSONObject().put("scope_id", scope).put("entities", selected))
                    .equals(envelope.optString("date_content_hash")), "快照当日清单校验失败");
        }
    }

    static List<JSONObject> verifyDay(JSONObject day) throws Exception {
        JSONObject data = day.optJSONObject("data");
        require(data != null && keys(data).equals(new HashSet<>(Arrays.asList(COLLECTIONS))), "快照正文集合不完整");
        require(hash(new JSONObject().put("snapshot_format", FORMAT).put("scope_id", day.getString("scope_id"))
                .put("date", day.getString("date")).put("timezone", "Asia/Shanghai").put("data", data))
                .equals(day.optString("content_hash")), "快照正文整体校验失败");
        Map<String, JSONObject> descriptors = descriptorMap(day);
        Set<String> expected = new HashSet<>();
        for (Map.Entry<String, JSONObject> item : descriptors.entrySet()) {
            if (item.getValue().isNull("date") || day.getString("date").equals(item.getValue().optString("date"))) expected.add(item.getKey());
        }
        List<JSONObject> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String collection : COLLECTIONS) {
            JSONArray rows = data.optJSONArray(collection);
            require(rows != null && rows.length() <= 4000, "快照正文集合超过预算");
            String previous = "";
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.getJSONObject(i);
                String key = row.getString("entity_id");
                require(key.compareTo(previous) > 0 && expected.contains(key) && seen.add(key), "快照正文实体重复或范围不匹配");
                previous = key;
                verifyRow(row, descriptors.get(key));
                require(collectionFor(row).equals(collection), "快照实体所在集合错误");
                result.add(row);
            }
        }
        require(seen.equals(expected), "快照正文缺少完整清单中的记录");
        return result;
    }

    static void verifyRow(JSONObject row, JSONObject descriptor) throws Exception {
        require(descriptor != null, "快照正文存在清单外实体");
        JSONObject unhashed = copy(row); unhashed.remove("content_hash");
        require(isHash(row.optString("content_hash")) && hash(unhashed).equals(row.getString("content_hash")), "记录正文校验失败");
        JSONObject projection = new JSONObject();
        for (String field : new String[]{"entity_id", "entity_type", "date", "updated_at", "deleted_at", "content_hash"}) projection.put(field, row.get(field));
        require(canonical(projection).equals(canonical(descriptor)), "记录正文与清单不一致");
        long version = row.getLong("version");
        require(version >= 1 && version < 9007199254740991L, "记录版本不正确");
        String source = row.getString("source"), id = row.getString("source_id"), key = row.getString("entity_id");
        String expectedKey;
        if ("legacy_daily_note".equals(source)) {
            require(validDay(id) && ("life".equals(row.optString("category")) || "work".equals(row.optString("category"))), "旧日记标识不正确");
            expectedKey = "legacy-" + row.getString("category") + ":" + id;
        } else {
            require(id.matches(UUID), "记录标识不正确");
            Map<String, String> prefixes = new HashMap<>();
            prefixes.put("todo", "todo"); prefixes.put("note_entry", "note-entry");
            prefixes.put("memo_group", "memo-group"); prefixes.put("memo_note", "memo-note");
            prefixes.put("work_reminder", "work-reminder");
            require(prefixes.containsKey(source), "快照来源类型不正确");
            expectedKey = prefixes.get(source) + ":" + id;
        }
        require(key.equals(expectedKey), "记录稳定标识不匹配");
        collectionFor(row);
    }

    private static String collectionFor(JSONObject row) throws Exception {
        String source = row.getString("source"), type = row.getString("entity_type");
        if ("todo".equals(source) && "todo".equals(type)) return "todos";
        if (("note_entry".equals(source) || "legacy_daily_note".equals(source))
                && ("life".equals(row.optString("category")) || "work".equals(row.optString("category")))
                && (row.getString("category") + "_note").equals(type)) return row.getString("category") + "_notes";
        if ("work_reminder".equals(source) && "work_reminder".equals(type)) return "work_reminders";
        if ("memo_group".equals(source) && "memo_group".equals(type) && row.isNull("date")) return "memo_groups";
        if ("memo_note".equals(source) && "memo_note".equals(type) && row.isNull("date")) return "memos";
        throw new ProtocolProblem("needs_attention", "快照实体分类不正确");
    }

    private static Map<String, JSONObject> descriptorMap(JSONObject envelope) throws Exception {
        Map<String, JSONObject> result = new LinkedHashMap<>();
        JSONArray entities = envelope.getJSONArray("entities");
        for (int i = 0; i < entities.length(); i++) {
            JSONObject value = entities.getJSONObject(i);
            require(result.put(value.getString("entity_id"), value) == null, "快照实体清单重复");
        }
        return result;
    }

    private static void sameManifest(JSONObject first, JSONObject second) throws Exception {
        if (!first.getString("scope_id").equals(second.getString("scope_id"))) throw new ProtocolProblem("scope_changed", "拉取期间数据归属范围变化，未应用部分数据");
        if (!first.getString("manifest_hash").equals(second.getString("manifest_hash"))
                || !first.getString("global_content_hash").equals(second.getString("global_content_hash"))) {
            throw new ProtocolProblem("snapshot_changed", "线上数据正在更新，本机已保留完整旧副本，将重新核对后同步");
        }
    }

    private static boolean isDeleted(JSONObject row) { return row != null && !row.isNull("deleted_at"); }
    private static boolean completed(JSONObject row) {
        Object value = row.opt("completed");
        return Boolean.TRUE.equals(value) || value instanceof Number && ((Number) value).intValue() == 1;
    }
    private static String today() { return LocalDate.now(ZoneId.of("Asia/Shanghai")).toString(); }
    private static boolean validDay(String value) {
        try { return value != null && value.matches("(?!0000)\\d{4}-\\d{2}-\\d{2}") && LocalDate.parse(value).toString().equals(value); }
        catch (RuntimeException invalid) { return false; }
    }
    private static boolean isHash(String value) { return value != null && value.matches("[a-f0-9]{64}"); }
    private static JSONObject copy(JSONObject value) throws Exception { return new JSONObject(value.toString()); }
    private static Set<String> keys(JSONObject value) {
        Set<String> result = new HashSet<>();
        for (Iterator<String> it = value.keys(); it.hasNext();) result.add(it.next());
        return result;
    }
    private static void require(boolean condition, String message) throws ProtocolProblem {
        if (!condition) throw new ProtocolProblem("needs_attention", message);
    }

    /** Matches JSON.stringify(stable(value)): UTF-16 key ordering and no slash escaping. */
    static String canonical(Object value) throws Exception {
        if (value == null || value == JSONObject.NULL) return "null";
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            List<String> names = new ArrayList<>(keys(object)); Collections.sort(names);
            StringBuilder result = new StringBuilder("{");
            for (int i = 0; i < names.size(); i++) {
                if (i > 0) result.append(',');
                result.append(quote(names.get(i))).append(':').append(canonical(object.get(names.get(i))));
            }
            return result.append('}').toString();
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            StringBuilder result = new StringBuilder("[");
            for (int i = 0; i < array.length(); i++) {
                if (i > 0) result.append(',');
                result.append(canonical(array.get(i)));
            }
            return result.append(']').toString();
        }
        if (value instanceof String) return quote((String) value);
        if (value instanceof Boolean) return value.toString();
        if (value instanceof Number) {
            double number = ((Number) value).doubleValue();
            require(!Double.isNaN(number) && !Double.isInfinite(number), "非有限 JSON 数值");
            if (number == 0) return "0";
            if (number == Math.rint(number) && Math.abs(number) <= 9007199254740991d) return Long.toString(((Number) value).longValue());
            throw new ProtocolProblem("needs_attention", "快照包含当前协议未支持的小数数值");
        }
        throw new ProtocolProblem("needs_attention", "不支持的 JSON 值");
    }

    private static String quote(String value) {
        StringBuilder result = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"': result.append("\\\""); break;
                case '\\': result.append("\\\\"); break;
                case '\b': result.append("\\b"); break;
                case '\f': result.append("\\f"); break;
                case '\n': result.append("\\n"); break;
                case '\r': result.append("\\r"); break;
                case '\t': result.append("\\t"); break;
                default:
                    if (c < 32 || Character.isSurrogate(c) && !(Character.isHighSurrogate(c)
                            && i + 1 < value.length() && Character.isLowSurrogate(value.charAt(i + 1)))
                            && !(Character.isLowSurrogate(c) && i > 0 && Character.isHighSurrogate(value.charAt(i - 1)))) {
                        result.append(String.format(java.util.Locale.ROOT, "\\u%04x", (int) c));
                    } else result.append(c);
            }
        }
        return result.append('"').toString();
    }

    static String hash(Object value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical(value).getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte b : digest) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return result.toString();
    }
}
