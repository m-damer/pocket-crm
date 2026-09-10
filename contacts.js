const CAT_META = {
  customer: { color: "#0068B3" },
  lead: { color: "#C97C1F" },
  lost: { color: "#8A93A3" },
};
function catLabel(cat) {
  const keys = { customer: "cat_customer", lead: "cat_lead", lost: "cat_lost" };
  return keys[cat] ? t(keys[cat]) : cat;
}
function phoneEmailLabel(labelKey) {
  const keys = { mobile: "label_mobile", home: "label_home", work: "label_work", other: "label_other" };
  return keys[labelKey] ? t(keys[labelKey]) : t("generic_phone");
}
function websiteLabelText(labelKey) {
  const keys = { personal: "website_personal", work: "website_work", portfolio: "website_portfolio", other: "website_other" };
  return keys[labelKey] ? t(keys[labelKey]) : t("website_other");
}
function phoneEmailLabelPairs() {
  return [["mobile", t("label_mobile")], ["home", t("label_home")], ["work", t("label_work")], ["other", t("label_other")]];
}
function websiteLabelPairs() {
  return [["personal", t("website_personal")], ["work", t("website_work")], ["portfolio", t("website_portfolio")], ["other", t("website_other")]];
}
function fieldGroupLabel(key) {
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

function initials(c) {
  const a = (c.firstName || "").trim()[0] || "";
  const b = (c.lastName || "").trim()[0] || "";
  return (a + b).toUpperCase() || "?";
}

function fullName(c) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || t("unnamed_contact");
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
  return d.toLocaleDateString(I18N.localeTag(), { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString(I18N.localeTag(), { hour: "2-digit", minute: "2-digit" });
}

// All-numeric date format for the Activity sections specifically, e.g.
// "31/12/2026 - 10:15 AM" — day/month/year with no locale-dependent month
// names, since a running activity log reads better scanned as fixed-width
// numbers than in prose form.
function fmtDateNumeric(iso) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${day}/${month}/${year} - ${hours}:${minutes} ${ampm}`;
}

function fmtBirthday(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(I18N.localeTag(), { day: "numeric", month: "long", year: "numeric" });
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
  selectMode: false,
  selectedIds: new Set(),

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
          <h3>${this.all.length === 0 ? t("empty_no_contacts") : t("empty_no_matches")}</h3>
          <p>${this.all.length === 0 ? t("empty_no_contacts_hint") : t("empty_no_matches_hint")}</p>
        </div>`;
      return;
    }
    listEl.innerHTML = items.map((c) => `
      <div class="contact-row ${this.selectMode ? "select-mode" : ""}" data-id="${c.id}">
        ${this.selectMode ? `<span class="select-check ${this.selectedIds.has(c.id) ? "checked" : ""}"></span>` : ""}
        ${c.photoDataUrl
          ? `<img class="avatar" src="${c.photoDataUrl}" style="object-fit:cover" />`
          : `<div class="avatar" style="background:${CAT_META[c.category].color}">${initials(c)}</div>`}
        <div class="contact-info">
          <p class="contact-name">${escapeHTML(fullName(c))}</p>
          <p class="contact-sub">${escapeHTML(c.company || primaryPhone(c) || primaryEmail(c) || "")}</p>
        </div>
        ${this.selectMode ? "" : `<span class="badge ${c.category}">${catLabel(c.category)}</span>`}
      </div>
    `).join("");
    listEl.querySelectorAll(".contact-row").forEach((row) => {
      row.addEventListener("click", () => {
        if (this.selectMode) this.toggleSelect(row.dataset.id);
        else openDetail(row.dataset.id);
      });
    });
  },

  toggleSelect(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    this.renderList();
    updateSelectBar();
  },

  enterSelectMode() {
    this.selectMode = true;
    this.selectedIds = new Set();
    this.renderList();
    updateSelectBar();
  },

  exitSelectMode() {
    this.selectMode = false;
    this.selectedIds = new Set();
    this.renderList();
    updateSelectBar();
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
      <p class="label" style="margin:6px 6px 6px">${t("label_upcoming")}</p>
      ${events.map((e) => `
        <div class="field-row">
          <p class="value">${escapeHTML(e.title || t("untitled_event"))}</p>
          <p class="label" style="margin-top:3px">${new Date(e.when).toLocaleDateString(I18N.localeTag(), { day: "numeric", month: "short" })} · ${new Date(e.when).toLocaleTimeString(I18N.localeTag(), { hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      `).join("")}
    </div>
  `;
}

// ---------------- Info tab field groups (order/visibility driven by Settings) ----------------
function renderFieldGroupHTML(key, c) {
  switch (key) {
    case "nickname":
      return c.nickname ? `<div class="field-row"><p class="label">${t("field_nickname")}</p><p class="value">${escapeHTML(c.nickname)}</p></div>` : "";
    case "companyJobTitle":
      // Company is shown in the hero now, right under the name — only Job
      // title still belongs in the field list, to avoid showing company twice.
      if (!c.jobTitle) return "";
      return `<div class="field-row"><p class="label">${t("field_job_title")}</p><p class="value">${escapeHTML(c.jobTitle)}</p></div>`;
    case "phones":
      return (c.phones || []).map((p) => `
        <div class="field-row"><p class="label">${phoneEmailLabel(p.label)}</p><p class="value">${escapeHTML(p.value)}</p></div>
      `).join("");
    case "emails":
      return (c.emails || []).map((e) => `
        <div class="field-row"><p class="label">${phoneEmailLabel(e.label)}</p><p class="value">${escapeHTML(e.value)}</p></div>
      `).join("");
    case "addresses":
      return (c.addresses || []).map((a) => `
        <div class="field-row">
          <p class="label">${phoneEmailLabel(a.label)}</p>
          <p class="value">${escapeHTML(a.value)}</p>
          ${a.mapsLink ? `<a href="${escapeHTML(a.mapsLink)}" target="_blank" rel="noopener" style="font-size:12px;color:var(--blue);font-weight:600">${t("open_map_link")}</a>` : ""}
        </div>
      `).join("");
    case "websites":
      return (c.websites || []).map((w) => `
        <div class="field-row"><p class="label">${websiteLabelText(w.label)}</p><p class="value"><a href="${/^https?:\/\//.test(w.value) ? w.value : "https://" + w.value}" target="_blank" rel="noopener" style="color:var(--blue)">${escapeHTML(w.value)}</a></p></div>
      `).join("");
    case "birthday":
      return c.birthday ? `<div class="field-row"><p class="label">${t("field_birthday")}</p><p class="value">${fmtBirthday(c.birthday)}</p></div>` : "";
    case "customFields":
      return (c.customFields || []).filter((f) => f.value).map((f) => `
        <div class="field-row"><p class="label">${escapeHTML(f.label || t("field_custom_fallback"))}</p><p class="value">${escapeHTML(f.value)}</p></div>
      `).join("");
    default:
      return "";
  }
}

async function renderInfoTab(c) {
  const settings = await Settings.get();
  const config = settings.contactFieldConfig || DEFAULT_CONTACT_FIELD_CONFIG;
  // Nickname and Company/Job title are now always shown in the hero, so the
  // "Details" section below skips them to avoid showing the same thing twice.
  const groupsHTML = config
    .filter((f) => f.visible && f.key !== "nickname" && f.key !== "companyJobTitle")
    .map((f) => renderFieldGroupHTML(f.key, c))
    .join("");

  return `
    ${await renderLinkedEvents(c.id)}
    <div class="field-list">
      <p class="section-title">${t("label_details")}</p>
      ${groupsHTML}
      <div class="field-row"><p class="label">${t("label_added")}</p><p class="value">${fmtDate(c.createdAt)}</p></div>
      <div class="field-row"><p class="label">${t("label_modified")}</p><p class="value">${fmtDate(c.updatedAt)}</p></div>
    </div>
  `;
}

// ---------------- Detail screen ----------------
let detailTab = "info";

async function openDetail(id, tab) {
  Contacts.currentId = id;
  detailTab = tab || "info";
  await renderDetail();
  showScreen("screen-detail");
}

async function renderDetail() {
  const c = await DB.get(Contacts.currentId);
  if (!c) return;

  const addr = primaryAddress(c);
  const allTags = await Tags.getAll();
  const tagsHTML = c.tags && c.tags.length
    ? `<div class="tag-row hero-tags">${c.tags.map((tid) => {
        const t2 = allTags.find((x) => x.id === tid);
        return t2 ? `<span class="tag" style="background:${t2.color};color:#fff">${escapeHTML(t2.name)}</span>` : "";
      }).join("")}</div>`
    : "";

  document.getElementById("detail-hero").innerHTML = `
    <div class="hero-top">
      ${c.photoDataUrl
        ? `<img class="avatar" src="${c.photoDataUrl}" style="object-fit:cover;width:56px;height:56px" />`
        : `<div class="avatar" style="background:${CAT_META[c.category].color}">${initials(c)}</div>`}
      <div class="hero-name-block">
        <div class="hero-name-row">
          <h2>${escapeHTML(fullName(c))}</h2>
          <span class="badge hero-badge ${c.category}">${catLabel(c.category)}</span>
        </div>
        ${c.nickname ? `<p class="hero-nickname">"${escapeHTML(c.nickname)}"</p>` : ""}
        ${c.jobTitle || c.company ? `<p>${escapeHTML([c.jobTitle, c.company].filter(Boolean).join(" · "))}</p>` : ""}
        ${tagsHTML}
      </div>
    </div>
    ${addr ? `
      <div class="hero-address-row">
        ${addr.mapsLink ? `
          <a class="hero-directions-btn" target="_blank" rel="noopener" href="${escapeHTML(addr.mapsLink)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
            ${t("qa_directions")}
          </a>
        ` : ""}
        <span class="hero-address-text">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
          ${escapeHTML(addr.value)}
        </span>
      </div>
    ` : ""}
  `;

  const phone = primaryPhone(c), email = primaryEmail(c);
  document.getElementById("detail-qa").innerHTML = `
    <a class="qa-btn ${phone ? "" : "disabled"}" href="${phone ? "tel:" + phone : "#"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></svg>
      ${t("qa_call")}
    </a>
    <a class="qa-btn ${phone ? "" : "disabled"}" target="_blank" rel="noopener" href="${phone ? waLink(phone) : "#"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 01-12.3 7.6L3 20l1-5.5A8.5 8.5 0 1121 11.5z"/><path d="M8.5 10.5c.3 2 2.7 4.3 4.7 4.6.8.1 1.6-.4 1.8-1.2"/></svg>
      ${t("qa_whatsapp")}
    </a>
    <a class="qa-btn ${email ? "" : "disabled"}" href="${email ? "mailto:" + email : "#"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>
      ${t("qa_email")}
    </a>
  `;

  document.getElementById("detail-tab-info").innerHTML = await renderInfoTab(c);

  renderActivityTab(c);

  await renderNotesTab(c.id);

  if (pipelineEnabled) await renderDealsTab(c.id);

  setDetailTab(detailTab);
  await renderDocsTab(c.id);
}

// ---------------- Activity cards (rich: note/call content inline, expandable) ----------------
const ACTIVITY_PREVIEW_LIMIT = 160;

function saveAudioPosition(key, time) {
  try { localStorage.setItem("audio-pos-" + key, String(time)); } catch (e) { /* storage unavailable — resume just won't work */ }
}
function loadAudioPosition(key) {
  try { return parseFloat(localStorage.getItem("audio-pos-" + key) || "0") || 0; } catch (e) { return 0; }
}

// Wires an <audio> element to remember and restore its playback position,
// keyed by the activity entry's own id, so re-opening the app (or just
// scrolling away and back) resumes a long voice note where you left off.
function wireAudioResume(audioEl, key) {
  audioEl.addEventListener("loadedmetadata", () => {
    const saved = loadAudioPosition(key);
    if (saved > 0 && saved < audioEl.duration - 1) audioEl.currentTime = saved;
  });
  let lastSaved = 0;
  audioEl.addEventListener("timeupdate", () => {
    if (Math.abs(audioEl.currentTime - lastSaved) < 2) return; // throttle writes to ~every 2s
    lastSaved = audioEl.currentTime;
    saveAudioPosition(key, audioEl.currentTime);
  });
  audioEl.addEventListener("pause", () => saveAudioPosition(key, audioEl.currentTime));
  audioEl.addEventListener("ended", () => saveAudioPosition(key, 0));
}

// Derives the small top-right type badge and the top-left title for an
// activity entry. Note/call entries use the note's own title (or a kind
// fallback); system entries (contact created, category changed) have no
// separate "title" concept, so the generated description text doubles as
// the title, with a generic badge alongside it.
function activityTypeBadge(a) {
  if (a.noteKind === "call") return a.callMedia === "voice" ? t("activity_type_call_voice") : t("activity_type_call_text");
  if (a.noteKind === "note") return t("activity_type_note");
  if (a.type === "category_changed" || a.type === "contacts_merged") return t("activity_type_update");
  return t("activity_type_contact");
}
function activityCardTitle(a) {
  if (a.noteKind) return a.noteTitle || (a.noteKind === "call" ? t("note_title_fallback_call") : t("note_title_fallback_note"));
  return a.text || "";
}

function renderActivityCardHTML(a, opts) {
  opts = opts || {};
  const isVoice = a.noteKind === "call" && a.callMedia === "voice" && a.audioDataUrl;
  const fullText = a.noteText || "";
  const isLong = fullText.length > ACTIVITY_PREVIEW_LIMIT;
  const previewText = isLong ? fullText.slice(0, ACTIVITY_PREVIEW_LIMIT).trim() + "\u2026" : fullText;

  return `
    <div class="activity-item" data-activity-id="${a.id}">
      ${opts.contactName ? `<p class="activity-contact-name">${escapeHTML(opts.contactName)}</p>` : ""}
      <div class="activity-card-top">
        <p class="activity-card-title">${escapeHTML(activityCardTitle(a))}</p>
        <span class="activity-type-badge">${activityTypeBadge(a)}</span>
      </div>
      ${isVoice ? `<audio class="activity-audio" controls preload="metadata" data-audio-key="${a.id}" src="${a.audioDataUrl}"></audio>` : ""}
      ${fullText ? `<p class="activity-note-preview">${escapeHTML(previewText)}</p>` : ""}
      ${isLong ? `<button type="button" class="activity-expand-btn" data-expand-id="${a.id}">${t("btn_read_more")}</button>` : ""}
      <p class="when">${fmtDateNumeric(a.date)}</p>
    </div>
  `;
}

// Wires the "read more" buttons and audio players inside a just-rendered
// batch of activity cards. `lookup(id)` returns the full activity entry for
// a given id (source differs between the per-contact tab and global feed).
function wireActivityCards(container, lookup) {
  container.querySelectorAll(".activity-expand-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = lookup(btn.dataset.expandId);
      if (!a) return;
      openNoteSheet({
        title: a.noteTitle || (a.noteKind === "call" ? t("note_title_fallback_call") : t("note_title_fallback_note")),
        date: fmtDateNumeric(a.date),
        text: a.noteText || "",
        audioDataUrl: a.noteKind === "call" && a.callMedia === "voice" ? a.audioDataUrl : "",
        audioKey: a.id,
      });
    });
  });
  container.querySelectorAll(".activity-audio").forEach((audioEl) => {
    wireAudioResume(audioEl, audioEl.dataset.audioKey);
  });
}

function renderActivityTab(c) {
  const activities = c.activities || [];
  const wrap = document.getElementById("detail-tab-activity");
  wrap.innerHTML = `
    <div class="field-list">
      ${activities.length === 0
        ? `<div class="empty-state" style="padding:32px 16px"><p>${t("empty_no_activity")}</p></div>`
        : activities.map((a) => renderActivityCardHTML(a)).join("")}
    </div>
  `;
  wireActivityCards(wrap, (id) => activities.find((a) => a.id === id));
}

// ---------------- Bottom sheet: expanded note / call-note view ----------------
let noteSheetHideTimer = null;

// Generic bottom-sheet opener — both the "expand a long note" view and the
// "Add Activity" action menu reuse this one sheet element, just with
// different body content (and the date line hidden when not applicable).
function openSheet({ title, date, bodyHTML }) {
  document.getElementById("note-sheet-title").textContent = title || "";
  const dateEl = document.getElementById("note-sheet-date");
  if (date) {
    dateEl.textContent = date;
    dateEl.style.display = "";
  } else {
    dateEl.textContent = "";
    dateEl.style.display = "none";
  }
  document.getElementById("note-sheet-body").innerHTML = bodyHTML;

  const backdrop = document.getElementById("note-sheet-backdrop");
  const sheet = document.getElementById("note-sheet");
  clearTimeout(noteSheetHideTimer);
  backdrop.hidden = false;
  sheet.hidden = false;
  requestAnimationFrame(() => {
    backdrop.classList.add("show");
    sheet.classList.add("show");
  });
}

function openNoteSheet({ title, date, text, audioDataUrl, audioKey }) {
  openSheet({
    title,
    date,
    bodyHTML: `
      ${text ? `<p style="margin:0 0 ${audioDataUrl ? "14px" : "0"}">${escapeHTML(text)}</p>` : ""}
      ${audioDataUrl ? `<audio controls preload="metadata" data-audio-key="${audioKey}-sheet" src="${audioDataUrl}"></audio>` : ""}
    `,
  });
  if (audioDataUrl) wireAudioResume(document.querySelector("#note-sheet-body audio"), audioKey + "-sheet");
}

function closeNoteSheet() {
  const backdrop = document.getElementById("note-sheet-backdrop");
  const sheet = document.getElementById("note-sheet");
  backdrop.classList.remove("show");
  sheet.classList.remove("show");
  clearTimeout(noteSheetHideTimer);
  noteSheetHideTimer = setTimeout(() => {
    backdrop.hidden = true;
    sheet.hidden = true;
  }, 250);
}

// ---------------- "Add Activity" quick-action menu ----------------
function openAddContactMenu() {
  const icons = {
    manual: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/><path d="M9 7l3 3 3-3"/><path d="M12 4v6"/></svg>',
  };
  const rows = [activityMenuRowHTML(icons.manual, t("menu_add_contact_manual"), "manual")];
  if (contactPickerSupported()) rows.push(activityMenuRowHTML(icons.phone, t("menu_add_contact_phone"), "phone"));
  openSheet({
    title: t("menu_add_contact_title"),
    date: "",
    bodyHTML: `<div class="activity-menu-list">${rows.join("")}</div>`,
  });
  document.querySelectorAll(".activity-menu-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeNoteSheet();
      const action = btn.dataset.action;
      if (action === "manual") openForm(null);
      else if (action === "phone") importFromPhoneContacts();
    });
  });
}

function activityMenuRowHTML(icon, label, action) {
  return `
    <button type="button" class="activity-menu-row" data-action="${action}">
      <span class="activity-menu-icon">${icon}</span>
      <span>${label}</span>
    </button>
  `;
}

function openActivityMenu(contactId) {
  const icons = {
    task: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
    meeting: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/><circle cx="12" cy="15" r="2.4"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/></svg>',
    voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0014 0"/><path d="M12 19v3"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
    deal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="18" rx="1.5"/><rect x="9.5" y="3" width="5" height="11" rx="1.5"/><rect x="16" y="3" width="5" height="7" rx="1.5"/></svg>',
  };
  const rows = [
    activityMenuRowHTML(icons.task, t("menu_add_task"), "task"),
    activityMenuRowHTML(icons.meeting, t("menu_add_meeting"), "meeting"),
    activityMenuRowHTML(icons.note, t("menu_add_note"), "note"),
    activityMenuRowHTML(icons.voice, t("menu_add_voice_note"), "voice"),
    activityMenuRowHTML(icons.doc, t("menu_add_document"), "doc"),
  ];
  if (pipelineEnabled) rows.push(activityMenuRowHTML(icons.deal, t("menu_add_deal"), "deal"));
  openSheet({
    title: t("btn_add_activity"),
    date: "",
    bodyHTML: `<div class="activity-menu-list">${rows.join("")}</div>`,
  });
  document.querySelectorAll(".activity-menu-row").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeNoteSheet();
      const action = btn.dataset.action;
      if (action === "task") openEventForm(null, { contactId, type: "task" });
      else if (action === "meeting") openEventForm(null, { contactId, type: "meeting" });
      else if (action === "note") openNoteForm(contactId, null);
      else if (action === "voice") openNoteForm(contactId, null, { kind: "call", callMedia: "voice" });
      else if (action === "deal") openDealForm(null, { contactId });
      else if (action === "doc") {
        setDetailTab("docs");
        setTimeout(() => {
          const input = document.getElementById("doc-file-input");
          if (input) input.click();
        }, 350); // let the screen's own close/settle finish first
      }
    });
  });
}

// ---------------- Global activity feed (across every contact) ----------------
// Reads fresh from the database rather than the Contacts.all cache — note/
// call actions don't currently trigger a Contacts.refresh() (nothing else
// needed them to), so relying on the cache here would show stale activity
// right after adding a note until something unrelated happened to refresh it.
async function allActivitiesFlat() {
  const all = await DB.getAll();
  const out = [];
  all.forEach((c) => {
    (c.activities || []).forEach((a) => {
      out.push({ ...a, contactId: c.id, contactName: fullName(c) });
    });
  });
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

// ---------------- Follow-up nudges ----------------
// A contact "needs follow-up" once nothing has been logged against it (a
// note, a call, a category change — anything in its own activity timeline)
// for longer than the configured threshold. Lost contacts are excluded —
// there's nothing left to follow up on once that's closed out.
function lastActivityDate(c) {
  return (c.activities && c.activities[0] && c.activities[0].date) || c.createdAt;
}

function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

async function findFollowUpContacts() {
  const settings = await Settings.get();
  if (!settings.followUpEnabled) return [];
  const threshold = settings.followUpDays || 14;
  const all = await DB.getAll();
  return all
    .filter((c) => c.category !== "lost")
    .map((c) => ({ contact: c, days: daysSince(lastActivityDate(c)) }))
    .filter((x) => x.days >= threshold)
    .sort((a, b) => b.days - a.days); // most overdue first
}

function renderFollowUpRowHTML(c, days) {
  return `
    <div class="contact-row" data-id="${c.id}" style="margin-bottom:8px">
      ${c.photoDataUrl
        ? `<img class="avatar" src="${c.photoDataUrl}" style="object-fit:cover" />`
        : `<div class="avatar" style="background:${CAT_META[c.category].color}">${initials(c)}</div>`}
      <div class="contact-info">
        <p class="contact-name">${escapeHTML(fullName(c))}</p>
        <p class="contact-sub">${I18N.plural(days, "followup_day_ago", "followup_days_ago")}</p>
      </div>
      <span class="badge ${c.category}">${catLabel(c.category)}</span>
    </div>
  `;
}

async function renderFollowUpSection() {
  const wrap = document.getElementById("followup-nudges-section");
  if (!wrap) return;
  const due = await findFollowUpContacts();
  if (due.length === 0) {
    wrap.innerHTML = "";
    return;
  }
  wrap.innerHTML = `
    <p class="section-title" style="margin:14px 16px 6px">${t("followup_section_title", {
      count: I18N.plural(due.length, "contact_count", "contact_count_plural"),
    })}</p>
    <div style="padding:0 16px">
      ${due.map((x) => renderFollowUpRowHTML(x.contact, x.days)).join("")}
    </div>
  `;
  wrap.querySelectorAll(".contact-row").forEach((row) => {
    row.addEventListener("click", () => openDetail(row.dataset.id));
  });
}

async function renderGlobalActivityFeed() {
  const wrap = document.getElementById("global-activity-list");
  const all = await allActivitiesFlat();
  if (all.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
        <h3>${t("empty_no_global_activity")}</h3>
        <p>${t("empty_no_global_activity_hint")}</p>
      </div>`;
    return;
  }
  wrap.innerHTML = all.map((a) => renderActivityCardHTML(a, { contactName: a.contactName })).join("");
  wireActivityCards(wrap, (id) => all.find((a) => a.id === id));
  wrap.querySelectorAll(".activity-item").forEach((card, idx) => {
    card.style.cursor = "pointer";
    card.addEventListener("click", (ev) => {
      if (ev.target.closest(".activity-audio") || ev.target.closest(".activity-expand-btn")) return;
      openDetail(all[idx].contactId, "activity");
    });
  });
}

async function renderDocsTab(contactId) {
  const docs = await Documents.forContact(contactId);
  const wrap = document.getElementById("detail-tab-docs");
  wrap.innerHTML = `
    <div class="field-list">
      <label class="btn-add-item" style="display:block;text-align:center;margin-bottom:10px;cursor:pointer">
        ${t("btn_attach_file")}
        <input type="file" id="doc-file-input" style="display:none" />
      </label>
      ${docs.length === 0
        ? `<div class="empty-state" style="padding:24px 16px"><p>${t("empty_no_docs")}</p></div>`
        : docs.map((d) => `
          <div class="doc-row" data-id="${d.id}">
            <div class="doc-icon">${(d.name.split(".").pop() || "?").slice(0, 4).toUpperCase()}</div>
            <div class="contact-info">
              <p class="contact-name">${escapeHTML(d.name)}</p>
              <p class="contact-sub">${(d.size / 1024).toFixed(0)} KB · ${fmtDate(d.createdAt)}</p>
            </div>
            <a class="icon-btn doc-download" style="color:var(--navy)" href="${d.dataUrl}" download="${escapeHTML(d.name)}" title="${t("doc_download_title")}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
            </a>
            <button class="icon-btn doc-remove" style="color:#B3261E" data-remove="${d.id}" title="${t("doc_remove_title")}">
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
      showToast(t("toast_file_too_large"));
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      await Documents.add({ contactId, name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
      showToast(t("toast_file_attached"));
      await renderDocsTab(contactId);
    };
    reader.readAsDataURL(file);
  });

  wrap.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(t("confirm_remove_file"))) return;
      await Documents.remove(btn.dataset.remove);
      await renderDocsTab(contactId);
    });
  });
}

// ---------------- Notes tab (multiple notes + call notes, per contact) ----------------
function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function renderNoteCardHTML(n) {
  const isCall = n.kind === "call";
  const kindLabel = isCall ? (n.callMedia === "voice" ? t("note_kind_call_voice") : t("note_kind_call_text")) : t("note_kind_note");
  const preview = isCall && n.callMedia === "voice"
    ? `<p class="value" style="color:var(--text-muted)">🎙 ${fmtDuration(n.audioDurationSec)} ${t("note_recording_suffix")}</p>`
    : (n.text ? `<p class="value" style="white-space:pre-wrap">${escapeHTML(n.text.length > 160 ? n.text.slice(0, 160) + "…" : n.text)}</p>` : "");
  return `
    <div class="field-row note-card" data-id="${n.id}">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <p class="label" style="margin:0">${escapeHTML(n.title || (isCall ? t("note_title_fallback_call") : t("note_title_fallback_note")))}</p>
        <span class="note-kind-badge">${kindLabel}</span>
      </div>
      ${preview}
      <p class="label" style="margin-top:6px">${fmtDate(n.updatedAt)}${n.updatedAt !== n.createdAt ? t("note_edited_suffix") : ""}</p>
    </div>
  `;
}

async function renderNotesTab(contactId) {
  const c = await DB.get(contactId);
  const notes = (c && c.notesList) || [];
  const wrap = document.getElementById("detail-tab-notes");
  wrap.innerHTML = `
    <div style="padding:4px 16px 0">
      <button type="button" class="btn-secondary" id="btn-add-note" style="padding:9px 16px;width:100%">${t("btn_add_note")}</button>
    </div>
    <div class="field-list" style="margin-top:10px">
      ${notes.length === 0
        ? `<div class="empty-state" style="padding:24px 16px"><p>${t("empty_no_notes")}</p></div>`
        : notes.map((n) => renderNoteCardHTML(n)).join("")}
    </div>
  `;
  document.getElementById("btn-add-note").addEventListener("click", () => openNoteForm(contactId, null));
  wrap.querySelectorAll(".note-card").forEach((card) => {
    card.addEventListener("click", () => openNoteDetail(contactId, card.dataset.id));
  });
}

// ---------------- Note detail (read-only view, opened by tapping a note card) ----------------
// Mirrors the Schedule event pattern: tapping the card opens this read-only
// screen first, with Edit and Delete icons in the header, rather than
// jumping straight into the editable form.
let noteDetailContactId = null;
let noteDetailId = null;

function renderNoteDetailContent(n) {
  const isCall = n.kind === "call";
  const kindLabel = isCall ? (n.callMedia === "voice" ? t("note_kind_call_voice") : t("note_kind_call_text")) : t("note_kind_note");
  const isVoice = isCall && n.callMedia === "voice";
  return `
    <div class="field-list">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
        <p class="section-title" style="margin:0">${escapeHTML(n.title || (isCall ? t("note_title_fallback_call") : t("note_title_fallback_note")))}</p>
        <span class="note-kind-badge">${kindLabel}</span>
      </div>
      <p class="label" style="margin-top:6px">${fmtDate(n.updatedAt)}${n.updatedAt !== n.createdAt ? t("note_edited_suffix") : ""}</p>
      ${isVoice
        ? `<audio controls preload="metadata" data-audio-key="${n.id}-detail" src="${n.audioDataUrl}" style="width:100%;margin-top:14px"></audio>`
        : (n.text ? `<p class="value" style="white-space:pre-wrap;margin-top:14px">${escapeHTML(n.text)}</p>` : "")}
    </div>
  `;
}

async function openNoteDetail(contactId, noteId) {
  const c = await DB.get(contactId);
  const note = c && (c.notesList || []).find((n) => n.id === noteId);
  if (!note) return;
  noteDetailContactId = contactId;
  noteDetailId = noteId;
  document.getElementById("note-detail-content").innerHTML = renderNoteDetailContent(note);
  if (note.kind === "call" && note.callMedia === "voice") {
    wireAudioResume(document.querySelector("#note-detail-content audio"), note.id + "-detail");
  }
  showScreen("screen-note-detail");
}

async function deleteNoteFromDetail() {
  if (!noteDetailContactId || !noteDetailId) return;
  if (!confirm(t("confirm_delete_note"))) return;
  await ContactNotes.remove(noteDetailContactId, noteDetailId);
  showToast(t("toast_note_deleted"));
  closeScreen("screen-note-detail");
  await renderDetail();
}

// ---------------- Note editor (add/edit a note or call note) ----------------
const MAX_CALL_NOTE_SECONDS = 7200; // 2 hours
let noteFormContactId = null;
let noteFormEditingId = null;
let noteFormKind = "note"; // note | call
let noteFormCallMedia = "text"; // text | voice
let noteFormAudioDataUrl = "";
let noteFormAudioDurationSec = 0;
let recorderStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordTimerInterval = null;
let recordStartTime = 0;

async function openNoteForm(contactId, noteId, presets) {
  releaseRecordingResources();
  noteFormContactId = contactId;
  noteFormEditingId = noteId || null;
  noteFormKind = (presets && presets.kind) || "note";
  noteFormCallMedia = (presets && presets.callMedia) || "text";
  noteFormAudioDataUrl = "";
  noteFormAudioDurationSec = 0;
  document.getElementById("note-title").value = "";
  document.getElementById("note-text").value = "";
  document.getElementById("note-delete-zone").style.display = noteId ? "block" : "none";

  if (noteId) {
    const c = await DB.get(contactId);
    const n = (c.notesList || []).find((x) => x.id === noteId);
    if (n) {
      noteFormKind = n.kind || "note";
      noteFormCallMedia = n.callMedia || "text";
      noteFormAudioDataUrl = n.audioDataUrl || "";
      noteFormAudioDurationSec = n.audioDurationSec || 0;
      document.getElementById("note-title").value = n.title || "";
      document.getElementById("note-text").value = n.text || "";
    }
  }
  document.getElementById("note-form-title").textContent = noteId ? t("note_form_title_edit") : t("note_form_title_new");
  setNoteKind(noteFormKind);
  setNoteCallMedia(noteFormCallMedia);
  showScreen("screen-note-form");
}

function clearRecordedAudio() {
  releaseRecordingResources();
  noteFormAudioDataUrl = "";
  noteFormAudioDurationSec = 0;
}

function setNoteKind(kind) {
  if (kind !== "call") clearRecordedAudio();
  noteFormKind = kind;
  document.querySelectorAll("#note-type-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.noteKind === kind));
  document.getElementById("note-call-media-group").hidden = kind !== "call";
  updateNoteFieldVisibility();
  renderVoiceWidget();
}

function setNoteCallMedia(media) {
  if (media !== "voice") clearRecordedAudio();
  noteFormCallMedia = media;
  document.querySelectorAll("#note-call-media-toggle button").forEach((b) => b.classList.toggle("active", b.dataset.callMedia === media));
  updateNoteFieldVisibility();
  renderVoiceWidget();
}

function updateNoteFieldVisibility() {
  const isVoiceCall = noteFormKind === "call" && noteFormCallMedia === "voice";
  document.getElementById("note-text-group").hidden = isVoiceCall;
  document.getElementById("note-voice-group").hidden = !isVoiceCall;
}

function renderVoiceWidget() {
  const wrap = document.getElementById("note-voice-widget");
  if (!wrap) return;
  if (noteFormAudioDataUrl) {
    wrap.innerHTML = `
      <audio controls src="${noteFormAudioDataUrl}" style="width:100%"></audio>
      <p class="hint-text" style="margin:6px 0 10px">${fmtDuration(noteFormAudioDurationSec)} ${t("note_recording_suffix")}</p>
      <button type="button" class="btn-secondary" id="btn-rerecord" style="padding:9px 16px">${t("btn_rerecord")}</button>
    `;
    document.getElementById("btn-rerecord").addEventListener("click", () => {
      clearRecordedAudio();
      renderVoiceWidget();
    });
  } else {
    wrap.innerHTML = `
      <div class="record-widget">
        <button type="button" class="btn-secondary" id="btn-start-record" style="padding:9px 16px">${t("btn_record")}</button>
        <span class="record-timer" id="record-timer" hidden>0:00</span>
        <button type="button" class="btn-danger" id="btn-stop-record" style="padding:9px 16px;display:none">${t("btn_stop_record")}</button>
      </div>
      <p class="hint-text" style="margin-top:8px">${t("hint_max_length")}</p>
    `;
    document.getElementById("btn-start-record").addEventListener("click", startVoiceRecording);
    document.getElementById("btn-stop-record").addEventListener("click", stopVoiceRecording);
  }
}

async function startVoiceRecording() {
  if (!("MediaRecorder" in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast(t("toast_voice_not_supported"));
    return;
  }
  try {
    recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    showToast(t("toast_mic_denied"));
    return;
  }
  recordedChunks = [];
  try {
    mediaRecorder = new MediaRecorder(recorderStream);
  } catch (e) {
    showToast(t("toast_record_not_supported"));
    return;
  }
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
  mediaRecorder.onstop = onRecordingStopped;
  mediaRecorder.start();
  recordStartTime = Date.now();
  const startBtn = document.getElementById("btn-start-record");
  const stopBtn = document.getElementById("btn-stop-record");
  const timerEl = document.getElementById("record-timer");
  if (startBtn) startBtn.style.display = "none";
  if (stopBtn) stopBtn.style.display = "";
  if (timerEl) timerEl.hidden = false;
  recordTimerInterval = setInterval(() => {
    const elapsed = (Date.now() - recordStartTime) / 1000;
    const timerNode = document.getElementById("record-timer");
    if (timerNode) timerNode.textContent = fmtDuration(elapsed);
    if (elapsed >= MAX_CALL_NOTE_SECONDS) {
      showToast(t("toast_max_length_reached"));
      stopVoiceRecording();
    }
  }, 250);
}

function stopVoiceRecording() {
  clearInterval(recordTimerInterval);
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    try { mediaRecorder.stop(); } catch (e) { /* already stopped */ }
  }
  if (recorderStream) {
    recorderStream.getTracks().forEach((t) => t.stop());
    recorderStream = null;
  }
}

// Cleanup used when leaving the recorder without keeping the take (cancel,
// switching away from voice mode, etc). Detaches onstop first so an
// in-progress recording doesn't get silently saved as a note.
function releaseRecordingResources() {
  clearInterval(recordTimerInterval);
  if (mediaRecorder) {
    mediaRecorder.onstop = null;
    if (mediaRecorder.state !== "inactive") {
      try { mediaRecorder.stop(); } catch (e) { /* already stopped */ }
    }
  }
  if (recorderStream) {
    recorderStream.getTracks().forEach((t) => t.stop());
    recorderStream = null;
  }
  mediaRecorder = null;
}

function onRecordingStopped() {
  const durationSec = Math.min((Date.now() - recordStartTime) / 1000, MAX_CALL_NOTE_SECONDS);
  const blob = new Blob(recordedChunks, { type: (mediaRecorder && mediaRecorder.mimeType) || "audio/webm" });
  const reader = new FileReader();
  reader.onload = () => {
    noteFormAudioDataUrl = reader.result;
    noteFormAudioDurationSec = durationSec;
    renderVoiceWidget();
  };
  reader.readAsDataURL(blob);
}

async function saveNoteForm() {
  const title = document.getElementById("note-title").value.trim();
  const text = document.getElementById("note-text").value;
  const isVoiceCall = noteFormKind === "call" && noteFormCallMedia === "voice";

  if (isVoiceCall && !noteFormAudioDataUrl) {
    showToast(t("toast_record_a_voice_note"));
    return;
  }
  if (!isVoiceCall && !title && !text.trim()) {
    showToast(t("toast_add_title_or_text"));
    return;
  }

  const patch = {
    kind: noteFormKind,
    title,
    text: isVoiceCall ? "" : text,
    callMedia: noteFormKind === "call" ? noteFormCallMedia : "",
    audioDataUrl: isVoiceCall ? noteFormAudioDataUrl : "",
    audioDurationSec: isVoiceCall ? noteFormAudioDurationSec : 0,
  };

  if (noteFormEditingId) {
    await ContactNotes.update(noteFormContactId, noteFormEditingId, patch);
    showToast(t("toast_note_updated"));
  } else {
    await ContactNotes.add(noteFormContactId, patch);
    showToast(noteFormKind === "call" ? t("toast_call_note_added") : t("toast_note_added"));
  }
  closeScreen("screen-note-form");
  // If this edit was opened from the read-only note detail screen, that's
  // still open underneath (screens stack) and would otherwise show stale
  // content — close it too so Save always lands back on the Notes tab.
  closeScreen("screen-note-detail");
  await renderDetail();
  await Contacts.refresh();
}

async function deleteNoteForm() {
  if (!noteFormEditingId) return;
  if (!confirm(t("confirm_delete_note"))) return;
  await ContactNotes.remove(noteFormContactId, noteFormEditingId);
  showToast(t("toast_note_deleted"));
  closeScreen("screen-note-form");
  closeScreen("screen-note-detail");
  await renderDetail();
}

function setDetailTab(tab) {
  detailTab = tab;
  document.querySelectorAll("#screen-detail .tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.dtab === tab)
  );
  ["info", "activity", "notes", "docs", "deals"].forEach((tb) => {
    document.getElementById("detail-tab-" + tb).hidden = tb !== tab;
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
  if (kind === "addresses") return t("ph_address");
  if (kind === "emails") return t("ph_email");
  if (kind === "websites") return t("ph_website");
  return t("ph_phone");
}
function multiFieldAddLabel(kind) {
  if (kind === "addresses") return t("add_address");
  if (kind === "emails") return t("add_email");
  if (kind === "websites") return t("add_website");
  return t("add_phone");
}
function multiFieldDefaultRow(kind) {
  if (kind === "addresses") return { label: "home", value: "", mapsLink: "" };
  if (kind === "websites") return { label: "other", value: "" };
  return { label: "mobile", value: "" };
}

function renderMultiFieldEditor(containerId, items, kind) {
  const wrap = document.getElementById(containerId);
  const isAddress = kind === "addresses";
  const labelPairs = kind === "websites" ? websiteLabelPairs() : phoneEmailLabelPairs();
  wrap.innerHTML = items.map((it, idx) => `
    <div class="item-row multi-field-row" data-idx="${idx}">
      <select class="mf-label">
        ${labelPairs.map(([k, v]) => `<option value="${k}" ${it.label === k ? "selected" : ""}>${v}</option>`).join("")}
      </select>
      <div class="mf-value-col">
        <input type="text" class="mf-value" placeholder="${multiFieldPlaceholder(kind)}" value="${escapeHTML(it.value || "")}" />
        ${isAddress ? `<input type="text" class="mf-maps" placeholder="${t("ph_maps_link")}" value="${escapeHTML(it.mapsLink || "")}" />` : ""}
      </div>
      <button type="button" class="it-remove" title="${t("remove_title")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
      </button>
    </div>
  `).join("") + `<button type="button" class="btn-add-item" data-add="${containerId}">${multiFieldAddLabel(kind)}</button>`;

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
        <input type="text" class="mf-value cf-label" placeholder="${t("ph_custom_field_name")}" value="${escapeHTML(it.label || "")}" />
        <input type="text" class="mf-value cf-value" placeholder="${t("ph_custom_field_value")}" value="${escapeHTML(it.value || "")}" />
      </div>
      <button type="button" class="it-remove" title="${t("remove_title")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
      </button>
    </div>
  `).join("") + `<button type="button" class="btn-add-item" data-add="${containerId}">${t("add_custom_field")}</button>`;

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
    wrap.innerHTML = `<p class="hint-text" style="margin:0 0 8px">${t("empty_no_tags_short")}</p>`;
    return;
  }
  wrap.innerHTML = formTagIds.map((id) => {
    const tg = allTags.find((x) => x.id === id);
    if (!tg) return "";
    return `
      <span class="tag-chip" style="background:${tg.color}">
        ${escapeHTML(tg.name)}
        <button type="button" class="tag-chip-remove" data-id="${tg.id}" title="${t("remove_title")}">&times;</button>
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
    wrap.innerHTML = `<p class="hint-text" style="margin:2px 0 0">${t("no_tags_dropdown")}</p>`;
    return;
  }
  wrap.innerHTML = allTags.map((tg) => `
    <label class="tag-dropdown-row">
      <input type="checkbox" class="tag-check" value="${tg.id}" ${formTagIds.includes(tg.id) ? "checked" : ""} />
      <span class="tag-dot" style="background:${tg.color}"></span>
      <span>${escapeHTML(tg.name)}</span>
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
  if (!name) { showToast(t("toast_enter_tag_name")); return; }
  const allTags = await Tags.getAll();
  const dupe = allTags.find((tg) => tg.name.toLowerCase() === name.toLowerCase());
  if (dupe) {
    if (!formTagIds.includes(dupe.id)) formTagIds.push(dupe.id);
    showToast(t("toast_tag_exists_selected"));
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

// ---------------- Bulk edit: add tag to selected contacts ----------------
// Mirrors the contact form's tag picker above, but applies to every
// currently-selected contact instead of one in-progress form.
let bulkTagSelected = [];

async function renderBulkTagList() {
  const allTags = await Tags.getAll();
  const wrap = document.getElementById("bulk-tag-list");
  if (allTags.length === 0) {
    wrap.innerHTML = `<p class="hint-text" style="margin:2px 0 0">${t("no_tags_dropdown")}</p>`;
    return;
  }
  wrap.innerHTML = allTags.map((tg) => `
    <label class="tag-dropdown-row">
      <input type="checkbox" class="bulk-tag-check" value="${tg.id}" ${bulkTagSelected.includes(tg.id) ? "checked" : ""} />
      <span class="tag-dot" style="background:${tg.color}"></span>
      <span>${escapeHTML(tg.name)}</span>
    </label>
  `).join("");
  wrap.querySelectorAll(".bulk-tag-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!bulkTagSelected.includes(cb.value)) bulkTagSelected.push(cb.value);
      } else {
        bulkTagSelected = bulkTagSelected.filter((id) => id !== cb.value);
      }
    });
  });
}

async function addNewTagFromBulkPicker() {
  const nameInput = document.getElementById("bulk-new-tag-name");
  const name = nameInput.value.trim();
  if (!name) { showToast(t("toast_enter_tag_name")); return; }
  const allTags = await Tags.getAll();
  const dupe = allTags.find((tg) => tg.name.toLowerCase() === name.toLowerCase());
  if (dupe) {
    if (!bulkTagSelected.includes(dupe.id)) bulkTagSelected.push(dupe.id);
    showToast(t("toast_tag_exists_selected"));
  } else {
    const colorsWrap = document.getElementById("bulk-new-tag-colors");
    const tag = await Tags.add(name, colorsWrap.dataset.selected);
    bulkTagSelected.push(tag.id);
  }
  nameInput.value = "";
  await renderBulkTagList();
}

async function openBulkTagPicker() {
  bulkTagSelected = [];
  document.getElementById("bulk-tag-hint").textContent = t("hint_bulk_tag_picker", {
    count: I18N.plural(Contacts.selectedIds.size, "contact_count", "contact_count_plural"),
  });
  await renderBulkTagList();
  renderColorSwatches("bulk-new-tag-colors", TAG_COLOR_PALETTE[0]);
  showScreen("screen-bulk-tag");
}

// Adds the chosen tag(s) to every selected contact, leaving any tags a
// contact already has untouched (a merge, not a replace).
async function applyBulkTag() {
  if (bulkTagSelected.length === 0) {
    showToast(t("toast_pick_one_tag"));
    return;
  }
  const ids = Array.from(Contacts.selectedIds);
  for (const id of ids) {
    const c = await DB.get(id);
    if (!c) continue;
    const merged = Array.from(new Set([...(c.tags || []), ...bulkTagSelected]));
    if (merged.length !== (c.tags || []).length) {
      await DB.update(id, { tags: merged });
    }
  }
  showToast(t("toast_bulk_tag_applied", {
    count: I18N.plural(ids.length, "contact_count", "contact_count_plural"),
  }));
  closeAllScreens();
  Contacts.exitSelectMode();
  await Contacts.refresh();
}

// ---------------- Bulk edit: change category of selected contacts ----------------
let bulkCategorySelected = "customer";

function setBulkCategory(cat) {
  bulkCategorySelected = cat;
  document.querySelectorAll("#bulk-category-picker button").forEach((b) =>
    b.classList.toggle("active", b.dataset.cat === cat)
  );
}

function openBulkCategoryPicker() {
  document.getElementById("bulk-category-hint").textContent = t("hint_bulk_category_picker", {
    count: I18N.plural(Contacts.selectedIds.size, "contact_count", "contact_count_plural"),
  });
  setBulkCategory("customer");
  showScreen("screen-bulk-category");
}

// DB.update() already auto-logs a "category changed" activity entry per
// contact when the category actually changes (see db.js) — bulk apply
// gets that timeline logging for free, one entry per affected contact.
async function applyBulkCategory() {
  const ids = Array.from(Contacts.selectedIds);
  for (const id of ids) {
    await DB.update(id, { category: bulkCategorySelected });
  }
  showToast(t("toast_bulk_category_applied", {
    count: I18N.plural(ids.length, "contact_count", "contact_count_plural"),
  }));
  closeAllScreens();
  Contacts.exitSelectMode();
  await Contacts.refresh();
}

// ---------------- Duplicate detection & merge ----------------
let duplicateGroups = [];
let activeDuplicateGroup = null; // the group array currently being reviewed
let duplicateMergePrimaryId = null;

function duplicateReasonLabel(reasons) {
  return reasons.map((r) => {
    if (r === "phone") return t("dup_reason_phone");
    if (r === "email") return t("dup_reason_email");
    if (r === "name") return t("dup_reason_name");
    return r;
  }).join(" \u00b7 ");
}

async function renderDuplicatesList() {
  const all = await DB.getAll();
  duplicateGroups = Duplicates.findGroups(all);
  const wrap = document.getElementById("duplicates-list");
  if (duplicateGroups.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="padding:24px 16px"><p>${t("empty_no_duplicates")}</p></div>`;
    return;
  }
  wrap.innerHTML = duplicateGroups.map((group, idx) => `
    <div class="more-card" style="margin-bottom:10px">
      <div class="more-row" style="cursor:pointer" data-review-idx="${idx}">
        <div class="txt">
          <p class="t">${group.map((c) => escapeHTML(fullName(c))).join(", ")}</p>
          <p class="s">${escapeHTML(duplicateReasonLabel(Duplicates.matchReasons(group)))} \u00b7 ${I18N.plural(group.length, "contact_count", "contact_count_plural")}</p>
        </div>
      </div>
    </div>
  `).join("");
  wrap.querySelectorAll("[data-review-idx]").forEach((row) => {
    row.addEventListener("click", () => openDuplicateMerge(Number(row.dataset.reviewIdx)));
  });
}

async function openDuplicates() {
  await renderDuplicatesList();
  showScreen("screen-duplicates");
}

function openDuplicateMerge(groupIdx) {
  activeDuplicateGroup = duplicateGroups[groupIdx];
  duplicateMergePrimaryId = activeDuplicateGroup[0].id; // default: first found
  renderDuplicateMergeScreen();
  showScreen("screen-duplicate-merge");
}

function renderDuplicateMergeScreen() {
  const wrap = document.getElementById("duplicate-merge-list");
  wrap.innerHTML = activeDuplicateGroup.map((c) => `
    <div class="contact-row" data-id="${c.id}">
      <span class="select-check ${c.id === duplicateMergePrimaryId ? "checked" : ""}"></span>
      ${c.photoDataUrl
        ? `<img class="avatar" src="${c.photoDataUrl}" style="object-fit:cover" />`
        : `<div class="avatar" style="background:${CAT_META[c.category].color}">${initials(c)}</div>`}
      <div class="contact-info">
        <p class="contact-name">${escapeHTML(fullName(c))}</p>
        <p class="contact-sub">${escapeHTML(c.company || primaryPhone(c) || primaryEmail(c) || "")}</p>
      </div>
      <span class="badge ${c.category}">${catLabel(c.category)}</span>
    </div>
  `).join("");
  wrap.querySelectorAll(".contact-row").forEach((row) => {
    row.addEventListener("click", () => {
      duplicateMergePrimaryId = row.dataset.id;
      renderDuplicateMergeScreen();
    });
  });
  document.getElementById("duplicate-merge-summary").textContent = t("hint_duplicate_merge_summary", {
    count: I18N.plural(activeDuplicateGroup.length - 1, "contact_count", "contact_count_plural"),
  });
}

async function confirmDuplicateMerge() {
  if (!activeDuplicateGroup || !duplicateMergePrimaryId) return;
  const memberIds = activeDuplicateGroup.map((c) => c.id);
  await Duplicates.merge(duplicateMergePrimaryId, memberIds);
  showToast(t("toast_contacts_merged"));
  closeScreen("screen-duplicate-merge");
  await renderDuplicatesList();
  await Contacts.refresh();
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
  document.getElementById("form-title").textContent = id ? t("form_title_edit") : t("form_title_new");

  ["prefix", "first", "last", "nickname", "company", "jobtitle", "department", "birthday"].forEach((f) => {
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
      document.getElementById("f-prefix").value = c.namePrefix || "";
      document.getElementById("f-first").value = c.firstName || "";
      document.getElementById("f-last").value = c.lastName || "";
      document.getElementById("f-nickname").value = c.nickname || "";
      document.getElementById("f-company").value = c.company || "";
      document.getElementById("f-jobtitle").value = c.jobTitle || "";
      document.getElementById("f-department").value = c.department || "";
      document.getElementById("f-birthday").value = c.birthday || "";
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
    namePrefix: document.getElementById("f-prefix").value.trim(),
    firstName: document.getElementById("f-first").value.trim(),
    lastName: document.getElementById("f-last").value.trim(),
    nickname: document.getElementById("f-nickname").value.trim(),
    company: document.getElementById("f-company").value.trim(),
    jobTitle: document.getElementById("f-jobtitle").value.trim(),
    department: document.getElementById("f-department").value.trim(),
    birthday: document.getElementById("f-birthday").value,
    phones: readMultiFieldEditor("f-phones", false),
    emails: readMultiFieldEditor("f-emails", false),
    addresses: readMultiFieldEditor("f-addresses", true),
    websites: readMultiFieldEditor("f-websites", false),
    customFields: readCustomFieldsEditor("f-customfields"),
    photoDataUrl: formPhotoDataUrl,
    tags: formTagIds.slice(),
    category: formCategory,
  };
  if (!payload.firstName && !payload.lastName && !payload.company) {
    showToast(t("toast_add_name_or_company"));
    return;
  }
  if (formEditingId) {
    await DB.update(formEditingId, payload);
    showToast(t("toast_contact_updated"));
  } else {
    await DB.add(payload);
    showToast(t("toast_contact_added"));
  }
  await Contacts.refresh();
  closeAllScreens();
}

async function deleteCurrentContact() {
  if (!Contacts.currentId) return;
  if (!confirm(t("confirm_delete_contact"))) return;
  await DB.remove(Contacts.currentId);
  showToast(t("toast_contact_deleted"));
  await Contacts.refresh();
  closeAllScreens();
}
