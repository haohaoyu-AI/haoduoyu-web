(function () {
    var nodes = document.querySelectorAll(
        '.popover,#overlay .modal,.shell.menu-open,.mobile-notes-nav[open],.mobile-media-nav[open]'
    );
    var open = Array.from(nodes).some(function (node) { return node.getClientRects().length > 0; });
    if (open) {
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', bubbles: true, cancelable: true
        }));
    }
    // Todo calendar/templates belong to URL history. Their website Escape handler pushes a
    // new entry, so Android must use goBack() for those panels instead of synthesizing Escape.
    return open;
})()
