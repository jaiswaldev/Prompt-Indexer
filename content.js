// Prompt Index Sidebar — robust hide/show + main auto-resize
(function () {
  const SIDEBAR_ID = "pi-sidebar";
  const TOGGLE_ID  = "pi-toggle";
  const SIDEBAR_WIDTH = "320px"; // width of sidebar when visible

  const SITE_ADAPTERS = {
    "chatgpt.com": {
      getRoot() { return document.querySelector("main") || document.querySelector('div[role="main"]') || document.body; },
      getUserMessageNodes() {
        // same selector used previously for chat messages
        const raw = Array.from(document.querySelectorAll('[data-message-author-role="user"]'));
        return raw.map(n => n.closest("div") || n).filter(Boolean);
      },
      getConversationId() {
        const m = location.pathname.match(/\/c\/([^/]+)/);
        return m ? m[1] : location.href;
      }
    }
  };

  // Helpers
  function pickSiteAdapter() {
    const host = location.hostname;
    for (const k of Object.keys(SITE_ADAPTERS)) if (host.endsWith(k)) return SITE_ADAPTERS[k];
    return {
      getRoot() { return document.querySelector("main") || document.body; },
      getUserMessageNodes() { return Array.from(document.querySelectorAll('[data-message-author-role="user"]')).map(n => n.closest("div") || n); },
      getConversationId() { return location.href; }
    };
  }
  function snippet(t, n = 80){ t = (t||"").replace(/\s+/g, " ").trim(); return t.length <= n ? t : t.slice(0, n-1) + "…"; }
  function getText(el){ return (el?.innerText || el?.textContent || "").trim(); }
  function escapeHtml(s){ return (s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

  // Create / remove utilities (avoid duplicates)
  function removeIfExists(id){
    const e = document.getElementById(id);
    if (e) e.remove();
  }

  // Toggle button (floating)
  function injectToggle(){
    removeIfExists(TOGGLE_ID);
    const btn = document.createElement("button");
    btn.id = TOGGLE_ID;
    btn.title = "Toggle Prompt Index";
    btn.innerHTML = `<span style="font-weight:700;">#</span>`;
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "20px",
      right: "12px", // will be adjusted when sidebar visible
      width: "48px",
      height: "48px",
      borderRadius: "999px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2147483647,
      background: "#4f46e5",
      color: "white",
      border: "none",
      cursor: "pointer",
      boxShadow: "0 6px 20px rgba(15,23,42,0.4)"
    });
    btn.addEventListener("click", () => {
      const s = document.getElementById(SIDEBAR_ID);
      if (!s) return setSidebarVisibility(true);
      const hidden = s.dataset.hidden === "true";
      setSidebarVisibility(!hidden);
    });
    document.body.appendChild(btn);
  }

  // Sidebar panel
  function injectSidebar() {
    removeIfExists(SIDEBAR_ID);

    const aside = document.createElement("aside");
    aside.id = SIDEBAR_ID;
    aside.dataset.hidden = "false";
    Object.assign(aside.style, {
      position: "fixed",
      top: "0",
      right: "0",
      height: "100vh",
      width: SIDEBAR_WIDTH,
      display: "flex",
      flexDirection: "column",
      background: "#0f172a",
      color: "#e6eef8",
      zIndex: 2147483646,
      boxShadow: "-8px 0 24px rgba(2,6,23,0.6)",
      transition: "opacity 0.22s ease",
      overflow: "hidden"
    });

    aside.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(148,163,184,0.06);">
        <div style="font-weight:600;">Prompt Index</div>
        <button id="pi-close" title="Hide" style="background:transparent;border:none;color:inherit;font-size:20px;cursor:pointer;">✕</button>
      </div>
      <div style="padding:12px;border-bottom:1px solid rgba(148,163,184,0.03);">
        <input id="pi-search" placeholder="Search prompts…" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(148,163,184,0.06);background:#071028;color:inherit;" />
      </div>
      <div id="pi-list" style="flex:1;overflow:auto;padding:10px;gap:8px;display:flex;flex-direction:column;"></div>
      <div style="padding:10px;border-top:1px solid rgba(148,163,184,0.03);font-size:12px;color:rgba(226,238,248,0.7);">Session: <span id="pi-session" style="opacity:0.95;"></span></div>
    `;

    // close button
    aside.querySelector("#pi-close").addEventListener("click", () => setSidebarVisibility(false));

    document.body.appendChild(aside);
  }

  // When sidebar visible, push root element to left by margin-right
  function applyMainMargin(show){
    const root = (STATE.site && STATE.site.getRoot) ? STATE.site.getRoot() : document.querySelector("main") || document.body;
    if (!root) return;
    // Transition for smooth effect
    root.style.transition = root.style.transition ? root.style.transition : "margin-right 0.22s ease";
    root.style.marginRight = show ? SIDEBAR_WIDTH : "";
  }

  function updateTogglePosition(show){
    const btn = document.getElementById(TOGGLE_ID);
    if (!btn) return;
    // when sidebar visible, move toggle left so it's not sitting over the sidebar edge
    btn.style.right = show ? `calc(${SIDEBAR_WIDTH} + 12px)` : "12px";
  }

  // Show/hide logic (safely sets dataset + layout)
  function setSidebarVisibility(show){
    const s = document.getElementById(SIDEBAR_ID);
    if (!s) return;
    if (show) {
      s.dataset.hidden = "false";
      s.style.display = "flex";
      s.style.opacity = "1";
      applyMainMargin(true);
      updateTogglePosition(true);
    } else {
      s.dataset.hidden = "true";
      s.style.opacity = "0";
      // give opacity a moment to animate, then hide
      setTimeout(() => {
        s.style.display = "none";
      }, 220);
      applyMainMargin(false);
      updateTogglePosition(false);
    }
  }

  // ---- Prompt index functionality (build list from messages) ----
  const STATE = { items: [], counter: 1, observer: null, site: null };

  function buildIndex(){
    const nodes = (STATE.site && STATE.site.getUserMessageNodes) ? STATE.site.getUserMessageNodes() : Array.from(document.querySelectorAll('[data-message-author-role="user"]')).map(n=>n.closest("div")||n);
    if (!nodes?.length) return;
    nodes.forEach(el => {
      if (el.dataset.piIndexed === "true") return;
      const text = getText(el);
      if (!text) return;
      el.dataset.piIndexed = "true";
      el.dataset.piAnchor = `pi-${STATE.counter}`;
      STATE.items.push({ id: el.dataset.piAnchor, el, text, index: STATE.counter++ });
    });
    renderList();
  }

  function renderList(){
    const list = document.getElementById("pi-list");
    if (!list) return;
    const q = (document.getElementById("pi-search")?.value || "").toLowerCase();
    list.innerHTML = "";
    STATE.items
      .filter(it => it.text.toLowerCase().includes(q))
      .forEach(it => {
        const row = document.createElement("button");
        row.type = "button";
        Object.assign(row.style, { textAlign: "left", padding: "8px", borderRadius: "8px", border: "none", cursor: "pointer", background: "transparent", color: "inherit" });
        row.innerHTML = `<div style="display:flex;align-items:center;gap:10px;">
            <div style="min-width:28px;height:28px;border-radius:6px;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;">${it.index}</div>
            <div style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(snippet(it.text))}</div>
          </div>`;
        row.addEventListener("click", () => jumpTo(it.el));
        list.appendChild(row);
      });
  }

  function jumpTo(el){
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // temporary highlight
    const prev = el.style.boxShadow;
    el.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.25)";
    setTimeout(()=> el.style.boxShadow = prev || "", 1400);
  }

  function attachSearch(){
    const input = document.getElementById("pi-search");
    if (!input) return;
    if (input.dataset.bound === "true") return;
    input.dataset.bound = "true";
    input.addEventListener("input", renderList);
  }

  function startObserving(){
    const root = (STATE.site && STATE.site.getRoot) ? STATE.site.getRoot() : document.body;
    if (!root) return;
    if (STATE.observer) try{ STATE.observer.disconnect(); }catch(e){}
    STATE.observer = new MutationObserver(() => buildIndex());
    STATE.observer.observe(root, { childList: true, subtree: true });
    buildIndex();
  }

  // Initialization & robustness
  function boot(){
    STATE.site = pickSiteAdapter();
    injectToggle();
    injectSidebar();
    // session id, if available
    const s = document.getElementById("pi-session"); if (s) s.textContent = (STATE.site && STATE.site.getConversationId) ? STATE.site.getConversationId() : location.href;
    setSidebarVisibility(true); // show by default; users can hide
    attachSearch();
    startObserving();
    // repair if ChatGPT navigates or re-renders elements
    const repairInterval = setInterval(() => {
      if (!document.getElementById(TOGGLE_ID)) injectToggle();
      if (!document.getElementById(SIDEBAR_ID)) { injectSidebar(); setSidebarVisibility(false); }
      attachSearch();
    }, 1500);
    // stop interval after a while to avoid infinite loop (optional)
    setTimeout(() => clearInterval(repairInterval), 60_000);
    // Also listen for SPA navigation
    window.addEventListener("popstate", () => setTimeout(() => { attachSearch(); buildIndex(); }, 300));
  }

  // Wait for basic DOM to be ready in single-page apps
  function whenReady(fn){
    if (document.readyState === "complete" || document.readyState === "interactive") return fn();
    document.addEventListener("DOMContentLoaded", fn);
  }

  whenReady(boot);
})();
