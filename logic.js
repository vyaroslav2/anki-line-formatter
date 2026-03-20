(function () {
  const indent = "\u00A0\u00A0\u00A0\u00A0"; // The 4 non-breaking spaces

  // 1. Find the active field
  const editableRoot = (function walk(root) {
    const active = root.activeElement;
    if (!active) return null;
    if (active.contentEditable === "true") return active;
    return active.shadowRoot ? walk(active.shadowRoot) : null;
  })(document);

  if (!editableRoot) return;

  const rootNode = editableRoot.getRootNode();
  const sel = rootNode.getSelection
    ? rootNode.getSelection()
    : window.getSelection();
  if (!sel || !sel.rangeCount) return;

  const range = sel.getRangeAt(0);
  const getTop = (n) => {
    if (n === editableRoot) return null;
    let curr = n;
    while (curr && curr.parentNode !== editableRoot) curr = curr.parentNode;
    return curr;
  };

  const allNodes = Array.from(editableRoot.childNodes);
  let startLine = getTop(range.startContainer);
  let endLine = getTop(range.endContainer);

  if (!startLine)
    startLine =
      editableRoot.childNodes[range.startOffset] || editableRoot.firstChild;
  if (!endLine)
    endLine =
      editableRoot.childNodes[range.endOffset - 1] || editableRoot.lastChild;

  const startIndex = allNodes.indexOf(startLine);
  const endIndex = allNodes.indexOf(endLine);
  if (startIndex === -1 || endIndex === -1) return;

  const selectionScope = allNodes.slice(
    Math.min(startIndex, endIndex),
    Math.max(startIndex, endIndex) + 1,
  );

  let lastProcessed = null;

  selectionScope.forEach((node) => {
    if (node.nodeName === "BR") {
      node.remove();
      return;
    }

    if (node.nodeType === 3) {
      // ---------------- RAW TEXT NODE ----------------
      const text = node.textContent.trim();
      if (!text) return;

      const div = document.createElement("div");
      div.dataset.ankiFmt = "1";
      div.style.margin = "0";
      div.innerHTML = `${indent}<i>${text}</i>`;
      node.parentNode.replaceChild(div, node);
      lastProcessed = div;
    } else if (node.nodeType === 1) {
      // --------- ELEMENT (DIV/P) -------------

      // CHECK STATE: Is it actually formatted right now?
      // We check for the attribute AND the presence of the indent
      const hasAttr = node.dataset?.ankiFmt === "1";
      const hasIndent =
        node.innerHTML.startsWith(indent) ||
        node.innerHTML.startsWith("&nbsp;&nbsp;&nbsp;&nbsp;");

      if (hasAttr && hasIndent) {
        // --- ACTION: UNFORMAT (Toggle Off) ---
        let content = node.innerHTML;
        // Remove indent
        content = content.replace(/^(\u00A0|&nbsp;){4}/, "");
        // Remove the outer <i>...</i> but keep the text inside
        content = content.replace(/^<i>(.*)<\/i>$/i, "$1");

        node.innerHTML = content;
        delete node.dataset.ankiFmt;
        node.style.margin = ""; // Restore default margin
      } else {
        // --- ACTION: FORMAT (Toggle On) ---
        // Even if it has the attribute, if the indent is missing (user typed over it),
        // we treat it as a fresh line and re-format it.
        const inner = node.innerHTML
          .replace(/<br\s*\/?>$/gi, "")
          .replace(/[\n\r]/g, "")
          .trim();

        if (!inner) return;

        node.innerHTML = `${indent}<i>${inner}</i>`;
        node.dataset.ankiFmt = "1";
        node.style.margin = "0";
      }
      lastProcessed = node;
    }
  });

  // Cleanup redundant BRs
  const clean = () => {
    Array.from(editableRoot.childNodes).forEach((n) => {
      if (n.nodeName === "BR" && n.previousSibling?.nodeName === "DIV")
        n.remove();
    });
  };
  clean();
  setTimeout(clean, 20);

  // Restore Cursor
  if (lastProcessed) {
    const newRange = document.createRange();
    newRange.selectNodeContents(lastProcessed);
    newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);
    editableRoot.focus();
  }
})();
