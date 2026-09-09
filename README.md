# Cyberomeda CRM

A CRM app you install on your phone like a normal app, with **no Play Store, no account, and no server** — all your contacts live only on your device.

## Material 3 visual redesign (this update)
The whole app now looks and feels like a real Google product — Material Design 3 (specifically "Material 3 Expressive," Google's 2025-2026 update), not just a color change.

- **Real color science, not a guess**: the warm cream/gold palette was generated with Google's own `material-color-utilities` library — the exact algorithm Android's dynamic color system uses — from a single seed color, using the "TonalSpot" scheme. Light and dark are mathematically derived from the same seed, so they can never drift out of sync with each other.
- **A token-based theme system, built for future recoloring**: every color in the app resolves from `--md-sys-color-*` custom properties (Google's own naming convention) defined once at the top of `css/styles.css`. Changing the app's whole look in the future is changing one seed value in a small script and pasting the regenerated numbers back in — nothing else in the app needs to change.
- **Dark mode**, plus a **Light / Dark / System** picker in More → Appearance. "System" follows the phone's own setting live, including if it changes while the app is open.
- **Every component rebuilt to real M3 shapes and behavior**: buttons (filled/outlined/danger), the FAB, chips, segmented controls, switches (distinct from checkboxes — M3 treats on/off settings and multi-select lists as different components), text fields, dropdowns/selects, cards, and bottom sheets.
- **The top app bar and contact detail header are now neutral** — they blend into the page like stock Google apps do (Contacts, Gmail, Photos), rather than a bold color block. Color now lives in the FAB, active nav state, category badges, and chips instead — matching the reference screenshot this redesign was built from.
- **Real bugs found and fixed along the way**, not just restyled:
  - Several places (deal amount, every date/time picker) had *zero* CSS coverage at all — native unstyled browser defaults, invisible until this pass actually exercised every input type.
  - The contact detail header's category badge was missing its category class in the markup — invisible before because the old bold header's own override happened to mask it; the once-neutral header exposed it.
  - The contact detail avatar's translucent-white background was designed for the old dark header — nearly invisible against the new light one; now uses the same solid category color the rest of the app already uses.
  - The "Lead" badge's pale container color was, by coincidence, almost the same tone as the new page background — added a subtle border to every badge (using each one's own color) so this class of near-invisible-chip bug can't recur for any category, current or future.
  - A dozen-plus hardcoded colors (header text, toast, buttons, checkmarks, calendar dots, delete icons, bottom-sheet scrim) were still using the old emerald brand's literal hex values or plain white/black — invisible or badly-contrasted the moment dark mode or the new palette was involved. All now resolve through the token system.

## Deals/Pipeline
- **Pipeline board** (new tab, between Schedule and Activity): a kanban-style board — New → Contacted → Proposal → Negotiation → Won / Lost — with each column showing its deals, a running total, and the overall open pipeline value at the top. Scroll sideways between stages; tap a deal to edit it.
- **Deals**: a title, an optional linked contact (searchable single-tap picker), an amount, a stage, an optional expected close date, and notes. Moving a linked deal to a new stage logs it to that contact's own activity timeline automatically, the same way a category change already does.
- **Deals tab on every contact**: shows just that contact's deals, with its own "+ Add deal" that pre-links the contact. "Add deal" was also added to the existing quick-add menu on a contact's screen.
- **On/off toggle** (More → Pipeline): switches off the Pipeline tab, the Deals tab on contacts, and "Add deal" from the quick-add menu, all at once — the feature disappears cleanly rather than just going empty. Deals data itself is untouched either way. Defaults on.
- Included in the full JSON backup (export and restore) alongside contacts, events, and documents.

Two more real bugs turned up and got fixed — both the same underlying class as the `.icon-btn[hidden]` bug from the last update, just on different elements (`#view-pipeline` and `.nav-item`, both of which set their own `display` and so outranked the browser's built-in `[hidden]` styling). Rather than patch a third individual selector, this update replaces all of those one-off fixes with a single global rule (`[hidden] { display: none !important; }`) — `hidden` now reliably means hidden everywhere in this app, closing off this entire bug class instead of leaving it to resurface with the next new component.

## Calendar week-start, notes detail view, duplicate merge, bulk edit, follow-up nudges
Five features in one pass:
- **Calendar starts on** (More → Schedule): pick Saturday, Sunday, or Monday as the first day of the week for the Schedule tab's calendar month view. Defaults to Saturday.
- **Notes read-only detail view**: tapping a note now opens a read-only screen first — title, type, date, full text (or an inline player for voice call notes) — with Edit and Delete icons in the header, mirroring the pattern the Schedule event detail screen already used. Edit opens the same editor as before; Delete asks to confirm first.
- **Duplicate contacts** (More → Your data → Find duplicate contacts): scans for contacts that share a phone number, email, or full name — including transitively (A matches B by phone, B matches C by email → all three group together) — and lets you pick which one to keep. Phones, emails, addresses, websites, custom fields, tags, notes, and activity history all combine into the kept contact; the others are removed. The merge itself is logged to the kept contact's activity timeline.
- **Bulk edit** for the Contacts multi-select (previously vCard-sharing only): a new pencil icon opens **Bulk actions** — **Add tag** (adds one or more tags to every selected contact without removing tags they already have; can create a new tag inline) or **Change category** (applies one category to the whole selection; each contact that actually changes gets the same activity-log entry as an individual edit would, no duplicates for contacts already in that category).

- **Follow-up nudges** (More → Follow-ups): toggle on/off, with a 7/14/30/60-day inactivity threshold. When on, the Activity tab shows a "Needs follow-up" section above the regular feed, listing customer/lead contacts nothing has been logged against (no note, call, or edit) for longer than the threshold — lost contacts are excluded. Tap a contact there to jump straight to it.

Three real bugs turned up along the way and got fixed at the root rather than worked around:
- Several header icons (like the vCard-share button, and the new bulk-edit button) used the `hidden` attribute to stay hidden outside their relevant mode, but `.icon-btn`'s own `display:flex` was silently overriding the browser's built-in `[hidden]` styling, so they were never actually hidden — just not noticeable with only one affected button before now.
- The Schedule calendar month view only rendered once the events list below it had at least one item — a fresh install, or any empty filter, left the whole calendar blank instead of showing an empty grid.
- The app shell (`.app`) only had a `min-height`, not a fixed `height` — harmless while every tab's content fit in one screen, but once a tab's content grew taller (as More's did this update), the whole page grew and scrolled with it instead of that tab's own internal scrollbar taking over, which also meant slide-in screens opened by scrolled-down rows could render off-screen. Fixed by giving `.app` a definite `height: 100dvh` so flexbox can actually cap each tab's height and hand overflow to its own scrollbar, the way it was designed to.

## Contact screen overhaul + Schedule detail + Calendar
- **Hero card restructured**: name and category badge share one line; nickname sits right under the name; job title/company below that; tags below that
- **Address block**: Directions button and address text share one row, with Directions first so it's never pushed off-screen by a long address — and it links only to the Google Maps URL you actually entered
- **"Add Activity" floating button** on the contact screen: tap it for a quick menu — Add task, Add meeting, Add note, Add voice note, Add document — each pre-filled and linked to that contact
- **Info tab** now carries a "Details" heading and only shows what isn't already in the hero (phone, email, address, website, birthday, custom fields, added/modified dates)
- **Activity cards redesigned**: title top-left, type badge top-right, description in the middle, date in the bottom corner (mirrors correctly in Arabic — right corner in English becomes left corner in Arabic, not hardcoded). Long notes get a "Read more" bottom sheet; voice notes get an inline player right under the title
- **Voice notes**: max length raised from 5 minutes to **2 hours**, with the timer switching to `H:MM:SS` past the one-hour mark
- **Schedule**: tapping an event now opens a **read-only detail screen** first (Edit and Delete icons in the header) instead of jumping straight into editing — with a one-tap "Mark as complete" toggle and a tap-through to the linked contact
- **Calendar month view**: added to the Schedule tab, with month navigation, a dot under any day that has events, and tapping a day shows that day's events in their own list underneath — separate from the existing Upcoming/Today/Completed/All filtered list above it
- Fixed a real (if minor) bug along the way: the "Add Activity" menu had visible gaps between its buttons from stray whitespace in the generated HTML

## UI/UX polish pass (this update)
- **Bottom nav fixed for good**: found and fixed the real bug behind the nav sinking below the screen on the More tab — a classic flexbox issue (`.view` needs `min-height: 0` to actually respect `overflow-y: auto` instead of growing past the viewport). The nav is now `position: fixed`, always pinned.
- **New Activity tab** (4th bottom-nav icon): a running feed of everything across every contact — notes, calls, edits — newest first, tap any entry to jump straight to that contact's own Activity tab.
- **Contact header restructured**: Edit, Save-to-phone, and Delete (trash icon, with its confirmation warning intact) now live together at the top.
- **Hero redesigned**: category badge next to the name; address shown as icon + text with a Directions button underneath that links only to the Google Maps link you actually entered (no generic fallback search).
- **Quick actions trimmed** to Call / WhatsApp / Email.
- **Info tab reordered**: Upcoming events lead, Tags moved above phone numbers, the redundant Company row removed (Job title kept), Modified date added under Added date.
- **Richer activity cards**: a note's actual content now shows in its activity card — full text if short, a "Read more" bottom sheet if long, with the note's title and date. Voice notes get an inline audio player that remembers your playback position between visits.
- **Numeric date format** (`31/12/2026 - 10:15 AM`) in the Activity sections, with correct left-to-right number ordering even in the Arabic/RTL layout (a real bidi rendering bug, caught and fixed while testing this in Arabic).

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
