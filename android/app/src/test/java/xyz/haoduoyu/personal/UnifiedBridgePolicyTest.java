package xyz.haoduoyu.personal;

import org.junit.Test;
import static org.junit.Assert.*;

public final class UnifiedBridgePolicyTest {
    @Test public void nativeOriginGuardDoesNotGrantLocalOrForeignDocumentsAnEvent() {
        assertTrue(NativeBridgeScripts.allowedDocument(UrlPolicy.HOME));
        for (String url : new String[]{"https://haoduoyu.xyz.evil.invalid", "http://haoduoyu.xyz/", "file:///private", "content://private", "about:blank"})
            assertFalse(url, NativeBridgeScripts.allowedDocument(url));
    }
    @Test public void bridgeContainsOnlyFixedProtocolAndValidatedCounts() {
        String script = NativeBridgeScripts.legacy(3, 1, true);
        assertTrue(script.contains("protocol:1,pending:3,conflicts:1,needsConsent:true"));
        assertFalse(script.contains("cookie")); assertFalse(script.contains("fetch(")); assertFalse(script.contains("XMLHttpRequest"));
        assertThrows(IllegalArgumentException.class, () -> NativeBridgeScripts.legacy(-1, 0, false));
        assertThrows(IllegalArgumentException.class, () -> NativeBridgeScripts.legacy(0, 100001, false));
    }
    @Test public void largeUnicodeRecordsOfferFileExportInsteadOfRiskingClipboardBinderLimits() {
        assertTrue(LegacyViewerPolicy.clipboardAllowed(repeat("a", 65536)));
        assertFalse(LegacyViewerPolicy.clipboardAllowed(repeat("a", 65537)));
        assertTrue(LegacyViewerPolicy.clipboardAllowed(repeat("鱼", 21845)));
        assertFalse(LegacyViewerPolicy.clipboardAllowed(repeat("鱼", 21846)));
        assertTrue(LegacyViewerPolicy.clipboardAllowed(repeat("🐟", 16384)));
        assertFalse(LegacyViewerPolicy.clipboardAllowed(repeat("🐟", 16385)));
        String preview = LegacyViewerPolicy.preview(repeat("a", 31999) + "🐟" + repeat("b", 20));
        assertFalse(Character.isHighSurrogate(preview.charAt(31999))); assertTrue(preview.contains("导出保留完整内容"));
    }
    private static String repeat(String text, int count) { StringBuilder result = new StringBuilder(); for (int i = 0; i < count; i++) result.append(text); return result.toString(); }
}
