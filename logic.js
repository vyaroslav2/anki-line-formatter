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

  // --- STEP 2: NORMALIZE (Mega-Block splitting) ---
  function normalize(root) {
    Array.from(root.childNodes).forEach((node) => {
      if (node.nodeName === "BR") node.remove();
      else if (node.nodeType === 3 && node.textContent.trim().length > 0) {
        const div = document.createElement("div");
        div.style.margin = "0";
        node.parentNode.replaceChild(div, node);
        div.appendChild(node);
      } else if (node.nodeName === "DIV" || node.nodeName === "P") {
        const hasBR = Array.from(node.childNodes).some(
          (c) => c.nodeName === "BR",
        );
        if (hasBR) {
          let currentDiv = document.createElement("div");
          currentDiv.style.margin = "0";
          Array.from(node.childNodes).forEach((child) => {
            if (child.nodeName === "BR") {
              if (currentDiv.childNodes.length > 0) {
                node.parentNode.insertBefore(currentDiv, node);
                currentDiv = document.createElement("div");
                currentDiv.style.margin = "0";
              }
            } else currentDiv.appendChild(child);
          });
          if (currentDiv.childNodes.length > 0)
            node.parentNode.insertBefore(currentDiv, node);
          node.remove();
        } else node.style.margin = "0";
      }
    });
  }
  normalize(editableRoot);

  // --- STEP 3: PROCESS LINES ---
  const getTop = (n) => {
    let curr = n;
    while (curr && curr.parentNode !== editableRoot) curr = curr.parentNode;
    return curr;
  };

  const sMarker = editableRoot.querySelector(".anki-fmt-start");
  const eMarker = editableRoot.querySelector(".anki-fmt-end");
  const startLine = getTop(sMarker);
  const endLine = getTop(eMarker);
  const allNodes = Array.from(editableRoot.childNodes);
  const low = allNodes.indexOf(startLine);
  const high = allNodes.indexOf(endLine);

  if (low !== -1 && high !== -1) {
    const scope = allNodes.slice(Math.min(low, high), Math.max(low, high) + 1);

    // Use a temporary copy without markers to decide Toggle logic
    const checkHtml = scope[0].innerHTML.replace(
      /<span class="anki-fmt-(start|end)"><\/span>/g,
      "",
    );
    const shouldUnformat =
      checkHtml.startsWith(indent) ||
      checkHtml.startsWith("&nbsp;") ||
      scope[0].dataset.ankiFmt === "1";

    scope.forEach((line) => {
      if (line.nodeType !== 1) return;

      // We work DIRECTLY on innerHTML including the markers
      let html = line.innerHTML;

      // RECURSIVE STRIP (while keeping markers)
      // We use a regex that looks past the markers to see if the line is formatted
      let isFormatted = true;
      while (isFormatted) {
        let stripped = html
          .replace(/<span class="anki-fmt-(start|end)"><\/span>/g, "")
          .trim();
        if (
          stripped.startsWith(indent) ||
          stripped.startsWith("&nbsp;") ||
          stripped.toLowerCase().startsWith("<i>")
        ) {
          // Strip indents from the start (even if markers are in front of them)
          html = html.replace(
            /^((?:<span.*?<\/span>)*)(?:&nbsp;|\u00A0){4}/gi,
            "$1",
          );
          // Strip the <i> tags but preserve what's inside (including markers)
          html = html.replace(
            /^((?:<span.*?<\/span>)*)<i>(.*)<\/i>((?:<span.*?<\/span>)*)$/i,
            "$1$2$3",
          );
        } else {
          isFormatted = false;
        }
      }

      if (!shouldUnformat) {
        const inner = html.trim();
        if (inner.replace(/<span.*?<\/span>/g, "").length > 0) {
          line.innerHTML = `${indent}<i>${inner}</i>`;
          line.dataset.ankiFmt = "1";
        }
      } else {
        line.innerHTML = html;
        delete line.dataset.ankiFmt;
      }
    });
  }

  // --- STEP 4: RESTORE SELECTION ---
  const finalStart = editableRoot.querySelector(".anki-fmt-start");
  const finalEnd = editableRoot.querySelector(".anki-fmt-end");

  if (finalStart && finalEnd) {
    const finalRange = document.createRange();

    // If there was a selection (highlight), restore the highlight
    // If it was just a cursor, start and end are the same
    finalRange.setStartAfter(finalStart);
    finalRange.setEndBefore(finalEnd);

    sel.removeAllRanges();
    sel.addRange(finalRange);
  }

  // Final cleanup of markers
  editableRoot
    .querySelectorAll(".anki-fmt-start, .anki-fmt-end")
    .forEach((m) => m.remove());
  editableRoot.focus();
})();
