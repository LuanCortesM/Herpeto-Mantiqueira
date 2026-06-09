(function () {
  const references = () => window.GoldReferences || { total: 0, items: [] };

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function renderList(listId, emptyId, items, formatter) {
    const list = document.getElementById(listId);
    const empty = document.getElementById(emptyId);
    if (!list) return;

    list.innerHTML = "";
    const fragment = document.createDocumentFragment();

    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = formatter ? formatter(item) : item.reference;
      fragment.appendChild(li);
    });

    list.appendChild(fragment);
    if (empty) {
      empty.hidden = items.length > 0;
    }
  }

  function filterReferences() {
    const data = references();
    const input = document.getElementById("goldReferenceSearch");
    const counter = document.getElementById("goldReferenceVisibleCount");
    const pendingCounter = document.getElementById("goldPendingVisibleCount");
    const query = normalizeText(input ? input.value : "");
    const items = query
      ? data.items.filter((item) =>
          normalizeText(`${item.reference} ${item.title} ${item.relativePath}`).includes(query)
        )
      : data.items;
    const pendingItems = query
      ? (data.pendingItems || []).filter((item) =>
          normalizeText(`${item.reference} ${item.title} ${item.fileName} ${item.path}`).includes(query)
        )
      : data.pendingItems || [];

    renderList("goldReferencesList", "goldReferenceEmpty", items);
    renderList(
      "goldPendingReferencesList",
      "goldPendingReferenceEmpty",
      pendingItems,
      (item) => `${item.reference} (${item.fileName || "arquivo sem nome"})`
    );
    if (counter) {
      counter.textContent = String(items.length);
    }
    if (pendingCounter) {
      pendingCounter.textContent = String(pendingItems.length);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const data = references();
    const total = document.getElementById("goldReferenceCount");
    const visible = document.getElementById("goldReferenceVisibleCount");
    const formattedTotal = document.getElementById("goldFormattedCount");
    const pendingTotal = document.getElementById("goldPendingCount");
    const pendingVisible = document.getElementById("goldPendingVisibleCount");
    const generatedAt = document.getElementById("goldReferenceGeneratedAt");
    const input = document.getElementById("goldReferenceSearch");

    if (total) total.textContent = String(data.total || data.items.length || 0);
    if (formattedTotal) formattedTotal.textContent = String(data.formattedTotal || data.items.length || 0);
    if (pendingTotal) pendingTotal.textContent = String(data.pendingTotal || (data.pendingItems || []).length || 0);
    if (visible) visible.textContent = String(data.items.length || 0);
    if (pendingVisible) pendingVisible.textContent = String((data.pendingItems || []).length || 0);
    if (generatedAt && data.generatedAt) {
      generatedAt.textContent = new Date(data.generatedAt).toLocaleDateString("pt-BR");
    }
    if (input) input.addEventListener("input", filterReferences);
    filterReferences();
  });
})();
