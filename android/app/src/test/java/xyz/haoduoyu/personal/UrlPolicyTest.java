package xyz.haoduoyu.personal;

import org.junit.Test;
import static org.junit.Assert.*;

public class UrlPolicyTest {
    @Test public void acceptsExactHttpsOriginAndRoutes() {
        assertTrue(UrlPolicy.isTrustedWebsite(UrlPolicy.HOME));
        assertTrue(UrlPolicy.isTrustedWebsite("https://HAODUOYU.XYZ:443/?page=notes&notes_category=work"));
        assertTrue(UrlPolicy.isTrustedWebsite("https://haoduoyu.xyz/?page=memos"));
    }
    @Test public void rejectsOriginConfusion() {
        String[] blocked = {"http://haoduoyu.xyz/", "https://haoduoyu.xyz.evil.test/",
            "https://evil.test/haoduoyu.xyz", "https://haoduoyu.xyz@evil.test/",
            "https://user@haoduoyu.xyz/", "https://haoduoyu.xyz:8443/",
            "https://haoduoyu.xyz./", "https://%68aoduoyu.xyz/", "//haoduoyu.xyz/",
            "https://haoduoyu.xyz\\@evil.test/", "", null};
        for (String url : blocked) assertFalse(String.valueOf(url), UrlPolicy.isTrustedWebsite(url));
    }
    @Test public void rejectsExecutableAndLocalExternalSchemes() {
        String[] blocked = {"intent://example/#Intent;end", "javascript:alert(1)",
            "data:text/html,test", "file:///etc/passwd", "content://private/document/1",
            "blob:https://haoduoyu.xyz/id", "about:blank", "https://user@evil.test/",
            "https://example.com/\r\nInjected: true", "https:", null};
        for (String url : blocked) assertEquals(String.valueOf(url), "", UrlPolicy.externalScheme(url));
    }
    @Test public void allowsOnlyDeliberateBrowserMailAndDialActions() {
        assertEquals("https", UrlPolicy.externalScheme("https://example.com/path"));
        assertEquals("http", UrlPolicy.externalScheme("http://example.com/"));
        assertEquals("mailto", UrlPolicy.externalScheme("mailto:someone@example.com"));
        assertEquals("tel", UrlPolicy.externalScheme("tel:+86123456789"));
    }
}
