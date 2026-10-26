package xyz.haoduoyu.personal;

/** Bound native previews/clipboard without allocating another copy of a potentially large private record. */
final class LegacyViewerPolicy {
    static final int CLIPBOARD_BYTES = 65536;
    private LegacyViewerPolicy() { }
    static boolean clipboardAllowed(String text) {
        if (text == null) return false;
        int bytes = 0;
        for (int i = 0; i < text.length(); i++) {
            char value = text.charAt(i);
            if (value < 128) bytes++;
            else if (value < 2048) bytes += 2;
            else if (Character.isHighSurrogate(value) && i + 1 < text.length() && Character.isLowSurrogate(text.charAt(i + 1))) {
                bytes += 4; i++;
            } else bytes += 3;
            if (bytes > CLIPBOARD_BYTES) return false;
        }
        return true;
    }
    static String preview(String text) {
        if (text.length() <= 32000) return text;
        int end = Character.isHighSurrogate(text.charAt(31999)) ? 31999 : 32000;
        return text.substring(0, end) + "\n\n预览较长；导出保留完整内容。";
    }
}
