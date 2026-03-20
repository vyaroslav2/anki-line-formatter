(function () {
  const indent = "\u00A0\u00A0\u00A0\u00A0";

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

  // --- STEP 1: DROP SELECTION MARKER ---
  const range = sel.getRangeAt(0);
  const marker = document.createElement("span");
  marker.id = "anki-fmt-marker";
  range.insertNode(marker);

  // --- STEP 2: NORMALIZE THE ENTIRE FIELD ---
  // Turns every line into a clean <div> sibling
  function normalizeField(root) {
    const children = Array.from(root.childNodes);
    children.forEach((node) => {
      if (node.nodeName === "BR") {
        node.remove();
      } else if (node.nodeType === 3) {
        // Loose text
        if (node.textContent.trim().length > 0) {
          const div = document.createElement("div");
          div.style.margin = "0";
          node.parentNode.replaceChild(div, node);
          div.appendChild(node);
        } else {
          node.remove();
        }
      } else if (node.nodeName === "DIV" || node.nodeName === "P") {
        // Split DIVs that contain BRs inside them
        const hasBR = Array.from(node.childNodes).some(
          (c) => c.nodeName === "BR",
        );
        if (hasBR) {
          let currentDiv = document.createElement("div");
          currentDiv.style.margin = "0";
          const innerNodes = Array.from(node.childNodes);
          innerNodes.forEach((child) => {
            if (child.nodeName === "BR") {
              if (currentDiv.childNodes.length > 0) {
                node.parentNode.insertBefore(currentDiv, node);
                currentDiv = document.createElement("div");
                currentDiv.style.margin = "0";
              }
            } else {
              currentDiv.appendChild(child);
            }
          });
          if (currentDiv.childNodes.length > 0) {
            node.parentNode.insertBefore(currentDiv, node);
          }
          node.remove();
        } else {
          node.style.margin = "0";
        }
      }
    });
  }

  normalizeField(editableRoot);

  // --- STEP 3: IDENTIFY LINES TO PROCESS ---
  const finalMarker = editableRoot.querySelector("#anki-fmt-marker");
  const getTop = (n) => {
    let curr = n;
    while (curr && curr.parentNode !== editableRoot) curr = curr.parentNode;
    return curr;
  };

  // We only process the line where the marker is.
  // (To process multiple lines, user must highlight them)
  const startLine = getTop(finalMarker);
  // If user has a selection range, we'd need to expand this,
  // but usually, for the "Mega Block" fix, processing the current block is key.

  // For simplicity, let's find all divs and process only those that were part of the selection
  const allDivs = Array.from(editableRoot.querySelectorAll("div"));

  // Logic: If a div contains the marker OR was part of the previous selection scope
  // For this fix, we will focus on the block containing the marker.
  const targetLines = allDivs.filter((div) => div.contains(finalMarker));

  targetLines.forEach((line) => {
    // Remove the marker HTML temporarily to clean the text
    const markerHTML = finalMarker.outerHTML;
    let html = line.innerHTML.replace(markerHTML, "");

    // DETECT: Is it already formatted? (Check for attribute or existing indent)
    const isFormatted = line.dataset.ankiFmt === "1" || html.startsWith(indent);

    if (isFormatted) {
      // UNFORMAT: Aggressively strip all indents and <i> tags
      html = html.replace(/^(&nbsp;|\u00A0){4}/gi, "");
      html = html.replace(/^<i>/i, "").replace(/<\/i>$/i, "");
      // Recursive check to prevent the "Nested <i>" bug from previous runs
      while (html.startsWith(indent) || html.startsWith("<i>")) {
        html = html.replace(/^(&nbsp;|\u00A0){4}/gi, "");
        html = html.replace(/^<i>/i, "").replace(/<\/i>$/i, "");
      }
      line.innerHTML = html + markerHTML;
      delete line.dataset.ankiFmt;
    } else {
      // FORMAT
      const cleanText = html.trim();
      if (cleanText && cleanText !== "&nbsp;") {
        line.innerHTML = `${indent}<i>${cleanText}</i>${markerHTML}`;
        line.dataset.ankiFmt = "1";
      }
    }
  });

  // --- STEP 4: RESTORE CURSOR ---
  const lastMarker = editableRoot.querySelector("#anki-fmt-marker");
  if (lastMarker) {
    const finalRange = document.createRange();
    finalRange.selectNode(lastMarker);
    finalRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(finalRange);
    lastMarker.remove();
  }
  editableRoot.focus();
})();
