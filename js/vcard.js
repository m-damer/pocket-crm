// ---------------- vCard export ----------------
function vcardEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

// Field keys used by the shared field picker (QR generation + bulk share).
// Name/nickname are always included, like an identity — everything else is
// optional and gated behind `includeKeys`. Pass no `includeKeys` (or null)
// to keep the original full-export behavior. Labels are resolved live via
// shareFieldMeta() so they follow the active language.
const SHARE_FIELD_ALL_KEYS = ["company", "phones", "emails", "addresses", "websites", "birthday", "notes"];
function shareFieldMeta() {
  return {
    company: t("field_meta_company"),
    phones: t("field_phones"),
    emails: t("field_emails"),
    addresses: t("field_addresses"),
    websites: t("field_websites"),
    birthday: t("field_birthday"),
    notes: t("field_meta_notes"),
  };
}

function contactToVCard(c, includeKeys) {
  const include = (key) => !includeKeys || includeKeys.includes(key);
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  lines.push(`N:${vcardEscape(c.lastName)};${vcardEscape(c.firstName)};;;`);
  lines.push(`FN:${vcardEscape(fullName(c))}`);
  if (c.nickname) lines.push(`NICKNAME:${vcardEscape(c.nickname)}`);
  if (include("company")) {
    if (c.jobTitle) lines.push(`TITLE:${vcardEscape(c.jobTitle)}`);
    if (c.company) lines.push(`ORG:${vcardEscape(c.company)}`);
  }
  if (include("phones")) {
    (c.phones || []).forEach((p) => {
      const type = p.label === "mobile" ? "CELL" : (p.label || "OTHER").toUpperCase();
      lines.push(`TEL;TYPE=${type}:${vcardEscape(p.value)}`);
    });
  }
  if (include("emails")) {
    (c.emails || []).forEach((e) => {
      lines.push(`EMAIL;TYPE=${(e.label || "OTHER").toUpperCase()}:${vcardEscape(e.value)}`);
    });
  }
  if (include("addresses")) {
    (c.addresses || []).forEach((a) => {
      lines.push(`ADR;TYPE=${(a.label || "OTHER").toUpperCase()}:;;${vcardEscape(a.value)};;;;`);
      if (a.mapsLink) lines.push(`URL;TYPE=${(a.label || "OTHER").toUpperCase()}-MAP:${vcardEscape(a.mapsLink)}`);
    });
  }
  if (include("websites")) {
    (c.websites || []).forEach((w) => {
      lines.push(`URL;TYPE=${(w.label || "OTHER").toUpperCase()}:${vcardEscape(w.value)}`);
    });
  }
  if (include("birthday") && c.birthday) lines.push(`BDAY:${c.birthday.replace(/-/g, "")}`);
  if (include("notes")) {
    (c.notesList || []).filter((n) => n.kind === "note" && n.text).forEach((n) => {
      lines.push(`NOTE:${vcardEscape(n.title ? `${n.title}: ${n.text}` : n.text)}`);
    });
  }
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
  showToast(t("toast_saved_open_to_add"));
}

async function exportAllVCards() {
  const all = await DB.getAll();
  if (all.length === 0) { showToast(t("toast_no_contacts_to_export")); return; }
  const vcard = all.map(contactToVCard).join("\r\n");
  downloadFile(vcard, `crm-contacts-${new Date().toISOString().slice(0, 10)}.vcf`, "text/vcard");
  showToast(t("toast_vcard_downloaded"));
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
    } else if (key === "NICKNAME") {
      current.nickname = vcardUnescape(value.split(",")[0]);
    } else if (key === "TITLE") {
      current.jobTitle = vcardUnescape(value);
    } else if (key === "ORG") {
      current.company = vcardUnescape(value.split(";")[0]);
    } else if (key === "BDAY") {
      const digits = value.replace(/[^\d]/g, "");
      if (digits.length === 8) current.birthday = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    } else if (key === "TEL") {
      current.phones = current.phones || [];
      current.phones.push({ label: vcardTypeToLabel(rawKey), value: vcardUnescape(value) });
    } else if (key === "EMAIL") {
      current.emails = current.emails || [];
      current.emails.push({ label: vcardTypeToLabel(rawKey), value: vcardUnescape(value) });
    } else if (key === "ADR") {
      const parts = value.split(";").map(vcardUnescape).filter(Boolean);
      current.addresses = current.addresses || [];
      current.addresses.push({ label: vcardTypeToLabel(rawKey), value: parts.join(", "), mapsLink: "" });
    } else if (key === "URL") {
      if (/-MAP$/i.test(rawKey) && current.addresses && current.addresses.length) {
        current.addresses[current.addresses.length - 1].mapsLink = vcardUnescape(value);
      } else {
        current.websites = current.websites || [];
        current.websites.push({ label: "other", value: vcardUnescape(value) });
      }
    } else if (key === "NOTE") {
      current.notesList = current.notesList || [];
      const now = new Date().toISOString();
      current.notesList.push({
        id: uid("n"), kind: "note", title: "", text: vcardUnescape(value),
        callMedia: "", audioDataUrl: "", audioDurationSec: 0,
        createdAt: now, updatedAt: now,
      });
    }
  }
  return cards.filter((c) => c.firstName || c.lastName || c.company);
}

function vcardTypeToLabel(rawKey) {
  const m = /TYPE=([^;:]+)/i.exec(rawKey);
  const t2 = (m ? m[1] : "").toUpperCase();
  if (t2.includes("CELL")) return "mobile";
  if (t2.includes("HOME")) return "home";
  if (t2.includes("WORK")) return "work";
  return "other";
}

async function importVCardFile(file) {
  const text = await file.text();
  const parsed = parseVCards(text);
  if (parsed.length === 0) {
    showToast(t("toast_no_contacts_in_file"));
    return;
  }
  for (const p of parsed) {
    await DB.add({ ...p, category: "lead" });
  }
  await Contacts.refresh();
  showToast(I18N.plural(parsed.length, "toast_imported_contacts", "toast_imported_contacts_plural"));
}

// ---------------- Native Contact Picker (Android Chrome) ----------------
function contactPickerSupported() {
  return "contacts" in navigator && "ContactsManager" in window;
}

async function importFromPhoneContacts() {
  if (!contactPickerSupported()) {
    showToast(t("toast_no_contact_picker"));
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
        phones: (p.tel || []).map((v) => ({ label: "mobile", value: v })),
        emails: (p.email || []).map((v) => ({ label: "other", value: v })),
        category: "lead",
      });
      count++;
    }
    await Contacts.refresh();
    showToast(I18N.plural(count, "toast_imported_from_phone", "toast_imported_from_phone_plural"));
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
    showToast(t("toast_invalid_backup"));
    return;
  }
  if (!data || typeof data !== "object") {
    showToast(t("toast_invalid_backup"));
    return;
  }
  const counts = await DB.importBackup(data);
  await Contacts.refresh();
  await Schedule.refresh();
  showToast(t("toast_restored", { contacts: counts.contacts, events: counts.events }));
}
