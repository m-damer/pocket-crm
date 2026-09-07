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

// ---------------- Wiring: bulk select + share ----------------
function updateSelectBar() {
  const count = Contacts.selectedIds.size;
  document.getElementById("contacts-header-title").textContent = Contacts.selectMode
    ? t("contacts_selected_count", { n: count })
    : t("contacts_title");
  document.getElementById("btn-export").hidden = Contacts.selectMode;
  document.getElementById("btn-select-share").hidden = !Contacts.selectMode;
  const selectBtn = document.getElementById("btn-select-mode");
  selectBtn.title = Contacts.selectMode ? t("btn_cancel_select_title") : t("btn_select_title");
  selectBtn.innerHTML = Contacts.selectMode
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/></svg>`;
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button type="button" class="icon-btn tag-delete-btn" style="color:#B3261E" title="${t("tag_delete_title")}" data-id="${t2.id}">
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

// ---------------- Wiring: Note / call note editor ----------------
document.getElementById("btn-note-cancel").addEventListener("click", () => {
  releaseRecordingResources();
  closeAllScreens();
});
document.getElementById("btn-note-save").addEventListener("click", saveNoteForm);
document.getElementById("btn-note-delete").addEventListener("click", deleteNoteForm);
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
document.getElementById("btn-qr-view-delete").addEventListener("click", deleteQRCode);
document.getElementById("btn-qr-download").addEventListener("click", downloadQRImage);
document.getElementById("btn-qr-share").addEventListener("click", shareQRImage);

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

// ---------------- Boot ----------------
(async function boot() {
  await I18N.init();
  document.querySelectorAll("#lang-toggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.lang === I18N.lang)
  );
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
