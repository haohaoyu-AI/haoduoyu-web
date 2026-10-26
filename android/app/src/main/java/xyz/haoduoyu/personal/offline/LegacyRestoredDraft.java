package xyz.haoduoyu.personal.offline;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;

/** A saved-instance-state draft retained locally, never an executable operation or upload grant. */
public final class LegacyRestoredDraft {
    public static final String FORMAT = "haoduoyu-legacy-restored-draft";
    public static final int VERSION = 1;
    public static final int MAX_PAYLOAD_BYTES = LegacyArchive.MAX_PAYLOAD_BYTES;
    public static final int MAX_RECORD_BYTES = ((MAX_PAYLOAD_BYTES + 2) / 3) * 4 + 8192;
    private static final String SOURCE = "xyz.haoduoyu.personal.OfflineActivity:saved-instance-state";
    public final String recoveryId, recoveredAt;
    private final String tab, date, draft;
    private final byte[] payload;

    private LegacyRestoredDraft(String id, String time, String tab, String date, String draft, byte[] payload) {
        recoveryId = id; recoveredAt = time; this.tab = tab; this.date = date; this.draft = draft; this.payload = payload;
    }

    /** The caller distinguishes an absent Bundle key by not calling capture; null is a retained value. */
    public static LegacyRestoredDraft capture(String tab, String date, String draft) throws Exception {
        byte[] raw = payload(tab, date, draft);
        return new LegacyRestoredDraft(LegacyArchive.sha256(raw), Instant.now().toString(), tab, date, draft, raw);
    }
    public String tab() { return tab; }
    public String date() { return date; }
    public String draft() { return draft; }

    public byte[] encode() throws Exception {
        JSONObject record = container();
        record.put("record_sha256", JsonUtil.sha256(record));
        byte[] bytes = utf8(JsonUtil.canonical(record));
        if (bytes.length > MAX_RECORD_BYTES) throw invalid("恢复记录超过支持容量");
        return bytes;
    }
    private JSONObject container() throws Exception {
        return new JSONObject().put("format", FORMAT).put("format_version", VERSION).put("source", SOURCE)
                .put("recovery_id", recoveryId).put("recovered_at", recoveredAt)
                .put("payload", new JSONObject().put("encoding", "utf8-json-base64").put("length_bytes", payload.length)
                        .put("sha256", recoveryId).put("base64", Base64.getEncoder().encodeToString(payload)));
    }

    public static LegacyRestoredDraft decode(byte[] bytes) throws Exception {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_RECORD_BYTES) throw invalid("恢复记录大小无效");
        JSONObject record = object(bytes);
        if (record.length() != 7 || !FORMAT.equals(record.opt("format")) || !integer(record.opt("format_version"), VERSION, VERSION)
                || !SOURCE.equals(record.opt("source"))) throw invalid("恢复记录格式或版本不支持");
        String hash = string(record, "record_sha256"), id = string(record, "recovery_id"), time = string(record, "recovered_at");
        if (!id.matches("[a-f0-9]{64}") || !hash.matches("[a-f0-9]{64}")) throw invalid("恢复记录摘要无效");
        record.remove("record_sha256");
        if (!same(hash, JsonUtil.sha256(record))) throw invalid("恢复记录元数据与摘要不一致");
        try { if (!Instant.parse(time).toString().equals(time)) throw invalid("恢复时间格式无效"); }
        catch (java.time.format.DateTimeParseException invalidTime) { throw invalid("恢复时间格式无效"); }
        JSONObject descriptor = record.optJSONObject("payload");
        if (descriptor == null || descriptor.length() != 4 || !"utf8-json-base64".equals(descriptor.opt("encoding"))
                || !integer(descriptor.opt("length_bytes"), 1, MAX_PAYLOAD_BYTES)
                || !id.equals(descriptor.opt("sha256"))) throw invalid("恢复正文描述无效");
        int length = descriptor.getInt("length_bytes"); String base64 = string(descriptor, "base64");
        if (base64.length() != ((length + 2) / 3) * 4) throw invalid("恢复正文已截断");
        byte[] raw;
        try { raw = Base64.getDecoder().decode(base64); }
        catch (IllegalArgumentException badEncoding) { throw invalid("恢复正文编码损坏"); }
        if (raw.length != length || !base64.equals(Base64.getEncoder().encodeToString(raw))
                || !same(id, LegacyArchive.sha256(raw))) throw invalid("恢复正文与摘要不一致");
        JSONObject fields = object(raw);
        if (fields.length() != 3) throw invalid("恢复正文包含不支持字段");
        String tab = nullable(fields, "tab"), date = nullable(fields, "date"), draft = nullable(fields, "draft");
        if (!Arrays.equals(raw, payload(tab, date, draft))) throw invalid("恢复正文不是完整规范记录");
        return new LegacyRestoredDraft(id, time, tab, date, draft, raw);
    }

    public String textExport() throws Exception {
        JSONObject metadata = new JSONObject().put("format", FORMAT).put("format_version", VERSION).put("source", SOURCE)
                .put("recovery_id", recoveryId).put("recovered_at", recoveredAt)
                .put("tab_display", tab == null ? JSONObject.NULL : display(tab)).put("date_display", date == null ? JSONObject.NULL : display(date))
                .put("draft_value_type", draft == null ? "null" : "string").put("payload_sha256", recoveryId)
                .put("payload", object(payload));
        return "好多鱼旧界面恢复草稿 · 本机只读保留\nrecovered_at 仅为本次恢复时间，不是原记录发生时间。\n"
                + metadata.toString(2) + "\n\n正文（null 与空字符串由元数据区分；未配对 UTF16 单元以 \\uXXXX 显示，完整原值保存在 payload 编码中）：\n"
                + (draft == null ? "" : display(draft));
    }

    private static byte[] payload(String tab, String date, String draft) throws Exception {
        JSONObject value = new JSONObject().put("tab", field(tab)).put("date", field(date)).put("draft", field(draft));
        byte[] bytes = utf8(JsonUtil.canonical(value));
        if (bytes.length > MAX_PAYLOAD_BYTES) throw invalid("恢复正文超过支持容量");
        return bytes;
    }
    private static Object field(String value) throws Exception {
        if (value == null) return JSONObject.NULL;
        if ((long) value.length() * 2 > MAX_PAYLOAD_BYTES) throw invalid("恢复正文超过支持容量");
        byte[] bytes = new byte[value.length() * 2];
        for (int i = 0; i < value.length(); i++) { bytes[i * 2] = (byte) value.charAt(i); bytes[i * 2 + 1] = (byte) (value.charAt(i) >>> 8); }
        return new JSONObject().put("encoding", "utf16le-base64").put("code_units", value.length())
                .put("base64", Base64.getEncoder().encodeToString(bytes));
    }
    private static String nullable(JSONObject value, String key) throws Exception {
        if (!value.has(key)) throw invalid("恢复正文缺少字段"); Object field = value.opt(key);
        if (field == JSONObject.NULL) return null;
        if (!(field instanceof JSONObject)) throw invalid("恢复正文字段类型无效"); JSONObject encoded = (JSONObject) field;
        if (encoded.length() != 3 || !"utf16le-base64".equals(encoded.opt("encoding"))
                || !integer(encoded.opt("code_units"), 0, MAX_PAYLOAD_BYTES / 2)) throw invalid("恢复正文字段编码无效");
        int count = encoded.getInt("code_units"); String base64 = string(encoded, "base64");
        if (base64.length() != ((count * 2 + 2) / 3) * 4) throw invalid("恢复正文字段已截断");
        byte[] bytes;
        try { bytes = Base64.getDecoder().decode(base64); }
        catch (IllegalArgumentException malformed) { throw invalid("恢复正文字段编码损坏"); }
        if (bytes.length != count * 2 || !base64.equals(Base64.getEncoder().encodeToString(bytes))) throw invalid("恢复正文字段长度无效");
        char[] units = new char[count];
        for (int i = 0; i < count; i++) units[i] = (char) ((bytes[i * 2] & 255) | ((bytes[i * 2 + 1] & 255) << 8));
        return new String(units);
    }
    private static String display(String value) {
        StringBuilder result = new StringBuilder();
        for (int i = 0; i < value.length(); i++) {
            char unit = value.charAt(i);
            if (Character.isHighSurrogate(unit) && i + 1 < value.length() && Character.isLowSurrogate(value.charAt(i + 1))) {
                result.append(unit).append(value.charAt(++i));
            } else if (Character.isSurrogate(unit)) result.append(String.format(java.util.Locale.ROOT, "\\u%04x", (int) unit));
            else result.append(unit);
        }
        return result.toString();
    }
    private static String string(JSONObject value, String key) throws IOException {
        Object field = value.opt(key); if (!(field instanceof String)) throw invalid("恢复记录字段类型无效"); return (String) field;
    }
    private static JSONObject object(byte[] bytes) throws Exception {
        JSONTokener parser = new JSONTokener(StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString());
        Object value = parser.nextValue();
        if (!(value instanceof JSONObject) || parser.nextClean() != 0) throw invalid("恢复记录不是完整 JSON 对象");
        return (JSONObject) value;
    }
    private static byte[] utf8(String value) throws Exception {
        ByteBuffer buffer = StandardCharsets.UTF_8.newEncoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).encode(CharBuffer.wrap(value));
        byte[] bytes = new byte[buffer.remaining()]; buffer.get(bytes); return bytes;
    }
    private static boolean integer(Object value, long minimum, long maximum) {
        return value instanceof Number && ((Number) value).doubleValue() == ((Number) value).longValue()
                && ((Number) value).longValue() >= minimum && ((Number) value).longValue() <= maximum;
    }
    private static boolean same(String left, String right) {
        return MessageDigest.isEqual(left.getBytes(StandardCharsets.US_ASCII), right.getBytes(StandardCharsets.US_ASCII));
    }
    private static IOException invalid(String message) { return new IOException(message + "；旧数据库未更改"); }
}
