package xyz.haoduoyu.personal.offline;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.InterruptedIOException;

/** Small, same-origin API boundary. Cookies and CSRF stay in the Android transport. */
public final class ApiClient {
    public static final String ORIGIN = "https://haoduoyu.xyz";
    public static final String PREFIX = "/api/v1";

    public interface Transport {
        Response send(String method, String path, JSONObject body) throws Exception;
    }

    public static final class Response {
        public final int status;
        public final JSONObject body;
        public final long retryAfterMillis;
        public Response(int status, JSONObject body) { this(status, body, 0); }
        public Response(int status, JSONObject body, long retryAfterMillis) {
            this.status = status;
            this.body = body;
            this.retryAfterMillis = Math.max(0, retryAfterMillis);
        }
    }

    public static final class ApiException extends IOException {
        public final int status;
        public final String code;
        public final long retryAfterMillis;
        public ApiException(int status, String code, String message) {
            this(status, code, message, 0);
        }
        public ApiException(int status, String code, String message, long retryAfterMillis) {
            super(message);
            this.status = status;
            this.code = code;
            this.retryAfterMillis = Math.max(0, retryAfterMillis);
        }
    }

    public static final class TransportException extends IOException {
        TransportException(IOException cause) { super("Network transport failed", cause); }
    }

    private final Transport transport;
    public ApiClient(Transport transport) {
        if (transport == null) throw new IllegalArgumentException("transport required");
        this.transport = transport;
    }

    public Response request(String method, String path, JSONObject body) throws Exception {
        if (path == null || path.length() > 8192 || !path.startsWith(PREFIX + "/") || path.contains("#")
                || path.contains("/../") || path.contains("/./")
                || path.contains("\\") || path.indexOf('\r') >= 0 || path.indexOf('\n') >= 0
                || !("GET".equals(method) || "POST".equals(method)
                || "PUT".equals(method) || "PATCH".equals(method) || "DELETE".equals(method))) {
            throw new IllegalArgumentException("Invalid same-origin API request");
        }
        Response response;
        try { response = transport.send(method, path, body); }
        catch (InterruptedIOException interrupted) { throw interrupted; }
        catch (IOException network) { throw new TransportException(network); }
        if (response == null) throw new IOException("Empty transport response");
        if (response.status < 200 || response.status >= 300) {
            JSONObject error = response.body == null ? null : response.body.optJSONObject("error");
            throw new ApiException(response.status,
                    error == null ? "HTTP_" + response.status : error.optString("code", "HTTP_" + response.status),
                    error == null ? "服务器请求失败（HTTP " + response.status + "）"
                            : error.optString("message", "服务器请求失败"), response.retryAfterMillis);
        }
        if (response.body == null || !response.body.has("data")) {
            throw new ApiException(502, "INVALID_RESPONSE", "接口响应不完整，本地内容已保留");
        }
        return response;
    }

    public JSONObject object(String method, String path, JSONObject body) throws Exception {
        JSONObject object = request(method, path, body).body.optJSONObject("data");
        if (object == null) throw new ApiException(502, "INVALID_RESPONSE", "接口对象格式不正确");
        return object;
    }

    public JSONArray array(String path) throws Exception {
        JSONArray array = request("GET", path, null).body.optJSONArray("data");
        if (array == null) throw new ApiException(502, "INVALID_RESPONSE", "接口列表格式不正确");
        return array;
    }

    public JSONObject me() throws Exception { return object("GET", PREFIX + "/auth/me", null); }
}
