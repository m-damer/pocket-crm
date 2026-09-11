// ---------------- Pipeline (Deals) ----------------
// A small, optional module: everything here is inert and hidden unless
// Settings.pipelineEnabled is true. DEAL_STAGES (the ordered list of stage
// keys) lives in db.js next to the Deals data module; this file owns the
// stage *metadata* (color, label) and all the rendering/interaction.
const DEAL_STAGE_META = {
  new: { color: "#0068B3" },
  contacted: { color: "#6B4FA0" },
  proposal: { color: "#C97C1F" },
  negotiation: { color: "#C2185B" },
  won: { color: "#10845D" },
  lost: { color: "#8A93A3" },
};
function dealStageLabel(stage) {
  const key = "deal_stage_" + stage;
  return t(key) !== key ? t(key) : stage;
}

// js/invoices.js has its own money() formatter, but that file isn't
// actually loaded by index.html (a leftover from an earlier phase) — kept
// self-contained here rather than take a dependency on a file that isn't
// part of the live app.
function dealMoney(amount, currency) {
  const n = Number(amount) || 0;
  return `${currency || "USD"} ${n.toFixed(2)}`;
}

// Deals can each carry their own currency (USD or SYP) — totals across a
// mixed set are shown per-currency, never converted into one number.
// Converting would need an exchange rate, and exchange rates move; showing
// "USD 500.00 · SYP 200,000.00" side by side is honest about what's
// actually known, where a single blended total wouldn't be.
function formatDealTotals(dealsList) {
  const totals = {};
  dealsList.forEach((d) => {
    const cur = d.currency || "USD";
    totals[cur] = (totals[cur] || 0) + (Number(d.amount) || 0);
  });
  return Object.keys(totals).sort().map((cur) => dealMoney(totals[cur], cur)).join(" \u00b7 ");
}

let pipelineEnabled = true;

async function loadPipelineEnabled() {
  const settings = await Settings.get();
  pipelineEnabled = settings.pipelineEnabled !== false;
}

// Shows/hides every Pipeline-related entry point at once: the bottom-nav
// tab, the contact-detail Deals tab, and (handled separately, read live
// each time the sheet opens) the "Add deal" quick-menu row. Called at boot
// and immediately after the toggle changes, so nothing needs a page reload.
function applyPipelineVisibility() {
  const navBtn = document.getElementById("nav-pipeline");
  if (navBtn) navBtn.hidden = !pipelineEnabled;
  const dealsTabBtn = document.getElementById("tab-btn-deals");
  if (dealsTabBtn) dealsTabBtn.hidden = !pipelineEnabled;
  // If Pipeline was open and got turned off mid-session, fall back to
  // Contacts rather than leaving an empty/inaccessible tab showing.
  if (!pipelineEnabled && !document.getElementById("view-pipeline").hidden) {
    switchTab("contacts");
  }
}

// ---------------- Pipeline board ----------------
function dealContactsSummary(deal, contactsById) {
  const contacts = (deal.contactIds || []).map((id) => contactsById[id]).filter(Boolean);
  if (contacts.length === 0) return "";
  if (contacts.length <= 2) return contacts.map(fullName).join(", ");
  return `${fullName(contacts[0])} ${t("deal_contacts_plus_more", { n: contacts.length - 1 })}`;
}

function dealCardHTML(deal, contactsById) {
  const contactsLine = dealContactsSummary(deal, contactsById);
  return `
    <div class="deal-card" data-id="${deal.id}">
      <p class="deal-title">${escapeHTML(deal.title || t("deal_title_fallback"))}</p>
      ${contactsLine ? `<p class="deal-contact">${escapeHTML(contactsLine)}</p>` : ""}
      <p class="deal-amount">${escapeHTML(dealMoney(deal.amount, deal.currency))}</p>
    </div>
  `;
}

async function renderPipelineBoard() {
  const board = document.getElementById("pipeline-board");
  if (!board) return;
  const [deals, contacts] = await Promise.all([Deals.getAll(), DB.getAll()]);
  const contactsById = {};
  contacts.forEach((c) => { contactsById[c.id] = c; });

  const openDeals = deals.filter((d) => d.stage !== "won" && d.stage !== "lost");
  document.getElementById("pipeline-summary").textContent = deals.length === 0
    ? t("pipeline_empty_summary")
    : t("pipeline_summary", { amount: formatDealTotals(openDeals) || dealMoney(0, "USD"), count: I18N.plural(deals.length, "deal_count", "deal_count_plural") });

  board.innerHTML = DEAL_STAGES.map((stage) => {
    const stageDeals = deals.filter((d) => d.stage === stage);
    return `
      <div class="pipeline-column">
        <div class="pipeline-column-header">
          <p class="pipeline-column-title" style="color:${DEAL_STAGE_META[stage].color}">${dealStageLabel(stage)}</p>
          <p class="pipeline-column-meta">${I18N.plural(stageDeals.length, "deal_count", "deal_count_plural")}${stageDeals.length ? " \u00b7 " + formatDealTotals(stageDeals) : ""}</p>
        </div>
        <div class="pipeline-column-body" data-stage="${stage}">
          ${stageDeals.map((d) => dealCardHTML(d, contactsById)).join("")}
        </div>
      </div>
    `;
  }).join("");

  board.querySelectorAll(".deal-card").forEach((card) => {
    card.addEventListener("click", () => openDealForm(card.dataset.id));
  });
}

// ---------------- Deal form (add/edit) ----------------
let dealFormEditingId = null;
let dealFormStage = "new";
let dealFormContactIds = [];
let dealFormCurrency = "USD";

async function openDealForm(id, presets) {
  dealFormEditingId = id || null;
  dealFormStage = (presets && presets.stage) || "new";
  dealFormContactIds = (presets && presets.contactId) ? [presets.contactId] : [];
  const settings = await Settings.get();
  dealFormCurrency = settings.currency === "SYP" ? "SYP" : "USD";

  document.getElementById("deal-form-title").textContent = id ? t("deal_form_title_edit") : t("deal_form_title_new");
  document.getElementById("deal-title").value = "";
  document.getElementById("deal-amount").value = "";
  document.getElementById("deal-close-date").value = "";
  document.getElementById("deal-notes").value = "";
  document.getElementById("deal-delete-zone").style.display = id ? "" : "none";

  if (id) {
    const deal = await Deals.get(id);
    if (deal) {
      document.getElementById("deal-title").value = deal.title || "";
      document.getElementById("deal-amount").value = deal.amount || "";
      document.getElementById("deal-close-date").value = deal.expectedCloseDate || "";
      document.getElementById("deal-notes").value = deal.notes || "";
      dealFormStage = deal.stage;
      dealFormContactIds = deal.contactIds || [];
      dealFormCurrency = deal.currency === "SYP" ? "SYP" : "USD";
    }
  }
  setDealStage(dealFormStage);
  setDealCurrency(dealFormCurrency);
  await refreshDealContactLabel();
  showScreen("screen-deal-form");
}

function setDealStage(stage) {
  dealFormStage = stage;
  document.querySelectorAll("#deal-stage-chips .chip").forEach((b) =>
    b.classList.toggle("active", b.dataset.stage === stage)
  );
}

function setDealCurrency(currency) {
  dealFormCurrency = currency;
  document.querySelectorAll("#deal-currency-toggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.currency === currency)
  );
}

async function refreshDealContactLabel() {
  const label = document.getElementById("deal-contact-label");
  if (!dealFormContactIds.length) {
    label.textContent = t("deal_no_contact");
    return;
  }
  const contacts = (await Promise.all(dealFormContactIds.map((id) => DB.get(id)))).filter(Boolean);
  if (contacts.length === 0) {
    label.textContent = t("deal_no_contact");
  } else if (contacts.length <= 2) {
    label.textContent = contacts.map(fullName).join(", ");
  } else {
    label.textContent = `${fullName(contacts[0])} ${t("deal_contacts_plus_more", { n: contacts.length - 1 })}`;
  }
}

async function saveDealForm() {
  const title = document.getElementById("deal-title").value.trim();
  if (!title) {
    showToast(t("toast_enter_deal_title"));
    return;
  }
  const patch = {
    title,
    contactIds: dealFormContactIds,
    amount: Number(document.getElementById("deal-amount").value) || 0,
    currency: dealFormCurrency,
    stage: dealFormStage,
    expectedCloseDate: document.getElementById("deal-close-date").value,
    notes: document.getElementById("deal-notes").value.trim(),
  };
  if (dealFormEditingId) {
    await Deals.update(dealFormEditingId, patch);
    showToast(t("toast_deal_updated"));
  } else {
    await Deals.add(patch);
    showToast(t("toast_deal_added"));
  }
  closeAllScreens();
  await renderPipelineBoard();
  if (Contacts.currentId) await renderDealsTab(Contacts.currentId);
}

async function deleteDealForm() {
  if (!dealFormEditingId) return;
  if (!confirm(t("confirm_delete_deal"))) return;
  await Deals.remove(dealFormEditingId);
  showToast(t("toast_deal_deleted"));
  closeAllScreens();
  await renderPipelineBoard();
  if (Contacts.currentId) await renderDealsTab(Contacts.currentId);
}

// ---------------- Deal form: contact picker (multi-select) ----------------
let dealPickerSelected = new Set();

async function openDealContactPicker() {
  dealPickerSelected = new Set(dealFormContactIds);
  document.getElementById("deal-picker-search").value = "";
  await renderDealContactPickerList("");
  showScreen("screen-deal-contact-picker");
}

async function renderDealContactPickerList(query) {
  const wrap = document.getElementById("deal-contact-picker-list");
  const all = await DB.getAll();
  const q = (query || "").trim().toLowerCase();
  const filtered = q
    ? all.filter((c) => (fullName(c) + " " + (c.company || "")).toLowerCase().includes(q))
    : all;

  wrap.innerHTML = filtered.map((c) => `
    <div class="contact-row select-mode" data-id="${c.id}">
      <span class="select-check${dealPickerSelected.has(c.id) ? " checked" : ""}"></span>
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
      if (dealPickerSelected.has(id)) dealPickerSelected.delete(id);
      else dealPickerSelected.add(id);
      row.querySelector(".select-check").classList.toggle("checked", dealPickerSelected.has(id));
    });
  });
}

function applyDealContactPicker() {
  dealFormContactIds = Array.from(dealPickerSelected);
  closeScreen("screen-deal-contact-picker");
  refreshDealContactLabel();
}

// ---------------- Contact detail: Deals tab ----------------
async function renderDealsTab(contactId) {
  const wrap = document.getElementById("detail-tab-deals");
  if (!wrap) return;
  const deals = await Deals.forContact(contactId);
  wrap.innerHTML = `
    <div style="padding:4px 16px 0">
      <button type="button" class="btn-secondary" id="btn-add-deal" style="padding:9px 16px;width:100%">${t("btn_add_deal")}</button>
    </div>
    <div class="field-list" style="margin-top:10px">
      ${deals.length === 0
        ? `<div class="empty-state" style="padding:24px 16px"><p>${t("empty_no_deals")}</p></div>`
        : deals.map((d) => `
          <div class="deal-card" data-id="${d.id}" style="margin-bottom:8px">
            <p class="deal-title">${escapeHTML(d.title || t("deal_title_fallback"))}</p>
            <p class="deal-contact" style="color:${DEAL_STAGE_META[d.stage].color}">${dealStageLabel(d.stage)}</p>
            <p class="deal-amount">${escapeHTML(dealMoney(d.amount, d.currency))}</p>
          </div>
        `).join("")}
    </div>
  `;
  document.getElementById("btn-add-deal").addEventListener("click", () => openDealForm(null, { contactId }));
  wrap.querySelectorAll(".deal-card").forEach((card) => {
    card.addEventListener("click", () => openDealForm(card.dataset.id));
  });
}
