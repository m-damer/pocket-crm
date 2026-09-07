// ---------------- QR rendering (uses the vendored qrcode.js encoder) ----------------
function renderQRToCanvas(text, canvas, opts) {
  opts = opts || {};
  const qr = qrcode(0, opts.ecLevel || "M"); // typeNumber 0 = auto-size to fit the data
  qr.addData(text || " ");
  qr.make();
  const count = qr.getModuleCount();
  const cell = opts.cellSize || 6;
  const margin = opts.margin != null ? opts.margin : cell * 2;
  const size = count * cell + margin * 2;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas; // headless/test environments without canvas support
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
    }
  }
  return canvas;
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

function openFieldPicker(onConfirm, presetKeys) {
  fieldPickerSelected = (presetKeys || SHARE_FIELD_ALL_KEYS).slice();
  fieldPickerOnConfirm = onConfirm;
  renderFieldPicker();
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
  openFieldPicker(handleQRFieldsConfirmed);
}

// ---------------- QR source: phone contacts (native picker) ----------------
async function pickQRFromPhoneContacts() {
  if (!contactPickerSupported()) {
    showToast(t("toast_no_contact_picker"));
    return;
  }
  try {
    const picked = await navigator.contacts.select(["name", "tel", "email"], { multiple: true });
    if (!picked || picked.length === 0) return;
    qrPendingContacts = picked.map((p) => {
      const full = (p.name && p.name[0]) || "";
      const sp = full.indexOf(" ");
      return {
        firstName: sp === -1 ? full : full.slice(0, sp),
        lastName: sp === -1 ? "" : full.slice(sp + 1),
        company: "", jobTitle: "",
        phones: (p.tel || []).map((v) => ({ label: "mobile", value: v })),
        emails: (p.email || []).map((v) => ({ label: "other", value: v })),
        addresses: [], websites: [], birthday: "", notesList: [],
      };
    });
    openFieldPicker(handleQRFieldsConfirmed);
  } catch (e) {
    // user cancelled the native picker — nothing to do
  }
}

// ---------------- QR source: manual entry ----------------
function openQRManualForm() {
  ["qr-manual-first", "qr-manual-last", "qr-manual-company", "qr-manual-phone", "qr-manual-email"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  showScreen("screen-qr-manual");
}

function confirmQRManualForm() {
  const first = document.getElementById("qr-manual-first").value.trim();
  const last = document.getElementById("qr-manual-last").value.trim();
  const company = document.getElementById("qr-manual-company").value.trim();
  const phone = document.getElementById("qr-manual-phone").value.trim();
  const email = document.getElementById("qr-manual-email").value.trim();
  if (!first && !last && !company) {
    showToast(t("toast_add_name_or_company"));
    return;
  }
  qrPendingContacts = [{
    firstName: first, lastName: last, company, jobTitle: "",
    phones: phone ? [{ label: "mobile", value: phone }] : [],
    emails: email ? [{ label: "other", value: email }] : [],
    addresses: [], websites: [], birthday: "", notesList: [],
  }];
  closeScreen("screen-qr-manual");
  openFieldPicker(handleQRFieldsConfirmed);
}

// ---------------- QR generation ----------------
let qrPendingContacts = [];

async function handleQRFieldsConfirmed(selectedKeys) {
  const generated = [];
  for (const c of qrPendingContacts) {
    const vcardText = contactToVCard(c, selectedKeys);
    const label = fullName(c) || c.company || t("qr_code_fallback");
    const entry = await QRCodes.add({ label, vcardText });
    generated.push(entry);
  }
  qrPendingContacts = [];
  closeAllScreens();
  await renderQRList();
  showScreen("screen-qr-list");
  if (generated.length === 1) {
    openQRView(generated[0].id);
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
  codes.forEach((q) => {
    const canvas = document.getElementById(`qr-thumb-${q.id}`);
    if (canvas) renderQRToCanvas(q.vcardText, canvas, { cellSize: 2, margin: 4 });
  });
  wrap.querySelectorAll(".qr-row").forEach((row) => {
    row.addEventListener("click", () => openQRView(row.dataset.id));
  });
}

let qrViewingId = null;

async function openQRView(id) {
  const codes = await QRCodes.getAll();
  const q = codes.find((x) => x.id === id);
  if (!q) return;
  qrViewingId = id;
  document.getElementById("qr-view-label").textContent = q.label || t("qr_code_fallback");
  document.getElementById("qr-view-date").textContent = t("qr_generated_prefix", { date: fmtDate(q.createdAt) });
  const canvas = document.getElementById("qr-view-canvas");
  renderQRToCanvas(q.vcardText, canvas, { cellSize: 8, margin: 16 });
  showScreen("screen-qr-view");
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
