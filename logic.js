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

  // --- STEP 1: DROP MARKERS ---
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

  // --- STEP 2: NORMALIZE (Fix Mega-Blocks) ---
  function normalize(root) {
    Array.from(root.childNodes).forEach((node) => {
      if (node.nodeName === "BR") node.remove();
      else if (node.nodeType === 3) {
        if (node.textContent.trim().length > 0) {
          const div = document.createElement("div");
          div.style.margin = "0";
          node.parentNode.replaceChild(div, node);
          div.appendChild(node);
        } else node.remove();
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

  // --- STEP 3: PROCESS RANGE ---
  const getTop = (n) => {
    let curr = n;
    while (curr && curr.parentNode !== editableRoot) curr = curr.parentNode;
    return curr;
  };

  const startLine = getTop(editableRoot.querySelector(".anki-fmt-start"));
  const endLine = getTop(editableRoot.querySelector(".anki-fmt-end"));
  const allNodes = Array.from(editableRoot.childNodes);
  const low = allNodes.indexOf(startLine);
  const high = allNodes.indexOf(endLine);

  if (low !== -1 && high !== -1) {
    const scope = allNodes.slice(Math.min(low, high), Math.max(low, high) + 1);

    // Decide Toggle: If the FIRST line is already formatted, we UNFORMAT everything.
    const firstLineHtml = scope[0].innerHTML.replace(
      /<span class="anki-fmt-(start|end)"><\/span>/g,
      "",
    );
    const shouldUnformat =
      firstLineHtml.startsWith(indent) ||
      firstLineHtml.startsWith("&nbsp;") ||
      scope[0].dataset.ankiFmt === "1";

    scope.forEach((line) => {
      if (line.nodeType !== 1) return;

      // A. STRIP EVERYTHING (Clean to Zero State)
      let html = line.innerHTML.replace(
        /<span class="anki-fmt-(start|end)"><\/span>/g,
        "",
      );

      // Recursive Strip: remove ALL leading indents and outer <i> tags
      while (
        html.startsWith(indent) ||
        html.startsWith("&nbsp;") ||
        html.toLowerCase().startsWith("<i>")
      ) {
        html = html.replace(/^(&nbsp;|\u00A0)+/gi, "");
        html = html.replace(/^<i>(.*)<\/i>$/i, "$1");
      }
      html = html.trim();

      // B. APPLY TOGGLE
      if (shouldUnformat) {
        line.innerHTML = html;
        delete line.dataset.ankiFmt;
      } else if (html.length > 0 && html !== "&nbsp;") {
        line.innerHTML = `${indent}<i>${html}</i>`;
        line.dataset.ankiFmt = "1";
      }
    });
  }

  // --- STEP 4: RESTORE SELECTION ---
  const fStart = editableRoot.querySelector(".anki-fmt-start");
  const fEnd = editableRoot.querySelector(".anki-fmt-end");
  if (fStart && fEnd) {
    const fRange = document.createRange();
    const sL = getTop(fStart),
      eL = getTop(fEnd);
    if (sL !== eL) {
      fRange.setStartBefore(sL);
      fRange.setEndAfter(eL);
    } else {
      fRange.selectNodeContents(sL);
      fRange.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(fRange);
  }
  editableRoot
    .querySelectorAll(".anki-fmt-start, .anki-fmt-end")
    .forEach((m) => m.remove());
  editableRoot.focus();
})();
