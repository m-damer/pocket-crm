// Simple promise-based IndexedDB wrapper.
// All business data lives on-device only — nothing is sent anywhere.
const DB_NAME = "crm-db";
const DB_VERSION = 4;
const STORE_CONTACTS = "contacts";
const STORE_EVENTS = "events";
const STORE_INVOICES = "invoices";
const STORE_SETTINGS = "settings";
const STORE_DOCS = "documents";

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
        const store = db.createObjectStore(STORE_CONTACTS, { keyPath: "id" });
        store.createIndex("category", "category", { unique: false });
        store.createIndex("name", "lastName", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_EVENTS)) {
        const store = db.createObjectStore(STORE_EVENTS, { keyPath: "id" });
        store.createIndex("when", "when", { unique: false });
        store.createIndex("contactId", "contactId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_INVOICES)) {
        const store = db.createObjectStore(STORE_INVOICES, { keyPath: "id" });
        store.createIndex("contactId", "contactId", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_DOCS)) {
        const store = db.createObjectStore(STORE_DOCS, { keyPath: "id" });
        store.createIndex("contactId", "contactId", { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function uid(prefix = "c") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const TAG_COLOR_PALETTE = ["#1F3D71", "#009BDE", "#1F8A5F", "#C97C1F", "#B3261E", "#8A93A3", "#6B4FA0", "#0E7C86", "#C2185B", "#5D4037"];
const CATEGORY_LABELS = { customer: "Customer", lead: "Lead", lost: "Lost" };

// Builds a short human-readable activity description for a note event.
function describeNoteActivity(entry, action) {
  const kindLabel = entry.kind === "call"
    ? (entry.callMedia === "voice" ? "Call note (voice)" : "Call note")
    : "Note";
  const title = entry.title ? ` "${entry.title}"` : "";
  return `${kindLabel}${title} ${action}`;
}

// Upgrades an old-shape contact (flat phone/email/address strings) to the
// new multi-value shape, in place on read. Persists the upgrade once so it
// only has to run a single time per contact.
function needsContactMigration(c) {
  return c.phones === undefined || c.emails === undefined || c.addresses === undefined ||
    c.websites === undefined || c.customFields === undefined || c.notesList === undefined;
}

function migrateContactShape(c) {
  if (!needsContactMigration(c)) return c;
  const migrated = { ...c };
  if (migrated.phones === undefined) {
    migrated.phones = c.phone ? [{ id: uid("p"), label: "mobile", value: c.phone }] : [];
  }
  if (migrated.emails === undefined) {
    migrated.emails = c.email ? [{ id: uid("e"), label: "other", value: c.email }] : [];
  }
  if (migrated.addresses === undefined) {
    migrated.addresses = c.address ? [{ id: uid("a"), label: "other", value: c.address, mapsLink: "" }] : [];
  }
  if (migrated.websites === undefined) {
    // Older builds stored a single `website` string — carry it over as the
    // first entry of the new multi-value list, then drop the old field.
    migrated.websites = c.website ? [{ id: uid("w"), label: "other", value: c.website }] : [];
  }
  if (migrated.customFields === undefined) migrated.customFields = [];
  if (migrated.notesList === undefined) {
    // Older builds stored one free-text `notes` string — carry it over as
    // the first entry of the new multi-note list, then drop the old field.
    const now = new Date().toISOString();
    migrated.notesList = c.notes ? [{
      id: uid("n"), kind: "note", title: "", text: c.notes,
      callMedia: "", audioDataUrl: "", audioDurationSec: 0,
      createdAt: c.createdAt || now, updatedAt: c.updatedAt || now,
    }] : [];
  }
  if (migrated.nickname === undefined) migrated.nickname = "";
  if (migrated.jobTitle === undefined) migrated.jobTitle = "";
  if (migrated.birthday === undefined) migrated.birthday = "";
  if (migrated.photoDataUrl === undefined) migrated.photoDataUrl = "";
  delete migrated.phone;
  delete migrated.email;
  delete migrated.address;
  delete migrated.website;
  delete migrated.notes;
  return migrated;
}

async function withStore(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllFromStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// One-time upgrade: older builds stored tags as free-typed strings directly
// on the contact (c.tags = ["VIP", "Damascus"]). This creates a proper global
// tag (with an id + color) for every unique name ever typed, then rewrites
// every contact to reference tags by id instead. Runs once per install,
// gated by settings.tagsMigrated, and cached in memory so repeat calls in
// the same session are free.
let _tagsMigrationChecked = false;
async function ensureTagsMigrated() {
  if (_tagsMigrationChecked) return;
  const settings = await Settings.get();
  if (settings.tagsMigrated) {
    _tagsMigrationChecked = true;
    return;
  }

  const raw = await getAllFromStore(STORE_CONTACTS);
  const tags = (settings.tags || []).slice();
  const nameToId = new Map(tags.map((t) => [t.name.trim().toLowerCase(), t.id]));

  for (const c of raw) {
    const oldTags = Array.isArray(c.tags) ? c.tags : [];
    if (oldTags.length === 0) continue;
    const newTagIds = [];
    for (const rawName of oldTags) {
      const name = String(rawName || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      let id = nameToId.get(key);
      if (!id) {
        id = uid("t");
        tags.push({ id, name, color: TAG_COLOR_PALETTE[tags.length % TAG_COLOR_PALETTE.length] });
        nameToId.set(key, id);
      }
      if (!newTagIds.includes(id)) newTagIds.push(id);
    }
    await withStore(STORE_CONTACTS, "readwrite", (store) => store.put({ ...c, tags: newTagIds }));
  }

  await Settings.update({ tags, tagsMigrated: true });
  _tagsMigrationChecked = true;
}

const DB = {
  async getAll() {
    await ensureTagsMigrated();
    const db = await openDB();
    const raw = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONTACTS, "readonly");
      const req = tx.objectStore(STORE_CONTACTS).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const toPersist = raw.filter(needsContactMigration);
    const migrated = raw.map(migrateContactShape);
    for (const c of toPersist) {
      await withStore(STORE_CONTACTS, "readwrite", (store) => store.put(migrateContactShape(c)));
    }
    return migrated.sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName));
  },

  async get(id) {
    await ensureTagsMigrated();
    const db = await openDB();
    const raw = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE_CONTACTS, "readonly").objectStore(STORE_CONTACTS).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!raw) return raw;
    if (needsContactMigration(raw)) {
      const migrated = migrateContactShape(raw);
      await withStore(STORE_CONTACTS, "readwrite", (store) => store.put(migrated));
      return migrated;
    }
    return raw;
  },

  async add(contact) {
    const now = new Date().toISOString();
    const record = {
      id: uid("c"),
      photoDataUrl: "",
      firstName: "",
      lastName: "",
      nickname: "",
      company: "",
      jobTitle: "",
      phones: [], // {id, label: mobile|home|work|other, value}
      emails: [], // {id, label, value}
      addresses: [], // {id, label, value, mapsLink}
      websites: [], // {id, label: personal|work|portfolio|other, value}
      customFields: [], // {id, label, value} — user-defined
      birthday: "", // YYYY-MM-DD
      category: "lead", // customer | lead | lost
      tags: [],
      notesList: [], // {id, kind: note|call, title, text, callMedia, audioDataUrl, audioDurationSec, createdAt, updatedAt}
      activities: [{ id: uid("a"), date: now, type: "contact_created", text: "Contact added" }],
      createdAt: now,
      updatedAt: now,
      ...contact,
    };
    await withStore(STORE_CONTACTS, "readwrite", (store) => store.put(record));
    return record;
  },

  async update(id, patch) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Contact not found");
    let finalPatch = patch;
    // Auto-log a category change, unless the caller already supplied its own
    // `activities` patch (e.g. ContactNotes, which logs note-specific events).
    if (patch.category !== undefined && patch.category !== existing.category && patch.activities === undefined) {
      const now = new Date().toISOString();
      finalPatch = {
        ...patch,
        activities: [
          { id: uid("a"), date: now, type: "category_changed", text: `Category changed to ${CATEGORY_LABELS[patch.category] || patch.category}` },
          ...(existing.activities || []),
        ],
      };
    }
    const updated = { ...existing, ...finalPatch, updatedAt: new Date().toISOString() };
    await withStore(STORE_CONTACTS, "readwrite", (store) => store.put(updated));
    return updated;
  },

  async remove(id) {
    await withStore(STORE_CONTACTS, "readwrite", (store) => store.delete(id));
  },

  async addActivity(id, activity) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Contact not found");
    const activities = [
      { id: uid("a"), date: new Date().toISOString(), ...activity },
      ...(existing.activities || []),
    ];
    return this.update(id, { activities });
  },

  async exportJSON() {
    const contacts = await this.getAll();
    const events = await Events.getAll();
    const invoices = await Invoices.getAll();
    const settings = await Settings.get();
    const documents = await getAllFromStore(STORE_DOCS);
    return JSON.stringify({ exportedAt: new Date().toISOString(), contacts, events, invoices, documents, settings }, null, 2);
  },

  async importBackup(data) {
    const counts = { contacts: 0, events: 0, invoices: 0, documents: 0 };
    for (const c of data.contacts || []) {
      await withStore(STORE_CONTACTS, "readwrite", (store) => store.put(c));
      counts.contacts++;
    }
    for (const e of data.events || []) {
      await withStore(STORE_EVENTS, "readwrite", (store) => store.put(e));
      counts.events++;
    }
    for (const i of data.invoices || []) {
      await withStore(STORE_INVOICES, "readwrite", (store) => store.put(i));
      counts.invoices++;
    }
    for (const d of data.documents || []) {
      await withStore(STORE_DOCS, "readwrite", (store) => store.put(d));
      counts.documents++;
    }
    if (data.settings && typeof data.settings === "object") {
      await Settings.update(data.settings);
    }
    return counts;
  },
};

// ---------------- Events (Schedule: tasks & meetings) ----------------
const Events = {
  async getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_EVENTS, "readonly").objectStore(STORE_EVENTS).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => a.when.localeCompare(b.when)));
      req.onerror = () => reject(req.error);
    });
  },

  async get(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_EVENTS, "readonly").objectStore(STORE_EVENTS).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async add(event) {
    const now = new Date().toISOString();
    const record = {
      id: uid("e"),
      type: "task", // task | meeting
      title: "",
      when: now, // ISO datetime of the event
      contactId: null,
      remind: false,
      notified: false,
      completed: false,
      notes: "",
      createdAt: now,
      updatedAt: now,
      ...event,
    };
    await withStore(STORE_EVENTS, "readwrite", (store) => store.put(record));
    return record;
  },

  async update(id, patch) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Event not found");
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await withStore(STORE_EVENTS, "readwrite", (store) => store.put(updated));
    return updated;
  },

  async remove(id) {
    await withStore(STORE_EVENTS, "readwrite", (store) => store.delete(id));
  },

  async forContact(contactId) {
    const all = await this.getAll();
    return all.filter((e) => e.contactId === contactId);
  },
};

// ---------------- Invoices & Proposals ----------------
const Invoices = {
  async getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_INVOICES, "readonly").objectStore(STORE_INVOICES).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.issueDate.localeCompare(a.issueDate)));
      req.onerror = () => reject(req.error);
    });
  },

  async get(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_INVOICES, "readonly").objectStore(STORE_INVOICES).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async nextNumber(type) {
    const key = type === "proposal" ? "proposalCounter" : "invoiceCounter";
    const settings = await Settings.get();
    const next = (settings[key] || 0) + 1;
    await Settings.update({ [key]: next });
    const prefix = type === "proposal" ? "PRO" : "INV";
    return `${prefix}-${String(next).padStart(4, "0")}`;
  },

  async add(invoice) {
    const now = new Date().toISOString();
    const number = invoice.number || (await this.nextNumber(invoice.type || "invoice"));
    const record = {
      id: uid("i"),
      type: "invoice", // invoice | proposal
      number,
      contactId: null,
      issueDate: now.slice(0, 10),
      dueDate: "",
      currency: "USD",
      items: [], // {id, description, qty, unitPrice}
      notes: "",
      status: "draft", // draft | sent | paid (invoice) / draft | sent | accepted (proposal)
      createdAt: now,
      updatedAt: now,
      ...invoice,
      number,
    };
    await withStore(STORE_INVOICES, "readwrite", (store) => store.put(record));
    return record;
  },

  async update(id, patch) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Invoice not found");
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await withStore(STORE_INVOICES, "readwrite", (store) => store.put(updated));
    return updated;
  },

  async remove(id) {
    await withStore(STORE_INVOICES, "readwrite", (store) => store.delete(id));
  },

  total(invoice) {
    return (invoice.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  },
};

// ---------------- Settings (business profile + counters) ----------------
const DEFAULT_CONTACT_FIELD_CONFIG = [
  { key: "nickname", visible: true },
  { key: "companyJobTitle", visible: true },
  { key: "phones", visible: true },
  { key: "emails", visible: true },
  { key: "addresses", visible: true },
  { key: "websites", visible: true },
  { key: "birthday", visible: true },
  { key: "customFields", visible: true },
];

const Settings = {
  async get() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_SETTINGS, "readonly").objectStore(STORE_SETTINGS).get("business");
      req.onsuccess = () => {
        const value = req.result ? req.result.value : {};
        resolve({
          businessName: "", address: "", phone: "", email: "",
          currency: "USD", logoDataUrl: "", invoiceCounter: 0, proposalCounter: 0,
          contactFieldConfig: DEFAULT_CONTACT_FIELD_CONFIG,
          tags: [], // {id, name, color}
          tagsMigrated: false,
          qrCodes: [], // {id, label, vcardText, createdAt}
          ...value,
        });
      };
      req.onerror = () => reject(req.error);
    });
  },

  async update(patch) {
    const current = await this.get();
    const updated = { ...current, ...patch };
    await withStore(STORE_SETTINGS, "readwrite", (store) => store.put({ key: "business", value: updated }));
    return updated;
  },
};

// ---------------- Tags (global registry, referenced by id from contacts) ----------------
const Tags = {
  async getAll() {
    await ensureTagsMigrated();
    const s = await Settings.get();
    return s.tags || [];
  },

  async add(name, color) {
    await ensureTagsMigrated();
    const s = await Settings.get();
    const tags = (s.tags || []).slice();
    const tag = {
      id: uid("t"),
      name: String(name || "").trim(),
      color: color || TAG_COLOR_PALETTE[tags.length % TAG_COLOR_PALETTE.length],
    };
    tags.push(tag);
    await Settings.update({ tags });
    return tag;
  },

  async update(id, patch) {
    await ensureTagsMigrated();
    const s = await Settings.get();
    const tags = (s.tags || []).map((t) => (t.id === id ? { ...t, ...patch } : t));
    await Settings.update({ tags });
  },

  // Deletes the tag and removes it from every contact that had it.
  async remove(id) {
    await ensureTagsMigrated();
    const s = await Settings.get();
    const tags = (s.tags || []).filter((t) => t.id !== id);
    await Settings.update({ tags });
    const all = await getAllFromStore(STORE_CONTACTS);
    for (const c of all) {
      if (Array.isArray(c.tags) && c.tags.includes(id)) {
        await withStore(STORE_CONTACTS, "readwrite", (store) =>
          store.put({ ...c, tags: c.tags.filter((tid) => tid !== id) })
        );
      }
    }
  },

  // { [tagId]: numberOfContacts }
  async countsById() {
    await ensureTagsMigrated();
    const all = await getAllFromStore(STORE_CONTACTS);
    const counts = {};
    all.forEach((c) => (Array.isArray(c.tags) ? c.tags : []).forEach((tid) => {
      counts[tid] = (counts[tid] || 0) + 1;
    }));
    return counts;
  },
};

// ---------------- QR codes (saved, shareable contact-card codes) ----------------
const QRCodes = {
  async getAll() {
    const s = await Settings.get();
    return s.qrCodes || [];
  },

  async add(record) {
    const s = await Settings.get();
    const qrCodes = (s.qrCodes || []).slice();
    const entry = {
      id: uid("q"), label: "", vcardText: "",
      createdAt: new Date().toISOString(),
      ...record,
    };
    qrCodes.unshift(entry);
    await Settings.update({ qrCodes });
    return entry;
  },

  async remove(id) {
    const s = await Settings.get();
    const qrCodes = (s.qrCodes || []).filter((q) => q.id !== id);
    await Settings.update({ qrCodes });
  },
};

// ---------------- Contact notes (multiple, per contact) ----------------
const ContactNotes = {
  // note: { kind: "note"|"call", title, text, callMedia: ""|"text"|"voice", audioDataUrl, audioDurationSec }
  async add(contactId, note) {
    const c = await DB.get(contactId);
    if (!c) throw new Error("Contact not found");
    const now = new Date().toISOString();
    const entry = {
      id: uid("n"), kind: "note", title: "", text: "",
      callMedia: "", audioDataUrl: "", audioDurationSec: 0,
      createdAt: now, updatedAt: now,
      ...note,
    };
    const notesList = [entry, ...(c.notesList || [])];
    const activities = [
      { id: uid("a"), date: now, type: entry.kind === "call" ? "call_note_added" : "note_added", text: describeNoteActivity(entry, "added") },
      ...(c.activities || []),
    ];
    await DB.update(contactId, { notesList, activities });
    return entry;
  },

  async update(contactId, noteId, patch) {
    const c = await DB.get(contactId);
    if (!c) throw new Error("Contact not found");
    const now = new Date().toISOString();
    let updatedEntry = null;
    const notesList = (c.notesList || []).map((n) => {
      if (n.id !== noteId) return n;
      updatedEntry = { ...n, ...patch, updatedAt: now };
      return updatedEntry;
    });
    if (!updatedEntry) return;
    const activities = [
      { id: uid("a"), date: now, type: updatedEntry.kind === "call" ? "call_note_edited" : "note_edited", text: describeNoteActivity(updatedEntry, "edited") },
      ...(c.activities || []),
    ];
    await DB.update(contactId, { notesList, activities });
  },

  async remove(contactId, noteId) {
    const c = await DB.get(contactId);
    if (!c) throw new Error("Contact not found");
    const removed = (c.notesList || []).find((n) => n.id === noteId);
    if (!removed) return;
    const notesList = (c.notesList || []).filter((n) => n.id !== noteId);
    const now = new Date().toISOString();
    const activities = [
      { id: uid("a"), date: now, type: removed.kind === "call" ? "call_note_deleted" : "note_deleted", text: describeNoteActivity(removed, "deleted") },
      ...(c.activities || []),
    ];
    await DB.update(contactId, { notesList, activities });
  },
};

// ---------------- Documents (per-contact attachments) ----------------
const Documents = {
  async forContact(contactId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const idx = db.transaction(STORE_DOCS, "readonly").objectStore(STORE_DOCS).index("contactId");
      const req = idx.getAll(contactId);
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      req.onerror = () => reject(req.error);
    });
  },

  async add(doc) {
    const now = new Date().toISOString();
    const record = { id: uid("d"), contactId: null, name: "", type: "", size: 0, dataUrl: "", createdAt: now, ...doc };
    await withStore(STORE_DOCS, "readwrite", (store) => store.put(record));
    return record;
  },

  async remove(id) {
    await withStore(STORE_DOCS, "readwrite", (store) => store.delete(id));
  },
};
