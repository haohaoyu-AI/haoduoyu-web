package xyz.haoduoyu.personal.offline;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.Semaphore;

/** One old-queue owner. No grant, retarget, SQLite schema migration, executable import or web outbox copy. */
public final class LegacyMigrationCoordinator {
    static final Semaphore OWNER = new Semaphore(1, true);
    public interface Source extends LocalRepository.Store { byte[] readRawPayload() throws Exception; }
    public interface Backup { void ensure(byte[] raw) throws Exception; }
    public interface Target { JSONObject verify() throws Exception; }
    public interface Drain { void run(LocalRepository repository) throws Exception; }
    public static final class Result {
        public final String code, message;
        public final int pending, conflicts, drafts;
        public final boolean needsConsent;
        Result(String code, String message, JSONObject state, boolean consent) {
            this.code = code; this.message = message; needsConsent = consent;
            int pendingCount = 0;
            Set<String> conflictKeys = new HashSet<>();
            JSONArray operations = state == null ? null : state.optJSONArray("operations");
            if (operations != null) for (int i = 0; i < operations.length(); i++) {
                JSONObject operation = operations.optJSONObject(i);
                if (operation != null) {
                    if (!"conflict".equals(operation.optString("status"))) pendingCount++;
                    else conflictKeys.add(operation.optString("op_id", "operation-" + i));
                }
            }
            JSONArray history = state == null ? null : state.optJSONArray("conflicts");
            if (history != null) for (int i = 0; i < history.length(); i++) {
                JSONObject conflict = history.optJSONObject(i);
                if (conflict != null && !conflict.optBoolean("resolved", false))
                    conflictKeys.add(conflict.optString("op_id", "history-" + i));
            }
            pending = Math.min(100000, pendingCount); conflicts = Math.min(100000, conflictKeys.size());
            JSONObject values = state == null ? null : state.optJSONObject("drafts"); drafts = values == null ? 0 : values.length();
        }
    }

    public Result run(Source source, Backup backup, Target target, Drain drain) {
        if (!OWNER.tryAcquire()) return new Result("busy", "旧记录正在核对，网页可继续使用", null, false);
        JSONObject state = null;
        try {
            byte[] raw = source.readRawPayload();
            if (raw == null) return new Result("empty", "没有旧版本机状态", null, false);
            state = LegacyArchive.state(raw); backup.ensure(raw);
            JSONObject workspace = state.optJSONObject("workspace");
            if (!allowed(state, workspace)) return new Result("needs-consent", "旧版本机记录尚未获此目标上传同意；已保留，可查看或导出", state, true);
            if (!safeWires(state, workspace)) return new Result("identity-paused", "旧原请求身份或范围不同，已保留且未发送", state, false);
            JSONArray operations = state.optJSONArray("operations");
            if (operations == null) throw new IOException("旧队列格式无法识别");
            if (operations.length() == 0) return new Result("retained", "旧记录和草稿已保留；网页独立读取线上内容", state, false);
            JSONObject verified = target.verify();
            if (verified == null || !ApiClient.ORIGIN.equals(verified.optString("origin"))
                    || !workspace.optString("scope_id").equals(verified.optString("scope_id"))
                    || !Boolean.TRUE.equals(verified.opt("public_business")))
                return new Result("target-paused", "线上身份或工作台范围变化，旧队列未发送", state, false);
            LocalRepository repository = new LocalRepository(new GuardedStore(source, raw));
            drain.run(repository); state = repository.snapshot();
            JSONObject status = state.optJSONObject("status");
            Result result = new Result("recovered", "已核对旧队列；原库与备份保留", state, false);
            if (result.pending > 0 || result.conflicts > 0) return new Result("retained",
                    status == null ? "旧队列尚未全部确认，网页可继续使用" : status.optString("message", "旧记录已保留"), state, false);
            return result;
        } catch (Exception failure) {
            return new Result("paused", "旧记录恢复暂停：" + failure.getMessage() + "；原库保留，网页可继续使用", state, false);
        } finally { OWNER.release(); }
    }

    private static boolean allowed(JSONObject state, JSONObject workspace) {
        if (workspace == null || !"public".equals(workspace.optString("mode"))
                || !Boolean.TRUE.equals(workspace.opt("upload_consented")) || !ApiClient.ORIGIN.equals(workspace.optString("origin"))) return false;
        String scope = workspace.optString("scope_id"), account = workspace.optString("account_id");
        return !scope.isEmpty() && scope.equals(state.optString("scope_id")) && account.equals(state.optString("account_id"))
                && account.equals(LocalRepository.publicAccountId(ApiClient.ORIGIN, scope));
    }
    private static boolean safeWires(JSONObject state, JSONObject workspace) throws Exception {
        JSONArray operations = state.optJSONArray("operations"); if (operations == null) return false;
        for (int i = 0; i < operations.length(); i++) {
            JSONObject operation = operations.optJSONObject(i); if (operation == null) return false;
            JSONObject wire = operation.optJSONObject("wire");
            if ("frozen".equals(operation.optString("status")) && wire == null) return false;
            if (wire != null && (!"public".equals(wire.optString("identity_mode")) || !ApiClient.ORIGIN.equals(wire.optString("origin"))
                    || !workspace.optString("scope_id").equals(wire.optString("scope_id"))
                    || !workspace.optString("account_id").equals(wire.optString("account_id")))) return false;
        }
        return true;
    }
    private static final class GuardedStore implements LocalRepository.Store {
        private final Source source; private byte[] expected;
        GuardedStore(Source source, byte[] raw) { this.source = source; expected = raw.clone(); }
        @Override public JSONObject read() throws Exception { return LegacyArchive.state(expected); }
        @Override public void write(JSONObject value) throws Exception {
            synchronized (source) {
                if (!Arrays.equals(expected, source.readRawPayload())) throw new IOException("旧状态在核对期间改变，本次写入未执行");
                source.write(value); expected = source.readRawPayload();
            }
        }
    }
}
