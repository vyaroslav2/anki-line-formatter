(function () {
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

  // Gutter/Offset fallback
  if (!startLine)
    startLine =
      editableRoot.childNodes[range.startOffset] || editableRoot.firstChild;
  if (!endLine)
    endLine =
      editableRoot.childNodes[range.endOffset - 1] || editableRoot.lastChild;

  const startIndex = allNodes.indexOf(startLine);
  const endIndex = allNodes.indexOf(endLine);
  if (startIndex === -1 || endIndex === -1) return;

  const low = Math.min(startIndex, endIndex);
  const high = Math.max(startIndex, endIndex);
  const toProcess = allNodes.slice(low, high + 1);

  const indent = "\u00A0\u00A0\u00A0\u00A0";
  let lastProcessed = null;

  toProcess.forEach((node) => {
    // 1. Remove Top-Level BRs (This stops the "Double Newline")
    if (node.nodeName === "BR") {
      node.remove();
      return;
    }

    // 2. Skip whitespace-only text
    if (node.nodeType === 3 && !node.textContent.trim()) {
      if (node !== startLine && node !== endLine) node.remove();
      return;
    }

    // 3. Skip if already formatted
    if (node.dataset?.ankiFmt) {
      lastProcessed = node;
      return;
    }

    // 4. Formatting
    let newNode;
    if (node.nodeType === 3) {
      // RAW TEXT NODE
      newNode = document.createElement("div");
      newNode.dataset.ankiFmt = "1";
      // FORCE MARGIN 0 to keep lines tight
      newNode.style.margin = "0";
      newNode.style.padding = "0";
      newNode.innerHTML = `${indent}<i>${node.textContent.replace(/[\n\r]/g, "")}</i>`;
      node.parentNode.replaceChild(newNode, node);
    } else {
      // EXISTING ELEMENT
      const cleaned = node.innerHTML
        .replace(/<br\s*\/?>$/gi, "") // Remove internal trailing BR
        .replace(/[\n\r]/g, ""); // Remove raw code newlines

      node.innerHTML = `${indent}<i>${cleaned}</i>`;
      node.dataset.ankiFmt = "1";
      node.style.margin = "0";
      node.style.padding = "0";
      newNode = node;
    }
    lastProcessed = newNode;
  });

  // 5. Final Cleanup: Remove any rogue BRs that might have survived
  // We do this twice: once now, once after a tiny delay to fight Anki's auto-BR.
  const clean = () => {
    Array.from(editableRoot.childNodes).forEach((n) => {
      if (n.nodeName === "BR" && n.previousSibling?.nodeName === "DIV") {
        n.remove();
      }
    });
  };

  clean();
  setTimeout(clean, 20);

  // 6. Restore Cursor
  if (lastProcessed) {
    const newRange = document.createRange();
    newRange.selectNodeContents(lastProcessed);
    newRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(newRange);
    editableRoot.focus();
  }
})();
