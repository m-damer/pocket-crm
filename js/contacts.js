const CAT_META = {
  customer: { label: "Customer", color: "#1F8A5F" },
  lead: { label: "Lead", color: "#C97C1F" },
  lost: { label: "Lost", color: "#8A93A3" },
};
const LABEL_META = { mobile: "Mobile", home: "Home", work: "Work", other: "Other" };
const WEBSITE_LABEL_META = { personal: "Personal", work: "Work", portfolio: "Portfolio", other: "Other" };
const FIELD_GROUP_META = {
  nickname: "Nickname",
  companyJobTitle: "Company & job title",
  phones: "Phone numbers",
  emails: "Emails",
  addresses: "Addresses",
  websites: "Websites",
  birthday: "Birthday",
  customFields: "Custom fields",
};

function initials(c) {
  const a = (c.firstName || "").trim()[0] || "";
  const b = (c.lastName || "").trim()[0] || "";
  return (a + b).toUpperCase() || "?";
}

function fullName(c) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed contact";
}

function primaryPhone(c) { return (c.phones && c.phones[0] && c.phones[0].value) || ""; }
function primaryEmail(c) { return (c.emails && c.emails[0] && c.emails[0].value) || ""; }
function primaryAddress(c) { return (c.addresses && c.addresses[0]) || null; }

function waLink(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "").replace(/^\+/, "");
  return digits ? `https://wa.me/${digits}` : "";
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function fmtBirthday(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

const Contacts = {
  all: [],
  filter: "all",
  query: "",
  currentId: null,

  async load() {
    this.all = await DB.getAll();
  },

  visible() {
    return this.all.filter((c) => {
      if (this.filter !== "all" && c.category !== this.filter) return false;
      if (!this.query) return true;
      const q = this.query.toLowerCase();
      const haystack = [
        c.firstName, c.lastName, c.nickname, c.company, c.jobTitle,
        ...(c.phones || []).map((p) => p.value),
        ...(c.emails || []).map((e) => e.value),
        ...(c.websites || []).map((w) => w.value),
      ].filter(Boolean);
      return haystack.some((v) => v.toLowerCase().includes(q));
    });
  },

  renderList() {
    const listEl = document.getElementById("contact-list");
    const items = this.visible();
    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2"/><circle cx="10" cy="7" r="4"/></svg>
          <h3>${this.all.length === 0 ? "No contacts yet" : "No matches"}</h3>
          <p>${this.all.length === 0 ? "Tap the + button to add your first contact." : "Try a different search or filter."}</p>
        </div>`;
      return;
    }
    listEl.innerHTML = items.map((c) => `
      <div class="contact-row" data-id="${c.id}">
        ${c.photoDataUrl
          ? `<img class="avatar" src="${c.photoDataUrl}" style="object-fit:cover" />`
          : `<div class="avatar" style="background:${CAT_META[c.category].color}">${initials(c)}</div>`}
        <div class="contact-info">
          <p class="contact-name">${escapeHTML(fullName(c))}</p>
          <p class="contact-sub">${escapeHTML(c.company || primaryPhone(c) || primaryEmail(c) || "")}</p>
        </div>
        <span class="badge ${c.category}">${CAT_META[c.category].label}</span>
      </div>
    `).join("");
    listEl.querySelectorAll(".contact-row").forEach((row) => {
      row.addEventListener("click", () => openDetail(row.dataset.id));
    });
  },

  async refresh() {
    await this.load();
    this.renderList();
  },
};

async function renderLinkedEvents(contactId) {
  const events = (await Events.forContact(contactId))
    .filter((e) => !e.completed)
    .sort((a, b) => a.when.localeCompare(b.when));
  if (events.length === 0) return "";
  return `
    <div class="field-list" style="margin-top:2px">
      <p class="label" style="margin:6px 6px 6px">Upcoming</p>
      ${events.map((e) => `
        <div class="field-row">
          <p class="value">${escapeHTML(e.title || "Untitled")}</p>
          <p class="label" style="margin-top:3px">${new Date(e.when).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ${new Date(e.when).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      `).join("")}
    </div>
  `;
}

// ---------------- Info tab field groups (order/visibility driven by Settings) ----------------
function renderFieldGroupHTML(key, c) {
  switch (key) {
    case "nickname":
      return c.nickname ? `<div class="field-row"><p class="label">Nickname</p><p class="value">${escapeHTML(c.nickname)}</p></div>` : "";
    case "companyJobTitle":
      if (!c.company && !c.jobTitle) return "";
      return `<div class="field-row"><p class="label">Company</p><p class="value">${escapeHTML([c.jobTitle, c.company].filter(Boolean).join(" · ") || "—")}</p></div>`;
    case "phones":
      return (c.phones || []).map((p) => `
        <div class="field-row"><p class="label">${LABEL_META[p.label] || "Phone"}</p><p class="value">${escapeHTML(p.value)}</p></div>
      `).join("");
    case "emails":
      return (c.emails || []).map((e) => `
        <div class="field-row"><p class="label">${LABEL_META[e.label] || "Email"}</p><p class="value">${escapeHTML(e.value)}</p></div>
      `).join("");
    case "addresses":
      return (c.addresses || []).map((a) => `
        <div class="field-row">
          <p class="label">${LABEL_META[a.label] || "Address"}</p>
          <p class="value">${escapeHTML(a.value)}</p>
          ${a.mapsLink ? `<a href="${escapeHTML(a.mapsLink)}" target="_blank" rel="noopener" style="font-size:12px;color:var(--blue);font-weight:600">Open map link →</a>` : ""}
        </div>
      `).join("");
    case "websites":
      return (c.websites || []).map((w) => `
        <div class="field-row"><p class="label">${WEBSITE_LABEL_META[w.label] || "Website"}</p><p class="value"><a href="${/^https?:\/\//.test(w.value) ? w.value : "https://" + w.value}" target="_blank" rel="noopener" style="color:var(--blue)">${escapeHTML(w.value)}</a></p></div>
      `).join("");
    case "birthday":
      return c.birthday ? `<div class="field-row"><p class="label">Birthday</p><p class="value">${fmtBirthday(c.birthday)}</p></div>` : "";
    case "customFields":
      return (c.customFields || []).filter((f) => f.value).map((f) => `
        <div class="field-row"><p class="label">${escapeHTML(f.label || "Custom")}</p><p class="value">${escapeHTML(f.value)}</p></div>
      `).join("");
    default:
      return "";
  }
}

async function renderInfoTab(c) {
  const settings = await Settings.get();
  const config = settings.contactFieldConfig || DEFAULT_CONTACT_FIELD_CONFIG;
  const allTags = await Tags.getAll();
  const groupsHTML = config
    .filter((f) => f.visible)
    .map((f) => renderFieldGroupHTML(f.key, c))
    .join("");

  return `
    <div class="field-list">
      <div class="field-row"><p class="label">Category</p><p class="value">${CAT_META[c.category].label}</p></div>
      ${groupsHTML}
      ${c.tags && c.tags.length ? `<div class="field-row"><p class="label">Tags</p><div class="tag-row">${c.tags.map((tid) => {
        const t = allTags.find((x) => x.id === tid);
        return t ? `<span class="tag" style="background:${t.color};color:#fff">${escapeHTML(t.name)}</span>` : "";
      }).join("")}</div></div>` : ""}
      <div class="field-row"><p class="label">Added</p><p class="value">${fmtDate(c.createdAt)}</p></div>
    </div>
    ${await renderLinkedEvents(c.id)}
  `;
}

// ---------------- Detail screen ----------------
let detailTab = "info";

async function openDetail(id) {
  Contacts.currentId = id;
  detailTab = "info";
  await renderDetail();
  showScreen("screen-detail");
}

async function renderDetail() {
  const c = await DB.get(Contacts.currentId);
  if (!c) return;

  document.getElementById("detail-hero").innerHTML = `
    ${c.photoDataUrl
      ? `<img class="avatar" src="${c.photoDataUrl}" style="object-fit:cover;width:56px;height:56px" />`
      : `<div class="avatar" style="background:rgba(255,255,255,0.18)">${initials(c)}</div>`}
    <h2>${escapeHTML(fullName(c))}${c.nickname ? ` <span style="opacity:0.75;font-weight:400">"${escapeHTML(c.nickname)}"</span>` : ""}</h2>
    <p>${escapeHTML(c.jobTitle && c.company ? `${c.jobTitle} · ${c.company}` : (c.company || CAT_META[c.category].label))}</p>
  `;

  const phone = primaryPhone(c), email = primaryEmail(c), addr = primaryAddress(c);
  const mapsHref = addr ? (addr.mapsLink || "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(addr.value)) : "#";
  document.getElementById("detail-qa").innerHTML = `
    <a class="qa-btn ${phone ? "" : "disabled"}" href="${phone ? "tel:" + phone : "#"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></svg>
      Call
    </a>
    <a class="qa-btn ${phone ? "" : "disabled"}" target="_blank" rel="noopener" href="${phone ? waLink(phone) : "#"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 01-12.3 7.6L3 20l1-5.5A8.5 8.5 0 1121 11.5z"/><path d="M8.5 10.5c.3 2 2.7 4.3 4.7 4.6.8.1 1.6-.4 1.8-1.2"/></svg>
      WhatsApp
    </a>
    <a class="qa-btn ${email ? "" : "disabled"}" href="${email ? "mailto:" + email : "#"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>
      Email
    </a>
    <a class="qa-btn ${addr ? "" : "disabled"}" target="_blank" rel="noopener" href="${mapsHref}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
      Directions
    </a>
    <button type="button" class="qa-btn" id="btn-save-to-phone">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 18h6"/></svg>
      Save to phone
    </button>
  `;
  document.getElementById("btn-save-to-phone").addEventListener("click", () => saveContactToPhone(c.id));

  document.getElementById("detail-tab-info").innerHTML = await renderInfoTab(c);

  const activities = c.activities || [];
  document.getElementById("detail-tab-activity").innerHTML = `
    <div class="field-list">
      ${activities.length === 0
        ? `<div class="empty-state" style="padding:32px 16px"><p>No activity logged yet.</p></div>`
        : activities.map((a) => `
          <div class="activity-item">
            <p class="when">${fmtDate(a.date)}</p>
            <p class="what">${escapeHTML(a.note)}</p>
          </div>`).join("")}
    </div>
  `;

  document.getElementById("detail-tab-notes").innerHTML = `
    <div class="notes-box">
      <textarea id="notes-textarea" placeholder="Write notes about this contact...">${escapeHTML(c.notes || "")}</textarea>
    </div>
  `;
  const notesArea = document.getElementById("notes-textarea");
  let notesTimer = null;
  notesArea.addEventListener("input", () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(async () => {
      await DB.update(c.id, { notes: notesArea.value });
      showToast("Notes saved");
    }, 700);
  });

  setDetailTab(detailTab);
  await renderDocsTab(c.id);
}

async function renderDocsTab(contactId) {
  const docs = await Documents.forContact(contactId);
  const wrap = document.getElementById("detail-tab-docs");
  wrap.innerHTML = `
    <div class="field-list">
      <label class="btn-add-item" style="display:block;text-align:center;margin-bottom:10px;cursor:pointer">
        + Attach a file
        <input type="file" id="doc-file-input" style="display:none" />
      </label>
      ${docs.length === 0
        ? `<div class="empty-state" style="padding:24px 16px"><p>No documents attached yet.</p></div>`
        : docs.map((d) => `
          <div class="doc-row" data-id="${d.id}">
            <div class="doc-icon">${(d.name.split(".").pop() || "?").slice(0, 4).toUpperCase()}</div>
            <div class="contact-info">
              <p class="contact-name">${escapeHTML(d.name)}</p>
              <p class="contact-sub">${(d.size / 1024).toFixed(0)} KB · ${fmtDate(d.createdAt)}</p>
            </div>
            <a class="icon-btn doc-download" style="color:var(--navy)" href="${d.dataUrl}" download="${escapeHTML(d.name)}" title="Download">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
            </a>
            <button class="icon-btn doc-remove" style="color:#B3261E" data-remove="${d.id}" title="Remove">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </div>
        `).join("")}
    </div>
  `;

  document.getElementById("doc-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showToast("File too large (max 8 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      await Documents.add({ contactId, name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
      showToast("File attached");
      await renderDocsTab(contactId);
    };
    reader.readAsDataURL(file);
  });

  wrap.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this file?")) return;
      await Documents.remove(btn.dataset.remove);
      await renderDocsTab(contactId);
    });
  });
}

function setDetailTab(tab) {
  detailTab = tab;
  document.querySelectorAll("#screen-detail .tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.dtab === tab)
  );
  ["info", "activity", "notes", "docs"].forEach((t) => {
    document.getElementById("detail-tab-" + t).hidden = t !== tab;
  });
}

// ---------------- Multi-value field editors (phones / emails / addresses) ----------------
function syncMultiFieldFromDOM(containerId, items, isAddress) {
  const rows = document.querySelectorAll(`#${containerId} .multi-field-row`);
  rows.forEach((row, idx) => {
    if (!items[idx]) return;
    items[idx].label = row.querySelector(".mf-label").value;
    items[idx].value = row.querySelector(".mf-value").value;
    if (isAddress) items[idx].mapsLink = row.querySelector(".mf-maps").value;
  });
}

function multiFieldPlaceholder(kind) {
  if (kind === "addresses") return "Address";
  if (kind === "emails") return "Email";
  if (kind === "websites") return "example.com";
  return "Phone number";
}
function multiFieldAddLabel(kind) {
  if (kind === "addresses") return "address";
  if (kind === "emails") return "email";
  if (kind === "websites") return "website";
  return "phone";
}
function multiFieldDefaultRow(kind) {
  if (kind === "addresses") return { label: "home", value: "", mapsLink: "" };
  if (kind === "websites") return { label: "other", value: "" };
  return { label: "mobile", value: "" };
}

function renderMultiFieldEditor(containerId, items, kind) {
  const wrap = document.getElementById(containerId);
  const isAddress = kind === "addresses";
  const labelMeta = kind === "websites" ? WEBSITE_LABEL_META : LABEL_META;
  wrap.innerHTML = items.map((it, idx) => `
    <div class="item-row multi-field-row" data-idx="${idx}">
      <select class="mf-label">
        ${Object.entries(labelMeta).map(([k, v]) => `<option value="${k}" ${it.label === k ? "selected" : ""}>${v}</option>`).join("")}
      </select>
      <div class="mf-value-col">
        <input type="text" class="mf-value" placeholder="${multiFieldPlaceholder(kind)}" value="${escapeHTML(it.value || "")}" />
        ${isAddress ? `<input type="text" class="mf-maps" placeholder="Google Maps link (optional)" value="${escapeHTML(it.mapsLink || "")}" />` : ""}
      </div>
      <button type="button" class="it-remove" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
      </button>
    </div>
  `).join("") + `<button type="button" class="btn-add-item" data-add="${containerId}">+ Add ${multiFieldAddLabel(kind)}</button>`;

  wrap.querySelectorAll(".it-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncMultiFieldFromDOM(containerId, items, isAddress); // preserve what's typed in the other rows
      const idx = Number(btn.closest(".multi-field-row").dataset.idx);
      items.splice(idx, 1);
      renderMultiFieldEditor(containerId, items, kind);
    });
  });
  wrap.querySelector("[data-add]").addEventListener("click", () => {
    syncMultiFieldFromDOM(containerId, items, isAddress); // preserve what's typed before adding a new row
    items.push(multiFieldDefaultRow(kind));
    renderMultiFieldEditor(containerId, items, kind);
  });
}

// ---------------- Custom fields editor (user-defined label + value) ----------------
function syncCustomFieldsFromDOM(containerId, items) {
  const rows = document.querySelectorAll(`#${containerId} .custom-field-row`);
  rows.forEach((row, idx) => {
    if (!items[idx]) return;
    items[idx].label = row.querySelector(".cf-label").value;
    items[idx].value = row.querySelector(".cf-value").value;
  });
}

function renderCustomFieldsEditor(containerId, items) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = items.map((it, idx) => `
    <div class="item-row custom-field-row" data-idx="${idx}">
      <div class="mf-value-col">
        <input type="text" class="mf-value cf-label" placeholder="Field name (e.g. Instagram)" value="${escapeHTML(it.label || "")}" />
        <input type="text" class="mf-value cf-value" placeholder="Value" value="${escapeHTML(it.value || "")}" />
      </div>
      <button type="button" class="it-remove" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
      </button>
    </div>
  `).join("") + `<button type="button" class="btn-add-item" data-add="${containerId}">+ Add custom field</button>`;

  wrap.querySelectorAll(".it-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      syncCustomFieldsFromDOM(containerId, items);
      const idx = Number(btn.closest(".custom-field-row").dataset.idx);
      items.splice(idx, 1);
      renderCustomFieldsEditor(containerId, items);
    });
  });
  wrap.querySelector("[data-add]").addEventListener("click", () => {
    syncCustomFieldsFromDOM(containerId, items);
    items.push({ label: "", value: "" });
    renderCustomFieldsEditor(containerId, items);
  });
}

function readCustomFieldsEditor(containerId) {
  const rows = document.querySelectorAll(`#${containerId} .custom-field-row`);
  const out = [];
  rows.forEach((row) => {
    const label = row.querySelector(".cf-label").value.trim();
    const value = row.querySelector(".cf-value").value.trim();
    if (!label && !value) return;
    out.push({ id: uid("cf"), label, value });
  });
  return out;
}

function readMultiFieldEditor(containerId, isAddress) {
  const rows = document.querySelectorAll(`#${containerId} .multi-field-row`);
  const out = [];
  rows.forEach((row) => {
    const label = row.querySelector(".mf-label").value;
    const value = row.querySelector(".mf-value").value.trim();
    if (!value) return;
    const entry = { id: uid(isAddress ? "a" : "f"), label, value };
    if (isAddress) entry.mapsLink = row.querySelector(".mf-maps").value.trim();
    out.push(entry);
  });
  return out;
}

// ---------------- Shared: color swatch picker (tag colors) ----------------
function renderColorSwatches(containerId, selectedColor) {
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = TAG_COLOR_PALETTE.map((c) => `
    <button type="button" class="tag-swatch ${c === selectedColor ? "selected" : ""}" data-color="${c}" style="background:${c}" title="${c}"></button>
  `).join("");
  wrap.dataset.selected = selectedColor;
  wrap.querySelectorAll(".tag-swatch").forEach((btn) => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".tag-swatch").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      wrap.dataset.selected = btn.dataset.color;
    });
  });
}

// ---------------- Contact form: tag picker (dropdown + inline "add new") ----------------
async function renderTagChips() {
  const allTags = await Tags.getAll();
  const wrap = document.getElementById("f-tags-chips");
  if (formTagIds.length === 0) {
    wrap.innerHTML = `<p class="hint-text" style="margin:0 0 8px">No tags yet</p>`;
    return;
  }
  wrap.innerHTML = formTagIds.map((id) => {
    const t = allTags.find((x) => x.id === id);
    if (!t) return "";
    return `
      <span class="tag-chip" style="background:${t.color}">
        ${escapeHTML(t.name)}
        <button type="button" class="tag-chip-remove" data-id="${t.id}" title="Remove">&times;</button>
      </span>
    `;
  }).join("");
  wrap.querySelectorAll(".tag-chip-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      formTagIds = formTagIds.filter((id) => id !== btn.dataset.id);
      await renderTagChips();
      await renderTagDropdownList();
    });
  });
}

async function renderTagDropdownList() {
  const allTags = await Tags.getAll();
  const wrap = document.getElementById("tag-dropdown-list");
  if (allTags.length === 0) {
    wrap.innerHTML = `<p class="hint-text" style="margin:2px 0 0">No tags yet — add one below</p>`;
    return;
  }
  wrap.innerHTML = allTags.map((t) => `
    <label class="tag-dropdown-row">
      <input type="checkbox" class="tag-check" value="${t.id}" ${formTagIds.includes(t.id) ? "checked" : ""} />
      <span class="tag-dot" style="background:${t.color}"></span>
      <span>${escapeHTML(t.name)}</span>
    </label>
  `).join("");
  wrap.querySelectorAll(".tag-check").forEach((cb) => {
    cb.addEventListener("change", async () => {
      if (cb.checked) {
        if (!formTagIds.includes(cb.value)) formTagIds.push(cb.value);
      } else {
        formTagIds = formTagIds.filter((id) => id !== cb.value);
      }
      await renderTagChips();
    });
  });
}

async function addNewTagFromForm() {
  const nameInput = document.getElementById("new-tag-name");
  const name = nameInput.value.trim();
  if (!name) { showToast("Enter a tag name"); return; }
  const allTags = await Tags.getAll();
  const dupe = allTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (dupe) {
    if (!formTagIds.includes(dupe.id)) formTagIds.push(dupe.id);
    showToast("Tag already exists — selected it");
  } else {
    const colorsWrap = document.getElementById("new-tag-colors");
    const tag = await Tags.add(name, colorsWrap.dataset.selected);
    formTagIds.push(tag.id);
  }
  nameInput.value = "";
  await renderTagChips();
  await renderTagDropdownList();
}

function wireTagPickerOnce() {
  const toggleBtn = document.getElementById("btn-toggle-tag-dropdown");
  if (toggleBtn.dataset.wired) return;
  toggleBtn.dataset.wired = "1";
  toggleBtn.addEventListener("click", async () => {
    const panel = document.getElementById("tag-dropdown");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      await renderTagDropdownList();
      renderColorSwatches("new-tag-colors", TAG_COLOR_PALETTE[0]);
    }
  });
  document.getElementById("btn-add-new-tag").addEventListener("click", addNewTagFromForm);
}

// ---------------- Add / Edit form ----------------
let formEditingId = null;
let formCategory = "customer";
let formPhones = [];
let formEmails = [];
let formAddresses = [];
let formWebsites = [];
let formCustomFields = [];
let formTagIds = [];
let formPhotoDataUrl = "";

async function openForm(id) {
  formEditingId = id || null;
  formCategory = "customer";
  formPhotoDataUrl = "";
  document.getElementById("form-title").textContent = id ? "Edit contact" : "New contact";

  ["first", "last", "nickname", "company", "jobtitle", "birthday", "notes"].forEach((f) => {
    const el = document.getElementById("f-" + f);
    if (el) el.value = "";
  });
  formPhones = [{ label: "mobile", value: "" }];
  formEmails = [{ label: "other", value: "" }];
  formAddresses = [];
  formWebsites = [];
  formCustomFields = [];
  formTagIds = [];
  updatePhotoPreview();

  if (id) {
    const c = await DB.get(id);
    if (c) {
      document.getElementById("f-first").value = c.firstName || "";
      document.getElementById("f-last").value = c.lastName || "";
      document.getElementById("f-nickname").value = c.nickname || "";
      document.getElementById("f-company").value = c.company || "";
      document.getElementById("f-jobtitle").value = c.jobTitle || "";
      document.getElementById("f-birthday").value = c.birthday || "";
      document.getElementById("f-notes").value = c.notes || "";
      formPhones = (c.phones || []).map((p) => ({ ...p }));
      formEmails = (c.emails || []).map((e) => ({ ...e }));
      formAddresses = (c.addresses || []).map((a) => ({ ...a }));
      formWebsites = (c.websites || []).map((w) => ({ ...w }));
      formCustomFields = (c.customFields || []).map((f) => ({ ...f }));
      formTagIds = (c.tags || []).slice();
      formPhotoDataUrl = c.photoDataUrl || "";
      formCategory = c.category || "customer";
    }
  }
  if (formPhones.length === 0) formPhones = [{ label: "mobile", value: "" }];
  if (formEmails.length === 0) formEmails = [{ label: "other", value: "" }];

  setFormCategory(formCategory);
  renderMultiFieldEditor("f-phones", formPhones, "phones");
  renderMultiFieldEditor("f-emails", formEmails, "emails");
  renderMultiFieldEditor("f-addresses", formAddresses, "addresses");
  renderMultiFieldEditor("f-websites", formWebsites, "websites");
  renderCustomFieldsEditor("f-customfields", formCustomFields);
  document.getElementById("tag-dropdown").hidden = true;
  await renderTagChips();
  wireTagPickerOnce();
  updatePhotoPreview();
  await applyFieldVisibilityToForm();
  showScreen("screen-form");
}

function updatePhotoPreview() {
  const el = document.getElementById("photo-preview");
  if (formPhotoDataUrl) {
    el.innerHTML = `<img src="${formPhotoDataUrl}" />`;
  } else {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/></svg>`;
  }
}

async function applyFieldVisibilityToForm() {
  const settings = await Settings.get();
  const config = settings.contactFieldConfig || DEFAULT_CONTACT_FIELD_CONFIG;
  const container = document.getElementById("dynamic-field-groups");
  config.forEach((f) => {
    const el = container.querySelector(`[data-field="${f.key}"]`);
    if (el) {
      el.hidden = !f.visible;
      container.appendChild(el); // re-append in config order
    }
  });
}

function setFormCategory(cat) {
  formCategory = cat;
  document.querySelectorAll("#form-category button").forEach((b) =>
    b.classList.toggle("active", b.dataset.cat === cat)
  );
}

async function saveForm() {
  const payload = {
    firstName: document.getElementById("f-first").value.trim(),
    lastName: document.getElementById("f-last").value.trim(),
    nickname: document.getElementById("f-nickname").value.trim(),
    company: document.getElementById("f-company").value.trim(),
    jobTitle: document.getElementById("f-jobtitle").value.trim(),
    birthday: document.getElementById("f-birthday").value,
    phones: readMultiFieldEditor("f-phones", false),
    emails: readMultiFieldEditor("f-emails", false),
    addresses: readMultiFieldEditor("f-addresses", true),
    websites: readMultiFieldEditor("f-websites", false),
    customFields: readCustomFieldsEditor("f-customfields"),
    photoDataUrl: formPhotoDataUrl,
    tags: formTagIds.slice(),
    notes: document.getElementById("f-notes").value,
    category: formCategory,
  };
  if (!payload.firstName && !payload.lastName && !payload.company) {
    showToast("Add at least a name or company");
    return;
  }
  if (formEditingId) {
    await DB.update(formEditingId, payload);
    showToast("Contact updated");
  } else {
    await DB.add(payload);
    showToast("Contact added");
  }
  await Contacts.refresh();
  closeAllScreens();
}

async function deleteCurrentContact() {
  if (!Contacts.currentId) return;
  if (!confirm("Delete this contact? This can't be undone.")) return;
  await DB.remove(Contacts.currentId);
  showToast("Contact deleted");
  await Contacts.refresh();
  closeAllScreens();
}
