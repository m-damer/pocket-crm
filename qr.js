// ---------------- QR rendering (uses the vendored qrcode.js encoder) ----------------
// Async because embedding a logo means loading an <img> first — every
// caller below already awaits this.
function renderQRToCanvas(text, canvas, opts) {
  opts = opts || {};
  return new Promise((resolve) => {
    const qr = qrcode(0, opts.ecLevel || (opts.logoDataUrl ? "H" : "M")); // typeNumber 0 = auto-size; H = high error-correction, needed so a center logo doesn't break scanning
    qr.addData(text || " ");
    qr.make();
    const count = qr.getModuleCount();
    const cell = opts.cellSize || 6;
    // ISO/IEC 18004 requires a minimum 4-module quiet zone on all sides —
    // real phone camera scanners rely on this blank border to detect the
    // code's boundary before they even attempt to decode it. The default
    // here used to be 2 modules, which is below spec; a synthetic decoder
    // in a clean test can often still read an under-margined code, but a
    // real camera scanning a screen, especially with any nearby on-screen
    // content, is a lot more likely to fail exactly where this margin was
    // being shorted.
    const margin = opts.margin != null ? opts.margin : cell * 4;
    const size = count * cell + margin * 2;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) { resolve(canvas); return; } // headless/test environments without canvas support
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
      }
    }
    if (!opts.logoDataUrl) { resolve(canvas); return; }
    const img = new Image();
    img.onload = () => {
      // Logo covers ~18% of the code's width (including its white
      // padding, ~16% area) — conservative on purpose. The "H" correction
      // level can in principle recover from far more, but that headroom
      // also has to cover real-world scan conditions (screen glare, a
      // camera at an angle, a low-end scanner) on top of the logo itself,
      // not just the logo in isolation the way a clean synthetic decode
      // test would see it.
      const logoSize = size * 0.18;
      const pad = logoSize * 0.16;
      const cx = (size - logoSize) / 2;
      const cy = (size - logoSize) / 2;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx - pad, cy - pad, logoSize + pad * 2, logoSize + pad * 2);
      ctx.drawImage(img, cx, cy, logoSize, logoSize);
      resolve(canvas);
    };
    img.onerror = () => resolve(canvas); // corrupt/unreadable logo — ship the plain QR rather than fail the whole render
    img.src = opts.logoDataUrl;
  });
}

// Resizes an uploaded logo image down to a reasonable max dimension before
// storing it as a data URL — an unconstrained phone-camera photo would
// otherwise bloat Settings (and every QR re-render) for no visual benefit,
// since the logo only ever renders at a small fraction of the QR's size.
function resizeImageFileToDataUrl(file, maxDim) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("unreadable image"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleQRLogoFileChosen(file) {
  if (!file) return;
  try {
    const dataUrl = await resizeImageFileToDataUrl(file, 240);
    await Settings.update({ logoDataUrl: dataUrl });
    refreshQRLogoControls(true);
  } catch (e) {
    showToast(t("toast_logo_read_failed"));
  }
}

async function refreshQRLogoControls(forceIncludeOn) {
  const settings = await Settings.get();
  const has = !!settings.logoDataUrl;
  document.getElementById("fp-qr-logo-none").hidden = has;
  document.getElementById("fp-qr-logo-set").hidden = !has;
  if (has) document.getElementById("fp-qr-logo-thumb").src = settings.logoDataUrl;
  document.getElementById("fp-qr-use-logo").disabled = !has;
  if (!has) document.getElementById("fp-qr-use-logo").checked = false;
  else if (forceIncludeOn) document.getElementById("fp-qr-use-logo").checked = true;
}

// ---------------- Shared field picker (used by QR generation + bulk share) ----------------
let fieldPickerSelected = SHARE_FIELD_ALL_KEYS.slice();
let fieldPickerOnConfirm = null; // function(selectedKeys)

function renderFieldPicker() {
  const wrap = document.getElementById("field-picker-list");
  const meta = shareFieldMeta();
  wrap.innerHTML = Object.entries(meta).map(([key, label]) => `
    <label class="tag-dropdown-row">
      <input type="checkbox" class="fp-check" value="${key}" ${fieldPickerSelected.includes(key) ? "checked" : ""} />
      <span>${label}</span>
    </label>
  `).join("");
  wrap.querySelectorAll(".fp-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!fieldPickerSelected.includes(cb.value)) fieldPickerSelected.push(cb.value);
      } else {
        fieldPickerSelected = fieldPickerSelected.filter((k) => k !== cb.value);
      }
    });
  });
}

async function openFieldPicker(onConfirm, presetKeys, isQR) {
  fieldPickerSelected = (presetKeys || SHARE_FIELD_ALL_KEYS).slice();
  fieldPickerOnConfirm = onConfirm;
  renderFieldPicker();
  document.getElementById("fp-qr-extras").hidden = !isQR;
  if (isQR) {
    document.getElementById("fp-qr-title").value = "";
    await refreshQRLogoControls(false);
  }
  showScreen("screen-field-picker");
}

// ---------------- QR source: pick CRM contacts (multi-select) ----------------
let qrContactPickerSelected = new Set();

async function openQRContactPicker() {
  qrContactPickerSelected = new Set();
  const all = await DB.getAll();
  const wrap = document.getElementById("qr-contact-picker-list");
  if (all.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="padding:24px 16px"><p>${t("empty_no_contacts_short")}</p></div>`;
  } else {
    wrap.innerHTML = all.map((c) => `
      <div class="contact-row" data-id="${c.id}">
        <span class="select-check"></span>
        ${c.photoDataUrl
          ? `<img class="avatar" src="${c.photoDataUrl}" style="object-fit:cover" />`
          : `<div class="avatar" style="background:${CAT_META[c.category].color}">${initials(c)}</div>`}
        <div class="contact-info">
          <p class="contact-name">${escapeHTML(fullName(c))}</p>
          <p class="contact-sub">${escapeHTML(c.company || primaryPhone(c) || primaryEmail(c) || "")}</p>
        </div>
      </div>
    `).join("");
    wrap.querySelectorAll(".contact-row").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.dataset.id;
        if (qrContactPickerSelected.has(id)) qrContactPickerSelected.delete(id);
        else qrContactPickerSelected.add(id);
        row.classList.toggle("select-mode", true);
        row.querySelector(".select-check").classList.toggle("checked", qrContactPickerSelected.has(id));
      });
      row.classList.add("select-mode");
    });
  }
  showScreen("screen-qr-contact-picker");
}

async function confirmQRContactPicker() {
  if (qrContactPickerSelected.size === 0) {
    showToast(t("toast_select_one_contact"));
    return;
  }
  const all = await DB.getAll();
  qrPendingContacts = all.filter((c) => qrContactPickerSelected.has(c.id));
  closeScreen("screen-qr-contact-picker");
  openFieldPicker(handleQRFieldsConfirmed, null, true);
}

// ---------------- QR source: phone contacts (native picker) ----------------
async function pickQRFromPhoneContacts() {
  if (!contactPickerSupported()) {
    showToast(t("toast_no_contact_picker"));
    return;
  }
  try {
    const picked = await navigator.contacts.select(["name", "tel", "email", "address"], { multiple: true });
    if (!picked || picked.length === 0) return;
    qrPendingContacts = picked.map((p) => {
      const full = ((p.name && p.name[0]) || "").trim();
      const sp = full.indexOf(" ");
      const addresses = dedupeBy(
        (p.address || []).map((a) => formatPickerAddress(a)).filter(Boolean),
        (v) => v.trim().toLowerCase()
      ).map((value) => ({ label: "other", value, mapsLink: "" }));
      return {
        namePrefix: "",
        firstName: sp === -1 ? full : full.slice(0, sp),
        lastName: sp === -1 ? "" : full.slice(sp + 1),
        company: "", jobTitle: "", department: "",
        phones: dedupePhoneValues(p.tel || []).map((v) => ({ label: "mobile", value: v })),
        emails: dedupeEmailValues(p.email || []).map((v) => ({ label: "other", value: v })),
        addresses, websites: [], customFields: [], birthday: "", notesList: [],
      };
    });
    openFieldPicker(handleQRFieldsConfirmed, null, true);
  } catch (e) {
    // user cancelled the native picker — nothing to do
  }
}

// ---------------- QR source: manual entry ----------------
// ---------------- QR source: manual entry ----------------
let qrManualPhones = [];
let qrManualEmails = [];
let qrManualWebsites = [];
let qrManualAddresses = [];
let qrManualCustomFields = [];

function openQRManualForm() {
  ["qr-manual-prefix", "qr-manual-first", "qr-manual-last", "qr-manual-jobtitle", "qr-manual-department", "qr-manual-company"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  qrManualPhones = [{ label: "mobile", value: "" }];
  qrManualEmails = [{ label: "other", value: "" }];
  qrManualWebsites = [];
  qrManualAddresses = [];
  qrManualCustomFields = [];
  renderMultiFieldEditor("qr-manual-phones", qrManualPhones, "phones");
  renderMultiFieldEditor("qr-manual-emails", qrManualEmails, "emails");
  renderMultiFieldEditor("qr-manual-websites", qrManualWebsites, "websites");
  renderMultiFieldEditor("qr-manual-addresses", qrManualAddresses, "addresses");
  renderCustomFieldsEditor("qr-manual-customfields", qrManualCustomFields);
  showScreen("screen-qr-manual");
}

function confirmQRManualForm() {
  const prefix = document.getElementById("qr-manual-prefix").value.trim();
  const first = document.getElementById("qr-manual-first").value.trim();
  const last = document.getElementById("qr-manual-last").value.trim();
  const jobTitle = document.getElementById("qr-manual-jobtitle").value.trim();
  const department = document.getElementById("qr-manual-department").value.trim();
  const company = document.getElementById("qr-manual-company").value.trim();
  if (!first && !last && !company) {
    showToast(t("toast_add_name_or_company"));
    return;
  }
  qrPendingContacts = [{
    namePrefix: prefix, firstName: first, lastName: last, company, jobTitle, department,
    phones: readMultiFieldEditor("qr-manual-phones", false),
    emails: readMultiFieldEditor("qr-manual-emails", false),
    websites: readMultiFieldEditor("qr-manual-websites", false),
    addresses: readMultiFieldEditor("qr-manual-addresses", true),
    customFields: readCustomFieldsEditor("qr-manual-customfields"),
    birthday: "", notesList: [],
  }];
  closeScreen("screen-qr-manual");
  openFieldPicker(handleQRFieldsConfirmed, null, true);
}

// ---------------- QR generation ----------------
let qrPendingContacts = [];

async function handleQRFieldsConfirmed(selectedKeys) {
  const isQR = !document.getElementById("fp-qr-extras").hidden;
  const customTitle = isQR ? document.getElementById("fp-qr-title").value.trim() : "";
  const includeLogo = isQR && document.getElementById("fp-qr-use-logo").checked;

  const generated = [];
  for (const c of qrPendingContacts) {
    const vcardText = contactToVCard(c, selectedKeys);
    // A custom title only makes sense for a single contact — for a batch
    // (multiple contacts picked at once), each one still gets its own
    // sensible auto label rather than all sharing one typed-in title.
    const label = (qrPendingContacts.length === 1 && customTitle) || fullName(c) || c.company || t("qr_code_fallback");
    const entry = await QRCodes.add({ label, vcardText, includeLogo });
    generated.push(entry);
  }
  qrPendingContacts = [];
  closeAllScreens();
  await renderQRList();
  showScreen("screen-qr-list");
  if (generated.length === 1) {
    await openQRView(generated[0].id);
  } else if (generated.length > 1) {
    showToast(t("toast_qr_generated", { n: generated.length }));
  }
}

// ---------------- QR list + single-code view ----------------
async function renderQRList() {
  const codes = await QRCodes.getAll();
  const wrap = document.getElementById("qr-list");
  if (codes.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="padding:32px 16px"><p>${t("empty_no_qr_codes")}</p></div>`;
    return;
  }
  wrap.innerHTML = codes.map((q) => `
    <div class="contact-row qr-row" data-id="${q.id}">
      <div class="qr-thumb-wrap"><canvas id="qr-thumb-${q.id}"></canvas></div>
      <div class="contact-info">
        <p class="contact-name">${escapeHTML(q.label || t("qr_code_fallback"))}</p>
        <p class="contact-sub">${fmtDate(q.createdAt)}</p>
      </div>
    </div>
  `).join("");
  const settings = await Settings.get();
  for (const q of codes) {
    const canvas = document.getElementById(`qr-thumb-${q.id}`);
    if (canvas) await renderQRToCanvas(q.vcardText, canvas, { cellSize: 2, margin: 8, logoDataUrl: q.includeLogo ? settings.logoDataUrl : "" });
  }
  wrap.querySelectorAll(".qr-row").forEach((row) => {
    row.addEventListener("click", () => openQRView(row.dataset.id));
  });
}

let qrViewingId = null;

// Field order here mirrors SHARE_FIELD_ALL_KEYS in vcard.js, so the detail
// list always reads in the same order the field picker offered them in.
function renderQRDetailsList(parsed) {
  const wrap = document.getElementById("qr-view-details");
  const rows = [];
  const nameLine = [parsed.namePrefix, parsed.firstName, parsed.lastName].filter(Boolean).join(" ");
  if (nameLine) rows.push([t("field_name"), nameLine]);
  if (parsed.jobTitle) rows.push([t("field_job_title"), parsed.jobTitle]);
  if (parsed.department) rows.push([t("field_department"), parsed.department]);
  if (parsed.company) rows.push([t("field_meta_company"), parsed.company]);
  (parsed.phones || []).forEach((p) => rows.push([phoneEmailLabel(p.label), p.value]));
  (parsed.emails || []).forEach((e) => rows.push([phoneEmailLabel(e.label), e.value]));
  (parsed.websites || []).forEach((w) => rows.push([phoneEmailLabel(w.label), w.value]));
  (parsed.addresses || []).forEach((a) => rows.push([phoneEmailLabel(a.label), a.value]));
  (parsed.customFields || []).forEach((f) => rows.push([f.label || t("field_custom_fields"), f.value]));

  wrap.innerHTML = rows.length === 0
    ? `<p class="hint-text" style="margin:0 16px">${t("qr_details_empty")}</p>`
    : rows.map(([label, value]) => `<div class="field-row"><p class="label">${escapeHTML(label)}</p><p class="value">${escapeHTML(value)}</p></div>`).join("");
}

async function openQRView(id) {
  const codes = await QRCodes.getAll();
  const q = codes.find((x) => x.id === id);
  if (!q) return;
  qrViewingId = id;
  document.getElementById("qr-view-label").textContent = q.label || t("qr_code_fallback");
  document.getElementById("qr-view-date").textContent = t("qr_generated_prefix", { date: fmtDate(q.createdAt) });
  const settings = await Settings.get();
  const canvas = document.getElementById("qr-view-canvas");
  await renderQRToCanvas(q.vcardText, canvas, { cellSize: 8, margin: 32, logoDataUrl: q.includeLogo ? settings.logoDataUrl : "" });
  const [parsed] = parseVCards(q.vcardText);
  renderQRDetailsList(parsed || {});
  showScreen("screen-qr-view");
}

function openQRTitleEditor() {
  if (!qrViewingId) return;
  openSheet({
    title: t("qr_edit_title_title"),
    date: "",
    bodyHTML: `
      <div class="form-group" style="padding:0 0 4px"><input type="text" id="qr-title-input" placeholder="e.g. Amir - Work card" data-i18n-ph="ph_qr_title" /></div>
      <div class="form-actions" style="padding:14px 0 4px"><button class="btn-primary" id="btn-qr-title-save" style="width:100%">${t("btn_save")}</button></div>
    `,
  });
  const input = document.getElementById("qr-title-input");
  input.value = document.getElementById("qr-view-label").textContent;
  document.getElementById("btn-qr-title-save").addEventListener("click", async () => {
    const newLabel = input.value.trim() || t("qr_code_fallback");
    await QRCodes.update(qrViewingId, { label: newLabel });
    closeNoteSheet();
    document.getElementById("qr-view-label").textContent = newLabel;
    await renderQRList();
  });
}

function qrCanvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function downloadQRImage() {
  const canvas = document.getElementById("qr-view-canvas");
  const blob = await qrCanvasToBlob(canvas);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "qr-code.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function shareQRImage() {
  const canvas = document.getElementById("qr-view-canvas");
  const blob = await qrCanvasToBlob(canvas);
  if (!blob) return;
  const file = new File([blob], "qr-code.png", { type: "image/png" });
  if (navigator.canShare && navigator.share) {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: t("qr_code_fallback") });
        return;
      }
    } catch (e) { /* fall through to download */ }
  }
  await downloadQRImage();
  showToast(t("toast_qr_downloaded"));
}

async function deleteQRCode() {
  if (!qrViewingId) return;
  if (!confirm(t("confirm_delete_qr"))) return;
  await QRCodes.remove(qrViewingId);
  showToast(t("toast_qr_deleted"));
  closeAllScreens();
  await renderQRList();
}
