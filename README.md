# Cyberomeda CRM — Phase 4

A CRM app you install on your phone like a normal app, with **no Play Store, no account, and no server** — all your contacts live only on your device.

## What works right now

**Contacts (Phase 1)**
- Add, edit, delete contacts — Customer / Lead / Lost categories, color-coded
- Search and filter, tags, notes, address, activity log
- One-tap call / SMS / email / directions

**Schedule (Phase 2)**
- Tasks and meetings with date, time, and optional reminder
- Agenda grouped by day, filters for Upcoming / Today / Completed / All
- Link any item to a contact — shows under that contact's "Upcoming" section
- **Route today's meetings** (new) — the map icon in the Schedule header opens Google Maps with a driving route through every meeting scheduled today that has an address, in time order

**Invoices & Proposals (Phase 3)**
- Business profile (name, address, logo, currency) used on every document
- Line items with live totals, auto-numbering, status tracking
- Clean preview + real PDF export/share

**New in Phase 4**
- **Directions**: every contact with an address gets a one-tap "Directions" button that opens it in Google Maps
- **Documents**: attach files (contracts, IDs, photos) to any contact under a new "Docs" tab — stored on-device, download or remove anytime (8 MB per file limit to keep things fast)

All planned CRM features are now built. The only thing left on the original roadmap is wrapping this into a real native `.apk` (see below) — that's the natural next phase whenever you're ready.

Fully offline after first load (installable as a real app icon).

## A note on reminders
Since this is a browser-based app (not yet the native APK), reminders only fire reliably **while the app is open** — a phone browser can't wake itself up in the background the way an installed native app can. If you turn on "Remind me" for an item, the app will ask for notification permission the first time, then try to notify you if you have the app open (or recently open) when the time arrives. The agenda itself will always show anything overdue the moment you open it, regardless of notifications. True background push reminders are one of the things the native APK will unlock.

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
Everything is stored on your phone only (in the browser's local database). Nothing is uploaded anywhere. Use **More → Export all contacts** regularly to save a backup JSON file somewhere safe (e.g. send it to yourself, or save to Google Drive) — if you ever clear your browser data, uninstalled data can't be recovered otherwise.

## Updating after this and future phases
Once your repo is already live on GitHub Pages, updating is simpler than the first setup:
1. Go to your repo → open the file that changed (e.g. `index.html`, or a file inside `css/`, `js/`) → click the pencil (Edit) icon, or use "Add file → Upload files" and drag in the replacement file — GitHub will offer to overwrite the existing one.
2. Commit directly to `main` (no need for a pull request, since it's just you).
3. Pages redeploys automatically in under a minute.
4. On your phone, close the app fully and reopen it (or pull to refresh) — it may take one extra reload for the offline cache to pick up the new version, since the app is designed to work offline and briefly prefers its cached copy.

## Path to a real installable `.apk` later
This app was deliberately built as plain HTML/CSS/JS (no framework) so it can be wrapped later with **Capacitor** into a real native Android app almost unchanged — that will let it get its own APK file, plus access to things like the camera, contacts import, and biometric lock, which a browser-only PWA can't fully do. That's planned for a later phase once the feature set is more complete.
