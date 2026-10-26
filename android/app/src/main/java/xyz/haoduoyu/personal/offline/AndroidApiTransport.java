package xyz.haoduoyu.personal.offline;

import android.webkit.CookieManager;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import javax.net.ssl.HttpsURLConnection;

/** Uses only the existing first-party session and CSRF contract. Never logs credentials. */
public final class AndroidApiTransport implements ApiClient.Transport {
    public static final String ORIGIN = "https://haoduoyu.xyz";
    private volatile String csrf = "";
    private final boolean pinSession;
    private String pinnedCookie;
    private boolean sessionPinned;

    public AndroidApiTransport() { this(false); }
    public AndroidApiTransport(boolean pinSession) { this.pinSession = pinSession; }

    @Override public ApiClient.Response send(String method, String path, JSONObject body) throws Exception {
        if (Thread.currentThread().isInterrupted()) throw new IOException("同步已暂停");
        if (!path.startsWith("/api/v1/") || path.contains("\\") || path.contains("\r")
                || path.contains("\n") || path.contains("/../")) throw new IOException("无效接口路径");
        HttpsURLConnection connection = (HttpsURLConnection) new URL(ORIGIN + path).openConnection();
        try {
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(15000);
        connection.setRequestMethod(method);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Cache-Control", "no-cache");
        if (pinSession && !sessionPinned) {
            if (!path.equals("/api/v1/auth/me")) throw new IOException("同步必须先核对原账号");
            pinnedCookie = CookieManager.getInstance().getCookie(ORIGIN);
            sessionPinned = true;
        }
        String cookie = pinSession ? pinnedCookie : CookieManager.getInstance().getCookie(ORIGIN);
        if (cookie != null && !cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
        boolean writing = !"GET".equals(method) && !"HEAD".equals(method);
        if (writing) {
            connection.setRequestProperty("Origin", ORIGIN);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            if (!csrf.isEmpty()) connection.setRequestProperty("X-CSRF-Token", csrf);
            byte[] bytes = (body == null ? "{}" : body.toString()).getBytes(StandardCharsets.UTF_8);
            if (bytes.length > 262144) throw new IOException("请求超过本机发送上限，内容仍已保留");
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
        }
            int status = connection.getResponseCode();
            for (Map.Entry<String, List<String>> header : connection.getHeaderFields().entrySet()) {
                if (!pinSession && header.getKey() != null && "Set-Cookie".equalsIgnoreCase(header.getKey())) {
                    for (String value : header.getValue()) CookieManager.getInstance().setCookie(ORIGIN, value);
                    CookieManager.getInstance().flush();
                }
            }
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String text = "";
            if (stream != null) try (InputStream input = stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int count, total = 0;
                while ((count = input.read(buffer)) != -1) {
                    if (Thread.currentThread().isInterrupted()) throw new IOException("同步已暂停");
                    if ((total += count) > 2097152) throw new IOException("响应超出本机预算，未应用部分数据");
                    bytes.write(buffer, 0, count);
                }
                text = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
            }
            JSONObject value;
            try { value = text.isEmpty() ? new JSONObject() : new JSONObject(text); }
            catch (Exception invalid) { throw new IOException("服务器未返回完整 JSON，本地内容仍保留"); }
            if (path.equals("/api/v1/auth/me") || path.equals("/api/v1/auth/login")) {
                JSONObject data = value.optJSONObject("data");
                if (status >= 200 && status < 300 && data != null) csrf = data.optString("csrfToken", "");
            }
            if (status == 401 || path.equals("/api/v1/auth/logout")) csrf = "";
            long retryAfter=0;String retry=connection.getHeaderField("Retry-After");
            if(retry!=null)try{retryAfter=Math.min(86400000,Math.max(0,Long.parseLong(retry.trim())*1000));}catch(NumberFormatException date){try{retryAfter=Math.min(86400000,Math.max(0,java.time.ZonedDateTime.parse(retry,java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli()-System.currentTimeMillis()));}catch(Exception ignored){}}
            return new ApiClient.Response(status, value, retryAfter);
        } finally { connection.disconnect(); }
    }
}
