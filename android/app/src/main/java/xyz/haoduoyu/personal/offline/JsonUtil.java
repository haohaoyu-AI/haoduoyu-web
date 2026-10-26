package xyz.haoduoyu.personal.offline;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;

/** Detached JSON values and deterministic comparisons; never exposes the stored mutable objects. */
public final class JsonUtil {
    private JsonUtil() {}

    public static JSONObject copy(JSONObject object) {
        if (object == null) return null;
        try { return new JSONObject(object.toString()); }
        catch (JSONException error) { throw new IllegalArgumentException("Invalid JSON object", error); }
    }

    public static JSONArray copy(JSONArray array) {
        if (array == null) return null;
        try { return new JSONArray(array.toString()); }
        catch (JSONException error) { throw new IllegalArgumentException("Invalid JSON array", error); }
    }

    public static JSONObject object(JSONObject parent, String key) {
        JSONObject result = parent.optJSONObject(key);
        if (result == null) throw new IllegalArgumentException("Missing object: " + key);
        return result;
    }

    public static List<String> keys(JSONObject object) {
        List<String> keys = new ArrayList<>();
        for (Iterator<String> it = object.keys(); it.hasNext();) keys.add(it.next());
        Collections.sort(keys);
        return keys;
    }

    public static boolean equal(Object left, Object right) { return canonical(left).equals(canonical(right)); }

    public static String canonical(Object value) {
        if (value == null || value == JSONObject.NULL) return "null";
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            StringBuilder result = new StringBuilder("{");
            boolean comma = false;
            for (String key : keys(object)) {
                if (comma) result.append(',');
                result.append(quote(key)).append(':').append(canonical(object.opt(key)));
                comma = true;
            }
            return result.append('}').toString();
        }
        if (value instanceof JSONArray) {
            JSONArray array = (JSONArray) value;
            StringBuilder result = new StringBuilder("[");
            for (int index = 0; index < array.length(); index++) {
                if (index > 0) result.append(',');
                result.append(canonical(array.opt(index)));
            }
            return result.append(']').toString();
        }
        if (value instanceof String) return quote((String) value);
        if (value instanceof Boolean) return value.toString();
        if (value instanceof Number) {
            double number = ((Number) value).doubleValue();
            if (!Double.isFinite(number)) throw new IllegalArgumentException("Non-finite JSON number");
            if (number == 0) return "0";
            String text = value.toString();
            if (text.endsWith(".0")) text = text.substring(0, text.length() - 2);
            return text;
        }
        throw new IllegalArgumentException("Unsupported JSON value");
    }

    public static String quote(String text) {
        StringBuilder result = new StringBuilder("\"");
        for (int index = 0; index < text.length(); index++) {
            char character = text.charAt(index);
            switch (character) {
                case '"': result.append("\\\""); break;
                case '\\': result.append("\\\\"); break;
                case '\b': result.append("\\b"); break;
                case '\f': result.append("\\f"); break;
                case '\n': result.append("\\n"); break;
                case '\r': result.append("\\r"); break;
                case '\t': result.append("\\t"); break;
                default:
                    if (character < 0x20) result.append(String.format(java.util.Locale.ROOT, "\\u%04x", (int) character));
                    else result.append(character);
            }
        }
        return result.append('"').toString();
    }

    public static String sha256(Object value) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest(canonical(value).getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder();
            for (byte item : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", item & 255));
            return result.toString();
        } catch (java.security.NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
}
