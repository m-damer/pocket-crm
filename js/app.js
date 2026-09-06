// ---------------- Tab navigation ----------------
const TAB_VIEWS = {
  contacts: "view-contacts",
  schedule: "view-schedule",
  invoices: "view-invoices",
  more: "view-more",
};

const FAB_ACTIONS = {
  contacts: () => openForm(null),
  schedule: () => openEventForm(null),
  invoices: () => openInvoiceForm(null),
};

function switchTab(tab) {
  Object.entries(TAB_VIEWS).forEach(([key, viewId]) => {
    document.getElementById(viewId).hidden = key !== tab;
  });
  document.querySelectorAll(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  const fab = document.getElementById("fab-add");
  fab.style.display = FAB_ACTIONS[tab] ? "flex" : "none";
  fab.onclick = FAB_ACTIONS[tab] || null;
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
switchTab("contacts"); // sets the initial FAB action
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

// ---------------- Schedule wiring ----------------
document.getElementById("btn-ev-cancel").addEventListener("click", closeAllScreens);
document.getElementById("btn-ev-cancel-2").addEventListener("click", closeAllScreens);
document.getElementById("btn-ev-save").addEventListener("click", saveEventForm);
document.getElementById("btn-ev-delete").addEventListener("click", deleteCurrentEvent);
document.querySelectorAll("#ev-type button").forEach((b) => {
  b.addEventListener("click", () => setEventType(b.dataset.type));
});
document.querySelectorAll("#schedule-chips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#schedule-chips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    Schedule.filter = chip.dataset.sfilter;
    Schedule.renderList();
  });
});

// ---------------- Invoices wiring ----------------
document.getElementById("btn-inv-cancel").addEventListener("click", closeAllScreens);
document.getElementById("btn-inv-cancel-2").addEventListener("click", closeAllScreens);
document.getElementById("btn-inv-save").addEventListener("click", saveInvoiceForm);
document.getElementById("btn-inv-delete").addEventListener("click", deleteCurrentInvoice);
document.querySelectorAll("#inv-type button").forEach((b) => {
  b.addEventListener("click", () => setInvType(b.dataset.type));
});
document.getElementById("inv-currency").addEventListener("input", updateInvTotal);
document.querySelectorAll("#invoice-chips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll("#invoice-chips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    InvoicesUI.filter = chip.dataset.ifilter;
    InvoicesUI.renderList();
  });
});
document.getElementById("btn-inv-detail-back").addEventListener("click", closeAllScreens);
document.getElementById("btn-inv-detail-edit").addEventListener("click", () => openInvoiceForm(InvoicesUI.currentId));
document.getElementById("btn-inv-export-pdf").addEventListener("click", exportInvoicePDF);
document.getElementById("btn-inv-detail-delete").addEventListener("click", async () => {
  if (!InvoicesUI.currentId) return;
  if (!confirm("Delete this document? This can't be undone.")) return;
  await Invoices.remove(InvoicesUI.currentId);
  showToast("Deleted");
  await InvoicesUI.refresh();
  closeAllScreens();
});

// ---------------- Business profile wiring ----------------
let pendingLogoDataUrl = null;
document.getElementById("biz-logo").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { pendingLogoDataUrl = reader.result; };
  reader.readAsDataURL(file);
});

async function loadBusinessProfileForm() {
  const s = await Settings.get();
  document.getElementById("biz-name").value = s.businessName || "";
  document.getElementById("biz-address").value = s.address || "";
  document.getElementById("biz-phone").value = s.phone || "";
  document.getElementById("biz-email").value = s.email || "";
  document.getElementById("biz-currency").value = s.currency || "USD";
}

document.getElementById("btn-biz-save").addEventListener("click", async () => {
  const patch = {
    businessName: document.getElementById("biz-name").value.trim(),
    address: document.getElementById("biz-address").value.trim(),
    phone: document.getElementById("biz-phone").value.trim(),
    email: document.getElementById("biz-email").value.trim(),
    currency: document.getElementById("biz-currency").value.trim() || "USD",
  };
  if (pendingLogoDataUrl) patch.logoDataUrl = pendingLogoDataUrl;
  await Settings.update(patch);
  pendingLogoDataUrl = null;
  showToast("Business profile saved");
});

// ---------------- Boot ----------------
(async function boot() {
  await Contacts.refresh();
  await Schedule.refresh();
  Schedule.startReminderLoop();
  await InvoicesUI.refresh();
  await loadBusinessProfileForm();
})();

// ---------------- PWA install support ----------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      /* offline caching just won't be available; app still works */
    });
  });
}
