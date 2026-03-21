(function () {
  const indent = "\u00A0\u00A0\u00A0\u00A0";
  const indentRegex = /^(?:<span[^>]*><\/span>)*(?:\s|&nbsp;|\u00A0){4}/i;

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

  // --- STEP 2: STABLE NORMALIZATION ---
  function normalize(root) {
    // 1. Clean Clozes
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      null,
      false,
    );
    let node;
    const clozes = [];
    while ((node = walker.nextNode())) {
      if (node.nodeValue.includes("{{c")) clozes.push(node);
    }
    clozes.forEach((n) => {
      n.nodeValue = n.nodeValue.replace(/{{c\d+::(.*?)(?:::(?:.*?))?}}/g, "$1");
    });

    // 2. Split on <br> (Enhanced to handle <b>Header<br></b>)
    let br;
    while ((br = root.querySelector("br"))) {
      const splitRange = document.createRange();
      splitRange.setStartAfter(br);
      let top = br.parentNode;
      while (top && top.parentNode !== root) top = top.parentNode;

      if (top) {
        splitRange.setEndAfter(top);
        const fragment = splitRange.extractContents();
        const newDiv = document.createElement("div");
        newDiv.appendChild(fragment);
        root.insertBefore(newDiv, top.nextSibling);
      }
      br.remove();
    }

    // 3. Flatten nested block elements
    let nested;
    while (
      (nested = root.querySelector("div > div, div > p, p > div, p > p"))
    ) {
      const wrapper = nested.parentNode;
      const fragment = document.createDocumentFragment();
      while (wrapper.firstChild) fragment.appendChild(wrapper.firstChild);
      wrapper.replaceWith(fragment);
    }

    // 4. Wrap orphans and clean empty bold/italic tags
    const children = Array.from(root.childNodes);
    let group = [];
    children.forEach((node) => {
      const isBlock =
        node.nodeType === 1 && ["DIV", "P"].includes(node.nodeName);
      if (isBlock) {
        if (group.length > 0) wrap(group);
        group = [];
        node.style.margin = "0";
      } else {
        group.push(node);
      }
    });
    if (group.length > 0) wrap(group);

    function wrap(nodes) {
      const div = document.createElement("div");
      div.style.margin = "0";
      nodes[0].parentNode.insertBefore(div, nodes[0]);
      nodes.forEach((n) => div.appendChild(n));
    }

    // Clean ghost tags
    root.querySelectorAll("b, i").forEach((el) => {
      if (el.innerHTML.trim() === "" || el.innerHTML === "&nbsp;") el.remove();
    });
  }

  try {
    normalize(editableRoot);

    const sMarker = editableRoot.querySelector(".anki-fmt-start");
    const eMarker = editableRoot.querySelector(".anki-fmt-end");
    if (!sMarker || !eMarker) throw new Error("Markers lost");

    const getLine = (n) =>
      n && n.parentNode === editableRoot ? n : getLine(n.parentNode);
    const allLines = Array.from(editableRoot.childNodes);
    let low = allLines.indexOf(getLine(sMarker));
    let high = allLines.indexOf(getLine(eMarker));
    if (low > high) [low, high] = [high, low];

    const checkIsHeader = (line) => {
      if (!line || line.nodeType !== 1) return false;
      const text = line.innerText.trim();
      const b = line.querySelector("b");
      return b && text.length > 0 && text === b.innerText.trim();
    };

    // Expand scope if header
    if (low === high && checkIsHeader(allLines[low])) {
      for (let i = low + 1; i < allLines.length; i++) {
        if (checkIsHeader(allLines[i])) break;
        high = i;
      }
    }

    const scope = allLines.slice(low, high + 1);

    // REFINED TOGGLE LOGIC:
    // Is formatted ONLY if it has BOTH 4 spaces AND italics/attribute
    const refLine =
      scope.find((l) => l.innerText.trim().length > 0 && !checkIsHeader(l)) ||
      scope[0];
    const hasIndent = indentRegex.test(refLine.innerHTML.trim());
    const hasItalics = refLine.querySelector("i") !== null;
    const shouldUnformat =
      (hasIndent && hasItalics) || refLine.dataset.ankiFmt === "1";

    scope.forEach((line) => {
      if (line.nodeType !== 1) return;

      let html = line.innerHTML;
      let lastHtml = "";
      while (html !== lastHtml) {
        lastHtml = html;
        html = html.replace(
          /^((?:<span class="anki-fmt-(?:start|end)"><\/span>)*)(?:\s|&nbsp;|\u00A0){1,4}/gi,
          "$1",
        );
        html = html.replace(/<\/?i>/gi, "");
      }

      if (!shouldUnformat) {
        if (line.innerText.trim().length > 0 && !checkIsHeader(line)) {
          line.innerHTML = `${indent}<i>${html}</i>`;
          line.dataset.ankiFmt = "1";
        } else {
          line.innerHTML = html;
        }
      } else {
        line.innerHTML = html;
        delete line.dataset.ankiFmt;
      }
    });

    const finalStart = editableRoot.querySelector(".anki-fmt-start");
    const finalEnd = editableRoot.querySelector(".anki-fmt-end");
    if (finalStart && finalEnd) {
      const finalRange = document.createRange();
      finalRange.setStartAfter(finalStart);
      finalRange.setEndBefore(finalEnd);
      sel.removeAllRanges();
      sel.addRange(finalRange);
    }
  } catch (e) {
    console.error(e);
  } finally {
    editableRoot
      .querySelectorAll(".anki-fmt-start, .anki-fmt-end")
      .forEach((m) => m.remove());
    editableRoot.focus();
  }
})();
