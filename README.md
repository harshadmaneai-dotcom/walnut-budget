# Walnut

A multi-user budget tracker for the browser. Every account signs in with an email and password, and keeps its own budget: spending across three groups — Needs, Expenses and Investments — plus income, accounts, loans with partial repayments and due dates, monthly category budgets, recurring entries and reports. The dashboard ring chart splits the month across the three groups.

Data lives in Supabase, one row per account, with a per-account `localStorage` cache for offline use. Row-level security means the publishable key shipped in the bundle can only ever reach the signed-in user's own row.

## Live

- App: <https://walnut-budget.vercel.app> (Vercel project `budget-tracker`)
- Database: Supabase project `mucbgkqwqeqvtgmxplnu`, table `public.walnut_data`
- The migration below is already applied to that project, and `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` are set in Vercel for production and preview.

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

## Desktop app

The desktop app is the same web bundle wrapped in Electron (`electron/main.ts`, `electron/preload.ts`). It loads `dist/index.html` from disk. Compile it with `npm run desktop:compile` (runs as part of the desktop scripts), which outputs to `dist-electron/`.

- **Windows:** `npm run desktop` produces an unsigned NSIS installer. Windows SmartScreen will warn about it until a code-signing certificate is added.
- **macOS:** `npm run desktop:mac` must run on a Mac. Code signing and notarization are not configured.
- **Sign-up links:** confirmation emails redirect to the hosted site, not `file://`. Add the hosted origin to Authentication → URL Configuration in Supabase, and set `WEB_ORIGIN` in `src/lib/downloads.ts`.
- **Downloads:** upload the installers to a GitHub Release, then set `DESKTOP_DOWNLOAD_URL` in `src/lib/downloads.ts`. The landing page links to that one constant.

## Android app

The Android app is the same web bundle wrapped in Capacitor (`android/`, `capacitor.config.ts`). The site serves a fixed `public/Walnut.apk`, and the Android workflow builds the same bundle as a debug APK.

- **Updates:** Settings → Android app → **Check for updates** reads `public/app-version.json` from the deployed site and compares it with the build it is running. The APK opens in the browser (allow installs from the browser once) and installs over the previous version.
- **Release checklist:** bump `package.json`, `versionName`/`versionCode` in `android/app/build.gradle`, `ANDROID_VERSION` in `src/lib/downloads.ts` and `public/app-version.json`, then `npm run android:sync`, `cd android && ./gradlew assembleDebug`, and replace `public/Walnut.apk` with `android/app/build/outputs/apk/debug/app-debug.apk`. The feed and the APK must ship in the same commit, or users are prompted for a build they already have. Use `android:sync` rather than a bare build, because `dist/Walnut.apk` is a copy of the previous release and would otherwise be bundled inside the new APK.
- **Signing:** builds use the committed `android/app/walnut-debug.jks` so an update installs over the installed app. If that key is ever replaced, everyone has to uninstall once.

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
