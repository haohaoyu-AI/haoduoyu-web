package xyz.haoduoyu.personal;

/** Fixed, counts-only first-party wake-up events. There is no native JavaScript interface. */
final class NativeBridgeScripts {
    private static final String GUARD = "(function(){if(window.top!==window||window.location.origin!=='https://haoduoyu.xyz')return;";
    private NativeBridgeScripts() { }
    static boolean allowedDocument(String url) { return UrlPolicy.isTrustedWebsite(url); }
    static String online() {
        return GUARD + "window.dispatchEvent(new CustomEvent('haoduoyu:native-online',"
                + "{detail:{protocol:1,reason:'network-restored'}}));})()";
    }
    static String legacy(int pending, int conflicts, boolean needsConsent) {
        if (pending < 0 || pending > 100000 || conflicts < 0 || conflicts > 100000)
            throw new IllegalArgumentException("Legacy event counts are outside the reviewed protocol");
        return GUARD + "window.dispatchEvent(new CustomEvent('haoduoyu:legacy-status',{detail:{protocol:1,pending:"
                + pending + ",conflicts:" + conflicts + ",needsConsent:" + needsConsent + "}}));})()";
    }
}
