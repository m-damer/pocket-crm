// ---------------- Reports (Phase 8b) ----------------
// Three views: Summary (counts by category/tag), Activity (contacts added +
// activity log entries within a date range), and By Tag (per-tag contact
// breakdown). Each view can export to CSV (full Arabic support — it's just
// UTF-8 text) or PDF (English-only text rendering — see the note below).

// ---------------- Data ----------------
function reportSummaryData() {
  const byCategory = { customer: 0, lead: 0, lost: 0 };
  Contacts.all.forEach((c) => {
    if (byCategory[c.category] !== undefined) byCategory[c.category]++;
  });
  return { total: Contacts.all.length, byCategory };
}

async function reportTagBreakdown() {
  const tags = await Tags.getAll();
  return tags
    .map((tg) => {
      const contacts = Contacts.all.filter((c) => (c.tags || []).includes(tg.id));
      return { id: tg.id, name: tg.name, color: tg.color, count: contacts.length, contacts };
    })
    .sort((a, b) => b.count - a.count);
}

function reportActivityData(fromStr, toStr) {
  const fromTime = fromStr ? new Date(fromStr + "T00:00:00").getTime() : -Infinity;
  const toTime = toStr ? new Date(toStr + "T23:59:59").getTime() : Infinity;
  const addedContacts = Contacts.all.filter((c) => {
    const created = new Date(c.createdAt).getTime();
    return created >= fromTime && created <= toTime;
  });
  const entries = [];
  Contacts.all.forEach((c) => {
    (c.activities || []).forEach((a) => {
      const at = new Date(a.date).getTime();
      if (at >= fromTime && at <= toTime) {
        entries.push({ date: a.date, contactName: fullName(c), text: a.text || "" });
      }
    });
  });
  entries.sort((a, b) => b.date.localeCompare(a.date));
  return { addedContacts, entries };
}

function defaultReportRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400000);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}

// ---------------- Rendering ----------------
let reportsTab = "summary";

function listSeparator() {
  return I18N.lang === "ar" ? "\u060c " : ", ";
}

function updatePdfNote(elId) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = t("pdf_english_note");
  el.style.display = "block";
}

async function renderReportSummary() {
  const { total, byCategory } = reportSummaryData();
  const tags = await Tags.getAll();
  const counts = await Tags.countsById();
  const wrap = document.getElementById("report-summary-content");
  wrap.innerHTML = `
    <div class="field-row"><p class="label">${t("summary_total_contacts")}</p><p class="value" style="font-size:20px;font-weight:700">${total}</p></div>
    <div class="field-row">
      <p class="label">${t("summary_by_category")}</p>
      <div class="tag-row" style="margin-top:8px;gap:8px">
        <span class="badge customer">${catLabel("customer")} \u00b7 ${byCategory.customer}</span>
        <span class="badge lead">${catLabel("lead")} \u00b7 ${byCategory.lead}</span>
        <span class="badge lost">${catLabel("lost")} \u00b7 ${byCategory.lost}</span>
      </div>
    </div>
    <div class="field-row">
      <p class="label">${t("summary_by_tag")}</p>
      ${tags.length === 0
        ? `<p class="hint-text" style="margin:8px 0 0">${t("summary_no_tags")}</p>`
        : `<div class="tag-row" style="margin-top:8px;gap:8px">${tags.map((tg) => `<span class="tag" style="background:${tg.color};color:#fff">${escapeHTML(tg.name)} \u00b7 ${counts[tg.id] || 0}</span>`).join("")}</div>`}
    </div>
  `;
  updatePdfNote("summary-pdf-note");
}

async function renderReportActivity() {
  const from = document.getElementById("report-from").value;
  const to = document.getElementById("report-to").value;
  const { addedContacts, entries } = reportActivityData(from, to);
  const wrap = document.getElementById("report-activity-content");
  if (addedContacts.length === 0 && entries.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="padding:24px 16px"><p>${t("empty_activity_range")}</p></div>`;
  } else {
    wrap.innerHTML = `
      <div class="field-row"><p class="label">${t("activity_contacts_added")}</p><p class="value" style="font-size:18px;font-weight:700">${addedContacts.length}</p></div>
      <div class="field-row"><p class="label">${t("activity_log_entries")}</p><p class="value" style="font-size:18px;font-weight:700">${entries.length}</p></div>
      ${entries.slice(0, 300).map((e) => `
        <div class="activity-item">
          <p class="when">${fmtDate(e.date)}${e.contactName ? " \u00b7 " + escapeHTML(e.contactName) : ""}</p>
          <p class="what">${escapeHTML(e.text)}</p>
        </div>
      `).join("")}
    `;
  }
  updatePdfNote("activity-pdf-note");
}

async function renderReportTags() {
  const breakdown = await reportTagBreakdown();
  const wrap = document.getElementById("report-tags-content");
  if (breakdown.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="padding:24px 16px"><p>${t("by_tag_empty")}</p></div>`;
  } else {
    const sep = listSeparator();
    wrap.innerHTML = breakdown.map((tg) => `
      <div class="field-row">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <span class="tag-dot" style="background:${tg.color}"></span>
          <p class="label" style="margin:0;font-size:14px">${escapeHTML(tg.name)}</p>
          <span style="margin-inline-start:auto;font-size:12px;color:var(--text-muted)">${I18N.plural(tg.count, "by_tag_contacts_count", "by_tag_contacts_count_plural")}</span>
        </div>
        <p class="value" style="font-size:13px">${tg.contacts.map((c) => escapeHTML(fullName(c))).join(sep) || "\u2014"}</p>
      </div>
    `).join("");
  }
  updatePdfNote("tags-pdf-note");
}

function setReportsTab(tab) {
  reportsTab = tab;
  document.querySelectorAll("#screen-reports .tab-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.rtab === tab)
  );
  ["summary", "activity", "tags"].forEach((tb) => {
    document.getElementById("report-tab-" + tb).hidden = tb !== tab;
  });
}

async function openReports() {
  reportsTab = "summary";
  const range = defaultReportRange();
  const fromInput = document.getElementById("report-from");
  const toInput = document.getElementById("report-to");
  if (!fromInput.value) fromInput.value = range.from;
  if (!toInput.value) toInput.value = range.to;
  setReportsTab("summary");
  await renderReportSummary();
  await renderReportActivity();
  await renderReportTags();
  showScreen("screen-reports");
}

async function refreshOpenReportTab() {
  if (reportsTab === "summary") await renderReportSummary();
  else if (reportsTab === "activity") await renderReportActivity();
  else await renderReportTags();
}

// ---------------- CSV export (full Arabic support — plain UTF-8 text) ----------------
function csvEscape(v) {
  const s = String(v == null ? "" : v);
  if (/["\n,]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function csvFromRows(rows) {
  // Leading BOM so Excel opens Arabic (and any UTF-8) text correctly.
  return "\uFEFF" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}
function downloadCSV(rows, filenameBase) {
  const csv = csvFromRows(rows);
  downloadFile(csv, `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
  showToast(t("toast_csv_downloaded"));
}

async function exportSummaryCSV() {
  const { total, byCategory } = reportSummaryData();
  const tags = await Tags.getAll();
  const counts = await Tags.countsById();
  const rows = [[t("csv_header_type"), t("csv_header_name"), t("csv_header_count")]];
  rows.push(["", t("summary_total_contacts"), total]);
  rows.push([t("csv_header_category"), catLabel("customer"), byCategory.customer]);
  rows.push([t("csv_header_category"), catLabel("lead"), byCategory.lead]);
  rows.push([t("csv_header_category"), catLabel("lost"), byCategory.lost]);
  tags.forEach((tg) => rows.push([t("csv_header_tag"), tg.name, counts[tg.id] || 0]));
  downloadCSV(rows, "crm-summary-report");
}

async function exportActivityCSV() {
  const from = document.getElementById("report-from").value;
  const to = document.getElementById("report-to").value;
  const { entries } = reportActivityData(from, to);
  const rows = [[t("csv_header_date"), t("csv_header_contact"), t("csv_header_activity")]];
  entries.forEach((e) => rows.push([fmtDate(e.date), e.contactName, e.text]));
  downloadCSV(rows, "crm-activity-report");
}

async function exportTagsCSV() {
  const breakdown = await reportTagBreakdown();
  const rows = [[t("csv_header_tag"), t("csv_header_contact"), t("csv_header_category")]];
  breakdown.forEach((tg) => {
    if (tg.contacts.length === 0) { rows.push([tg.name, "", ""]); return; }
    tg.contacts.forEach((c) => rows.push([tg.name, fullName(c), catLabel(c.category)]));
  });
  downloadCSV(rows, "crm-tags-report");
}

// ---------------- PDF export ----------------
// jsPDF's built-in fonts only cover Latin script and have no Arabic
// shaping/bidi support, so PDF report CONTENT is always rendered in
// English regardless of the active UI language or the language of the
// underlying data (see pdf_english_note, shown next to every PDF button).
// CSV export is the fully Arabic-capable path.
function pdfDoc() {
  const { jsPDF } = window.jspdf;
  return new jsPDF({ unit: "pt", format: "a4" });
}

function pdfPageHeader(doc, title) {
  const marginX = 48;
  let y = 56;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(17, 95, 69);
  doc.text("Cyberomeda CRM", marginX, y);
  y += 20;
  doc.setFontSize(13);
  doc.text(title, marginX, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 108, 120);
  doc.text(`Generated ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`, marginX, y);
  return y + 22;
}

function pdfTable(doc, marginX, y, pageWidth, headers, rows, colWidths) {
  doc.setFillColor(17, 95, 69);
  doc.rect(marginX, y, pageWidth, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  let x = marginX + 6;
  headers.forEach((h, i) => { doc.text(String(h), x, y + 14); x += colWidths[i]; });
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 24, 33);
  rows.forEach((row, idx) => {
    if (y > 760) { doc.addPage(); y = 40; }
    const rowH = 18;
    if (idx % 2 === 1) {
      doc.setFillColor(246, 247, 250);
      doc.rect(marginX, y, pageWidth, rowH, "F");
    }
    let cx = marginX + 6;
    row.forEach((cell, i) => {
      doc.text(String(cell == null ? "" : cell), cx, y + 13, { maxWidth: colWidths[i] - 8 });
      cx += colWidths[i];
    });
    y += rowH;
  });
  return y;
}

function sharePDFOrSave(doc, filename) {
  if (navigator.canShare && navigator.share) {
    try {
      const blob = doc.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: filename }).then(() => true).catch(() => false);
      }
    } catch (_) { /* fall through to direct save */ }
  }
  doc.save(filename);
  return Promise.resolve(true);
}

async function exportSummaryPDF() {
  const { total, byCategory } = reportSummaryData();
  const tags = await Tags.getAll();
  const counts = await Tags.countsById();
  const doc = pdfDoc();
  let y = pdfPageHeader(doc, "Client Summary Report");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 24, 33);
  doc.text(`Total contacts: ${total}`, 48, y);
  y += 22;

  const catRows = [["Customer", String(byCategory.customer)], ["Lead", String(byCategory.lead)], ["Lost", String(byCategory.lost)]];
  y = pdfTable(doc, 48, y, 499, ["Category", "Count"], catRows, [400, 99]);
  y += 24;

  const tagRows = tags.map((tg) => [tg.name, String(counts[tg.id] || 0)]);
  if (tagRows.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("By tag", 48, y);
    y += 10;
    pdfTable(doc, 48, y, 499, ["Tag", "Count"], tagRows, [400, 99]);
  }

  await sharePDFOrSave(doc, `crm-summary-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  showToast(t("toast_pdf_downloaded"));
}

async function exportActivityPDF() {
  const from = document.getElementById("report-from").value;
  const to = document.getElementById("report-to").value;
  const { addedContacts, entries } = reportActivityData(from, to);
  const doc = pdfDoc();
  let y = pdfPageHeader(doc, `Activity Report (${from || "\u2026"} to ${to || "\u2026"})`);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 24, 33);
  doc.text(`Contacts added: ${addedContacts.length}    Activity entries: ${entries.length}`, 48, y);
  y += 20;

  const rows = entries.slice(0, 500).map((e) => [
    new Date(e.date).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }),
    e.contactName,
    e.text,
  ]);
  pdfTable(doc, 48, y, 499, ["Date", "Contact", "Activity"], rows, [90, 150, 259]);

  await sharePDFOrSave(doc, `crm-activity-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  showToast(t("toast_pdf_downloaded"));
}

async function exportTagsPDF() {
  const breakdown = await reportTagBreakdown();
  const doc = pdfDoc();
  let y = pdfPageHeader(doc, "Tag Breakdown Report");
  const rows = [];
  breakdown.forEach((tg) => {
    if (tg.contacts.length === 0) { rows.push([tg.name, "\u2014", ""]); return; }
    tg.contacts.forEach((c) => rows.push([tg.name, fullName(c), c.category]));
  });
  pdfTable(doc, 48, y, 499, ["Tag", "Contact", "Category"], rows, [150, 200, 149]);

  await sharePDFOrSave(doc, `crm-tags-report-${new Date().toISOString().slice(0, 10)}.pdf`);
  showToast(t("toast_pdf_downloaded"));
}
