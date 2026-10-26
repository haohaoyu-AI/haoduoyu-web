package xyz.haoduoyu.personal.offline;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

/** Local, read-only recovery format. Its exact payload never becomes an executable web queue. */
public final class LegacyArchive {
    public static final String FORMAT = "haoduoyu-legacy-archive";
    public static final int VERSION = 1;
    public static final int MAX_PAYLOAD_BYTES = 32 * 1024 * 1024;
    public static final int MAX_ARCHIVE_BYTES = ((MAX_PAYLOAD_BYTES + 2) / 3) * 4 + 65536;
    private final byte[] payload;
    public final String archiveId;
    public final String payloadHash;

    private LegacyArchive(String id, byte[] bytes) throws Exception {
        archiveId = id; payload = bytes.clone(); payloadHash = sha256(bytes);
    }

    public static byte[] encode(byte[] raw) throws Exception {
        state(raw);
        JSONObject source = new JSONObject().put("package", "xyz.haoduoyu.personal")
                .put("database", "haoduoyu-offline.db").put("state_schema", 1)
                .put("reader_baseline", "d5e417384fc66870e810cd14626f770a1be88d0e")
                .put("original_app_version", "not-stored-in-state");
        return new JSONObject().put("format", FORMAT).put("format_version", VERSION)
                .put("archive_id", UUID.randomUUID().toString()).put("created_at", Instant.now().toString())
                .put("source", source).put("payload", new JSONObject().put("encoding", "base64")
                        .put("length_bytes", raw.length).put("sha256", sha256(raw))
                        .put("base64", Base64.getEncoder().encodeToString(raw)))
                .toString().getBytes(StandardCharsets.UTF_8);
    }

    public static LegacyArchive decode(byte[] archive) throws Exception {
        if (archive == null || archive.length == 0 || archive.length > MAX_ARCHIVE_BYTES)
            throw invalid("备份大小不在支持范围");
        JSONObject container = object(archive);
        if (!FORMAT.equals(container.optString("format")) || !integer(container.opt("format_version"), VERSION, VERSION))
            throw invalid("备份格式或版本不支持");
        String id = container.optString("archive_id");
        if (!id.matches("[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}")) throw invalid("备份身份无效");
        JSONObject source = container.optJSONObject("source"), descriptor = container.optJSONObject("payload");
        if (source == null || !integer(source.opt("state_schema"), 1, 1)
                || !"xyz.haoduoyu.personal".equals(source.optString("package"))
                || !"haoduoyu-offline.db".equals(source.optString("database")) || descriptor == null
                || !"base64".equals(descriptor.optString("encoding"))
                || !integer(descriptor.opt("length_bytes"), 1, MAX_PAYLOAD_BYTES)) throw invalid("备份来源或长度无效");
        int length = descriptor.getInt("length_bytes");
        String encoded = descriptor.optString("base64"), digest = descriptor.optString("sha256");
        if (encoded.length() != ((length + 2) / 3) * 4 || !digest.matches("[a-f0-9]{64}")) throw invalid("备份已截断或摘要无效");
        byte[] raw;
        try { raw = Base64.getDecoder().decode(encoded); }
        catch (IllegalArgumentException malformed) { throw invalid("备份编码损坏"); }
        if (raw.length != length || !encoded.equals(Base64.getEncoder().encodeToString(raw))
                || !MessageDigest.isEqual(digest.getBytes(StandardCharsets.US_ASCII), sha256(raw).getBytes(StandardCharsets.US_ASCII)))
            throw invalid("备份内容与摘要不一致");
        state(raw);
        return new LegacyArchive(id, raw);
    }

    public byte[] rawPayload() { return payload.clone(); }
    public JSONObject state() throws Exception { return state(payload); }
    public String textExport() throws Exception {
        return "好多鱼旧版记录 · 只读本地保留\n备份 " + archiveId + "\nSHA256 " + payloadHash
                + "\n未执行上传或导入网页队列。原始状态 JSON（包含空草稿、历史冲突及未知字段）：\n\n" + utf8(payload);
    }

    public static byte[] readBounded(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); byte[] buffer = new byte[8192];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if ((long) output.size() + count > MAX_ARCHIVE_BYTES) throw invalid("备份超过支持容量");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }

    public static JSONObject state(byte[] raw) throws Exception {
        if (raw == null || raw.length == 0 || raw.length > MAX_PAYLOAD_BYTES) throw invalid("旧记录大小无效");
        JSONObject value = object(raw);
        if (!integer(value.opt("schema"), 1, 1)) throw invalid("旧记录状态版本不支持");
        return value;
    }
    private static JSONObject object(byte[] raw) throws Exception {
        JSONTokener parser = new JSONTokener(utf8(raw)); Object result = parser.nextValue();
        if (!(result instanceof JSONObject) || parser.nextClean() != 0) throw invalid("备份不是完整 JSON 对象");
        return (JSONObject) result;
    }
    private static String utf8(byte[] raw) throws Exception {
        return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(raw)).toString();
    }
    private static boolean integer(Object value, long minimum, long maximum) {
        return value instanceof Number && ((Number) value).doubleValue() == ((Number) value).longValue()
                && ((Number) value).longValue() >= minimum && ((Number) value).longValue() <= maximum;
    }
    public static String sha256(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes); StringBuilder hex = new StringBuilder();
        for (byte value : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return hex.toString();
    }
    private static IOException invalid(String message) { return new IOException(message + "；旧库和原文件未更改"); }
}
