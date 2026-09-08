# Cyberomeda CRM

A CRM app you install on your phone like a normal app, with **no Play Store, no account, and no server** — all your contacts live only on your device.

## Visual redesign — Material 3, emerald brand (this update)
- New brand color: **emerald/jade green** (`#10845D` primary, `#115F45` deep, `#D7F4EA` soft tint) — deliberately distinct from the blue/purple most CRMs use
- Full Material 3 styling pass across every screen: pill-shaped buttons (filled primary / outlined secondary), tonal (soft-background) chips and tabs instead of solid-fill, soft elevation shadows on list cards, a rounded floating search bar, and a proper Material nav-bar pill indicator behind the active tab icon
- Category badges (Customer/Lead/Lost) were deliberately reassigned to blue/amber/grey so they stay visually distinct from the new green brand color instead of blending into it
- App icons and the OS-level theme color (status bar, splash screen) were regenerated to match
- Found and fixed a real bug while testing this in Arabic: the off-screen slide-in panels were creating invisible horizontal scroll overflow that happened to be harmless in English (default scroll position hid it) but caused the entire Arabic UI to render blank on some devices — fixed at the root (`overflow: hidden` on the app shell)

## Phase 8b — Client reports
- **Reports** (More → Reports): three views — **Summary**, **Activity**, and **By Tag**
- **Summary**: total contact count, a breakdown by category (Customer / Lead / Lost), and a count per tag
- **Activity**: pick a date range and see how many contacts were added and how many activity-log entries (notes, calls, category changes) happened in that window, with the full list below
- **By Tag**: every tag with its contact count and the full list of who's tagged with it
- **Export**: every report exports as **CSV** (opens in Excel/Sheets, full Arabic support) or **PDF** (formatted document, English text only — see the note below)
- A note on PDF: the PDF engine this app uses doesn't support Arabic text yet, so names, tags, or notes written in Arabic won't render correctly inside a PDF. This shows up as a small notice next to every PDF button. **CSV/Excel export has no such limitation** — Arabic text comes through perfectly — so it's the safer choice whenever your data includes Arabic.

## Phase 8a — Arabic language & RTL
- **Full Arabic translation** of every screen, button, label, empty state, confirmation, and toast — nothing was left in English behind the scenes
- **Language switch** (More → Language): a simple English / العربية toggle, saved on-device so it's remembered next time you open the app
- **Right-to-left layout**: switching to Arabic mirrors the whole interface — screens slide in from the correct side, the "+" button and back arrows move to the right place, tab order and text alignment all flip naturally
- **Arabic dates**: months and weekdays show in Arabic once you switch, while numbers stay in familiar Western digits (1, 2, 3) for clarity in a business context
- Activity log entries (like "Contact added") are written in whichever language was active **at that moment** — same idea as a timestamp, so older entries don't silently change wording after you switch languages

## Phase 7 — QR codes & bulk share
- **QR codes** (More tab): generate a scannable contact card from a CRM contact, a phone contact, or a manual entry — scanning it offers to add the contact directly, no app needed on the other end
- Generate **multiple QR codes at once** by picking several contacts together
- Choose exactly **which fields go into the code** (phone, email, address, company, etc.) with a simple checklist — a saved list of every code you've generated, each viewable full-size, downloadable as an image, or shareable
- **Bulk select & share**: tap Select in the Contacts list, pick as many contacts as you like, and share them all as one contact file — using the same field checklist
- Fully offline: the QR code is generated right on your device, nothing is uploaded anywhere

## Phase 6 — Notes, call notes & activity timeline
- **Multiple notes per contact**: unlimited notes, each with an optional title and free text, editable any time, with automatic created/updated timestamps
- **Call notes**: a distinct note type for logging a call — either typed text or a **voice recording** (records right in the app, capped at 5:00, with playback and re-record before saving)
- **Automatic activity timeline**: every note added, edited, or deleted is logged with a timestamp — along with when the contact was created and whenever its category changes — with no manual entry needed

## Phase 5.1 — Contact form additions
- **Multiple websites** per contact (Personal/Work/Portfolio/Other), same style as phone numbers and emails
- **Custom fields**: add any number of your own label + value pairs to a contact

## Tags — full manager
- Pick tags for a contact from a dropdown of existing ones, or add a new tag (with its own color) right from that dropdown
- **Manage tags** (More tab): rename, recolor, or delete any tag, with a live count of how many contacts use it and a warning before deleting
- Deleting a tag removes it from every contact automatically

## Phase 5 — Contact overhaul
- **Photo**: add from camera or gallery, with an in-app crop tool (drag to reposition, slider to zoom)
- **Multi-value fields, like Google Contacts**: unlimited phone numbers, emails, and addresses, each with a label (Mobile/Home/Work/Other)
- **Google Maps link per address**: paste a maps link directly under any address (shows once you tap "+ Add address") — Directions and route planning prefer it over a text search when present
- **Nickname, job title (separate from company), birthday**
- **Contact form field settings** (More tab): choose which of the above fields show in the Add/Edit form, and reorder them
- **WhatsApp** quick action alongside Call/Email/Directions
- Existing contacts from earlier versions **upgrade automatically** the first time you open them — nothing to do manually
- **Invoices/Proposals removed** from the app for now (the code isn't deleted, just disabled, in case it's wanted again later)

## Also still included from earlier phases
- Contacts: search, filter, document attachments, one-tap call/SMS/email/WhatsApp/directions/save-to-phone
- Schedule: tasks & meetings, agenda, reminders (while the app is open), route planning for today's meetings
- Phone contacts integration: save to phone, export/import vCard, native Android contact picker, full JSON backup & restore

## What's next
The native Android `.apk`, via Capacitor — the final phase.

Fully offline after first load (installable as a real app icon).

## A note on reminders
Since this is a browser-based app (not yet the native APK), reminders only fire reliably **while the app is open** — a phone browser can't wake itself up in the background the way an installed native app can. If you turn on "Remind me" for an item, the app will ask for notification permission the first time, then try to notify you if you have the app open (or recently open) when the time arrives. The agenda itself will always show anything overdue the moment you open it, regardless of notifications. True background push reminders are one of the things the native APK will unlock.

## A note on voice call notes
Recording uses your phone's microphone through the browser (`MediaRecorder`), so it'll ask for microphone permission the first time you try it. The recording is stored on-device the same way photos and documents are — nothing is uploaded. If a browser doesn't support in-page audio recording, the voice option is skipped automatically and you can still log the call as text.

## A note on QR codes & sharing
QR codes are generated entirely on your device using a small built-in library — nothing is sent anywhere to create them. Sharing (a QR image, or a bulk contact file) uses your phone's normal share sheet when the browser supports it; otherwise the file downloads directly and you can share it manually from your Downloads or Files app. "From phone contacts" uses the same native contact picker as the existing import feature, so it only appears on browsers that support it (Chrome on Android).

## How to install it on your phone (no coding needed)

You need to put these files somewhere with a web address, because phones only let you "install" a PWA from a real `https://` link — opening the files directly won't let it work fully offline. The easiest free way:

### Option A — GitHub Pages (recommended, free, permanent link)
1. Create a free account at github.com if you don't have one.
2. Create a new repository (e.g. `pocket-crm`), and upload **all the files in this folder**, keeping the same folder structure (`css/`, `js/`, `icons/` etc).
3. In the repository, go to **Settings → Pages**, set the source branch to `main` and folder to `/ (root)`, save.
4. GitHub will give you a link like `https://yourname.github.io/pocket-crm/`. Wait a minute, then open it.

### Option B — Netlify Drop (even simpler, no account needed)
1. Go to `app.netlify.com/drop` in a browser.
2. Drag this whole folder onto the page.
3. You instantly get a live `https://...netlify.app` link.

### Then, on your phone:
1. Open that link in **Chrome** on your Android phone.
2. Tap the **⋮ menu → Add to Home screen / Install app**.
3. It now sits on your home screen with its own icon, opens full-screen with no browser bar, and works with no internet connection.

## Your data
Everything is stored on your phone only (in the browser's local database). Nothing is uploaded anywhere. Use **More → Export full backup (JSON)** regularly to save a backup file somewhere safe (e.g. send it to yourself, or save to Google Drive) — if you ever clear your browser data, uninstalled data can't be recovered otherwise.

## Updating after this and future phases
Once your repo is already live on GitHub Pages, updating is simpler than the first setup:
1. Go to your repo → open the file that changed (e.g. `index.html`, or a file inside `css/`, `js/`) → click the pencil (Edit) icon, or use "Add file → Upload files" and drag in the replacement file — GitHub will offer to overwrite the existing one.
2. Commit directly to `main` (no need for a pull request, since it's just you).
3. Pages redeploys automatically in under a minute.
4. On your phone, close the app fully and reopen it (or pull to refresh) — it may take one extra reload for the offline cache to pick up the new version, since the app is designed to work offline and briefly prefers its cached copy. If it still looks outdated, clear that site's storage in Chrome's site settings and reopen the link fresh.

## Path to a real installable `.apk` later
This app was deliberately built as plain HTML/CSS/JS (no framework) so it can be wrapped later with **Capacitor** into a real native Android app almost unchanged — that will let it get its own APK file, plus access to things like the camera, contacts import, and biometric lock, which a browser-only PWA can't fully do. That's planned for a later phase once the feature set is more complete.
