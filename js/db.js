// Simple promise-based IndexedDB wrapper.
// All business data lives on-device only — nothing is sent anywhere.
const DB_NAME = "crm-db";
const DB_VERSION = 1;
const STORE_CONTACTS = "contacts";

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
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

function uid() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function withStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONTACTS, mode);
    const store = tx.objectStore(STORE_CONTACTS);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

const DB = {
  async getAll() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONTACTS, "readonly");
      const req = tx.objectStore(STORE_CONTACTS).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) =>
        (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName)
      ));
      req.onerror = () => reject(req.error);
    });
  },

  async get(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_CONTACTS, "readonly").objectStore(STORE_CONTACTS).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async add(contact) {
    const now = new Date().toISOString();
    const record = {
      id: uid(),
      firstName: "",
      lastName: "",
      company: "",
      phone: "",
      email: "",
      address: "",
      category: "lead", // customer | lead | lost
      tags: [],
      notes: "",
      activities: [],
      createdAt: now,
      updatedAt: now,
      ...contact,
    };
    await withStore("readwrite", (store) => store.put(record));
    return record;
  },

  async update(id, patch) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Contact not found");
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    await withStore("readwrite", (store) => store.put(updated));
    return updated;
  },

  async remove(id) {
    await withStore("readwrite", (store) => store.delete(id));
  },

  async addActivity(id, activity) {
    const existing = await this.get(id);
    if (!existing) throw new Error("Contact not found");
    const activities = [
      { id: uid(), date: new Date().toISOString(), ...activity },
      ...(existing.activities || []),
    ];
    return this.update(id, { activities });
  },

  async exportJSON() {
    const all = await this.getAll();
    return JSON.stringify({ exportedAt: new Date().toISOString(), contacts: all }, null, 2);
  },
};
