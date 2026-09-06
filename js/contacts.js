const CAT_META = {
  customer: { label: "Customer", color: "#1F8A5F" },
  lead: { label: "Lead", color: "#C97C1F" },
  lost: { label: "Lost", color: "#8A93A3" },
};

function initials(c) {
  const a = (c.firstName || "").trim()[0] || "";
  const b = (c.lastName || "").trim()[0] || "";
  return (a + b).toUpperCase() || "?";
}

function fullName(c) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed contact";
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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
      return [c.firstName, c.lastName, c.company, c.phone, c.email]
        .filter(Boolean).some((v) => v.toLowerCase().includes(q));
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
        <div class="avatar" style="background:${CAT_META[c.category].color}">${initials(c)}</div>
        <div class="contact-info">
          <p class="contact-name">${escapeHTML(fullName(c))}</p>
          <p class="contact-sub">${escapeHTML(c.company || c.phone || c.email || "")}</p>
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

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

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
    <div class="avatar" style="background:rgba(255,255,255,0.18)">${initials(c)}</div>
    <h2>${escapeHTML(fullName(c))}</h2>
    <p>${escapeHTML(c.company || CAT_META[c.category].label)}</p>
  `;

  const hasPhone = !!c.phone, hasEmail = !!c.email, hasAddress = !!c.address;
  document.getElementById("detail-qa").innerHTML = `
    <a class="qa-btn ${hasPhone ? "" : "disabled"}" href="${hasPhone ? "tel:" + c.phone : "#"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></svg>
      Call
    </a>
    <a class="qa-btn ${hasPhone ? "" : "disabled"}" href="${hasPhone ? "sms:" + c.phone : "#"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
      Message
    </a>
    <a class="qa-btn ${hasEmail ? "" : "disabled"}" href="${hasEmail ? "mailto:" + c.email : "#"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></svg>
      Email
    </a>
    <a class="qa-btn ${hasAddress ? "" : "disabled"}" target="_blank" rel="noopener" href="${hasAddress ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(c.address) : "#"}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
      Directions
    </a>
    <button type="button" class="qa-btn" id="btn-save-to-phone">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 18h6"/></svg>
      Save to phone
    </button>
  `;
  document.getElementById("btn-save-to-phone").addEventListener("click", () => saveContactToPhone(c.id));

  document.getElementById("detail-tab-info").innerHTML = `
    <div class="field-list">
      <div class="field-row"><p class="label">Category</p><p class="value">${CAT_META[c.category].label}</p></div>
      ${c.phone ? `<div class="field-row"><p class="label">Phone</p><p class="value">${escapeHTML(c.phone)}</p></div>` : ""}
      ${c.email ? `<div class="field-row"><p class="label">Email</p><p class="value">${escapeHTML(c.email)}</p></div>` : ""}
      ${c.address ? `<div class="field-row"><p class="label">Address</p><p class="value">${escapeHTML(c.address)}</p></div>` : ""}
      ${c.tags && c.tags.length ? `<div class="field-row"><p class="label">Tags</p><div class="tag-row">${c.tags.map((t) => `<span class="tag">${escapeHTML(t)}</span>`).join("")}</div></div>` : ""}
      <div class="field-row"><p class="label">Added</p><p class="value">${fmtDate(c.createdAt)}</p></div>
    </div>
    ${await renderLinkedEvents(c.id)}
  `;

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

// ---------------- Add / Edit form ----------------
let formEditingId = null;
let formCategory = "customer";

function openForm(id) {
  formEditingId = id || null;
  formCategory = "customer";
  document.getElementById("form-title").textContent = id ? "Edit contact" : "New contact";

  const fields = ["first", "last", "company", "phone", "email", "address", "tags", "notes"];
  fields.forEach((f) => (document.getElementById("f-" + f).value = ""));

  if (id) {
    DB.get(id).then((c) => {
      if (!c) return;
      document.getElementById("f-first").value = c.firstName || "";
      document.getElementById("f-last").value = c.lastName || "";
      document.getElementById("f-company").value = c.company || "";
      document.getElementById("f-phone").value = c.phone || "";
      document.getElementById("f-email").value = c.email || "";
      document.getElementById("f-address").value = c.address || "";
      document.getElementById("f-tags").value = (c.tags || []).join(", ");
      document.getElementById("f-notes").value = c.notes || "";
      formCategory = c.category || "customer";
      setFormCategory(formCategory);
    });
  } else {
    setFormCategory("customer");
  }
  showScreen("screen-form");
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
    company: document.getElementById("f-company").value.trim(),
    phone: document.getElementById("f-phone").value.trim(),
    email: document.getElementById("f-email").value.trim(),
    address: document.getElementById("f-address").value.trim(),
    tags: document.getElementById("f-tags").value
      .split(",").map((t) => t.trim()).filter(Boolean),
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
