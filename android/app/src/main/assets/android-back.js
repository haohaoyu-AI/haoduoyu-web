(function () {
    function visible(selector) {
        return Array.from(document.querySelectorAll(selector)).some(function (node) {
            return node.getClientRects().length > 0;
        });
    }
    var primary = visible('.popover,#overlay .modal,.shell.menu-open');
    var menu = visible('.mobile-notes-nav[open],.mobile-media-nav[open]');
    var panel = visible('#todo-history:not([hidden]),#todo-templates:not([hidden])');
    // Website Escape returns early for a modal/popover/sidebar. For a mobile dropdown it can
    // continue into setTodoPanel(""), which pushes history; that combination must use goBack.
    var consume = primary || (menu && !panel);
    if (consume) {
        document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', bubbles: true, cancelable: true
        }));
    }
    return consume;
})()
