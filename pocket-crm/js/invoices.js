const STATUS_SETS = {
  invoice: ["draft", "sent", "paid"],
  proposal: ["draft", "sent", "accepted"],
};
const STATUS_META = {
  draft: { label: "Draft", color: "#8A93A3", soft: "#EEF0F3" },
  sent: { label: "Sent", color: "#009BDE", soft: "#E5F5FC" },
  paid: { label: "Paid", color: "#1F8A5F", soft: "#E7F5EE" },
  accepted: { label: "Accepted", color: "#1F8A5F", soft: "#E7F5EE" },
};

function money(amount, currency) {
  const n = Number(amount) || 0;
  return `${currency || "USD"} ${n.toFixed(2)}`;
}

function invoiceTypeLabel(type) {
  return type === "proposal" ? "Proposal" : "Invoice";
}

const InvoicesUI = {
  all: [],
  filter: "all", // all | invoice | proposal
  currentId: null,

  async load() {
    this.all = await Invoices.getAll();
  },

  visible() {
    if (this.filter === "all") return this.all;
    return this.all.filter((i) => i.type === this.filter);
  },

  contactName(id) {
    if (!id) return "";
    const c = Contacts.all.find((c) => c.id === id);
    return c ? fullName(c) : "";
  },

  renderList() {
    const el = document.getElementById("invoice-list");
    const items = this.visible();
    if (items.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l3 3v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>
          <h3>No invoices or proposals yet</h3>
          <p>Tap the + button to create your first one.</p>
        </div>`;
      return;
    }
    el.innerHTML = items.map((inv) => {
      const total = Invoices.total(inv);
      const cname = this.contactName(inv.contactId);
      const meta = STATUS_META[inv.status] || STATUS_META.draft;
      return `
      <div class="invoice-row" data-id="${inv.id}">
        <div class="invoice-icon">${inv.type === "proposal" ? "P" : "I"}</div>
        <div class="contact-info">
          <p class="contact-name">${escapeHTML(inv.number)}${cname ? " · " + escapeHTML(cname) : ""}</p>
          <p class="contact-sub">${invoiceTypeLabel(inv.type)} · ${inv.issueDate} · ${money(total, inv.currency)}</p>
        </div>
        <span class="badge" style="background:${meta.soft};color:${meta.color}">${meta.label}</span>
      </div>`;
    }).join("");
    el.querySelectorAll(".invoice-row").forEach((row) => {
      row.addEventListener("click", () => openInvoiceDetail(row.dataset.id));
    });
  },

  async refresh() {
    await this.load();
    this.renderList();
  },
};

// ---------------- Add / Edit form ----------------
let invEditingId = null;
let invType = "invoice";
let invItems = [];

function populateInvContactSelect(selectedId) {
  const sel = document.getElementById("inv-contact");
  sel.innerHTML = `<option value="">No linked contact</option>` +
    Contacts.all.map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${escapeHTML(fullName(c))}</option>`).join("");
}

function setInvType(type) {
  invType = type;
  document.querySelectorAll("#inv-type button").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
  renderStatusOptions();
}

function renderStatusOptions(selected) {
  const wrap = document.getElementById("inv-status");
  const statuses = STATUS_SETS[invType];
  const sel = selected && statuses.includes(selected) ? selected : statuses[0];
  wrap.innerHTML = statuses.map((s) => `
    <button type="button" class="status-opt ${s === sel ? "active" : ""}" data-status="${s}"
      style="${s === sel ? `background:${STATUS_META[s].soft};color:${STATUS_META[s].color};border-color:${STATUS_META[s].soft}` : ""}">
      ${STATUS_META[s].label}
    </button>`).join("");
  wrap.querySelectorAll(".status-opt").forEach((b) => {
    b.addEventListener("click", () => renderStatusOptions(b.dataset.status));
  });
}

function getSelectedStatus() {
  const active = document.querySelector("#inv-status .status-opt.active");
  return active ? active.dataset.status : STATUS_SETS[invType][0];
}

function renderItemsEditor() {
  const wrap = document.getElementById("inv-items");
  wrap.innerHTML = invItems.map((it, idx) => `
    <div class="item-row" data-idx="${idx}">
      <input type="text" class="it-desc" placeholder="Description" value="${escapeHTML(it.description)}" />
      <input type="number" class="it-qty" placeholder="Qty" min="0" step="1" value="${it.qty}" />
      <input type="number" class="it-price" placeholder="Price" min="0" step="0.01" value="${it.unitPrice}" />
      <button type="button" class="it-remove" title="Remove">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
      </button>
    </div>
  `).join("") + `<button type="button" class="btn-add-item" id="btn-add-item">+ Add item</button>`;

  wrap.querySelectorAll(".item-row").forEach((row) => {
    const idx = Number(row.dataset.idx);
    row.querySelector(".it-desc").addEventListener("input", (e) => { invItems[idx].description = e.target.value; updateInvTotal(); });
    row.querySelector(".it-qty").addEventListener("input", (e) => { invItems[idx].qty = e.target.value; updateInvTotal(); });
    row.querySelector(".it-price").addEventListener("input", (e) => { invItems[idx].unitPrice = e.target.value; updateInvTotal(); });
    row.querySelector(".it-remove").addEventListener("click", () => { invItems.splice(idx, 1); renderItemsEditor(); updateInvTotal(); });
  });
  document.getElementById("btn-add-item").addEventListener("click", () => {
    invItems.push({ description: "", qty: 1, unitPrice: 0 });
    renderItemsEditor();
    updateInvTotal();
  });
  updateInvTotal();
}

function updateInvTotal() {
  const currency = document.getElementById("inv-currency").value || "USD";
  const total = invItems.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  document.getElementById("inv-total-display").textContent = money(total, currency);
}

async function openInvoiceForm(id) {
  invEditingId = id || null;
  const settings = await Settings.get();
  document.getElementById("inv-form-title").textContent = id ? "Edit" : "New invoice or proposal";
  document.getElementById("inv-currency").value = settings.currency || "USD";
  document.getElementById("inv-issue-date").value = new Date().toISOString().slice(0, 10);
  document.getElementById("inv-due-date").value = "";
  document.getElementById("inv-notes").value = "";
  invItems = [{ description: "", qty: 1, unitPrice: 0 }];
  populateInvContactSelect(null);
  setInvType("invoice");
  document.getElementById("inv-delete").style.display = id ? "block" : "none";

  if (id) {
    const inv = await Invoices.get(id);
    if (inv) {
      document.getElementById("inv-currency").value = inv.currency;
      document.getElementById("inv-issue-date").value = inv.issueDate;
      document.getElementById("inv-due-date").value = inv.dueDate || "";
      document.getElementById("inv-notes").value = inv.notes || "";
      invItems = inv.items.length ? inv.items.map((it) => ({ ...it })) : [{ description: "", qty: 1, unitPrice: 0 }];
      populateInvContactSelect(inv.contactId);
      setInvType(inv.type);
      renderStatusOptions(inv.status);
    }
  }
  renderItemsEditor();
  showScreen("screen-invoice-form");
}

async function saveInvoiceForm() {
  const cleanItems = invItems
    .map((it) => ({ id: it.id || uid("li"), description: (it.description || "").trim(), qty: Number(it.qty) || 0, unitPrice: Number(it.unitPrice) || 0 }))
    .filter((it) => it.description || it.qty || it.unitPrice);

  if (cleanItems.length === 0) {
    showToast("Add at least one item");
    return;
  }
  const payload = {
    type: invType,
    contactId: document.getElementById("inv-contact").value || null,
    issueDate: document.getElementById("inv-issue-date").value,
    dueDate: document.getElementById("inv-due-date").value,
    currency: document.getElementById("inv-currency").value.trim() || "USD",
    items: cleanItems,
    notes: document.getElementById("inv-notes").value,
    status: getSelectedStatus(),
  };
  if (invEditingId) {
    await Invoices.update(invEditingId, payload);
    showToast("Updated");
  } else {
    await Invoices.add(payload);
    showToast(`${invoiceTypeLabel(invType)} created`);
  }
  await InvoicesUI.refresh();
  closeAllScreens();
}

async function deleteCurrentInvoice() {
  if (!invEditingId) return;
  if (!confirm("Delete this document? This can't be undone.")) return;
  await Invoices.remove(invEditingId);
  showToast("Deleted");
  await InvoicesUI.refresh();
  closeAllScreens();
}

// ---------------- Detail / preview screen ----------------
async function openInvoiceDetail(id) {
  InvoicesUI.currentId = id;
  const inv = await Invoices.get(id);
  if (!inv) return;
  const settings = await Settings.get();
  const cname = InvoicesUI.contactName(inv.contactId);
  const contact = inv.contactId ? Contacts.all.find((c) => c.id === inv.contactId) : null;
  const total = Invoices.total(inv);
  const meta = STATUS_META[inv.status] || STATUS_META.draft;

  document.getElementById("inv-detail-title").textContent = `${invoiceTypeLabel(inv.type)} ${inv.number}`;

  document.getElementById("invoice-doc").innerHTML = `
    <div class="invoice-doc">
      <div class="invoice-doc-header">
        ${settings.logoDataUrl ? `<img src="${settings.logoDataUrl}" class="invoice-logo" />` : ""}
        <div>
          <p class="invoice-biz-name">${escapeHTML(settings.businessName || "Your business name")}</p>
          <p class="invoice-biz-line">${escapeHTML(settings.address || "")}</p>
          <p class="invoice-biz-line">${escapeHTML([settings.phone, settings.email].filter(Boolean).join(" · "))}</p>
        </div>
      </div>
      <div class="invoice-doc-meta">
        <div>
          <p class="label">${invoiceTypeLabel(inv.type)} #</p>
          <p class="value">${escapeHTML(inv.number)}</p>
        </div>
        <div>
          <p class="label">Issue date</p>
          <p class="value">${inv.issueDate}</p>
        </div>
        ${inv.dueDate ? `<div><p class="label">Due date</p><p class="value">${inv.dueDate}</p></div>` : ""}
        <div>
          <p class="label">Status</p>
          <p class="value" style="color:${meta.color}">${meta.label}</p>
        </div>
      </div>
      ${contact ? `
      <div class="invoice-bill-to">
        <p class="label">Bill to</p>
        <p class="value">${escapeHTML(fullName(contact))}</p>
        ${contact.company ? `<p class="value">${escapeHTML(contact.company)}</p>` : ""}
        ${contact.phone ? `<p class="value">${escapeHTML(contact.phone)}</p>` : ""}
        ${contact.email ? `<p class="value">${escapeHTML(contact.email)}</p>` : ""}
      </div>` : ""}
      <table class="invoice-table">
        <thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead>
        <tbody>
          ${inv.items.map((it) => `
            <tr>
              <td>${escapeHTML(it.description || "—")}</td>
              <td>${it.qty}</td>
              <td>${money(it.unitPrice, inv.currency)}</td>
              <td>${money(it.qty * it.unitPrice, inv.currency)}</td>
            </tr>`).join("")}
        </tbody>
        <tfoot><tr><td colspan="3">Total</td><td>${money(total, inv.currency)}</td></tr></tfoot>
      </table>
      ${inv.notes ? `<div class="invoice-notes"><p class="label">Notes</p><p class="value">${escapeHTML(inv.notes)}</p></div>` : ""}
    </div>
  `;
  showScreen("screen-invoice-detail");
}

// ---------------- PDF export ----------------
function buildInvoicePDF(inv, settings, contact) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  let y = 56;
  const navy = [31, 61, 113];
  const grey = [100, 108, 120];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...navy);
  doc.text(settings.businessName || "Your business name", marginX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...grey);
  y += 18;
  if (settings.address) { doc.text(settings.address, marginX, y); y += 14; }
  const contactLine = [settings.phone, settings.email].filter(Boolean).join("   ·   ");
  if (contactLine) { doc.text(contactLine, marginX, y); y += 14; }

  y += 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...navy);
  doc.text(`${invoiceTypeLabel(inv.type)}  ${inv.number}`, marginX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...grey);
  doc.text(`Issue date: ${inv.issueDate}${inv.dueDate ? "    Due date: " + inv.dueDate : ""}    Status: ${STATUS_META[inv.status].label}`, marginX, y + 16);
  y += 40;

  if (contact) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...navy);
    doc.text("Bill to", marginX, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 24, 33);
    [fullName(contact), contact.company, contact.phone, contact.email].filter(Boolean).forEach((line) => {
      doc.text(line, marginX, y);
      y += 13;
    });
    y += 10;
  }

  // table header
  const colX = [marginX, 330, 400, 470];
  doc.setFillColor(31, 61, 113);
  doc.rect(marginX, y, 515 - marginX + 32, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Description", colX[0] + 6, y + 14);
  doc.text("Qty", colX[1], y + 14);
  doc.text("Price", colX[2], y + 14);
  doc.text("Amount", colX[3], y + 14);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 24, 33);
  inv.items.forEach((it, idx) => {
    const rowH = 20;
    if (idx % 2 === 1) {
      doc.setFillColor(246, 247, 250);
      doc.rect(marginX, y, 515 - marginX + 32, rowH, "F");
    }
    doc.text(String(it.description || "—"), colX[0] + 6, y + 14, { maxWidth: 260 });
    doc.text(String(it.qty), colX[1], y + 14);
    doc.text(money(it.unitPrice, inv.currency), colX[2], y + 14);
    doc.text(money(it.qty * it.unitPrice, inv.currency), colX[3], y + 14);
    y += rowH;
  });

  y += 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...navy);
  doc.text(`Total: ${money(Invoices.total(inv), inv.currency)}`, colX[3] - 40, y + 10);
  y += 34;

  if (inv.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...grey);
    doc.text("Notes", marginX, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 24, 33);
    const split = doc.splitTextToSize(inv.notes, 515 - marginX);
    doc.text(split, marginX, y);
  }

  return doc;
}

async function exportInvoicePDF() {
  const inv = await Invoices.get(InvoicesUI.currentId);
  if (!inv) return;
  const settings = await Settings.get();
  const contact = inv.contactId ? Contacts.all.find((c) => c.id === inv.contactId) : null;
  const doc = buildInvoicePDF(inv, settings, contact);
  const filename = `${inv.number}.pdf`;

  if (navigator.canShare && navigator.share) {
    try {
      const blob = doc.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (_) { /* fall through to download */ }
  }
  doc.save(filename);
  showToast("PDF downloaded");
}
