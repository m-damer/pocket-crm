// ---------------- vCard export ----------------
function vcardEscape(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

// Field keys used by the shared field picker (QR generation + bulk share).
// Order here is the order they're offered in the picker AND the order
// fields appear in the "what's inside this QR" detail view — both just
// iterate this array, so reordering the export only ever means editing
// this one line. Nothing is unconditionally included anymore (not even
// the name) — pass no `includeKeys` (or null) to keep the original
// full-export behavior. Labels are resolved live via shareFieldMeta() so
// they follow the active language.
const SHARE_FIELD_ALL_KEYS = [
  "namePrefix", "firstName", "lastName", "jobTitle", "department", "company",
  "phones", "emails", "websites", "addresses", "customFields",
];
function shareFieldMeta() {
  return {
    namePrefix: t("field_name_prefix"),
    firstName: t("label_first_name"),
    lastName: t("label_last_name"),
    jobTitle: t("field_job_title"),
    department: t("field_department"),
    company: t("field_meta_company"),
    phones: t("field_phones"),
    emails: t("field_emails"),
    websites: t("field_websites"),
    addresses: t("field_addresses"),
    customFields: t("field_custom_fields"),
  };
}

function contactToVCard(c, includeKeys) {
  const include = (key) => !includeKeys || includeKeys.includes(key);
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];

  const prefix = include("namePrefix") ? (c.namePrefix || "") : "";
  const given = include("firstName") ? (c.firstName || "") : "";
  const family = include("lastName") ? (c.lastName || "") : "";
  lines.push(`N:${vcardEscape(family)};${vcardEscape(given)};;${vcardEscape(prefix)};`);
  const fn = [prefix, given, family].filter(Boolean).join(" ") || c.company || t("qr_code_fallback");
  lines.push(`FN:${vcardEscape(fn)}`);
  if (c.nickname) lines.push(`NICKNAME:${vcardEscape(c.nickname)}`);

  if (include("jobTitle") && c.jobTitle) lines.push(`TITLE:${vcardEscape(c.jobTitle)}`);
  const org = include("company") ? (c.company || "") : "";
  const dept = include("department") ? (c.department || "") : "";
  if (org || dept) lines.push(`ORG:${vcardEscape(org)};${vcardEscape(dept)}`);

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
  if (include("customFields")) {
    // X- properties are the standard way to carry non-standard data in a
    // vCard — any real contacts app that doesn't recognize them just
    // ignores them, so this is safe to include even for scanners outside
    // this app. LABEL param carries the field's own name; a stray `;` or
    // `:` in a user-typed label would break the parameter, so those are
    // stripped here specifically (vcardEscape alone isn't enough inside a
    // parameter, only inside a content value).
    (c.customFields || []).forEach((f) => {
      if (!f.label && !f.value) return;
      const safeLabel = String(f.label || t("field_custom_fields")).replace(/[;:]/g, " ");
      lines.push(`X-CUSTOM;LABEL=${safeLabel}:${vcardEscape(f.value)}`);
    });
  }
  if (!includeKeys) {
    // Full/legacy export (e.g. "Save to phone", "Export all") — keep
    // birthday and notes too, same as before this field picker existed.
    if (c.birthday) lines.push(`BDAY:${c.birthday.replace(/-/g, "")}`);
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
      current.namePrefix = current.namePrefix || parts[3] || "";
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
      const parts = value.split(";").map(vcardUnescape);
      current.company = parts[0] || "";
      current.department = parts[1] || "";
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
    } else if (key === "X-CUSTOM") {
      const m = /LABEL=([^;:]*)/i.exec(rawKey);
      current.customFields = current.customFields || [];
      current.customFields.push({ label: m ? m[1] : "", value: vcardUnescape(value) });
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

function dedupeBy(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// The phone's native contact picker commonly returns the SAME number or
// email more than once for a single contact — Android in particular often
// keeps several "raw" copies of one logical contact (synced from a Google
// account, the SIM card, WhatsApp, etc.) and the picker API hands back the
// union of all of them without de-duplicating. That's a platform quirk,
// not something this app's own code causes, but it's still this app's job
// to clean it up before saving.
function dedupePhoneValues(values) {
  return dedupeBy(values, (v) => String(v || "").replace(/[^\d+]/g, ""));
}
function dedupeEmailValues(values) {
  return dedupeBy(values, (v) => String(v || "").trim().toLowerCase());
}

// The Contact Picker API's address objects are structured (addressLine,
// city, region, country, ...), not a single string — this composes them
// into one readable line matching how this app stores addresses.
function formatPickerAddress(addr) {
  if (!addr) return "";
  const lines = Array.isArray(addr.addressLine) ? addr.addressLine : [];
  const parts = [...lines, addr.city, addr.region, addr.postalCode, addr.country].filter(Boolean);
  return parts.join(", ");
}

async function importFromPhoneContacts() {
  if (!contactPickerSupported()) {
    showToast(t("toast_no_contact_picker"));
    return;
  }
  try {
    // "address" is requested too now — the API supports it, it just wasn't
    // being asked for before. Support for it varies by device/browser, so
    // p.address may still come back empty or undefined on some phones;
    // that's a platform limitation, handled gracefully below rather than
    // treated as an error.
    const picked = await navigator.contacts.select(["name", "tel", "email", "address"], { multiple: true });
    if (!picked || picked.length === 0) return;
    let count = 0;
    for (const p of picked) {
      const full = ((p.name && p.name[0]) || "").trim();
      const sp = full.indexOf(" ");
      const firstName = sp === -1 ? full : full.slice(0, sp);
      const lastName = sp === -1 ? "" : full.slice(sp + 1);
      const addresses = dedupeBy(
        (p.address || []).map((a) => formatPickerAddress(a)).filter(Boolean),
        (v) => v.trim().toLowerCase()
      ).map((value) => ({ label: "other", value, mapsLink: "" }));
      await DB.add({
        firstName,
        lastName,
        phones: dedupePhoneValues(p.tel || []).map((v) => ({ label: "mobile", value: v })),
        emails: dedupeEmailValues(p.email || []).map((v) => ({ label: "other", value: v })),
        addresses,
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
