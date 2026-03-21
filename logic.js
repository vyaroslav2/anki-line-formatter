(function () {
  const indent = "\u00A0\u00A0\u00A0\u00A0";

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

  // --- STEP 1: DROP SELECTION MARKERS ---
  const range = sel.getRangeAt(0);
  const startMarker = document.createElement("span");
  startMarker.className = "anki-fmt-start";
  const endMarker = document.createElement("span");
  endMarker.className = "anki-fmt-end";

  const sRange = range.cloneRange();
  sRange.collapse(true);
  sRange.insertNode(startMarker);
  const eRange = range.cloneRange();
  eRange.collapse(false);
  eRange.insertNode(endMarker);

  // --- STEP 2: NUCLEAR FLATTENING ---
  function normalize(root) {
    // 1. Convert all <br> to actual block breaks
    const brs = Array.from(root.querySelectorAll("br"));
    brs.forEach((br) => {
      const splitRange = document.createRange();
      splitRange.setStartAfter(br);
      let top = br.parentNode;
      while (top && top.parentNode !== root) top = top.parentNode;
      if (top) {
        splitRange.setEndAfter(top);
        const fragment = splitRange.extractContents();
        const newDiv = document.createElement("div");
        newDiv.appendChild(fragment);
        top.parentNode.insertBefore(newDiv, top.nextSibling);
      }
      br.remove();
    });

    // 2. Shred all nested blocks. Every <div> or <p> must be a direct child of root.
    let nestedBlock;
    while ((nestedBlock = root.querySelector("div div, div p, p div, p p"))) {
      const parent = nestedBlock.parentNode;
      const referenceNode = nestedBlock.nextSibling;
      // Move children of the nested block to the level of the parent
      while (nestedBlock.firstChild) {
        parent.parentNode.insertBefore(
          nestedBlock.firstChild,
          parent.nextSibling,
        );
      }
      nestedBlock.remove();
    }

    // 3. Ensure everything at the root is wrapped in a clean <div>
    let inlineGroup = [];
    const children = Array.from(root.childNodes);
    children.forEach((node) => {
      if (node.nodeName === "DIV" || node.nodeName === "P") {
        if (inlineGroup.length > 0) wrap(inlineGroup);
        inlineGroup = [];
        node.style.margin = "0";
      } else {
        inlineGroup.push(node);
      }
    });
    if (inlineGroup.length > 0) wrap(inlineGroup);

    function wrap(nodes) {
      const div = document.createElement("div");
      div.style.margin = "0";
      nodes[0].parentNode.insertBefore(div, nodes[0]);
      nodes.forEach((n) => div.appendChild(n));
    }

    // 4. Remove empty wrapper divs that contain no text/markers
    Array.from(root.childNodes).forEach((node) => {
      if (
        node.nodeType === 1 &&
        node.innerHTML.trim() === "" &&
        !node.querySelector("span")
      ) {
        node.remove();
      }
    });
  }

  normalize(editableRoot);

  // --- STEP 3: PROCESS FLAT LINES ---
  const sMarker = editableRoot.querySelector(".anki-fmt-start");
  const eMarker = editableRoot.querySelector(".anki-fmt-end");
  if (!sMarker || !eMarker) return;

  const getTop = (n) => {
    let curr = n;
    while (curr && curr.parentNode !== editableRoot) curr = curr.parentNode;
    return curr;
  };

  const startLine = getTop(sMarker);
  const endLine = getTop(eMarker);
  const allNodes = Array.from(editableRoot.childNodes);
  const low = allNodes.indexOf(startLine);
  const high = allNodes.indexOf(endLine);

  if (low !== -1 && high !== -1) {
    const scope = allNodes.slice(Math.min(low, high), Math.max(low, high) + 1);

    // Toggle Logic: find first line with text to decide
    const firstTextLine = scope.find((l) => l.innerText.trim().length > 0);
    const shouldUnformat =
      firstTextLine &&
      (firstTextLine.innerHTML.includes(indent) ||
        firstTextLine.dataset.ankiFmt === "1");

    scope.forEach((line) => {
      if (line.nodeType !== 1) return;

      // Clean HTML from previous formatting attempts
      let html = line.innerHTML;
      let lastHtml = "";
      while (html !== lastHtml) {
        lastHtml = html;
        // Remove 4-space indents
        html = html.replace(
          /^((?:<span.*?<\/span>)*)(?:\s|&nbsp;|\u00A0){1,4}/gi,
          "$1",
        );
        // Remove <i> and </i> tags
        html = html.replace(/<\/?i>/gi, "");
      }

      // Detection: Is it a bold header?
      const isBoldHeader =
        line.innerHTML.trim().startsWith("<b>") &&
        line.innerHTML.trim().endsWith("</b>");
      const hasContent = line.innerText.trim().length > 0;

      if (!shouldUnformat) {
        // Apply if it's text and NOT a bold header
        if (hasContent && !isBoldHeader) {
          line.innerHTML = `${indent}<i>${html}</i>`;
          line.dataset.ankiFmt = "1";
        } else {
          line.innerHTML = html; // Keep headers clean
        }
      } else {
        line.innerHTML = html; // Restore cleaned version
        delete line.dataset.ankiFmt;
      }
    });
  }

  // --- STEP 4: RESTORE SELECTION ---
  const finalStart = editableRoot.querySelector(".anki-fmt-start");
  const finalEnd = editableRoot.querySelector(".anki-fmt-end");
  if (finalStart && finalEnd) {
    const finalRange = document.createRange();
    try {
      finalRange.setStartAfter(finalStart);
      finalRange.setEndBefore(finalEnd);
      sel.removeAllRanges();
      sel.addRange(finalRange);
    } catch (e) {}
  }

  editableRoot
    .querySelectorAll(".anki-fmt-start, .anki-fmt-end")
    .forEach((m) => m.remove());
  editableRoot.focus();
})();
