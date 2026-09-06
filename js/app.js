// ---------------- Tab navigation ----------------
const TAB_VIEWS = {
  contacts: "view-contacts",
  schedule: "view-schedule",
  invoices: "view-invoices",
  more: "view-more",
};

function switchTab(tab) {
  Object.entries(TAB_VIEWS).forEach(([key, viewId]) => {
    document.getElementById(viewId).hidden = key !== tab;
  });
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  document.getElementById("fab-add").style.display = tab === "contacts" ? "flex" : "none";
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// ---------------- Slide-in screens ----------------
function showScreen(id) {
  document.getElementById(id).classList.add("open");
}
function closeAllScreens() {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("open"));
}

// ---------------- Toast ----------------
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}

// ---------------- Wiring ----------------
document.getElementById("fab-add").addEventListener("click", () => openForm(null));
document.getElementById("btn-detail-back").addEventListener("click", closeAllScreens);
document.getElementById("btn-form-cancel").addEventListener("click", closeAllScreens);
document.getElementById("btn-form-cancel-2").addEventListener("click", closeAllScreens);
document.getElementById("btn-form-save").addEventListener("click", saveForm);
document.getElementById("btn-delete-contact").addEventListener("click", deleteCurrentContact);
document.getElementById("btn-detail-edit").addEventListener("click", () => openForm(Contacts.currentId));

document.querySelectorAll("#screen-detail .tab-btn").forEach((b) => {
  b.addEventListener("click", () => setDetailTab(b.dataset.dtab));
});
document.querySelectorAll("#form-category button").forEach((b) => {
  b.addEventListener("click", () => setFormCategory(b.dataset.cat));
});

document.getElementById("search-input").addEventListener("input", (e) => {
  Contacts.query = e.target.value;
  Contacts.renderList();
});
document.querySelectorAll("#filter-chips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#filter-chips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    Contacts.filter = chip.dataset.filter;
    Contacts.renderList();
  });
});

function downloadExport(json) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function exportData() {
  const json = await DB.exportJSON();
  downloadExport(json);
  showToast("Backup downloaded");
}
document.getElementById("btn-export").addEventListener("click", exportData);
document.getElementById("row-export").addEventListener("click", exportData);

// ---------------- Boot ----------------
(async function boot() {
  await Contacts.refresh();
})();

// ---------------- PWA install support ----------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      /* offline caching just won't be available; app still works */
    });
  });
}
