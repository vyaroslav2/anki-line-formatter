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

  console.log("%c[1] INITIAL HTML:", "color: orange; font-weight: bold;");
  console.log(editableRoot.innerHTML);

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
    let tNode;
    const clozes = [];
    while ((tNode = walker.nextNode())) {
      if (tNode.nodeValue.includes("{{c")) clozes.push(tNode);
    }
    clozes.forEach((n) => {
      n.nodeValue = n.nodeValue.replace(/{{c\d+::(.*?)(?:::(?:.*?))?}}/g, "$1");
    });

    // 2. Flatten into a list of nodes separated by BRs
    let allNodes = [];
    const process = (nodes) => {
      Array.from(nodes).forEach((node) => {
        if (node.nodeName === "DIV" || node.nodeName === "P") {
          process(node.childNodes);
          // Add a line break marker only if the previous node wasn't already a break
          if (
            allNodes.length > 0 &&
            allNodes[allNodes.length - 1].nodeName !== "BR"
          ) {
            allNodes.push(document.createElement("br"));
          }
        } else {
          allNodes.push(node);
        }
      });
    };
    process(root.childNodes);

    root.innerHTML = "";

    // 3. Reconstruct Divs (This preserves your manual blank lines)
    let currentDiv = document.createElement("div");
    currentDiv.style.margin = "0";
    root.appendChild(currentDiv);

    allNodes.forEach((node) => {
      if (node.nodeName === "BR") {
        if (currentDiv.childNodes.length === 0) currentDiv.innerHTML = "<br>";
        currentDiv = document.createElement("div");
        currentDiv.style.margin = "0";
        root.appendChild(currentDiv);
      } else {
        currentDiv.appendChild(node);
      }
    });

    // Final safety: if the last div is empty, make it a <br>
    if (currentDiv.childNodes.length === 0) {
      currentDiv.innerHTML = "<br>";
    }

    // Remove extra trailing empty div if it's redundant
    if (
      root.childNodes.length > 1 &&
      root.lastChild.innerHTML === "<br>" &&
      root.lastChild.previousSibling.innerHTML === "<br>"
    ) {
      root.lastChild.remove();
    }

    // Clean ghost formatting tags (like empty bold tags from copy-paste)
    root.querySelectorAll("b, i").forEach((el) => {
      if (el.innerText.trim() === "" && !el.querySelector("span")) el.remove();
    });
  }

  try {
    normalize(editableRoot);

    console.log("%c[2] POST-NORMALIZATION:", "color: cyan; font-weight: bold;");
    console.log(editableRoot.innerHTML);

    const sMarker = editableRoot.querySelector(".anki-fmt-start");
    const eMarker = editableRoot.querySelector(".anki-fmt-end");
    if (!sMarker || !eMarker)
      throw new Error("Markers lost during normalization");

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
      return (
        b &&
        text.length > 0 &&
        (text === b.innerText.trim() || line.innerHTML.trim().startsWith("<b>"))
      );
    };

    if (low === high && checkIsHeader(allLines[low])) {
      for (let i = low + 1; i < allLines.length; i++) {
        if (checkIsHeader(allLines[i])) break;
        high = i;
      }
    }

    const scope = allLines.slice(low, high + 1);
    const refLine =
      scope.find((l) => l.innerText.trim().length > 0 && !checkIsHeader(l)) ||
      scope[0];
    const hasIndent = indentRegex.test(refLine.innerHTML.trim());
    const hasItalics = refLine.querySelector("i") !== null;
    const shouldUnformat =
      (hasIndent && hasItalics) || refLine.dataset.ankiFmt === "1";

    scope.forEach((line) => {
      if (line.nodeType !== 1) return;

      const visibleText = line.innerText.trim();
      const isHeader = checkIsHeader(line);
      const isBlank = visibleText.length === 0;

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
        if (!isBlank && !isHeader) {
          line.innerHTML = `${indent}<i>${html}</i>`;
          line.dataset.ankiFmt = "1";
        } else {
          line.innerHTML = html;
        }
      } else {
        line.innerHTML = html;
        delete line.dataset.ankiFmt;
      }

      if (line.innerHTML.trim() === "") line.innerHTML = "<br>";
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

    console.log("%c[3] FINAL RESULT:", "color: lime; font-weight: bold;");
    console.log(editableRoot.innerHTML);
  } catch (e) {
    console.error("FORMATTER ERROR:", e);
  } finally {
    editableRoot
      .querySelectorAll(".anki-fmt-start, .anki-fmt-end")
      .forEach((m) => m.remove());
    editableRoot.focus();
  }
})();
