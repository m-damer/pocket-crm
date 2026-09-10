// ---------------- Theme mode (light / dark / system) ----------------
// Applies Settings.themeMode by toggling data-theme on <html> — the CSS
// in styles.css does the actual recoloring via [data-theme="dark"] and
// the prefers-color-scheme media query. "System" means no data-theme
// attribute at all, letting the media query decide; explicit light/dark
// pins it regardless of the OS setting.
let themeMediaQuery = null;

function applyThemeMode(mode) {
  const root = document.documentElement;
  if (mode === "light" || mode === "dark") {
    root.dataset.theme = mode;
  } else {
    delete root.dataset.theme;
  }
  try { localStorage.setItem("crm-theme", mode === "light" || mode === "dark" ? mode : ""); } catch (e) { /* ignore */ }
  updateThemeColorMeta();
}

function updateThemeColorMeta() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const isDark = getComputedStyle(document.documentElement).colorScheme === "dark"
    || document.documentElement.dataset.theme === "dark"
    || (!document.documentElement.dataset.theme && themeMediaQuery && themeMediaQuery.matches);
  meta.setAttribute("content", isDark ? "#17130b" : "#fcf2e5");
}

function initThemeModeWatcher() {
  if (window.matchMedia) {
    themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    // Only matters in "system" mode (no data-theme set) — the browser's
    // own media query already repaints the CSS automatically either way,
    // this just keeps the OS status-bar color (theme-color meta) in sync
    // if the system switches while the app is open.
    themeMediaQuery.addEventListener("change", () => {
      if (!document.documentElement.dataset.theme) updateThemeColorMeta();
    });
  }
}

// ---------------- Tab navigation ----------------
const TAB_VIEWS = {
  contacts: "view-contacts",
  schedule: "view-schedule",
  pipeline: "view-pipeline",
  activity: "view-activity",
  more: "view-more",
};

const FAB_ACTIONS = {
  contacts: () => openAddContactMenu(),
  schedule: () => openEventForm(null),
  pipeline: () => openDealForm(null),
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
  if (tab === "activity") { renderGlobalActivityFeed(); renderFollowUpSection(); }
  if (tab === "pipeline") renderPipelineBoard();
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
document.getElementById("btn-detail-save-to-phone").addEventListener("click", () => saveContactToPhone(Contacts.currentId));
document.getElementById("fab-add-activity").addEventListener("click", () => openActivityMenu(Contacts.currentId));

document.getElementById("btn-note-sheet-close").addEventListener("click", closeNoteSheet);
document.getElementById("note-sheet-backdrop").addEventListener("click", closeNoteSheet);

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

// ---------------- Wiring: bulk select + share ----------------
function updateSelectBar() {
  const count = Contacts.selectedIds.size;
  document.getElementById("contacts-header-title").textContent = Contacts.selectMode
    ? t("contacts_selected_count", { n: count })
    : t("contacts_title");
  document.getElementById("btn-export").hidden = Contacts.selectMode;
  document.getElementById("btn-select-share").hidden = !Contacts.selectMode;
  document.getElementById("btn-select-bulk-edit").hidden = !Contacts.selectMode;
  const selectBtn = document.getElementById("btn-select-mode");
  selectBtn.title = Contacts.selectMode ? t("btn_cancel_select_title") : t("btn_select_title");
  selectBtn.innerHTML = Contacts.selectMode
    ? `<svg viewBox="0 -960 960 960" fill="currentColor"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>`
    : `<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-56-216 296-296-56-56-240 240-120-120-56 56 176 176Z"/></svg>`;
  const fab = document.getElementById("fab-add");
  if (Contacts.selectMode) fab.style.display = "none";
  else if (FAB_ACTIONS[document.querySelector(".nav-item.active")?.dataset.tab]) fab.style.display = "flex";
}

document.getElementById("btn-select-mode").addEventListener("click", () => {
  if (Contacts.selectMode) Contacts.exitSelectMode();
  else Contacts.enterSelectMode();
});

async function shareSelectedContacts() {
  const ids = Array.from(Contacts.selectedIds);
  if (ids.length === 0) {
    showToast(t("toast_select_one_contact"));
    return;
  }
  openFieldPicker(async (selectedKeys) => {
    const all = await DB.getAll();
    const chosen = all.filter((c) => ids.includes(c.id));
    const vcard = chosen.map((c) => contactToVCard(c, selectedKeys)).join("\r\n");
    const filename = chosen.length === 1
      ? `${fullName(chosen[0]).replace(/[^\w\- ]/g, "").trim() || "contact"}.vcf`
      : `crm-contacts-${new Date().toISOString().slice(0, 10)}.vcf`;

    let shared = false;
    if (navigator.canShare && navigator.share) {
      try {
        const file = new File([vcard], filename, { type: "text/vcard" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          shared = true;
        }
      } catch (e) { /* fall through to download */ }
    }
    if (!shared) {
      downloadFile(vcard, filename, "text/vcard");
      showToast(t("toast_contact_file_downloaded"));
    }
    closeAllScreens();
    Contacts.exitSelectMode();
  });
}
document.getElementById("btn-select-share").addEventListener("click", shareSelectedContacts);

// ---------------- Wiring: bulk edit (add tag / change category) for selected contacts ----------------
// Reuses the same bottom sheet as the "Add Activity" quick menu (openSheet /
// activityMenuRowHTML in contacts.js) — just with two different rows.
function openBulkActionsMenu() {
  if (Contacts.selectedIds.size === 0) {
    showToast(t("toast_select_one_contact"));
    return;
  }
  openSheet({
    title: t("bulk_actions_title"),
    date: "",
    bodyHTML: `<div class="activity-menu-list">${[
      activityMenuRowHTML(
        '<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Zm220 160Z"/></svg>',
        t("menu_bulk_add_tag"),
        "tag"
      ),
      activityMenuRowHTML(
        '<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M160-160v-80h110l-16-14q-52-46-73-105t-21-119q0-111 66.5-197.5T400-790v84q-72 26-116 88.5T240-478q0 45 17 87.5t53 78.5l10 10v-98h80v240H160Zm400-10v-84q72-26 116-88.5T720-482q0-45-17-87.5T650-648l-10-10v98h-80v-240h240v80H690l16 14q49 49 71.5 106.5T800-482q0 111-66.5 197.5T560-170Z"/></svg>',
        t("menu_bulk_change_category"),
        "category"
      ),
    ].join("")}</div>`,
  });
  document.querySelectorAll(".activity-menu-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeNoteSheet();
      const action = btn.dataset.action;
      if (action === "tag") openBulkTagPicker();
      else if (action === "category") openBulkCategoryPicker();
    });
  });
}
document.getElementById("btn-select-bulk-edit").addEventListener("click", openBulkActionsMenu);

document.getElementById("btn-bulk-tag-cancel").addEventListener("click", () => closeScreen("screen-bulk-tag"));
document.getElementById("btn-bulk-tag-apply").addEventListener("click", applyBulkTag);
document.getElementById("btn-bulk-add-new-tag").addEventListener("click", addNewTagFromBulkPicker);

document.getElementById("btn-bulk-category-cancel").addEventListener("click", () => closeScreen("screen-bulk-category"));
document.getElementById("btn-bulk-category-apply").addEventListener("click", applyBulkCategory);
document.querySelectorAll("#bulk-category-picker button").forEach((b) => {
  b.addEventListener("click", () => setBulkCategory(b.dataset.cat));
});

// ---------------- Wiring: Photo picker + crop ----------------
document.getElementById("photo-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  openPhotoCropFromFile(file);
  e.target.value = "";
});
document.getElementById("btn-remove-photo").addEventListener("click", () => {
  if (!formPhotoDataUrl) return; // nothing to remove — skip the confirmation noise
  if (!confirm(t("confirm_remove_photo"))) return;
  formPhotoDataUrl = "";
  updatePhotoPreview();
});
document.getElementById("btn-crop-cancel").addEventListener("click", () => closeScreen("screen-photo-crop"));
document.getElementById("btn-crop-save").addEventListener("click", savePhotoCrop);
wirePhotoCropEvents();

// ---------------- Wiring: Contact form field settings ----------------
// Field labels are shared across the field-settings screen, the info tab,
// and the contact form itself — see FIELD_GROUP_META in contacts.js, which
// also reads from the same i18n keys, so the wording always stays in sync.
function fieldSettingLabel(key) {
  const keys = {
    nickname: "field_nickname",
    companyJobTitle: "field_company_job_title",
    phones: "field_phones",
    emails: "field_emails",
    addresses: "field_addresses",
    websites: "field_websites",
    birthday: "field_birthday",
    customFields: "field_custom_fields",
  };
  return keys[key] ? t(keys[key]) : key;
}

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
      <span class="fs-label">${fieldSettingLabel(f.key)}</span>
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
      <input type="text" id="tag-editor-name" placeholder="${t("ph_tag_name")}" value="${escapeHTML(state.name)}" />
      <div class="tag-color-swatches" id="tag-editor-colors"></div>
      <div class="tag-editor-actions">
        <button type="button" class="btn-secondary" id="tag-editor-cancel" style="padding:8px 14px">${t("btn_cancel")}</button>
        <button type="button" class="btn-primary" id="tag-editor-save" style="padding:8px 14px">${state.id ? t("tag_editor_save") : t("tag_editor_add")}</button>
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
    ? `<p class="hint-text" style="margin:14px 4px">${tagEditorState ? "" : t("empty_no_tags")}</p>`
    : tags.map((t2) => `
        <div class="tag-manage-row" data-id="${t2.id}">
          <span class="tag-dot" style="background:${t2.color}"></span>
          <div class="tag-manage-info">
            <p class="t">${escapeHTML(t2.name)}</p>
            <p class="s">${I18N.plural(counts[t2.id] || 0, "contact_count", "contact_count_plural")}</p>
          </div>
          <button type="button" class="icon-btn tag-edit-btn" style="color:var(--navy)" title="${t("tag_edit_title")}" data-id="${t2.id}">
            <svg viewBox="0 -960 960 960" fill="currentColor"><path d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"/></svg>
          </button>
          <button type="button" class="icon-btn tag-delete-btn" style="color:#B3261E" title="${t("tag_delete_title")}" data-id="${t2.id}">
            <svg viewBox="0 -960 960 960" fill="currentColor"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/></svg>
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
      if (!name) { showToast(t("toast_enter_tag_name")); return; }
      const color = document.getElementById("tag-editor-colors").dataset.selected;
      const dupe = tags.find((tg) => tg.name.toLowerCase() === name.toLowerCase() && tg.id !== tagEditorState.id);
      if (dupe) { showToast(t("toast_tag_exists")); return; }
      if (tagEditorState.id) {
        await Tags.update(tagEditorState.id, { name, color });
        showToast(t("toast_tag_updated"));
      } else {
        await Tags.add(name, color);
        showToast(t("toast_tag_added"));
      }
      tagEditorState = null;
      await renderTagsManageScreen();
    });
  }

  wrap.querySelectorAll(".tag-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = tags.find((tg) => tg.id === btn.dataset.id);
      if (!tag) return;
      tagEditorState = { id: tag.id, name: tag.name, color: tag.color };
      renderTagsManageScreen();
    });
  });
  wrap.querySelectorAll(".tag-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tag = tags.find((tg) => tg.id === btn.dataset.id);
      if (!tag) return;
      const count = counts[tag.id] || 0;
      const msg = count > 0
        ? t("confirm_delete_tag_used", { name: tag.name, count: I18N.plural(count, "contact_count", "contact_count_plural") })
        : t("confirm_delete_tag", { name: tag.name });
      if (!confirm(msg)) return;
      await Tags.remove(tag.id);
      showToast(t("toast_tag_deleted"));
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

// ---------------- Wiring: Pipeline (deals) ----------------
document.getElementById("btn-deal-cancel").addEventListener("click", closeAllScreens);
document.getElementById("btn-deal-save").addEventListener("click", saveDealForm);
document.getElementById("btn-deal-delete").addEventListener("click", deleteDealForm);
document.querySelectorAll("#deal-stage-chips .chip").forEach((chip) => {
  chip.addEventListener("click", () => setDealStage(chip.dataset.stage));
});
document.getElementById("deal-contact-row").addEventListener("click", openDealContactPicker);

document.getElementById("btn-deal-picker-cancel").addEventListener("click", () => closeScreen("screen-deal-contact-picker"));
document.getElementById("deal-picker-search").addEventListener("input", (e) => {
  renderDealContactPickerList(e.target.value);
});

document.getElementById("pipeline-enabled-toggle").addEventListener("change", async (e) => {
  pipelineEnabled = e.target.checked;
  await Settings.update({ pipelineEnabled });
  applyPipelineVisibility();
});

// ---------------- Wiring: Duplicate detection & merge ----------------
document.getElementById("row-duplicates").addEventListener("click", openDuplicates);
document.getElementById("btn-duplicates-back").addEventListener("click", closeAllScreens);
document.getElementById("btn-duplicate-merge-back").addEventListener("click", () => closeScreen("screen-duplicate-merge"));
document.getElementById("btn-duplicate-merge-confirm").addEventListener("click", confirmDuplicateMerge);

// ---------------- Wiring: Note / call note editor ----------------
document.getElementById("btn-note-cancel").addEventListener("click", () => {
  releaseRecordingResources();
  closeAllScreens();
});
document.getElementById("btn-note-save").addEventListener("click", saveNoteForm);
document.getElementById("btn-note-delete").addEventListener("click", deleteNoteForm);

// ---------------- Wiring: Note detail (read-only) ----------------
// Deliberately NOT closeAllScreens() like every other back button in this
// app — note detail is nested one level deeper than anything else here
// (contact detail -> note detail -> note editor), so "back" here should
// reveal the Notes tab underneath, not jump all the way out past the
// contact the person was just looking at.
document.getElementById("btn-note-detail-back").addEventListener("click", () => closeScreen("screen-note-detail"));
document.getElementById("btn-note-detail-edit").addEventListener("click", () => openNoteForm(noteDetailContactId, noteDetailId));
document.getElementById("btn-note-detail-delete").addEventListener("click", deleteNoteFromDetail);
document.querySelectorAll("#note-type-toggle button").forEach((b) => {
  b.addEventListener("click", () => setNoteKind(b.dataset.noteKind));
});
document.querySelectorAll("#note-call-media-toggle button").forEach((b) => {
  b.addEventListener("click", () => setNoteCallMedia(b.dataset.callMedia));
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
  showToast(t("toast_backup_downloaded"));
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

// ---------------- Wiring: shared field picker ----------------
document.getElementById("btn-field-picker-cancel").addEventListener("click", () => {
  fieldPickerOnConfirm = null;
  closeAllScreens();
});
document.getElementById("btn-field-picker-confirm").addEventListener("click", () => {
  const cb = fieldPickerOnConfirm;
  fieldPickerOnConfirm = null;
  if (cb) cb(fieldPickerSelected.slice());
});
document.getElementById("fp-select-all").addEventListener("click", () => {
  fieldPickerSelected = SHARE_FIELD_ALL_KEYS.slice();
  renderFieldPicker();
});
document.getElementById("fp-select-none").addEventListener("click", () => {
  fieldPickerSelected = [];
  renderFieldPicker();
});

// ---------------- Wiring: QR codes ----------------
document.getElementById("row-qr-codes").addEventListener("click", async () => {
  await renderQRList();
  showScreen("screen-qr-list");
});
document.getElementById("btn-qr-list-back").addEventListener("click", closeAllScreens);
document.getElementById("btn-qr-generate").addEventListener("click", () => showScreen("screen-qr-source"));
document.getElementById("btn-qr-source-back").addEventListener("click", () => closeScreen("screen-qr-source"));

document.getElementById("row-qr-from-crm").addEventListener("click", async () => {
  closeScreen("screen-qr-source");
  await openQRContactPicker();
});
document.getElementById("row-qr-from-phone").addEventListener("click", () => {
  closeScreen("screen-qr-source");
  pickQRFromPhoneContacts();
});
if (contactPickerSupported()) {
  document.getElementById("row-qr-from-phone").style.display = "flex";
}
document.getElementById("row-qr-manual").addEventListener("click", () => {
  closeScreen("screen-qr-source");
  openQRManualForm();
});

document.getElementById("btn-qr-picker-cancel").addEventListener("click", () => closeScreen("screen-qr-contact-picker"));
document.getElementById("btn-qr-picker-confirm").addEventListener("click", confirmQRContactPicker);

document.getElementById("btn-qr-manual-cancel").addEventListener("click", () => closeScreen("screen-qr-manual"));
document.getElementById("btn-qr-manual-continue").addEventListener("click", confirmQRManualForm);

document.getElementById("btn-qr-view-back").addEventListener("click", () => closeScreen("screen-qr-view"));
document.getElementById("btn-qr-view-edit-title").addEventListener("click", openQRTitleEditor);
document.getElementById("btn-qr-view-delete").addEventListener("click", deleteQRCode);
document.getElementById("btn-qr-download").addEventListener("click", downloadQRImage);
document.getElementById("btn-qr-share").addEventListener("click", shareQRImage);

// ---------------- Wiring: QR logo upload ----------------
document.getElementById("fp-qr-logo-none").addEventListener("click", () => document.getElementById("fp-qr-logo-file").click());
document.getElementById("fp-qr-logo-set").addEventListener("click", () => document.getElementById("fp-qr-logo-file").click());
document.getElementById("fp-qr-logo-file").addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  handleQRLogoFileChosen(file);
  e.target.value = "";
});

// ---------------- Wiring: Schedule ----------------
document.getElementById("btn-ev-cancel").addEventListener("click", closeAllScreens);
document.getElementById("btn-ev-cancel-2").addEventListener("click", closeAllScreens);
document.getElementById("btn-ev-save").addEventListener("click", saveEventForm);
document.getElementById("btn-ev-delete").addEventListener("click", deleteCurrentEvent);
document.getElementById("btn-ev-detail-back").addEventListener("click", closeAllScreens);
document.getElementById("btn-ev-detail-edit").addEventListener("click", () => openEventForm(eventDetailId));
document.getElementById("btn-ev-detail-delete").addEventListener("click", deleteEventFromDetail);
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
document.getElementById("btn-cal-prev").addEventListener("click", calendarPrevMonth);
document.getElementById("btn-cal-next").addEventListener("click", calendarNextMonth);

// ---------------- Wiring: Reports ----------------
document.getElementById("row-reports").addEventListener("click", openReports);
document.getElementById("btn-reports-back").addEventListener("click", closeAllScreens);
document.querySelectorAll("#screen-reports .tab-btn").forEach((b) => {
  b.addEventListener("click", async () => {
    setReportsTab(b.dataset.rtab);
    await refreshOpenReportTab();
  });
});
document.getElementById("report-from").addEventListener("change", renderReportActivity);
document.getElementById("report-to").addEventListener("change", renderReportActivity);
document.getElementById("btn-summary-export-csv").addEventListener("click", exportSummaryCSV);
document.getElementById("btn-summary-export-pdf").addEventListener("click", exportSummaryPDF);
document.getElementById("btn-activity-export-csv").addEventListener("click", exportActivityCSV);
document.getElementById("btn-activity-export-pdf").addEventListener("click", exportActivityPDF);
document.getElementById("btn-tags-export-csv").addEventListener("click", exportTagsCSV);
document.getElementById("btn-tags-export-pdf").addEventListener("click", exportTagsPDF);

// ---------------- Wiring: Language toggle ----------------
document.querySelectorAll("#lang-toggle button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    if (btn.dataset.lang === I18N.lang) return;
    document.querySelectorAll("#lang-toggle button").forEach((b) => b.classList.toggle("active", b === btn));
    await I18N.setLang(btn.dataset.lang);
  });
});
I18N.onChange(async () => {
  // Re-sync anything already rendered dynamically in the previous language.
  document.querySelectorAll("#lang-toggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.lang === I18N.lang)
  );
  closeAllScreens();
  await Contacts.refresh();
  await Schedule.refresh();
  updateSelectBar();
});

// ---------------- Wiring: Appearance (theme mode) ----------------
document.querySelectorAll("#theme-mode-toggle button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const mode = btn.dataset.theme;
    document.querySelectorAll("#theme-mode-toggle button").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    applyThemeMode(mode);
    await Settings.update({ themeMode: mode });
  });
});

// ---------------- Wiring: Schedule settings (calendar week start) ----------------
document.querySelectorAll("#week-start-toggle button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const val = Number(btn.dataset.weekstart);
    document.querySelectorAll("#week-start-toggle button").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    await Settings.update({ weekStart: val });
    await Schedule.refresh();
  });
});

// ---------------- Wiring: Follow-up nudge settings ----------------
function setFollowUpDaysRowEnabled(enabled) {
  const row = document.getElementById("followup-days-row");
  row.style.opacity = enabled ? "1" : "0.45";
  row.style.pointerEvents = enabled ? "auto" : "none";
}
document.getElementById("followup-enabled-toggle").addEventListener("change", async (e) => {
  const enabled = e.target.checked;
  setFollowUpDaysRowEnabled(enabled);
  await Settings.update({ followUpEnabled: enabled });
  await renderFollowUpSection();
});
document.querySelectorAll("#followup-days-toggle button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const val = Number(btn.dataset.days);
    document.querySelectorAll("#followup-days-toggle button").forEach((b) =>
      b.classList.toggle("active", b === btn)
    );
    await Settings.update({ followUpDays: val });
    await renderFollowUpSection();
  });
});

// ---------------- Boot ----------------
(async function boot() {
  initThemeModeWatcher();
  await I18N.init();
  document.querySelectorAll("#lang-toggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.lang === I18N.lang)
  );
  const settings = await Settings.get();
  applyThemeMode(settings.themeMode || "system");
  document.querySelectorAll("#theme-mode-toggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.theme === (settings.themeMode || "system"))
  );
  document.querySelectorAll("#week-start-toggle button").forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.weekstart) === settings.weekStart)
  );
  document.getElementById("followup-enabled-toggle").checked = settings.followUpEnabled;
  setFollowUpDaysRowEnabled(settings.followUpEnabled);
  document.querySelectorAll("#followup-days-toggle button").forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.days) === settings.followUpDays)
  );
  pipelineEnabled = settings.pipelineEnabled !== false;
  document.getElementById("pipeline-enabled-toggle").checked = pipelineEnabled;
  applyPipelineVisibility();
  await Contacts.refresh();
  await Schedule.refresh();
  await renderFollowUpSection();
  Schedule.startReminderLoop();
})();

// ---------------- PWA install support ----------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      /* offline caching just won't be available; app still works */
    });
  });
  // service-worker.js already calls skipWaiting() + clients.claim() on
  // every update, so a newly-installed version takes control automatically
  // — the one piece that was missing is telling an already-open tab to
  // actually reload once that happens, so it picks up the new HTML/JS
  // instead of continuing to run whatever was already loaded in memory.
  // This is exactly the class of bug that made three already-shipped
  // fixes look like they hadn't happened at all: the code was correct and
  // freshly cached, but the open tab was still executing the old page.
  // The reloadedOnce guard is the standard safeguard against this event
  // firing more than once and causing a refresh loop.
  let reloadedOnce = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadedOnce) return;
    reloadedOnce = true;
    window.location.reload();
  });
}
