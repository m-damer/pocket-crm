function eventTypeLabel(type) {
  return type === "meeting" ? t("event_type_meeting") : t("event_type_task");
}
const EVENT_TYPE_META = {
  task: { color: "#6B5FB3", soft: "#EFEDFA" },
  meeting: { color: "#10845D", soft: "#D7F4EA" },
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
    // Pre-existing bug fixed here: the calendar month view (and its "days
    // with events" dots) used to only render below this point, so an empty
    // events list — a fresh install, or just an empty filter like "today"
    // with nothing on it — meant the calendar never rendered at all, not
    // even a blank grid. Calendar and day-events highlighting are
    // unconditional now; only the list-below-the-calendar is filter-empty-aware.
    renderCalendar();
    renderCalendarDayEvents();
    if (items.length === 0) {
      el.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 -960 960 960" fill="currentColor"><path d="m388-212-56-56 92-92-92-92 56-56 92 92 92-92 56 56-92 92 92 92-56 56-92-92-92 92ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Zm0-480h560v-80H200v80Zm0 0v-80 80Z"/></svg>
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
            ${e.completed ? '<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>' : ""}
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
      row.addEventListener("click", () => openEventDetail(row.dataset.open));
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
    await loadCalendarWeekStart();
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
let evFormContactId = null;

async function refreshEventContactLabel() {
  const label = document.getElementById("ev-contact-label");
  if (!evFormContactId) {
    label.textContent = t("no_linked_contact");
    return;
  }
  const c = await DB.get(evFormContactId);
  label.textContent = c ? fullName(c) : t("no_linked_contact");
}

async function openEventContactPicker() {
  document.getElementById("ev-picker-search").value = "";
  await renderEventContactPickerList("");
  showScreen("screen-event-contact-picker");
}

async function renderEventContactPickerList(query) {
  const wrap = document.getElementById("ev-contact-picker-list");
  const all = await DB.getAll();
  const q = (query || "").trim().toLowerCase();
  const filtered = q
    ? all.filter((c) => (fullName(c) + " " + (c.company || "")).toLowerCase().includes(q))
    : all;

  const noneRow = `
    <div class="more-row" id="ev-picker-none" style="cursor:pointer">
      <div class="txt"><p class="t">${t("no_linked_contact")}</p></div>
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

  document.getElementById("ev-picker-none").addEventListener("click", () => {
    evFormContactId = null;
    closeScreen("screen-event-contact-picker");
    refreshEventContactLabel();
  });
  wrap.querySelectorAll(".contact-row").forEach((row) => {
    row.addEventListener("click", () => {
      evFormContactId = row.dataset.id;
      closeScreen("screen-event-contact-picker");
      refreshEventContactLabel();
    });
  });
}

function setEventType(type) {
  eventType = type;
  document.querySelectorAll("#ev-type button").forEach((b) => b.classList.toggle("active", b.dataset.type === type));
}

async function openEventForm(id, presets) {
  eventEditingId = id || null;
  eventType = (presets && presets.type) || "task";
  document.getElementById("ev-form-title").textContent = id ? t("event_form_title_edit") : t("event_form_title_new");

  const now = new Date(Date.now() + 30 * 60000); // default: 30 min from now
  document.getElementById("ev-title").value = "";
  document.getElementById("ev-notes").value = "";
  document.getElementById("ev-remind").checked = false;
  const defaults = toLocalInputParts(now.toISOString());
  document.getElementById("ev-date").value = defaults.date;
  document.getElementById("ev-time").value = defaults.time;
  evFormContactId = (presets && presets.contactId) || null;
  await refreshEventContactLabel();
  setEventType(eventType);
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
      evFormContactId = e.contactId || null;
      await refreshEventContactLabel();
      setEventType(e.type);
    }
  }
  showScreen("screen-event-form");
}

// ---------------- Read-only event detail (opened from the schedule list) ----------------
let eventDetailId = null;

function renderEventDetailContent(e) {
  const contact = e.contactId ? Contacts.all.find((c) => c.id === e.contactId) : null;
  const d = new Date(e.when);
  return `
    <div class="field-list" style="margin-top:12px">
      <div class="field-row">
        <p class="label">${eventTypeLabel(e.type)}</p>
        <p class="value" style="font-size:19px;font-weight:700">${escapeHTML(e.title || t("untitled_event"))}</p>
      </div>
      <div class="field-row"><p class="label">${t("label_date")}</p><p class="value">${d.toLocaleDateString(I18N.localeTag(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p></div>
      <div class="field-row"><p class="label">${t("label_time")}</p><p class="value">${timeLabel(e.when)}</p></div>
      ${contact ? `<div class="field-row" id="ev-detail-contact-row" data-contact-id="${contact.id}" style="cursor:pointer">
        <p class="label">${t("label_linked_contact")}</p>
        <p class="value" style="color:var(--blue);font-weight:650">${escapeHTML(fullName(contact))}</p>
      </div>` : ""}
      ${e.notes ? `<div class="field-row"><p class="label">${t("label_notes")}</p><p class="value" style="white-space:pre-wrap">${escapeHTML(e.notes)}</p></div>` : ""}
      <div class="field-row">
        <p class="label">${t("label_status")}</p>
        <p class="value">${e.completed ? t("status_completed") : t("status_pending")}</p>
      </div>
    </div>
    <div class="form-actions">
      <button type="button" class="btn-secondary" id="btn-ev-detail-toggle" style="width:100%">
        ${e.completed ? t("btn_mark_incomplete") : t("btn_mark_complete")}
      </button>
    </div>
  `;
}

async function openEventDetail(id) {
  eventDetailId = id;
  const e = await Events.get(id);
  if (!e) return;
  document.getElementById("event-detail-content").innerHTML = renderEventDetailContent(e);

  const contactRow = document.getElementById("ev-detail-contact-row");
  if (contactRow) {
    contactRow.addEventListener("click", () => openDetail(contactRow.dataset.contactId));
  }
  document.getElementById("btn-ev-detail-toggle").addEventListener("click", async () => {
    await Events.update(id, { completed: !e.completed });
    await Schedule.refresh();
    await openEventDetail(id); // re-render with the flipped status
  });

  showScreen("screen-event-detail");
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
    contactId: evFormContactId || null,
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

async function deleteEventFromDetail() {
  if (!eventDetailId) return;
  if (!confirm(t("confirm_delete_item"))) return;
  await Events.remove(eventDetailId);
  showToast(t("toast_deleted"));
  await Schedule.refresh();
  closeAllScreens();
}

// ---------------- Calendar month view ----------------
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarSelectedDay = null; // "YYYY-MM-DD" or null
let calendarWeekStart = 6; // 0=Sunday..6=Saturday, loaded from Settings (default Saturday)

// Re-reads the configured week-start day from Settings. Cheap enough to call
// every refresh so a change made in More → Schedule takes effect immediately,
// without needing a special-cased "settings changed" event just for this.
async function loadCalendarWeekStart() {
  const s = await Settings.get();
  calendarWeekStart = s.weekStart !== undefined ? s.weekStart : 6;
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function eventCountsByDay() {
  const map = {};
  Schedule.all.forEach((e) => {
    const key = dayKey(new Date(e.when));
    map[key] = (map[key] || 0) + 1;
  });
  return map;
}

function renderCalendarWeekdays() {
  const wrap = document.getElementById("calendar-weekdays");
  if (!wrap) return;
  // 2023-01-01 was a Sunday — shift forward by the configured week-start day
  // (0=Sunday..6=Saturday) to get the right label order.
  const base = new Date(2023, 0, 1 + calendarWeekStart);
  const labels = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    labels.push(d.toLocaleDateString(I18N.localeTag(), { weekday: "narrow" }));
  }
  wrap.innerHTML = labels.map((l) => `<span>${escapeHTML(l)}</span>`).join("");
}

function renderCalendar() {
  const monthLabel = document.getElementById("calendar-month-label");
  const grid = document.getElementById("calendar-grid");
  if (!monthLabel || !grid) return;

  monthLabel.textContent = calendarMonth.toLocaleDateString(I18N.localeTag(), { month: "long", year: "numeric" });
  renderCalendarWeekdays();

  const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() - calendarWeekStart + 7) % 7; // days before the 1st, relative to the configured week start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const counts = eventCountsByDay();
  const todayKey = dayKey(new Date());

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) cells.push({ dayNum: daysInPrevMonth - i, monthOffset: -1 });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ dayNum: d, monthOffset: 0 });
  let nextDay = 1;
  while (cells.length % 7 !== 0) cells.push({ dayNum: nextDay++, monthOffset: 1 });

  grid.innerHTML = cells.map((c) => {
    const cellDate = new Date(year, month + c.monthOffset, c.dayNum);
    const key = dayKey(cellDate);
    const classes = ["calendar-day"];
    if (c.monthOffset !== 0) classes.push("other-month");
    if (key === todayKey) classes.push("today");
    if (calendarSelectedDay === key) classes.push("selected");
    return `
      <button type="button" class="${classes.join(" ")}" data-daykey="${key}">
        ${c.dayNum}
        ${counts[key] ? `<span class="cal-dot"></span>` : ""}
      </button>
    `;
  }).join("");

  grid.querySelectorAll(".calendar-day").forEach((btn) => {
    btn.addEventListener("click", () => {
      calendarSelectedDay = calendarSelectedDay === btn.dataset.daykey ? null : btn.dataset.daykey;
      renderCalendar();
      renderCalendarDayEvents();
    });
  });
}

function renderCalendarDayEvents() {
  const wrap = document.getElementById("calendar-day-events");
  if (!wrap) return;
  if (!calendarSelectedDay) {
    wrap.style.display = "none";
    wrap.innerHTML = "";
    return;
  }
  const [y, m, d] = calendarSelectedDay.split("-").map(Number);
  const dayEvents = Schedule.all
    .filter((e) => {
      const ed = new Date(e.when);
      return ed.getFullYear() === y && ed.getMonth() === m - 1 && ed.getDate() === d;
    })
    .sort((a, b) => a.when.localeCompare(b.when));

  wrap.style.display = "block";
  if (dayEvents.length === 0) {
    wrap.innerHTML = `<div class="empty-state" style="padding:20px 16px"><p>${t("calendar_no_events_day")}</p></div>`;
    return;
  }
  wrap.innerHTML = dayEvents.map((e) => `
    <div class="event-row ${e.completed ? "done" : ""}" data-id="${e.id}">
      <button class="event-check ${e.completed ? "checked" : ""}" data-toggle="${e.id}" title="${e.completed ? t("mark_incomplete_title") : t("mark_complete_title")}">
        ${e.completed ? '<svg viewBox="0 -960 960 960" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>' : ""}
      </button>
      <div class="event-info" data-open="${e.id}">
        <p class="event-title">${escapeHTML(e.title || t("untitled_event"))}</p>
        <p class="event-sub">${timeLabel(e.when)}${e.contactId ? " · " + escapeHTML(Schedule.contactName(e.contactId)) : ""}</p>
      </div>
      <span class="badge event-badge" style="background:${EVENT_TYPE_META[e.type].soft};color:${EVENT_TYPE_META[e.type].color}">${eventTypeLabel(e.type)}</span>
    </div>
  `).join("");

  wrap.querySelectorAll("[data-open]").forEach((row) => {
    row.addEventListener("click", () => openEventDetail(row.dataset.open));
  });
  wrap.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.toggle;
      const e2 = await Events.get(id);
      await Events.update(id, { completed: !e2.completed });
      await Schedule.refresh();
    });
  });
}

function calendarPrevMonth() {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
}
function calendarNextMonth() {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
}
