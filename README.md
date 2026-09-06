# Cyberomeda CRM — Phase 1

A CRM app you install on your phone like a normal app, with **no Play Store, no account, and no server** — all your contacts live only on your device.

## What works right now (Phase 1)
- Add, edit, delete contacts
- Categorize as Customer / Lead / Lost, with color coding
- Search and filter
- Tags, notes, address
- Activity log per contact
- One-tap call / SMS / email
- Export all data as a JSON backup file
- Fully offline after first load (installable as a real app icon)

Schedule, Invoices, and Maps tabs are visible in the app as a preview of what's coming in later phases, but aren't wired up yet.

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

## Path to a real installable `.apk` later
This app was deliberately built as plain HTML/CSS/JS (no framework) so it can be wrapped later with **Capacitor** into a real native Android app almost unchanged — that will let it get its own APK file, plus access to things like the camera, contacts import, and biometric lock, which a browser-only PWA can't fully do. That's planned for a later phase once the feature set is more complete.
