(() => {
  const header = document.getElementById("homeHeader");
  const nav = document.getElementById("homeNav");
  const menuToggle = document.getElementById("homeMenuToggle");
  const tabs = Array.from(document.querySelectorAll("[data-resource-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-resource-panel]"));

  function closeMenu() {
    nav?.classList.remove("is-open");
    menuToggle?.setAttribute("aria-expanded", "false");
  }

  menuToggle?.addEventListener("click", () => {
    const isOpen = nav?.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
  });

  nav?.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  window.addEventListener("scroll", () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 24);
  }, { passive: true });

  tabs.forEach((button) => {
    button.addEventListener("click", () => {
      tabs.forEach((tab) => {
        const selected = tab === button;
        tab.classList.toggle("is-active", selected);
        tab.setAttribute("aria-selected", String(selected));
      });
      panels.forEach((panel) => {
        const selected = panel.dataset.resourcePanel === button.dataset.resourceTab;
        panel.classList.toggle("is-active", selected);
        panel.hidden = !selected;
      });
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-open-gold]")) return;
    closeMenu();
    window.startGoldExperience?.();
  });
})();
