# AI Co-Founder

A business companion for small South African businesses (spaza shops, salons, vendors): sales and
expenses, stock, services, customers and bookings, analytics, an AI assistant (chat and live voice),
voice notes and Paystack subscriptions. The app is built with Expo (React Native, also runs in a web
browser); the backend is Node.js + Express on top of Supabase.

```
AI-CoFounder-development/
  App.js, src/          the app (Expo)
  backend/              the API server (Express) + database scripts in backend/supabase/
```

## Requirements

- Node.js 22 or newer (`node -v`)
- A Supabase project (free tier is fine)
- Optional: Expo Go on your phone, a Groq API key (AI), a Paystack test key

## 1. Database (once per Supabase project)

In the Supabase dashboard open **SQL Editor** and run, in this order:

1. `backend/supabase/schema.sql`   (businesses, products, services, customers, bookings, transactions, email codes)
2. `backend/supabase/payments.sql` (subscriptions and payments)

3. `backend/supabase/sponsored.sql` (the Sponsored page: adverts, packages, advert payments, statistics, picture storage)

All are safe to run again on a project that already has the tables. **Run `schema.sql` again after
updating to this version**: it adds the booking-history columns (completion time, reschedules, notes), booking prices and the link
between a completed booking and its income transaction.

## 2. Backend

```bash
cd backend
npm install
# backend/.env is included. For a new project: copy .env.example to .env and fill it in.
npm start
```

You should see `AI Co-Founder backend running on http://localhost:4000` and `Database: connected, all tables found.`
Check it any time at http://localhost:4000/health (add `?deep=1` to test every table).

Accounts need **no email service**: see "Accounts and recovery keys" below.

## 3. App

In a second terminal, from the project folder (the one with `App.js`):

```bash
npm install
npx expo start          # then press w for the web browser, or scan the QR code with Expo Go
```

The app finds the backend automatically: in the browser it uses the same computer, on a phone it uses
the computer running Expo (phone and computer must be on the same Wi-Fi). For a deployed backend or a
tunnel, copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_URL`.

The app's Supabase project URL and publishable key are in `src/supabaseClient.js`; change them if you
use a different Supabase project (they must match the backend's `SUPABASE_URL`).

## 4. Admin portal (ai-cofounder-admin)

The admin website runs on this same backend, so it sees and changes the same data as the app. Its API
lives in `backend/src/admin/` and is mounted at `/admin-api`; the app's own routes are unchanged.

1. In Supabase → SQL Editor, run `backend/supabase/admin.sql` (safe to run again; adds the admin tables
   `admin_users`, `admin_audit_log` and `ai_usage_events`, and never touches the app's tables).
2. Give an existing account admin access (register it in the app first, or create it in Supabase →
   Authentication → Users):
   ```
   cd backend
   npm run admin:add -- you@example.com            # super admin (may also delete records)
   npm run admin:add -- helper@example.com --admin # admin (everything except deleting)
   npm run admin:check                             # checks tables, admins, payments and AI
   ```
   In PowerShell, if the email isn't passed through, run `node scripts/admin-add.js you@example.com`.
3. Start this backend (`npm run dev`), then the admin site (`npm run dev` in ai-cofounder-admin, which
   points at `http://localhost:4000/admin-api`) and open http://localhost:5173.

What the portal can do, and the rules it follows:
- **Suspend / reactivate** an account (a Supabase Auth ban): the person can't sign in, and the backend
  refuses their existing session on the next request (`middleware/auth.js`, code `account_suspended`).
- **Edit or delete** a business's profile, transactions, stock, services, customers and bookings using
  the same functions as the app (`lib/bookkeeping.js`, `lib/bookings.js`, `lib/records.js`), so stock,
  booking income and edit history behave exactly as in the app. Only super admins can delete.
- **Cancel / resume** a plan at period end and **re-check a payment with Paystack**
  (`lib/payments.js`); a plan is still only ever activated by a payment Paystack confirmed.
- Every admin sign-in and change is written to `admin_users`' companion table `admin_audit_log`.
- Revenue counts successful payments in the mode the server takes payments in (test while
  `PAYSTACK_SECRET_KEY` is an `sk_test_` key, live after).
- AI usage (requests, tokens, response time, errors; never message content) is recorded per request
  in `ai_usage_events` by `lib/aiUsage.js` for the Monitoring page.
- If `CORS_ORIGIN` is set, include the admin site's address (e.g. `http://localhost:5173`).

## Sponsored page (business adverts)

A **Sponsored** tab where everyone can browse adverts from businesses on AI Co-Founder, tap **Learn More** for the
business's page (WhatsApp, call, email, website, products and services) and report an advert. Business owners
create adverts in **More > My adverts**; administrators approve them in the admin portal (**Sponsored Adverts**).

**Setup (once):** run `backend/supabase/sponsored.sql` in the Supabase SQL Editor (tables, the four packages and the
`sponsored-media` picture bucket), then in the app folder run `npx expo install expo-image-picker` (picks the version
that matches your Expo SDK; it is already listed in package.json). Restart the backend: it prints `Sponsored: ready.`

**Rules (server-enforced, `backend/src/lib/sponsoredRules.js` and `lib/sponsored.js`):**
- **Who can advertise:** browsing is open to every plan. **Pro** and **Premium** can buy packages; **Free** sees an
  upgrade message (to open buying to Free, set `adPurchase: true` for `free` in `backend/src/lib/plans.js`).
- **Packages** live in the `sponsored_packages` table, so super admins change prices, days and placement in the
  portal without a code change. Starting values: Starter R99 / 7 days / standard; Growth R249 / 14 days / featured;
  Premium Campaign R499 / 30 days / priority. A running campaign keeps what it was bought with.
- **Premium allowance:** one standard 14-day advert per South African calendar month, no payment. It doesn't roll
  over; withdrawing that advert before it goes live gives the month's allowance back. The database refuses a second
  claim in the same month (unique index), so double taps can't use it twice.
- **Order of steps:** create → pay (Paystack) → admin review → live. The campaign's days start at approval, so time
  in review is never lost. A rejected advert is fixed and resubmitted **without paying again**.
- **Only shown when** approved, paid (or covered by Premium), inside its dates, with an approved business page, and the
  owner's account isn't suspended. Ended campaigns disappear immediately; an hourly job also records them as ended and
  closes adverts nobody paid for in 14 days.
- **Edits to a live advert or to the business page** wait for approval while the approved version stays up.
- **Withdrawing** is possible until the advert goes live. A paid advert is then marked **refund requested**: refund it in
  the Paystack dashboard (the `refund.processed` webhook updates everything) or mark it refunded in the portal.
- **Renewing** creates a new campaign with the same content; if the current one is still running, the new one starts
  when it ends.
- **Pictures** are uploaded through the app (PNG / JPEG / WebP, at most 2 MB). The server checks the file's real type,
  stores it under a random name and never overwrites it, so an approved picture can't be swapped later. Links to
  pictures on other websites are refused.
- **Payments** reuse the subscription rules: nothing moves forward until Paystack's own verify call confirms the exact
  amount, currency and order. Advert payments are stored in `sponsored_orders` (references start with `acfad-`) and go
  through the same webhook and return page as plan payments.
- **Statistics:** views, Learn More taps, page visits and WhatsApp / call / email / website taps, each counted once per
  person per advert per day; owners viewing their own adverts are not counted. Owners see their own figures only.
- **Safeguards:** every advert is reviewed by a person. The review panel shows automatic warnings (money or health claims
  that are often misleading, a public name that differs from the registered business name, the same picture or title
  used by another business, phone numbers or links in the text, user reports). Users can report adverts; admins can
  suspend, reinstate or remove them. At most 5 open adverts per business; rate limits on uploads, creation and reports.

**Testing payments:** with an `sk_test_` key, pay with one of the test cards listed in Paystack's documentation
(Payments > Test payments). The advert moves to *Waiting for approval*; approve it in the portal and it appears in the tab.

**Tests:** `cd backend && npm test` runs `test/sponsored.test.js` (the whole lifecycle against an in-memory database and
a simulated Paystack); `npm test` in the app folder covers `src/lib/sponsoredRules.test.js` and the translations.

## Accounts and recovery keys (no email needed)

Sign-up and password reset work **without any email service, API key, DNS record or domain**.

- **Sign up:** name, email, password. The account is ready immediately and the app shows a **recovery key**
  once, e.g. `K7MQ2-XWPAH-3DRTN-VYC9E`. The person saves it (Copy on the web, Save or share on a phone, or writes
  it down) and ticks "I have saved my recovery key" to continue.
- **Forgot password:** email + recovery key + new password. A correct key changes the password, logs the person
  in and shows a **new** key (the used one stops working). A wrong key, someone else's key, an unknown email or a
  used key all get the same "do not match" answer.
- **Profile → Account recovery:** shows whether the account has a key and creates a new one after the current
  password is entered. Accounts created before this change start here (they have no key yet).
- **Accounts left unverified by the old email-code sign-up** are activated the next time they log in with their
  correct password (and get a recovery key).
- **Lost both password and key:** the person who runs the server checks who they are (in person, or on a phone
  number already known), then runs `npm run recovery-key -- person@example.com` in `backend/` and gives them the
  new key privately.

**Security:** keys are 20 random characters (about 99 bits), stored only as an HMAC-SHA256 keyed with
`RECOVERY_SECRET` (server only) in the private `email_otps` table, single-use, and locked after
`RECOVERY_MAX_ATTEMPTS` wrong keys (default 8) for `RECOVERY_LOCK_MINUTES` (60), on top of per-IP and per-email
request limits. Keys and passwords are never logged or stored in the app.

**Limitation (honest):** without sending an email, the app cannot prove that the email address typed at sign-up
belongs to that person; it is a login name protected by the password and the recovery key. Anyone who has a
person's recovery key and email can reset their password, so the key must be kept private like a password.

## AI models (Groq)

`GROQ_CHAT_MODEL`, `GROQ_VOICE_MODEL`, `GROQ_STT_MODEL` (and optional `GROQ_STT_MODEL_AUTO`) choose the models.
At start-up the server asks Groq which models your key can use; a configured model that doesn't exist (for
example a retired one) is replaced by a working one from a short list, with a warning in the log. Run
`npm run check-ai` to see the available models, what the server will use, and a test request.

## Voice features on a phone (Voice Notes, chat microphone, Live Voice)

Speech-to-text runs on the backend (Groq Whisper; the key stays in `backend/.env`, never in the app), so the
phone must be able to reach the backend:

1. `GROQ_API_KEY` must be set in `backend/.env` (without it voice returns "Voice-to-text isn't set up").
2. Phone and computer on the **same Wi-Fi**, and start Expo normally (`npx expo start`, not `--tunnel`).
   The app then uses your computer's address automatically.
3. When the backend starts it prints the addresses phones can use, e.g. `http://192.168.1.20:4000`.
   Open `http://<that address>/health` in the **phone's browser**: if it doesn't load, the computer's firewall is
   blocking port 4000 (on Windows allow Node.js on *Private* networks) or the Wi-Fi isolates devices.
4. Using `--tunnel`, a hotspot, or a deployed backend? Create `.env` next to `package.json` with
   `EXPO_PUBLIC_API_URL=http://<address from step 3>` (or your https URL) and restart Expo.
5. The first time, allow the microphone. If it was refused, the app shows **Open Settings** to turn it back on.

If something is wrong the app now says which: unreachable server (with the address it tried), slow response,
speech-to-text not configured, microphone permission, or a recording that couldn't be read.

## Appointment reminders (notifications)

Reminders are **local scheduled notifications** (`expo-notifications`): when a booking is saved, the app hands
each reminder and its exact time to iOS / Android, and the phone shows it in the notification centre at that
time, even if the app is closed or not running. No server, push service or credentials are needed, and this
works in **Expo Go** (Expo Go only lacks *remote* push notifications on Android, which this doesn't use).

Setup and testing:
1. `npm install` (installs `expo-notifications`; or run `npx expo install expo-notifications` to get the exact
   version for your Expo SDK), then `npx expo start` and open the app on the phone.
2. Create or edit a booking and choose its reminders (on the day, 1/2/3 days before, custom days or hours before;
   several at once, or none). After saving, the app explains and asks for notification permission once.
3. Quick test: book an appointment for today about 70 minutes from now, add a custom **1 hour before**
   reminder, save, close the app completely, and wait about 10 minutes.

Good to know:
- Reminders are scheduled on the phone(s) where the app is installed and signed in. Bookings created or changed
  on the web or another device are picked up the next time the app is opened on the phone (it re-syncs on
  opening and on every change). Logging out removes this phone's reminders.
- Editing the date/time, changing reminders, cancelling, completing, marking missed or deleting a booking
  updates or removes its pending reminders. Reminder times use the phone's time zone.
- "On the day" and "N days before" arrive at 08:00 (an hour before the appointment if it starts before 09:00).
- iOS allows 64 pending reminders per app; the app keeps the 60 soonest and adds later ones as those pass.
- Android may delay a reminder by a few minutes when battery saving is on; allow notifications for the app
  (Android 13+ asks for this permission).
- Tapping a reminder opens Manage bookings on that booking.
- A standalone / store build needs no extra credentials for these local notifications. Remote push (e.g. to
  remind on a phone that hasn't opened the app) would need EAS push credentials and is not used.

## Security: keys

`backend/.env` holds secret keys (Supabase service role, Groq, Paystack, RECOVERY_SECRET). It is git-ignored and must never
be committed, shared, or put in the app. The keys in the copy you shared have been exposed, so **rotate them**:
Supabase → Project Settings → API (new secret key), Groq console → API Keys, Paystack → Settings → API Keys
(test key). Then paste the new values into `backend/.env` and restart. `RECOVERY_SECRET` has been set to a random
value: keep it; changing it makes every existing recovery key stop working (owners can create new ones in Profile).

## Tests

```bash
npm test                 # app: logic, translations, voice
cd backend && npm test   # server: payments, AI tools, product edits, password reset
```

## What changed in this version-

See `CHANGES.md` for the page-by-page review and every fix.
