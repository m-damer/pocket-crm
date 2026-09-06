// ---------------- vCard export ----------------
function vcardEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

function contactToVCard(c) {
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`N:${vcardEscape(c.lastName)};${vcardEscape(c.firstName)};;;`);
  lines.push(`FN:${vcardEscape(fullName(c))}`);
  if (c.company) lines.push(`ORG:${vcardEscape(c.company)}`);
  if (c.phone) lines.push(`TEL;TYPE=CELL:${vcardEscape(c.phone)}`);
  if (c.email) lines.push(`EMAIL:${vcardEscape(c.email)}`);
  if (c.address) lines.push(`ADR;TYPE=HOME:;;${vcardEscape(c.address)};;;;`);
  if (c.notes) lines.push(`NOTE:${vcardEscape(c.notes)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function saveContactToPhone(contactId) {
  const c = await DB.get(contactId);
  if (!c) return;
  const vcard = contactToVCard(c);
  const filename = `${fullName(c).replace(/[^\w\- ]/g, "").trim() || "contact"}.vcf`;

  if (navigator.canShare && navigator.share) {
    try {
      const file = new File([vcard], filename, { type: "text/vcard" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (_) { /* fall through to download */ }
  }
  downloadFile(vcard, filename, "text/vcard");
  showToast("Contact file downloaded — open it to add to your phone");
}

async function exportAllVCards() {
  const all = await DB.getAll();
  if (all.length === 0) { showToast("No contacts to export"); return; }
  const vcard = all.map(contactToVCard).join("\r\n");
  downloadFile(vcard, `crm-contacts-${new Date().toISOString().slice(0, 10)}.vcf`, "text/vcard");
  showToast("vCard file downloaded");
}

// ---------------- vCard import ----------------
function unfoldVCardLines(text) {
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines = [];
  for (const line of rawLines) {
    if (/^[ \t]/.test(line) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function vcardUnescape(s) {
  return String(s || "").replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseVCards(text) {
  const lines = unfoldVCardLines(text);
  const cards = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^BEGIN:VCARD/i.test(trimmed)) { current = {}; continue; }
    if (/^END:VCARD/i.test(trimmed)) { if (current) cards.push(current); current = null; continue; }
    if (!current) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const rawKey = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    const key = rawKey.split(";")[0].toUpperCase();

    if (key === "N") {
      const parts = value.split(";").map(vcardUnescape);
      current.lastName = current.lastName || parts[0] || "";
      current.firstName = current.firstName || parts[1] || "";
    } else if (key === "FN" && !current.firstName && !current.lastName) {
      const full = vcardUnescape(value).trim();
      const sp = full.indexOf(" ");
      current.firstName = sp === -1 ? full : full.slice(0, sp);
      current.lastName = sp === -1 ? "" : full.slice(sp + 1);
    } else if (key === "ORG") {
      current.company = vcardUnescape(value.split(";")[0]);
    } else if (key === "TEL") {
      if (!current.phone) current.phone = vcardUnescape(value);
    } else if (key === "EMAIL") {
      if (!current.email) current.email = vcardUnescape(value);
    } else if (key === "ADR") {
      const parts = value.split(";").map(vcardUnescape).filter(Boolean);
      if (!current.address) current.address = parts.join(", ");
    } else if (key === "NOTE") {
      current.notes = vcardUnescape(value);
    }
  }
  return cards.filter((c) => c.firstName || c.lastName || c.company);
}

async function importVCardFile(file) {
  const text = await file.text();
  const parsed = parseVCards(text);
  if (parsed.length === 0) {
    showToast("No contacts found in that file");
    return;
  }
  for (const p of parsed) {
    await DB.add({ ...p, category: "lead" });
  }
  await Contacts.refresh();
  showToast(`Imported ${parsed.length} contact${parsed.length === 1 ? "" : "s"}`);
}

// ---------------- Native Contact Picker (Android Chrome) ----------------
function contactPickerSupported() {
  return "contacts" in navigator && "ContactsManager" in window;
}

async function importFromPhoneContacts() {
  if (!contactPickerSupported()) {
    showToast("Your browser doesn't support the contact picker");
    return;
  }
  try {
    const picked = await navigator.contacts.select(["name", "tel", "email"], { multiple: true });
    if (!picked || picked.length === 0) return;
    let count = 0;
    for (const p of picked) {
      const full = (p.name && p.name[0]) || "";
      const sp = full.indexOf(" ");
      const firstName = sp === -1 ? full : full.slice(0, sp);
      const lastName = sp === -1 ? "" : full.slice(sp + 1);
      await DB.add({
        firstName,
        lastName,
        phone: (p.tel && p.tel[0]) || "",
        email: (p.email && p.email[0]) || "",
        category: "lead",
      });
      count++;
    }
    await Contacts.refresh();
    showToast(`Imported ${count} contact${count === 1 ? "" : "s"} from your phone`);
  } catch (_) {
    // user cancelled the picker — nothing to do
  }
}

// ---------------- Full backup restore ----------------
async function importBackupFile(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch (_) {
    showToast("That doesn't look like a valid backup file");
    return;
  }
  if (!data || typeof data !== "object") {
    showToast("That doesn't look like a valid backup file");
    return;
  }
  const counts = await DB.importBackup(data);
  await Contacts.refresh();
  await Schedule.refresh();
  await InvoicesUI.refresh();
  await loadBusinessProfileForm();
  showToast(`Restored ${counts.contacts} contacts, ${counts.events} schedule items, ${counts.invoices} invoices`);
}
