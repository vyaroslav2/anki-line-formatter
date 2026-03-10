from aqt import mw, gui_hooks
from aqt.editor import Editor
from aqt.utils import tooltip

def format_line_physical(editor: Editor):
    js = r"""
    (function() {
        function walkShadows(root, depth=0) {
            const active = root.activeElement;
            if (!active) return null;
            if (active.contentEditable === 'true') return active;
            if (active.shadowRoot) return walkShadows(active.shadowRoot, depth + 1);
            return null;
        }

        const editableRoot = walkShadows(document);
        if (!editableRoot) return "No editable root found";

        const shadowRoot = editableRoot.getRootNode();
        const sel = shadowRoot.getSelection ? shadowRoot.getSelection() : window.getSelection();
        if (!sel || !sel.rangeCount) return "No selection";

        function getLineBlock(anchorNode, editableRoot) {
            let node = anchorNode;
            while (node && node.parentNode !== editableRoot) {
                node = node.parentNode;
            }
            return node;
        }

        const lineBlock = getLineBlock(sel.anchorNode, editableRoot);
        if (!lineBlock) return "No line block found";

        try {
            // Use the shadow root's document to create the range
            const doc = lineBlock.ownerDocument;
            const range = doc.createRange();
            range.selectNodeContents(lineBlock);

            sel.removeAllRanges();
            sel.addRange(range);

            // Extract and rewrap
            const content = range.extractContents();
            const temp = doc.createElement('div');
            temp.appendChild(content);
            const innerHtml = temp.innerHTML;

            const wrapper = doc.createElement('span');
            wrapper.innerHTML = '\u00A0\u00A0\u00A0\u00A0<i>' + innerHtml + '</i>';

            range.insertNode(wrapper);

            sel.removeAllRanges();
            const newRange = doc.createRange();
            newRange.setStartAfter(wrapper);
            newRange.collapse(true);
            sel.addRange(newRange);

            return "Success";
        } catch(e) {
            return "Error: " + e.message;
        }
    })();
    """
    editor.web.evalWithCallback(js, lambda res: tooltip(res))

def on_editor_init_shortcuts(shortcuts, editor: Editor):
    shortcuts.append(("Ctrl+Shift+Q", lambda: format_line_physical(editor)))
    shortcuts.append(("Alt+Q", lambda: format_line_physical(editor)))

gui_hooks.editor_did_init_shortcuts.append(on_editor_init_shortcuts)