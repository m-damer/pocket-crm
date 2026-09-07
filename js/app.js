// ---------------- Tab navigation ----------------
const TAB_VIEWS = {
  contacts: "view-contacts",
  schedule: "view-schedule",
  more: "view-more",
};

const FAB_ACTIONS = {
  contacts: () => openForm(null),
  schedule: () => openEventForm(null),
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
function closeScreen(id) {
  document.getElementById(id).classList.remove("open");
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

// ---------------- Wiring: Contacts ----------------
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

// ---------------- Wiring: Photo picker + crop ----------------
document.getElementById("photo-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  openPhotoCropFromFile(file);
  e.target.value = "";
});
document.getElementById("btn-remove-photo").addEventListener("click", () => {
  formPhotoDataUrl = "";
  updatePhotoPreview();
});
document.getElementById("btn-crop-cancel").addEventListener("click", () => closeScreen("screen-photo-crop"));
document.getElementById("btn-crop-save").addEventListener("click", savePhotoCrop);
wirePhotoCropEvents();

// ---------------- Wiring: Contact form field settings ----------------
const FIELD_SETTING_LABELS = {
  nickname: "Nickname",
  companyJobTitle: "Company & job title",
  phones: "Phone numbers",
  emails: "Emails",
  addresses: "Addresses",
  websites: "Websites",
  birthday: "Birthday",
  customFields: "Custom fields",
};

async function renderFieldSettingsList() {
  const settings = await Settings.get();
  const config = settings.contactFieldConfig || DEFAULT_CONTACT_FIELD_CONFIG;
  const wrap = document.getElementById("field-settings-list");
  wrap.innerHTML = config.map((f, idx) => `
    <div class="field-setting-row" data-idx="${idx}">
      <div class="fs-controls">
        <button type="button" class="fs-arrow" data-dir="up" ${idx === 0 ? "disabled" : ""}>&#9650;</button>
        <button type="button" class="fs-arrow" data-dir="down" ${idx === config.length - 1 ? "disabled" : ""}>&#9660;</button>
      </div>
      <span class="fs-label">${FIELD_SETTING_LABELS[f.key] || f.key}</span>
      <input type="checkbox" class="fs-toggle-input" ${f.visible ? "checked" : ""} />
    </div>
  `).join("");

  wrap.querySelectorAll(".fs-arrow").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.closest(".field-setting-row").dataset.idx);
      const dir = btn.dataset.dir;
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= config.length) return;
      [config[idx], config[newIdx]] = [config[newIdx], config[idx]];
      await Settings.update({ contactFieldConfig: config });
      await renderFieldSettingsList();
    });
  });
  wrap.querySelectorAll(".fs-toggle-input").forEach((input) => {
    input.addEventListener("change", async () => {
      const idx = Number(input.closest(".field-setting-row").dataset.idx);
      config[idx].visible = input.checked;
      await Settings.update({ contactFieldConfig: config });
    });
  });
}

document.getElementById("row-field-settings").addEventListener("click", async () => {
  await renderFieldSettingsList();
  showScreen("screen-field-settings");
});
document.getElementById("btn-field-settings-back").addEventListener("click", closeAllScreens);

// ---------------- Wiring: Data export/import ----------------
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

document.getElementById("import-backup-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await importBackupFile(file);
  e.target.value = "";
});

document.getElementById("row-export-vcard").addEventListener("click", exportAllVCards);

document.getElementById("import-vcard-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await importVCardFile(file);
  e.target.value = "";
});

document.getElementById("row-import-picker").addEventListener("click", importFromPhoneContacts);
if (contactPickerSupported()) {
  document.getElementById("row-import-picker").style.display = "flex";
}

// ---------------- Wiring: Schedule ----------------
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
document.getElementById("btn-route-today").addEventListener("click", () => Schedule.routeToday());

// ---------------- Boot ----------------
(async function boot() {
  await Contacts.refresh();
  await Schedule.refresh();
  Schedule.startReminderLoop();
})();

// ---------------- PWA install support ----------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      /* offline caching just won't be available; app still works */
    });
  });
}
