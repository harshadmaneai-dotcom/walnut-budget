# Walnut

A multi-user budget tracker for the browser. Every account signs in with an email and password, and keeps its own budget: spending across three groups — Needs, Expenses and Investments — plus income, accounts, loans with partial repayments and due dates, monthly category budgets, recurring entries and reports. The Assets page tracks income streams and ownership goals — stages, milestones, targets and the real cash flow linked to each one. The dashboard ring chart splits the month across the three groups.

Data lives in Supabase, one row per account, with a per-account `localStorage` cache for offline use. Row-level security means the publishable key shipped in the bundle can only ever reach the signed-in user's own row. While Walnut is open, it polls the row's `updated_at` every few seconds and pulls the document when another device saves, so the same account stays in sync across open devices. Writes are last-write-wins; concurrent edits are not merged.

## Live

- App: <https://walnut-budget.vercel.app> (Vercel project `budget-tracker`)
- Database: Supabase project `mucbgkqwqeqvtgmxplnu`, table `public.walnut_data`
- The migration below is already applied to that project, and `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are set in Vercel for production and preview.

## Which repo is which

One repository builds this app and one Vercel project serves it. Anything else named Walnut on GitHub is a different project.

| Thing | Identifier |
| --- | --- |
| Source of this app | `harshadmaneai-dotcom/walnut-budget` (this repo) |
| Vercel project | `budget-tracker` → <https://walnut-budget.vercel.app> |
| Releases | GitHub Releases on this repo, tag `v<package.json version>` |
| Not this app | `harshadmaneai-dotcom/Walnut` (private, an old prompt-testing tool) |

Pushes to `main` do not deploy the site by themselves: Vercel Git deployments are off for `budget-tracker`, so a site deploy is triggered explicitly (see [Releasing](#releasing)). The app, the APK and the installer always come from GitHub Releases.

## Requirements

- Node.js 18 or newer
- npm
- A Supabase project with email/password auth enabled

## Run it

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## Backend setup

Config lives in `.env` (copy `.env.example`):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

Without both variables the app shows a "Walnut needs its backend" notice instead of the sign-in screen.

1. **Create the data table.** Run `supabase/migrations/0001_walnut_multiuser.sql` in the Supabase dashboard → SQL Editor. It creates `public.walnut_data`, enables row-level security, and adds policies so each signed-in user can only read and write the row whose `user_id` is their own `auth.uid()`. (Already applied to the live project.)
2. **Turn off email confirmation** for instant sign-up: Authentication → Sign In / Providers → Email → disable **Confirm email**. With it enabled, Supabase sends a confirmation link and the app shows a "Confirm your email" screen until it is clicked; the built-in sender is also rate-limited, so it is not suitable for real use without custom SMTP.
3. **Set the site URL** under Authentication → URL Configuration, and add `http://localhost:5173` as a redirect URL for local development if you keep confirmation on.

The old single-user table (`budget_tracker_data`) is left untouched as a backup. The first time an account signs in on a device that still has the pre-multi-user local cache (`budget-tracker:data`), that budget is imported into the account once.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and produce a production build in `dist/` |
| `npm run typecheck` | TypeScript check only |
| `npm test` | Unit tests for balance, loan and recurring logic |
| `npm run desktop` | Build the Windows installer (`release/Walnut Setup <version>.exe`) |
| `npm run desktop:dev` | Build and launch the Electron desktop app locally |
| `npm run desktop:mac` | Build a macOS `.dmg` (run on a Mac) |
| `npm run android:sync` | Build and copy the web bundle into the Android project |
| `npm run release` | Bump, tag and publish a release for desktop and Android |

## Desktop app

The desktop app is the same web bundle wrapped in Electron (`electron/main.ts`, `electron/preload.ts`). It loads `dist/index.html` from disk. Compile it with `npm run desktop:compile` (runs as part of the desktop scripts), which outputs to `dist-electron/`.

- **Windows:** `npm run desktop` produces an unsigned NSIS installer. Windows SmartScreen will warn about it until a code-signing certificate is added; that warning is separate from anything in the app.
- **Renderer hardening:** context isolation on, sandbox on, node integration off, `<webview>` disabled, every permission request denied, and navigation outside the bundled page is blocked and handed to the default browser.
- **macOS:** `npm run desktop:mac` must run on a Mac. Code signing and notarization are not configured.
- **Sign-up links:** confirmation emails redirect to the hosted site, not `file://`. Add the hosted origin to Authentication → URL Configuration in Supabase, and set `WEB_ORIGIN` in `src/lib/downloads.ts`.
- **Downloads:** `npm run release` publishes the installer to a GitHub Release; the landing page links to the stable `releases/latest/download/Walnut-Setup.exe` URL.
- **Updates:** the installed app checks GitHub on launch, every six hours, and from Settings → Desktop app. `latest.yml` in the latest release is what drives it, so the release must always be marked "latest" (the Release workflow does that). The installer force-closes a running Walnut tree (see `installer/installer.nsh`) and the app relaunches after installing.
- **Upgrades:** when replacing an existing install, the installer skips the legacy uninstaller. Walnut 2.0.14 and 2.0.15 shipped electron-builder's broken PowerShell running-app check, so their uninstaller could stop an upgrade with "Walnut cannot be closed" even when nothing was running. The new install overwrites the app tree and writes a fresh uninstaller and registry entry.
- **Size:** the Windows installer is about 120 MB because it bundles Electron and Chromium. The Android APK is small because Android supplies the system WebView. Releases include a `.blockmap`, so `electron-updater` can download only changed blocks when the previous installer is cached; the first update from an older build may still be a full download.

## Android app

The Android app is the same web bundle wrapped in Capacitor (`android/`, `capacitor.config.ts`).

- **Updates:** Settings → Android app → **Check for updates**, or the banner that appears on launch when a newer build exists. The APK downloads in-app (`ApkUpdaterPlugin.java`) and opens the system installer, so the only thing the user taps is Android's own Install confirmation. Android asks once to allow installs from Walnut.
- **Update feed:** the app reads `https://walnut-budget.vercel.app/updates/latest.json` first — a static file published with every release — and only falls back to GitHub's latest-release API. That matters on mobile networks: GitHub allows 60 unauthenticated API requests per hour per IP, and everyone behind a carrier NAT shares one address, so a GitHub-only check sometimes answered 403 and the app looked up to date. A failed check is now shown in the banner with a retry instead of disappearing.
- **Checksum:** the manifest carries the APK's size and SHA-256. The plugin hashes the finished file off the main thread and deletes a mismatch (or a stale file from another build) and tries the next source, so a bad download cannot reach the installer.
- **Dead ends:** a signature mismatch cannot be fixed in place, so the app says so and offers **Open download page** (a real browser intent). Settings → Android app also has **Download in browser** as a permanent escape hatch: it opens this site, where `/updates/Walnut.apk` is served from the same fast host as the feed. Builds before 2.0.11 shipped without the native plugin and cannot update themselves at all; those users install 2.0.20 or newer once manually, and updates work from then on.
- **When someone is stuck:** ask for the version under Settings → Android app, then send them to <https://walnut-budget.vercel.app> (or **Download in browser**). If Android says "App not installed" for a correctly signed build, the phone is usually blocking installs from Walnut, has a build from a different source, or Play Protect is holding it; the app now names the first two instead of looping on "Try again".
- **Version:** `android/app/build.gradle` reads `package.json` (the only version number in the project) and derives `versionCode` as `major*10000 + minor*100 + patch`.
- **Signing:** releases are built with `assembleRelease` and signed by the committed `android/app/walnut-debug.jks` through the `release` signing config. The file keeps its historical name, but it is the app's release identity: Android refuses an update whose signature differs, so the workflow pins the certificate and fails if it ever changes. Never ship `assembleDebug` — a debuggable APK lets adb read the signed-in session and is what security scanners flag.
- **What the workflow checks:** `versionName`/`versionCode` match `package.json`, the manifest is not debuggable, the APK is signed with the v2 and v3 schemes, and the certificate equals `EXPECTED_APK_CERT`.
- **Update integrity:** `ApkUpdaterPlugin` only hands a downloaded APK to the installer when its SHA-256 matches the published manifest and its signing certificate matches the installed app. A tampered, truncated or stale download is deleted instead of installed.
- **Known weakness:** the keystore password is still `walnut`, so anyone with read access to this repository can sign a build that Android would accept as an update. Fixing that means re-encrypting the same key under a strong password (`keytool -importkeystore`), which preserves the certificate and therefore existing installs. Do it with the original file backed up.

## Auto-tracking UPI payments (Android)

Settings → **Auto-track UPI payments** turns the confirmation Google Pay, PhonePe, Paytm, BHIM or Amazon Pay shows after a successful payment into an expense. It is Android-only and opt-in: off by default, nothing is captured on the desktop or the website, and manual entry is unchanged either way.

### Notification access is what makes it work

Android has no per-app, per-payment notification permission. The only supported way to see a payment confirmation while Walnut is closed is the **Notification access** special permission (`BIND_NOTIFICATION_LISTENER_SERVICE`), granted in system settings rather than by a dialog. Walnut's listener (`UpiNotificationListener.java`) is bound by the system only after that grant, and the permission can be revoked at any time.

- **What the permission technically allows.** Once granted, Android delivers every app's notifications to Walnut, not just the five UPI apps'. The listener drops anything that is not from one of those packages on the first comparison, before any text is read.
- **Granting it.** Settings → Auto-track UPI payments → **Open settings**, then enable Walnut under *Notification access* / *Device & app notifications* (the screen is `Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS`). Android 13+ files it under *Special app access*; on some builds it is inside *Privacy*. If Walnut is missing from the list, the system has not yet registered the listener — reopen the app once, or check that the app is not disabled or inside a work profile.
- **Reading the state.** The card shows **Allowed** or **Not allowed**, read from the system setting every time the page is opened or regains focus, so revoking access outside the app is reflected on return. The in-app toggle is separate from the permission: the toggle says whether Walnut should use access it already has.
- **Revoking it.** Turn off Walnut in the same system list. The in-app toggle is untouched, the card returns to **Not allowed**, and nothing more is captured. No other Walnut feature depends on the permission.

### What is captured, and what is kept

- Only a *successful debit* is stored. The parser rejects received, credited, refunded, failed, declined, cancelled, pending, collect-request and promotional notifications, and drops group summaries when a child notification already carries the payment.
- The raw notification text is never written to disk, logged or uploaded. The queue holds exactly five fields per payment: the notification key, the amount in paise, the merchant line, the post time and the source app label.
- A device-local queue in `SharedPreferences` (at most 50 entries) holds payments until the app opens. The web layer drains that queue and merges it through the same `store.update` → Supabase save path as a manual edit, so there is no second sync system and no second table. A payment made while Walnut is closed reaches the desktop at the phone's next app open.
- The transaction id is derived from the notification key, so merging the same item again (a retry, a re-post, or the same payment seen on another device) updates one row instead of adding a second.
- Detected entries land in review: they are marked *Auto*, show a **Needs review** strip in Transactions, and can be confirmed, recategorised or discarded. Discarding deletes the entry and remembers the notification key (the newest 200), so the same notification is not re-added.
- The target account is chosen under **Add detected payments to** and syncs with the document; the toggle itself stays device-local, because a permission belongs to the phone.
- `settings.upiAccountId` and the hidden `upiIgnored` list live in the normal document and need no migration.

### When a payment is missed

The usual causes, in order: notifications for that UPI app are turned off in Android, Walnut was removed from battery-optimised apps, the permission was revoked, or the confirmation did not name an amount (some UPI apps only notify for collect requests). Manual entry always works, and it is the only fallback by design — there is no Accessibility, SMS or screen-scraping path.

## Releasing

```bash
npm run release patch     # 2.0.11 -> 2.0.12 (also minor, major, or an explicit x.y.z)
```

The script checks the tree is clean and in sync, runs the tests, bumps `package.json`, commits `Release v<version>`, pushes the tag, and waits for the Release workflow to publish. The workflow builds the Windows installer and the APK from that commit, verifies both (version, `versionCode`, pinned APK signature), publishes them in one GitHub Release marked "latest", mirrors the APK to `public/updates/` with a `latest.json` manifest, and rejects the release unless the live website feed advertises the new version.

- Both apps read that one release: desktop through `latest.yml`, Android through `updates/latest.json` and the mirrored `Walnut-<version>.apk` (stable copy at `updates/Walnut.apk`), with the release assets as fallback.
- The mirror commit is pushed to `main` by the workflow, so the site must deploy from that push (or from `VERCEL_DEPLOY_HOOK`). The workflow fails if the live feed does not catch up, because GitHub's API alone leaves some networks unable to see updates.
- The release script runs from `main` only; a release is never built from a dirty tree.
- **Website:** Vercel Git deployments are off for this project. Enable them in the Vercel project settings, or add a `VERCEL_DEPLOY_HOOK` secret and the workflow triggers a production deploy after publishing.
- Do not publish GitHub releases by hand — a release without `latest.yml` or without `Walnut.apk` strands one of the platforms.

## Project layout

- `src/lib/supabase.ts` – the shared Supabase client.
- `src/lib/auth.ts` – auth context: session, sign in, sign up, sign out, friendly error messages.
- `src/lib/types.ts` – data model. Amounts are integer cents.
- `src/lib/calc.ts` – pure logic: balances, loan status, monthly totals, recurring rules.
- `src/lib/assets.ts` – asset month totals, all-time capital, milestones and linked-entry rows.
- `src/lib/storage.ts` – per-account local cache, default data, and the one-time legacy import.
- `src/lib/upi.ts` – pure auto-tracking logic: deterministic ids, native item → transaction, review and discard rules.
- `src/lib/upi-native.ts` – the Android bridge and the platform gate; `src/lib/useUpiIngest.ts` drains its queue into the document.
- `android/app/src/main/java/app/walnut/mobile/Upi*.java` – the notification listener, parser, queue and bridge plugin.
- `src/lib/remote.ts` – per-account reads and writes to `walnut_data`.
- `src/store.ts` – React state hook for one account; persists changes and applies recurring rules on open.
- `src/components/AuthScreen.tsx` – sign-in / create-account screen.
- `src/components/Logo.tsx` – the walnut mark used in the rail, auth screen and splash.
- `public/favicon.svg`, `public/apple-touch-icon.png` – browser tab and home-screen icon.
- `src/pages/` – Dashboard, Transactions, Loans, Assets, Reports, Settings.
- `src/components/` – shared modal, forms and settings panels.

## Notes

- Authentication is email and password only: no OAuth, magic links or phone sign-in.
- Loan repayments recorded with an account move that balance: money out for loans you owe, money in for loans owed to you.
- Recurring entries are created when the app opens, for each due date since the last one applied.
- Assets live in the same per-account document as the rest of the budget (data version 6), so they sync through the existing save/poll path. A linked transaction or transfer is the same Walnut entry, never a copy: contributions build capital and stay out of the asset's operating cash flow, and deleting an asset unlinks its entries instead of deleting them.
- The original Assets design reference is kept at `docs/assets-concept.html`; it is not part of the production bundle.
- Every expense category belongs to Needs, Expenses or Investments. Investments are a single bucket with no subcategories, so the transaction form hides the subcategory picker for them.
- Settings → Account shows the signed-in email and signs out. Sign-out leaves no other user's data visible, because the store and cache are keyed per account.
