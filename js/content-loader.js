(function () {
  "use strict";

  function currentPageName() {
    const page = window.location.pathname.split("/").filter(Boolean).pop() || "../index.html";
    return page === "" ? "../index.html" : page;
  }

  function applyPatch(patch) {
    if (!patch || !patch.selector) return;
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll(patch.selector));
    } catch {
      return;
    }
    nodes.forEach((node) => {
      if (patch.visible === false) node.hidden = true;
      if (patch.visible === true) node.hidden = false;
      if (typeof patch.text === "string") node.textContent = patch.text;
      if (typeof patch.html === "string") node.innerHTML = patch.html;
      if (patch.attr && typeof patch.attr === "object") {
        Object.entries(patch.attr).forEach(([name, value]) => {
          if (value === null || value === false) node.removeAttribute(name);
          else node.setAttribute(name, String(value));
        });
      }
      if (patch.className) node.className = String(patch.className);
    });
  }

  async function loadContent() {
    try {
      const response = await fetch("/api/site-content/public", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      const content = payload.content || payload;
      const page = content.pages?.[currentPageName()] || content.pages?.["../index.html"];
      if (!page) return;
      if (page.title) document.title = page.title;
      (page.patches || []).forEach(applyPatch);
    } catch {
      // Conteudo editavel e opcional; em falha, o HTML original permanece.
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadContent);
  } else {
    loadContent();
  }
})();

