# Walnut

A multi-user budget tracker for the browser. Every account signs in with an email and password, and keeps its own budget: spending across three groups — Needs, Expenses and Investments — plus income, accounts, loans with partial repayments and due dates, monthly category budgets, recurring entries and reports. The dashboard ring chart splits the month across the three groups.

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
- **Version:** `android/app/build.gradle` reads `package.json` (the only version number in the project) and derives `versionCode` as `major*10000 + minor*100 + patch`.
- **Signing:** releases are built with `assembleRelease` and signed by the committed `android/app/walnut-debug.jks` through the `release` signing config. The file keeps its historical name, but it is the app's release identity: Android refuses an update whose signature differs, so the workflow pins the certificate and fails if it ever changes. Never ship `assembleDebug` — a debuggable APK lets adb read the signed-in session and is what security scanners flag.
- **What the workflow checks:** `versionName`/`versionCode` match `package.json`, the manifest is not debuggable, the APK is signed with the v2 and v3 schemes, and the certificate equals `EXPECTED_APK_CERT`.
- **Update integrity:** `ApkUpdaterPlugin` only hands a downloaded APK to the installer when its signing certificate matches the installed app. A tampered or substituted download is deleted instead of installed.
- **Known weakness:** the keystore password is still `walnut`, so anyone with read access to this repository can sign a build that Android would accept as an update. Fixing that means re-encrypting the same key under a strong password (`keytool -importkeystore`), which preserves the certificate and therefore existing installs. Do it with the original file backed up.

## Releasing

```bash
npm run release patch     # 2.0.11 -> 2.0.12 (also minor, major, or an explicit x.y.z)
```

The script checks the tree is clean and in sync, runs the tests, bumps `package.json`, commits `Release v<version>`, pushes the tag, and waits for the Release workflow to publish. The workflow builds the Windows installer and the APK from that commit, verifies both (version, `versionCode`, pinned APK signature), publishes them in one GitHub Release marked "latest", and re-checks the live download URLs.

- Both apps read that one release: desktop through `latest.yml`, Android through the release tag plus `Walnut.apk`.
- The release script runs from `main` only; a release is never built from a dirty tree.
- **Website:** Vercel Git deployments are off for this project. Enable them in the Vercel project settings, or add a `VERCEL_DEPLOY_HOOK` secret and the workflow triggers a production deploy after publishing.
- Do not publish GitHub releases by hand — a release without `latest.yml` or without `Walnut.apk` strands one of the platforms.

## Project layout

- `src/lib/supabase.ts` – the shared Supabase client.
- `src/lib/auth.ts` – auth context: session, sign in, sign up, sign out, friendly error messages.
- `src/lib/types.ts` – data model. Amounts are integer cents.
- `src/lib/calc.ts` – pure logic: balances, loan status, monthly totals, recurring rules.
- `src/lib/storage.ts` – per-account local cache, default data, and the one-time legacy import.
- `src/lib/remote.ts` – per-account reads and writes to `walnut_data`.
- `src/store.ts` – React state hook for one account; persists changes and applies recurring rules on open.
- `src/components/AuthScreen.tsx` – sign-in / create-account screen.
- `src/components/Logo.tsx` – the walnut mark used in the rail, auth screen and splash.
- `public/favicon.svg`, `public/apple-touch-icon.png` – browser tab and home-screen icon.
- `src/pages/` – Dashboard, Transactions, Loans, Reports, Settings.
- `src/components/` – shared modal, forms and settings panels.

## Notes

- Authentication is email and password only: no OAuth, magic links or phone sign-in.
- Loan repayments recorded with an account move that balance: money out for loans you owe, money in for loans owed to you.
- Recurring entries are created when the app opens, for each due date since the last one applied.
- Every expense category belongs to Needs, Expenses or Investments. Investments are a single bucket with no subcategories, so the transaction form hides the subcategory picker for them.
- Settings → Account shows the signed-in email and signs out. Sign-out leaves no other user's data visible, because the store and cache are keyed per account.
