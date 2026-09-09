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
function dealCardHTML(deal, contactsById) {
  const contact = deal.contactId ? contactsById[deal.contactId] : null;
  return `
    <div class="deal-card" data-id="${deal.id}">
      <p class="deal-title">${escapeHTML(deal.title || t("deal_title_fallback"))}</p>
      ${contact ? `<p class="deal-contact">${escapeHTML(fullName(contact))}</p>` : ""}
      <p class="deal-amount">${escapeHTML(dealMoney(deal.amount, currentCurrency))}</p>
    </div>
  `;
}

let currentCurrency = "USD";

async function renderPipelineBoard() {
  const board = document.getElementById("pipeline-board");
  if (!board) return;
  const [deals, contacts, settings] = await Promise.all([Deals.getAll(), DB.getAll(), Settings.get()]);
  currentCurrency = settings.currency || "USD";
  const contactsById = {};
  contacts.forEach((c) => { contactsById[c.id] = c; });

  const openTotal = deals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  document.getElementById("pipeline-summary").textContent = deals.length === 0
    ? t("pipeline_empty_summary")
    : t("pipeline_summary", { amount: dealMoney(openTotal, currentCurrency), count: I18N.plural(deals.length, "deal_count", "deal_count_plural") });

  board.innerHTML = DEAL_STAGES.map((stage) => {
    const stageDeals = deals.filter((d) => d.stage === stage);
    const stageTotal = stageDeals.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
    return `
      <div class="pipeline-column">
        <div class="pipeline-column-header">
          <p class="pipeline-column-title" style="color:${DEAL_STAGE_META[stage].color}">${dealStageLabel(stage)}</p>
          <p class="pipeline-column-meta">${I18N.plural(stageDeals.length, "deal_count", "deal_count_plural")}${stageDeals.length ? " \u00b7 " + dealMoney(stageTotal, currentCurrency) : ""}</p>
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
let dealFormContactId = null;

async function openDealForm(id, presets) {
  dealFormEditingId = id || null;
  dealFormStage = (presets && presets.stage) || "new";
  dealFormContactId = (presets && presets.contactId) || null;

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
      dealFormContactId = deal.contactId;
    }
  }
  setDealStage(dealFormStage);
  await refreshDealContactLabel();
  showScreen("screen-deal-form");
}

function setDealStage(stage) {
  dealFormStage = stage;
  document.querySelectorAll("#deal-stage-chips .chip").forEach((b) =>
    b.classList.toggle("active", b.dataset.stage === stage)
  );
}

async function refreshDealContactLabel() {
  const label = document.getElementById("deal-contact-label");
  if (!dealFormContactId) {
    label.textContent = t("deal_no_contact");
    return;
  }
  const c = await DB.get(dealFormContactId);
  label.textContent = c ? fullName(c) : t("deal_no_contact");
}

async function saveDealForm() {
  const title = document.getElementById("deal-title").value.trim();
  if (!title) {
    showToast(t("toast_enter_deal_title"));
    return;
  }
  const patch = {
    title,
    contactId: dealFormContactId,
    amount: Number(document.getElementById("deal-amount").value) || 0,
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

// ---------------- Deal form: contact picker ----------------
async function openDealContactPicker() {
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

  const noneRow = `
    <div class="more-row" id="deal-picker-none" style="cursor:pointer">
      <div class="txt"><p class="t">${t("deal_no_contact")}</p></div>
    </div>
  `;
  wrap.innerHTML = noneRow + filtered.map((c) => `
    <div class="contact-row" data-id="${c.id}">
      ${c.photoDataUrl
        ? `<img class="avatar" src="${c.photoDataUrl}" style="object-fit:cover" />`
        : `<div class="avatar" style="background:${CAT_META[c.category].color}">${initials(c)}</div>`}
      <div class="contact-info">
        <p class="contact-name">${escapeHTML(fullName(c))}</p>
        <p class="contact-sub">${escapeHTML(c.company || primaryPhone(c) || primaryEmail(c) || "")}</p>
      </div>
    </div>
  `).join("");

  document.getElementById("deal-picker-none").addEventListener("click", () => {
    dealFormContactId = null;
    closeScreen("screen-deal-contact-picker");
    refreshDealContactLabel();
  });
  wrap.querySelectorAll(".contact-row").forEach((row) => {
    row.addEventListener("click", () => {
      dealFormContactId = row.dataset.id;
      closeScreen("screen-deal-contact-picker");
      refreshDealContactLabel();
    });
  });
}

// ---------------- Contact detail: Deals tab ----------------
async function renderDealsTab(contactId) {
  const wrap = document.getElementById("detail-tab-deals");
  if (!wrap) return;
  const deals = await Deals.forContact(contactId);
  const settings = await Settings.get();
  const currency = settings.currency || "USD";
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
            <p class="deal-amount">${escapeHTML(dealMoney(d.amount, currency))}</p>
          </div>
        `).join("")}
    </div>
  `;
  document.getElementById("btn-add-deal").addEventListener("click", () => openDealForm(null, { contactId }));
  wrap.querySelectorAll(".deal-card").forEach((card) => {
    card.addEventListener("click", () => openDealForm(card.dataset.id));
  });
}
