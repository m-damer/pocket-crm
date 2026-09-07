function eventTypeLabel(type) {
  return type === "meeting" ? t("event_type_meeting") : t("event_type_task");
}
const EVENT_TYPE_META = {
  task: { color: "#6B5FB3", soft: "#EFEDFA" },
  meeting: { color: "#009BDE", soft: "#E5F5FC" },
};

function pad2(n) { return String(n).padStart(2, "0"); }

function toLocalInputParts(iso) {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

function combineLocal(dateStr, timeStr) {
  // Interpreted in the device's local timezone.
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = (timeStr || "09:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(today)) / 86400000);
  if (diffDays === 0) return t("day_today");
  if (diffDays === 1) return t("day_tomorrow");
  if (diffDays === -1) return t("day_yesterday");
  return d.toLocaleDateString(I18N.localeTag(), { weekday: "short", day: "numeric", month: "short" });
}

function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString(I18N.localeTag(), { hour: "2-digit", minute: "2-digit" });
}

const Schedule = {
  all: [],
  filter: "upcoming", // upcoming | today | completed | all
  currentId: null,
  reminderTimer: null,

  async load() {
    this.all = await Events.getAll();
  },

  visible() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 86400000;
    return this.all.filter((e) => {
      if (this.filter === "completed") return e.completed;
      if (e.completed && this.filter !== "all") return false;
      const t2 = new Date(e.when).getTime();
      if (this.filter === "today") return t2 >= startOfToday && t2 < endOfToday;
      if (this.filter === "upcoming") return true; // all non-completed, any time (past shows as overdue)
      return true; // "all"
    });
  },

  contactName(id) {
    if (!id) return "";
    const c = Contacts.all.find((c) => c.id === id);
    return c ? fullName(c) : "";
  },

  renderList() {
    const el = document.getElementById("schedule-list");
    const items = this.visible();
    if (items.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
          <h3>${this.filter === "completed" ? t("empty_nothing_completed") : t("empty_nothing_scheduled")}</h3>
          <p>${t("empty_schedule_hint")}</p>
        </div>`;
      return;
    }

    // group by day label, in chronological order
    const groups = [];
    let lastLabel = null;
    for (const e of items) {
      const label = dayLabel(e.when);
      if (label !== lastLabel) { groups.push({ label, items: [] }); lastLabel = label; }
      groups[groups.length - 1].items.push(e);
    }

    const now = Date.now();
    el.innerHTML = groups.map((g) => `
      <p class="day-heading">${g.label}</p>
      ${g.items.map((e) => {
        const overdue = !e.completed && new Date(e.when).getTime() < now && this.filter !== "today";
        const cname = this.contactName(e.contactId);
        return `
        <div class="event-row ${e.completed ? "done" : ""}" data-id="${e.id}">
          <button class="event-check ${e.completed ? "checked" : ""}" data-toggle="${e.id}" title="${e.completed ? t("mark_incomplete_title") : t("mark_complete_title")}">
            ${e.completed ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' : ""}
          </button>
          <div class="event-info" data-open="${e.id}">
            <p class="event-title">${escapeHTML(e.title || t("untitled_event"))}</p>
            <p class="event-sub">${timeLabel(e.when)}${cname ? " · " + escapeHTML(cname) : ""}${overdue ? " · " + t("overdue_suffix") : ""}</p>
          </div>
          <span class="badge event-badge" style="background:${EVENT_TYPE_META[e.type].soft};color:${EVENT_TYPE_META[e.type].color}">${eventTypeLabel(e.type)}</span>
        </div>`;
      }).join("")}
    `).join("");

    el.querySelectorAll("[data-open]").forEach((row) => {
      row.addEventListener("click", () => openEventForm(row.dataset.open));
    });
    el.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.toggle;
        const ev2 = await Events.get(id);
        await Events.update(id, { completed: !ev2.completed });
        await Schedule.refresh();
      });
    });
  },

  async refresh() {
    await this.load();
    this.renderList();
  },

  // ---------------- Reminders (best-effort, app must be open) ----------------
  startReminderLoop() {
    if (this.reminderTimer) return;
    this.reminderTimer = setInterval(() => this.checkReminders(), 30000);
    this.checkReminders();
  },

  async checkReminders() {
    const now = Date.now();
    const due = this.all.filter((e) =>
      e.remind && !e.notified && !e.completed &&
      new Date(e.when).getTime() <= now &&
      new Date(e.when).getTime() > now - 5 * 60000
    );
    for (const e of due) {
      const body = `${eventTypeLabel(e.type)} · ${timeLabel(e.when)}${this.contactName(e.contactId) ? " · " + this.contactName(e.contactId) : ""}`;
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try { new Notification(e.title || t("reminder_fallback_title"), { body }); } catch (_) { showToast(t("toast_reminder", { title: e.title })); }
      } else {
        showToast(t("toast_reminder", { title: e.title }));
      }
      await Events.update(e.id, { notified: true });
    }
    if (due.length) await this.load();
  },

  // ---------------- Route planning ----------------
  routeToday() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 86400000;

    const stops = this.all
      .filter((e) => e.type === "meeting" && !e.completed)
      .filter((e) => { const t2 = new Date(e.when).getTime(); return t2 >= startOfToday && t2 < endOfToday; })
      .sort((a, b) => a.when.localeCompare(b.when))
      .map((e) => {
        const c = e.contactId ? Contacts.all.find((c) => c.id === e.contactId) : null;
        const addr = c ? primaryAddress(c) : null;
        return addr ? addr.value : null;
      })
      .filter(Boolean);

    if (stops.length === 0) {
      showToast(t("toast_no_meetings_with_address"));
      return;
    }
    const destination = stops[stops.length - 1];
    const waypoints = stops.slice(0, -1);
    let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
    if (waypoints.length) url += `&waypoints=${waypoints.map(encodeURIComponent).join("|")}`;
    window.open(url, "_blank", "noopener");
  },
};

// ---------------- Add / Edit event form ----------------
let eventEditingId = null;
let eventType = "task";

function populateContactSelect(selectedId) {
  const sel = document.getElementById("ev-contact");
  sel.innerHTML = `<option value="">${t("no_linked_contact")}</option>` +
    Contacts.all.map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${escapeHTML(fullName(c))}</option>`).join("");
}

function setEventType(type) {
  eventType = type;
  document.querySelectorAll("#ev-type button").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
}

async function openEventForm(id) {
  eventEditingId = id || null;
  eventType = "task";
  document.getElementById("ev-form-title").textContent = id ? t("event_form_title_edit") : t("event_form_title_new");

  const now = new Date(Date.now() + 30 * 60000); // default: 30 min from now
  document.getElementById("ev-title").value = "";
  document.getElementById("ev-notes").value = "";
  document.getElementById("ev-remind").checked = false;
  const defaults = toLocalInputParts(now.toISOString());
  document.getElementById("ev-date").value = defaults.date;
  document.getElementById("ev-time").value = defaults.time;
  populateContactSelect(null);
  setEventType("task");
  document.getElementById("ev-delete").style.display = id ? "block" : "none";

  if (id) {
    const e = await Events.get(id);
    if (e) {
      document.getElementById("ev-title").value = e.title || "";
      document.getElementById("ev-notes").value = e.notes || "";
      document.getElementById("ev-remind").checked = !!e.remind;
      const parts = toLocalInputParts(e.when);
      document.getElementById("ev-date").value = parts.date;
      document.getElementById("ev-time").value = parts.time;
      populateContactSelect(e.contactId);
      setEventType(e.type);
    }
  }
  showScreen("screen-event-form");
}

async function saveEventForm() {
  const title = document.getElementById("ev-title").value.trim();
  const date = document.getElementById("ev-date").value;
  const time = document.getElementById("ev-time").value;
  if (!title || !date) {
    showToast(t("toast_add_title_and_date"));
    return;
  }
  const remind = document.getElementById("ev-remind").checked;
  if (remind && typeof Notification !== "undefined" && Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch (_) { /* ignore */ }
  }
  const payload = {
    title,
    type: eventType,
    when: combineLocal(date, time),
    contactId: document.getElementById("ev-contact").value || null,
    remind,
    notes: document.getElementById("ev-notes").value,
  };
  if (eventEditingId) {
    payload.notified = false; // allow re-notification if time changed
    await Events.update(eventEditingId, payload);
    showToast(t("toast_updated"));
  } else {
    await Events.add(payload);
    showToast(t("toast_added_to_schedule"));
  }
  await Schedule.refresh();
  closeAllScreens();
}

async function deleteCurrentEvent() {
  if (!eventEditingId) return;
  if (!confirm(t("confirm_delete_item"))) return;
  await Events.remove(eventEditingId);
  showToast(t("toast_deleted"));
  await Schedule.refresh();
  closeAllScreens();
}
