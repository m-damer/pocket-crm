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

// Upgrades an old-shape contact (flat phone/email/address strings) to the
// new multi-value shape, in place on read. Persists the upgrade once so it
// only has to run a single time per contact.
function needsContactMigration(c) {
  return c.phones === undefined || c.emails === undefined || c.addresses === undefined ||
    c.websites === undefined || c.customFields === undefined;
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
  if (migrated.nickname === undefined) migrated.nickname = "";
  if (migrated.jobTitle === undefined) migrated.jobTitle = "";
  if (migrated.birthday === undefined) migrated.birthday = "";
  if (migrated.photoDataUrl === undefined) migrated.photoDataUrl = "";
  delete migrated.phone;
  delete migrated.email;
  delete migrated.address;
  delete migrated.website;
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

const DB = {
  async getAll() {
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
      notes: "",
      activities: [],
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
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
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
