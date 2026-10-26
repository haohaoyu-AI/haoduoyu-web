package xyz.haoduoyu.personal;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Deliberately independent of Android so navigation rules can run in JVM tests. */
final class UrlPolicy {
    static final String HOME = "https://haoduoyu.xyz/?page=todos";

    private UrlPolicy() {}

    private static URI parse(String value) {
        if (value == null || value.length() > 8192 || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) return null;
        try { return new URI(value); } catch (URISyntaxException ignored) { return null; }
    }

    static boolean isTrustedWebsite(String value) {
        URI uri = parse(value);
        return uri != null && "https".equalsIgnoreCase(uri.getScheme())
                && "haoduoyu.xyz".equalsIgnoreCase(uri.getHost())
                && uri.getRawUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    static String externalScheme(String value) {
        URI uri = parse(value);
        if (uri == null || uri.getScheme() == null || uri.getRawSchemeSpecificPart().isEmpty()) return "";
        String scheme = uri.getScheme().toLowerCase(Locale.ROOT);
        if ("http".equals(scheme) || "https".equals(scheme)) {
            return uri.getHost() != null && uri.getRawUserInfo() == null ? scheme : "";
        }
        return "mailto".equals(scheme) || "tel".equals(scheme) ? scheme : "";
    }
}
