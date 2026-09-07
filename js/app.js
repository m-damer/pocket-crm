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

// ---------------- Wiring: Tags management ----------------
let tagEditorState = null; // null | { id: null|string, name, color }

function tagEditorHTML(state) {
  return `
    <div class="tag-editor-card" id="tag-editor-card">
      <input type="text" id="tag-editor-name" placeholder="Tag name" value="${escapeHTML(state.name)}" />
      <div class="tag-color-swatches" id="tag-editor-colors"></div>
      <div class="tag-editor-actions">
        <button type="button" class="btn-secondary" id="tag-editor-cancel" style="padding:8px 14px">Cancel</button>
        <button type="button" class="btn-primary" id="tag-editor-save" style="padding:8px 14px">${state.id ? "Save" : "Add tag"}</button>
      </div>
    </div>
  `;
}

async function renderTagsManageScreen() {
  const tags = await Tags.getAll();
  const counts = await Tags.countsById();
  const wrap = document.getElementById("tags-manage-list");

  const editorHTML = tagEditorState ? tagEditorHTML(tagEditorState) : "";
  const listHTML = tags.length === 0
    ? `<p class="hint-text" style="margin:14px 4px">${tagEditorState ? "" : "No tags yet. Tap + to add one."}</p>`
    : tags.map((t) => `
        <div class="tag-manage-row" data-id="${t.id}">
          <span class="tag-dot" style="background:${t.color}"></span>
          <div class="tag-manage-info">
            <p class="t">${escapeHTML(t.name)}</p>
            <p class="s">${counts[t.id] || 0} contact${(counts[t.id] || 0) === 1 ? "" : "s"}</p>
          </div>
          <button type="button" class="icon-btn tag-edit-btn" style="color:var(--navy)" title="Edit" data-id="${t.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button type="button" class="icon-btn tag-delete-btn" style="color:#B3261E" title="Delete" data-id="${t.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
        </div>
      `).join("");

  wrap.innerHTML = editorHTML + listHTML;

  if (tagEditorState) {
    renderColorSwatches("tag-editor-colors", tagEditorState.color);
    document.getElementById("tag-editor-cancel").addEventListener("click", () => {
      tagEditorState = null;
      renderTagsManageScreen();
    });
    document.getElementById("tag-editor-save").addEventListener("click", async () => {
      const name = document.getElementById("tag-editor-name").value.trim();
      if (!name) { showToast("Enter a tag name"); return; }
      const color = document.getElementById("tag-editor-colors").dataset.selected;
      const dupe = tags.find((t) => t.name.toLowerCase() === name.toLowerCase() && t.id !== tagEditorState.id);
      if (dupe) { showToast("A tag with that name already exists"); return; }
      if (tagEditorState.id) {
        await Tags.update(tagEditorState.id, { name, color });
        showToast("Tag updated");
      } else {
        await Tags.add(name, color);
        showToast("Tag added");
      }
      tagEditorState = null;
      await renderTagsManageScreen();
    });
  }

  wrap.querySelectorAll(".tag-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = tags.find((t) => t.id === btn.dataset.id);
      if (!tag) return;
      tagEditorState = { id: tag.id, name: tag.name, color: tag.color };
      renderTagsManageScreen();
    });
  });
  wrap.querySelectorAll(".tag-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tag = tags.find((t) => t.id === btn.dataset.id);
      if (!tag) return;
      const count = counts[tag.id] || 0;
      const msg = count > 0
        ? `Delete tag "${tag.name}"? It's used on ${count} contact${count === 1 ? "" : "s"} — it will be removed from all of them. This can't be undone.`
        : `Delete tag "${tag.name}"? This can't be undone.`;
      if (!confirm(msg)) return;
      await Tags.remove(tag.id);
      showToast("Tag deleted");
      await Contacts.refresh();
      await renderTagsManageScreen();
    });
  });
}

document.getElementById("row-tags-settings").addEventListener("click", async () => {
  tagEditorState = null;
  await renderTagsManageScreen();
  showScreen("screen-tags");
});
document.getElementById("btn-tags-add").addEventListener("click", () => {
  tagEditorState = { id: null, name: "", color: TAG_COLOR_PALETTE[0] };
  renderTagsManageScreen();
});
document.getElementById("btn-tags-back").addEventListener("click", () => {
  tagEditorState = null;
  closeAllScreens();
});

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
