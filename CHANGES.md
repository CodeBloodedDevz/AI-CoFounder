# Splash screen

- `src/screens/SplashScreen.js` rebuilt from the designer's splash (HTML + screenshot): logo badge, AICO + AI pill,
  tagline, "Empowering micro-businesses across Africa" pill, animated progress bar, rotating status line,
  Enterprise Encrypted / POPIA Compliant marks and version line. It is shown on **every launch**
  (`RootNavigator`): at least 3 seconds, and longer if the session / saved data is still loading, then it goes to
  Log in or the dashboard as before. The unused `Splash` route was removed.
- New `splash.*` texts in English, Afrikaans and isiZulu. `app.json` native splash colour now matches the screen.
- Tests: `jest.setup.js` (AsyncStorage mock) is now actually loaded via `package.json`, and safe-area is mocked.

# Sponsored page: business adverts

**Run `backend/supabase/sponsored.sql` in Supabase and `npx expo install expo-image-picker` after updating.** See
"Sponsored page" in the README for the rules.

- **App:** new **Sponsored** tab (featured strip with priority / featured adverts rotated fairly per person per day,
  category chips, search, standard list), **business page** behind Learn More (WhatsApp as the main button, call, email,
  website, social links, products and services with prices, report an advert), **My adverts** (business page status,
  plan allowance, adverts with status and figures, payment tracking, renewal reminder 3 days before the end),
  **advert editor** (picture, title, description, category, package choice with price summary, Paystack payment or
  the Premium allowance; edit, fix-and-resubmit, renew), **advert details** (statistics with a 30-day chart, contact
  breakdown, history, withdraw), **business page editor** (prefilled from the business's records, products and services
  from stock / services in one tap, preview). More > Advertising links to both. All text in English, Afrikaans and isiZulu.
- **Backend:** `routes/sponsored.js` (app API), `admin/sponsored.js` (portal API), `lib/sponsored.js`,
  `lib/sponsoredRules.js`, `lib/sponsoredPayments.js`, `lib/sponsoredMedia.js`. The Paystack webhook and return page
  now also settle advert payments and refunds. Suspending an account hides its adverts. Plans gained `adPurchase`
  and `adsIncludedPerMonth`.
- **Admin portal:** **Sponsored Adverts** page: review queue (adverts, changes to live adverts, business page updates,
  user reports), review panel (the advert as the app shows it, old vs new business page, automatic warnings, owner,
  payments, statistics, history; approve now or on a date, reject / suspend / remove with ready-made reasons), all
  adverts, advertising payments (re-check with Paystack, mark refunded), packages (super admins edit prices), and
  engagement by category. The bell shows the review queue.
- **Tests:** `backend/test/sponsored.test.js` (21 tests), `src/lib/sponsoredRules.test.js`.

# Changes

## Settings, keyboard visibility, Business Analytics graph, Upcoming Work page

- **Settings: Preferred Language removed.** The language picker is gone from More. The Voice & Language row still shows
  the current language and is the one place to change it. The "partly translated" note moved there too. Edit Business
  now links to Voice & Language instead of having its own picker, and saving business details never sends a language
  (so it can't undo a change made on Voice & Language). First-time setup keeps its picker.
- **Keyboard (shared):** new `hooks/useKeyboard.js` measures how much of a container the keyboard really covers. This
  works on edge-to-edge Android, where the window is no longer resized, and gives 0 where the system already made room.
  New `KeyboardDismissButton` ("Hide keyboard").
- **Customer messages and every bottom sheet:** the sheet sits on top of the keyboard and shrinks to fit, the field
  being typed in is scrolled into view, and "Hide keyboard" appears next to Close/Cancel while typing. Dragging the
  content or tapping the dimmed background closes the keyboard; that first tap never discards the message. The message
  box grows to 180 px, then scrolls inside itself so the cursor line stays visible. Close buttons now clear the
  home-indicator / navigation bar.
- **AI assistant:** the chat sheet (phones) and card (tablets / desktop) are lifted by the measured keyboard overlap.
  Before, iPhones lifted the input too little and Android didn't lift it at all. The input is multi-line and grows to
  about five lines. Return still sends; Shift+Enter adds a line on a computer. While typing, the quick-reply chips make
  way for "Hide keyboard". Dragging the conversation or tapping outside the panel closes the keyboard, and the newest
  message stays in view.
- **Business Analytics:** new `FinanceChart` shows income and expenses as bars per day / week / month, with profit as
  a line. The scale always includes 0, so losses show below the zero line. Tap a period for its dates and exact
  figures (a loss shows in red). `lib/analytics.js` now returns `{ income, expenses, profit, from, to }` per point,
  using the same rules as the totals, so the graph adds up to the cards and updates as soon as records are added,
  edited or deleted. The first card reads "Income" to match the graph. `TrendChart.js` was removed (no longer used).
  `compactMoney()` (scale labels: R950, R1.3k, R1.5M) is in `lib/numbers.js`.
- **Upcoming Work page** (new route `UpcomingWork`): Home shows a 3-item preview with a "See more" button (with "+N" when
  more are waiting) under it whenever anything is booked; it is the only link to the page (the "See all" link was
  removed so there aren't two). The page shows the full list, grouped Today / Tomorrow / Next 7 days / Later, with "Needs an outcome" and the reminder notices on top.
  Every existing action works there (complete, confirm, reschedule, remind, cancel, booking details with reminders).
  Tapping a booking on Home opens its details on that page. Rescheduling opens the booking form on Customers & work,
  and Back returns to the list. The page reuses `OperationsScreen` (`mode="upcoming"`), so the rules live in one place.
  `OperationsScreen` also accepts `editWorkId` to open a booking straight into its form.
- New text is in English, Afrikaans and isiZulu (the i18n parity tests pass).
- Tests: per-period income / expenses / profit, the graph adding up to the totals, edits and deletions
  (`analytics.test.js`), and `compactMoney` (`numbers.test.js`).

## UI redesign to match the designer's HTML screens

- **Design tokens** (`src/theme.js`): the designer's palette (violet `#8234C6` accent, crimson `#B60E3D` highlight, coral-to-violet
  gradient `#FF4D6D` -> `#8234C6`, lavender surfaces `#F9F9FF` / `#F1F3FF` / `#E9EDFF`), softer card borders and radii. Every screen
  picks these up automatically; no screen logic was touched.
- **Typeface**: Inter everywhere (`src/lib/fonts.js`, loaded in `App.js`; new dependency `@expo-google-fonts/inter`).
- **Shared components**: new `components/ui.js` (Card, Pill, Toggle, SettingsGroup / SettingsRow, SectionLabel) and
  `components/ScreenHeader.js` (round back button, title, subtitle). Restyled `Button` (gradient glow), `StatCard`, `GradientHeroCard`,
  `BackButton` (round arrow), `Input`, and the bottom tab bar (filled icon for the active tab).
- **More**: rebuilt as the designer's page: profile card with plan badge and Upgrade link, grouped settings cards (Business Setup,
  Insights & Tools, Preferences & Localization, Billing & Subscription), Log out, version. Same destinations, dialogs and language picker.
- **Subscription**: new header, billing switch, plan cards with the "Popular" Pro card, check-circle features and the "Secured by
  Paystack" panel. Checkout, polling, manage / cancel / renew logic is unchanged.
- **Voice & Language** (new screen, More -> Voice & Language): hero card with Test Voice and "Speak responses aloud" (the same
  voice setting Live Voice uses) and the app-language list (English, Afrikaans, isiZulu) saved through the existing `setLanguage`.
- New text is in `en`, `af` and `zu` (the i18n parity tests pass).
- Not built: the four admin designs (Platform Overview, AI Ops, Revenue & Billing, Tenant Directory) - the app has no admin role or
  platform data yet.

## Live Voice: English conversation, three-language interpreter, cleaner screen

- **Conversation is English only.** The "Answer in" option and its dropdown are gone; speech is recognised as English
  and the AI always answers in English (also for settings saved by older versions).
- **Interpreter languages:** English, isiZulu (Zulu) and Afrikaans only, in a single "I speak ⇄ Translate to" card
  with a swap button. Picking the same language on both sides swaps them instead of allowing a pointless pair.
- **Removed from the screen:** detected-language labels, the pause indicator, pop-up notes, and language tags under
  messages. What remains: the mode switch, the animated microphone with one plain status line ("Listening",
  "Hearing you", "Thinking"...), the conversation, and errors that need action (microphone permission, retry).
- **Header** says what is happening: "Hands-free conversation in English" or "English ⇄ isiZulu".
- **Controls** have labels under the icons (Mute, Send, Stop) next to the Start / End button.
- **Settings** open as a sheet like the rest of the app, in plain words: *Pause before replying* (Quick / Balanced /
  Patient), *Microphone sensitivity*, *Voice speed*, *Read answers aloud*, *Let me interrupt*, each with a one-line
  explanation. The "I speak" picker and the seconds stepper were removed (the language is now fixed by the mode).
- Same colours, gradient orb and layout direction; works from a 320 px phone to desktop.
- Tests: settings rules (English-only conversation, the three interpreter languages, no same-language pair), the
  Live Voice session tests, and a browser run of conversation and interpreter mode.


## No email service: recovery keys for sign-up and password reset

Email verification (Brevo / SMTP / Resend) is removed completely: no API keys, SMTP settings, DNS records or domains.

- **Sign-up** creates a ready-to-use account and shows a **recovery key** once (new `RecoveryKeyScreen`; Copy on
  the web, Save or share on phones; "I have saved my recovery key" before continuing). The person is logged in.
- **Forgot password** asks for the email, the recovery key and a new password (same page design). Success logs the
  person in and shows a new key; the used key stops working. Wrong / someone else's / used keys and unknown emails
  get the same answer; keys are locked after repeated wrong tries, plus per-IP and per-email limits.
- **Profile → Account recovery** shows whether there is a key and creates a new one after the password is entered
  (this is how existing accounts get their first key).
- Accounts the old email flow left unverified are activated by logging in with the correct password.
- `npm run recovery-key -- email` lets the server operator issue a new key to someone who lost both password and key
  (after confirming who they are).
- Storage: HMAC-SHA256 with `RECOVERY_SECRET` (the former `OTP_SECRET` value, moved) in the private `email_otps`
  table; no database migration needed. Keys and passwords never appear in logs.
- Removed: `lib/mailer.js`, `lib/smtp.js`, `lib/brevo.js`, `lib/otp.js`, `scripts/check-email.js`, the
  `/auth/verify-otp`, `/resend-otp`, `/forgot-password`, `/reset-password` routes, the Verify Email screen, the
  code-entry helper, the email/OTP settings in `.env` and `.env.example`, and their tests.
- Tests: `backend/test/recovery.test.js` runs the real routes (sign-up, reset, reuse, someone else's key, guessing
  lock, unknown email, Profile key, old unverified accounts); a browser test drives the real routes through the
  app screens on phone size and desktop (register → key → log in; forgot password → new key; old password and
  used key refused; Profile new key).


## Email through Brevo (no 2-step verification needed)

- New `backend/src/lib/brevo.js`: sends the verification and reset emails with Brevo's HTTP API using an API key
  (`BREVO_API_KEY`). No Google 2-step verification or app password; works over HTTPS, so hosts that block mail
  ports are fine. The mailer uses Brevo automatically when the key is set; SMTP (e.g. Mailjet) remains the
  alternative (`MAIL_PROVIDER` can force one).
- `npm run check-email you@example.com` now checks the Brevo key, checks that `MAIL_FROM` is a confirmed Brevo sender
  (and says so if it's missing or unconfirmed), and sends a test email. The server checks the same at start-up.
- Clear errors for a wrong key, an unconfirmed sender, an account not yet activated for transactional email, rate
  limits and network problems; logged with a masked address, never the code.
- Tests (`backend/test/brevo.test.js`) run both flows end to end against a local stand-in for Brevo's API: the
  request the server sends, the code taken from it verifying the account and resetting the password, and every
  error case. README → Email has the Brevo steps.


## Verification emails delivered; Live Voice text without language tags

**Why no code arrived.** Two causes in the configuration and one in the reset flow:
1. Before the last update the server used Resend with the sender `no-reply@yourdomain.com`, an example address
   on a domain that was never verified with Resend; Resend refuses such messages (and, without a verified domain,
   only delivers to the Resend account's own address), so registration and reset emails never went out.
2. After switching to SMTP the SMTP settings in `backend/.env` were still empty and `MAIL_FROM` was still the
   example address, so the server correctly refused to send.
3. "Forgot password" silently sent nothing to accounts that had registered but never verified, which is exactly
   what happens when the sign-up email didn't arrive; those people could not get any code at all.

**What changed**
- A built-in SMTP client (`backend/src/lib/smtp.js`, Node's own TLS; `nodemailer` is no longer needed): port 465
  TLS or 587/25 with STARTTLS (the password is never sent unencrypted), AUTH PLAIN / LOGIN, certificate checks,
  a standard email with plain-text and HTML parts, Date and Message-ID headers.
- The example sender, empty host or empty password are reported precisely (server start-up, `/health?deep=1`,
  `npm run check-email`, and the sign-up / reset error). Gmail app passwords may be pasted with spaces.
- Every send and failure is logged with a masked address and the mail server's reply, never the code.
- Unverified accounts can use Forgot password; entering the emailed code also verifies the account.
- End-to-end tests (`backend/test/emailFlow.test.js`) run a real SMTP conversation against a local test server:
  the registration email and the reset email are delivered (STARTTLS and TLS), the code is read **from the
  received email** and verifies / resets; wrong, expired and reused codes are refused; a wrong SMTP password,
  a refused recipient, an untrusted certificate and a server without encryption all fail safely with clear errors.
- Delivery to a real inbox needs your SMTP account: see README → Email, then `npm run check-email`.

**Live Voice: no more `[en reply=en]`.** The AI is asked to start each spoken answer with `[user=xx reply=yy]` so
the app knows the languages; the old filter only removed that exact form, so variants such as `[en reply=en]`,
`(user: en, reply: af)` or `user=en reply=en:` were shown and read aloud. Now `lib/speechMeta.js` (server and app)
recognises all of these, keeps the languages they name (so replies keep the right voice), and removes them from
replies, from the conversation history sent back to the AI (so it stops copying them), from interpreter replies,
and from transcripts; recogniser notes such as `[BLANK_AUDIO]` or `(music)` are removed from transcripts. Only
bracketed groups made entirely of language codes are removed, so words people say in brackets stay. Tested with
English, Afrikaans and isiZulu examples, in the agent, and in the browser (Live Voice showed clean text).


## Voice auto-send, email through SMTP, Groq model fixes, configuration

**After updating:** `npm install` in `backend/` (adds `nodemailer`), fill in the SMTP settings in `backend/.env`
(README → Email), run `npm run check-email you@example.com` and `npm run check-ai`, and rotate the exposed keys
(README → Security).

**Voice: sends when you stop talking**
- The chat microphone and Voice Notes now work like ChatGPT's voice input: tap once, speak, and it sends by itself
  when you stop. Tapping the red button sends straight away; leaving the screen throws an unfinished recording away.
  Live Voice already worked this way and uses the same detection.
- New `src/lib/voice/utterance.js` (+ `useAutoVoiceInput`) built on the existing voice-activity detector:
  it measures the room for the first 0.3 s, counts only sound clearly above the background as speech (the
  Live Voice *sensitivity* setting), ignores clicks and steady noise (fans, traffic), keeps quiet syllables
  (hysteresis), and ends the message after the *pause* setting (default 1.1 s for chat; voice notes allow longer
  thinking pauses: at least 1.8 s). The recording starts when the microphone opens, so first words aren't cut.
- Exactly one submission: by the pause, a tap, or the length limit (60 s chat, 2 min notes); nothing heard in
  8–10 s stops without sending. Recordings are saved on the device first; a dropped connection is retried twice
  automatically and the chat offers **Retry sending the recording**.
- On the web the browser's echo cancellation and noise suppression are used. Phones record with expo-audio and
  the same adaptive detection.
- Tested end to end in Chrome with a real (simulated) microphone: the chat sent once by itself, Voice Notes stopped
  and transcribed by itself, and Live Voice answered two turns in a row without any tap. The phone path uses the
  same code with the native microphone; test it in Expo Go.

**Email: Resend removed, SMTP added**
- `backend/src/lib/mailer.js` now sends through any SMTP provider (Brevo, Gmail, Microsoft 365, Zoho, Mailgun, SES...)
  using `nodemailer`. Clear errors for wrong login, unreachable server, refused sender and rate limits, without
  codes or addresses. `npm run check-email` verifies the settings; the server checks them at start-up and in
  `/health?deep=1`. All Resend settings and code were removed.
- OTP rules are unchanged and enforced on the server: random codes, hashed with `OTP_SECRET` (now a 96-character
  random value), expiry, attempt limit, resend cooldown, hourly cap, per-IP limits; reset codes are separate from
  sign-up codes. New tests cover expiry, cooldown, the hourly cap and code randomness.

**Groq models**
- The `llama-3.1-8b-instant` errors came from a hard-coded fallback model in `lib/llm.js` (used by the agent and
  Live Voice) and `scripts/check-ai.js`. The server now asks Groq which models the key can use and picks, for chat,
  Live Voice, speech-to-text and auto-language speech-to-text, the configured model if available or a suitable
  available one; a model answering "does not exist" is skipped automatically. Retired-model, bad-key and missing-key
  problems are reported clearly to the app and in the log instead of failing silently. No hard-coded
  `llama-3.1-8b-instant` remains (a test checks this).

**Configuration**
- `backend/.env` is now read from the backend folder whatever folder the server is started from.
- Stray lines in `.env` that were not comments were commented; `TRUST_PROXY` is off for local use (turn it on only
  behind a proxy, otherwise visitors could fake their IP to avoid rate limits). Paystack stays in test mode
  (`PAYSTACK_ALLOW_LIVE=false`), plan limits stay enforced.


## Business Information: view first, edit on request

- **Business Profile → Business Information** now opens a read-only page (`BusinessInfoScreen`) showing the
  saved profile from the server: name, category, business mode, products / services, goals, location, opening
  hours, currency, preferred language, and the owner's contact details (from Profile, with a link to change them).
  Only fields that have a value are shown; optional ones still empty are listed in one line ("You can still add: …").
  An **Edit Business Information** button at the bottom opens the existing edit page.
- **Saving** on the edit page returns to Business Information with a "Business information saved." message and the
  updated details. Pull down to reload from the server.
- **No business information yet** (or a profile without a name, the one required field): the page goes straight to
  the edit page instead of showing an empty profile. It replaces itself in the history, so Back from the edit page
  returns to Business Profile and there is no loop; after the first save it shows the new information page.
- **New users** are still taken to business setup after registering when they have no business, then to Home.
  Existing users with a saved business are never sent through setup again.
- The data is the signed-in owner's only: the server's `GET/PUT /business` work on the caller's own business.
- Browser tests cover the read-only view, the redirect for missing / incomplete information (once, no empty page),
  returning after a save, and the navigation from Business Profile.


## Appointment reminders that arrive as phone notifications

**Run `backend/supabase/schema.sql` again** (adds `upcoming_work.reminders`) and **`npm install`** (adds
`expo-notifications`). See "Appointment reminders" in the README for testing on a phone.

- **Choosing reminders.** The booking form has a Reminders row: On the day, 1 / 2 / 3 days before, **Custom**
  (1–60 days or 1–72 hours before), several at once (up to 5), or **No reminders**. It shows exactly when each one
  will arrive. New bookings default to 1 day before. Saved with the booking on the server (validated there too),
  so they follow the booking everywhere.
- **Delivery when the app is closed.** Reminders are scheduled with the phone's own notification system
  (local notifications), so iOS / Android deliver them at the set time without the app running. They contain the
  service, customer, date and time, and the business name ("Tomorrow: Haircut — with Lerato · Thu 22 Oct at
  10:00 · Thando Spaza"). Tapping one opens Manage bookings on that booking.
- **Always in step.** The phone's pending reminders are re-synced on every booking change and whenever the app is
  opened: editing date/time or reminders reschedules them; cancelling, completing, marking missed or deleting
  removes them; reminders whose time has passed are skipped; logging out removes them all. Each reminder has an
  identifier made from the booking, the reminder, its time and its text, so syncing never creates duplicates.
- **Seeing what will happen.** Each upcoming booking shows "Next reminder Mon 19 Oct 08:00", "Reminders off",
  "Reminder times have passed", or a warning if notifications are off on this phone. Tapping a booking shows its
  reminders with their times and a button to change them. Completed / missed / cancelled bookings show that no
  reminders are needed.
- **Permission.** Asked once, after explaining why, when the first booking with reminders is saved. If notifications
  are off, Manage bookings says so with an **Open Settings** button. The web app explains that reminders arrive on
  the phone.
- New files: `src/lib/reminders.js` (rules), `src/lib/notifications.js` (phone scheduling),
  `src/context/RemindersContext.js` (sync, permission, tap handling), `src/components/ReminderPicker.js`.
- Tests: `src/lib/reminders.test.js` (times incl. month ends and early starts, multiple reminders, skipped states,
  rescheduling ids, the 60 cap), `src/lib/notifications.test.js` (sync against a simulated phone: schedule, no
  duplicates, edit, cancel, logout, web), a backend test for saving / validating reminders, and browser tests of
  the reminder settings. Delivery itself needs a real phone: see the README's quick test.


## Removed: "Customers & work" buttons and the Voice Notes language picker

- **Home** (service and hybrid businesses) and **Business Profile** no longer show the "Customers & upcoming work" /
  "Customers & work" buttons. The surrounding buttons close up with the usual spacing. Customer and booking
  management itself is unchanged and still reachable from Home's **Upcoming work → See all / Schedule** (every
  business type), the **Customers to follow up** card, Stock & Services → **Manage bookings** (hybrid), and a
  customer's history → **Book an appointment**.
- **Voice Notes** no longer has a language picker at the top; the record button now sits directly under the page
  heading. Notes are transcribed in the business's **Preferred language** from Business Profile: English → English,
  Afrikaans → Afrikaans, isiZulu (or none) → automatic detection (the speech service has no isiZulu model; it still
  transcribes English or Afrikaans speech). Language support in speech processing, the chat and Live Voice is
  unchanged. Texts used only by the removed controls were removed from the translation files.


## Completed bookings record their income; transactions can be edited

**Run `backend/supabase/schema.sql` again** after updating (it adds the booking price and the booking ↔ income
link; existing data is kept). Until then bookings still complete normally, and the app says that automatic
income needs the database update.

**Completing a booking records its income**
- Each booking now has an agreed **price**, filled in from the service when it is booked (it can be changed for
  that booking). Older bookings use the service's current price.
- Marking a booking **Completed** (from Manage bookings, a "They came" correction, logging a past visit, or the AI
  assistant) creates one income transaction: amount = the booking price, date = the booking's date, item = the
  service, description "Haircut – Lerato", linked to the booking and the customer (`booking_id`, `customer_id`,
  `source = 'booking'`, `booking_price`). It appears at once in Transactions, Home, Analytics and every income total.
- **Never twice.** The database allows one income per booking (unique index on `booking_id`), and the server looks
  for an existing one before creating; completing again, refreshing, reopening or editing the booking keeps the
  same transaction (and keeps any edits made to it).
- **Safe on failure.** The income is written first; if that fails the booking is *not* marked completed and the app
  says so. If marking the booking fails after the income was written, that income is removed again.
- **Undo completion** removes the automatic income (the confirmation says so). A booking with no price is still
  completed and the app asks you to record the payment in Transactions.

**Editing transactions**
- Tap a transaction, then **Edit transaction**: amount, description, item / category, date (not in the future), note,
  and quantity for product sales typed in by hand (stock is corrected to match). Saved on the server (`PUT
  /transactions/:id`), so it persists after refresh and on other devices.
- Booking income stays linked to its booking and customer after editing. Its original **booking price is kept
  separately**, so a R250 booking edited to R300 shows "Booking price R250, plus R50 extra (e.g. a tip)", and the
  booking's own price does not change.
- Every edit is kept in an **audit trail** on the transaction (`edit_history`: what changed, from what to what, when);
  the details show "Edited 2 times, last on …".
- Totals, balances, Home, Analytics and a customer's "spent" (now the actual income received, tips included)
  update immediately.

Tests: `backend/test/bookingIncome.test.js` (10 tests: one income per booking, duplicates, undo, missed→completed,
no price, rollback when the income can't be saved, editing a tip with audit trail, validation, stock), plus browser
tests of completing a booking, undoing it, and editing the income.


## Voice: Voice Notes, chat microphone and Live Voice on phones

**What was wrong.** All three features send audio to the backend's speech-to-text. On phones they did that
differently from every other request in the app: a multipart upload that hands React Native the recording's
*file path* to read during the upload, through separate code with its own token handling and no shared timeout
logic. When that read fails (a recording that was moved, an Expo Go storage path, a file the upload layer can't
open), React Native reports it as a network failure, and every voice error, whatever its cause, was shown as
"Couldn't connect to server". So the message was wrong in most cases, and the real cause was hidden.

**What changed**
- **One path for all voice requests.** The app now reads the recording itself (`src/lib/audioUpload.js`) and sends
  it as normal JSON (base64) through the same API client as everything else: the same server address, fresh login
  token with automatic refresh, timeouts (90 s for a voice note, 30 s per Live Voice segment, 45 s for a Live Voice
  reply) and cancellation. The server accepts this (`POST /ai/transcribe`, 18 MB limit on that route only) and
  still accepts multipart uploads from other clients.
- **Honest errors.** Each failure says what actually happened: the recording couldn't be read / was empty / too
  long; the server couldn't be reached (with the address that was tried); it was too slow; speech-to-text isn't
  configured on the server; the login expired. A phone that couldn't work out the computer's address (Expo in
  `--tunnel` mode) is told how to fix it.
- **Microphone permission.** Asked every time recording starts, so a permission turned off in Settings is noticed.
  When it is refused, Voice Notes, the chat and Live Voice show **Open Settings**, which opens the app's settings page.
- **Server address on phones.** The backend prints the Wi-Fi addresses phones can use when it starts; the README
  explains `EXPO_PUBLIC_API_URL` for tunnels, hotspots and deployed servers.
- **Voice Notes:** extra taps while the recorder starts or stops are ignored; a failed transcription is shown at
  the top as well as on the note (which keeps its Retry button).
- **Live Voice:** replies play on the loudspeaker while the microphone stays open for the next turn; network
  hiccups are reported and listening continues (as before); "Pause Ns" is translated.
- **Formats:** phone containers Whisper doesn't list by name (`.aac`, `.3gp`) are sent under a name it accepts.

**Tests:** `backend/test/transcribeUpload.test.js` (JSON upload decoding, size and format handling) and
`src/lib/audioUpload.test.js` (encoding, missing recordings). A real recording from Chromium's microphone was
read, encoded and checked end to end. The phone path (expo-audio + expo-file-system) could not be run here:
test it in Expo Go as described in the README.


## Code health and security review

**Correctness**
- **An older refresh could undo a save.** If a background refresh (pull-to-refresh, returning to the app) was
  still loading when a save finished, its older data replaced the new value on screen (for example a booking just
  marked Completed showed as Scheduled again until the next refresh). Loads now notice that a save happened
  meanwhile and keep the newer data.
- **Fewer requests.** After a change the app used to reload all seven data sets; it now reloads only what that
  change can affect (a sale: transactions and stock; a booking: bookings), and combines changes made close together.
- The hybrid Home "bookings this week" count uses the same definition of upcoming as Manage bookings.
- Several references found by a full type check were fixed while removing unused code (the subscription status
  chip and the service dashboard now always get the helpers they use).

**Maintainability**
- Removed unused imports and variables across the app and server, and three files nothing used
  (`src/lib/greeting.js`, `src/screens/AIChatScreen.js`, `src/i18n/translations.js`, which were leftover
  re-export shims).
- The list of unfinished booking statuses is defined once (`src/lib/schedule.js`) and reused by the booking rules.
- `multer` (a server-side upload library) was listed as an app dependency but never used by the app; it remains a
  backend dependency, where it is used.
- `npm run dev` in the backend used `nodemon`, which wasn't installed; it now uses Node's built-in `node --watch`.

**Security**
- Every data route was checked: each requires a signed-in, verified owner and only reads or changes rows of that
  owner's business; ids are validated; the payment webhook verifies Paystack's signature; the error handler never
  sends internal details to the app.
- No secret keys are in the source code. The app only contains Supabase's *publishable* key (public by design; the
  tables have row-level security with no public access). It can now also be set with `EXPO_PUBLIC_SUPABASE_URL` /
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `.gitignore` ignored `.env.example` along with `.env`, so the example files would never reach version control; fixed.
- Secrets stay in `backend/.env` only (service-role key, Groq, Resend, Paystack, OTP secret). Never commit or share it.


## Interface consistency pass (same palette, style and layouts)

- **One heading hierarchy everywhere.** Page titles, page subtitles, section titles and form titles now come from
  shared presets in `src/theme.js` (`type.pageTitle`, `type.pageSubtitle`, `type.sectionTitle`, `type.formTitle`),
  so every page has the same sizes, weights and spacing (before, section titles varied between 14.5 and 15 px and
  header spacing between 16 and 20 px).
- **Empty states.** A shared `EmptyState` component replaces the assorted italic one-liners: a card with an icon,
  a sentence and a hint for "no customers / bookings / products / services yet", and a compact one-line version
  for "nothing matches your search or filter". Used on Customers & work, Stock, Services, Stock & Services,
  Transactions, Analytics, Home, Voice notes and the customer history.
- **Booking rows on small phones.** The status label now sits on the title line, so the details and the action
  buttons (Complete, Missed, Reschedule, Cancel...) use the full width and no longer stack one per line.
- **History filters** only show the statuses that actually occur (plus "All"), so there are no "(0)" chips.
- **Business name** in the More header wraps to two lines instead of overflowing.
- Checked on a 320 px-wide phone: no page has content running off the screen.


## Manage bookings: statuses, visits, missed appointments and history

**After updating, run `backend/supabase/schema.sql` again in the Supabase SQL editor.** It adds the booking
history columns and the double-booking guard; existing bookings are kept. (Until then everything still works,
only the completion time, reschedule details and notes are not stored.)

**Statuses.** Every booking is in exactly one state, shown as a coloured label everywhere it appears:

| Shown as | Stored status | Meaning |
|---|---|---|
| Scheduled | `Pending` | Booked for today or later |
| Confirmed | `Confirmed` | Booked, and the customer confirmed |
| Needs an outcome | `Pending` / `Confirmed` | Its time (start + service duration + 30 min) is over and nobody recorded what happened yet |
| Completed | `Completed` | The visit happened. **The only state that counts as a visit** |
| Missed | `No-show` | The time passed and the customer did not come |
| Cancelled | `Cancelled` | Cancelled; kept in the history and can be restored |

A booking moved to another date or time is a **reschedule**: it stays Scheduled / Confirmed and shows
"Rescheduled from …" (`rescheduled_from`, `reschedule_count`).

**Visits are counted from the records, never stored as a counter.** A customer's visits = their bookings with
status Completed. Completing an already completed booking changes nothing (the first completion time is kept),
so refreshing, reopening or editing a booking can never add a second visit. Undoing a completion, or correcting
a missed booking to completed, updates the count straight away. Scheduled, missed and cancelled bookings never count.

**Missed appointments.** Nothing is ever marked missed automatically. When an appointment's time is over (also
if that happened while the app was closed) it moves to **Needs an outcome** at the top of Manage bookings, and
Home shows "N appointments need an outcome". The business taps **Complete** or **Missed**. "Missed" is offered
only 15 minutes after the start time (`MISSED_GRACE_MINUTES` on the server), times are South African time on the
server, and a booking without a time can be marked from that day on. A missed booking can be **rescheduled**
(it becomes Scheduled again) or corrected with **They came**.

**Actions per state.** Scheduled / Confirmed: Confirm, Reschedule, Remind, Cancel, and on the day Complete / Missed.
Completed: Edit details, Undo completion (a completed visit can't be cancelled). Missed: Reschedule, They came,
Delete. Cancelled: Restore (a past one asks for a new date), Delete. Missed, Cancel and corrections ask first.

**Customer history.** Each customer shows "2 visits · 1 upcoming · 1 missed · R380 spent" and the next
appointment or last visit. Tapping a customer opens their history: completed visits, upcoming, missed and
cancelled counts, most recent visit, next appointment, spend, every appointment with its status, and a
"Book an appointment" button that opens the booking form with the customer filled in.

**Validation (app and server, same rules; the AI assistant uses them too).**
- A booking needs a customer (in the app), a title or service, and a real date; the customer must still exist.
- New bookings are for today or later; a past date can only be logged as a Completed visit.
- A future booking can't be completed or marked missed; rescheduling must be to today or later.
- The same customer can't be booked twice at the same date and time, or for the same service on a day without
  times (checked in the app, on the server, and by a database index against double taps).

**Also:** customers with an unfinished booking are no longer suggested for a follow-up message; cancelled and
missed bookings no longer count towards "popular services" or "busy hours"; the AI only lists open bookings as upcoming.
Tests: `backend/test/bookings.test.js` (10 tests) and `src/lib/bookings.test.js` (10 tests), plus browser tests of the whole workflow.


## Whole-app polish (same design, colours and layouts)

- **Responsive:** on tablets and desktop browsers every page is centred at a comfortable reading width
  (720 px) instead of stretching across the screen; pick-lists are centred too.
- **Accessibility:** muted text, and the green / amber / red status text and badges, are a shade deeper so
  they reach WCAG AA contrast on white (same hues). Buttons, tabs, segmented controls and list options
  announce their role, selected / disabled / busy state to screen readers and keyboard users.
- **Refresh:** pull down on Home, Transactions, Stock, Services, Stock & Services, Customers & work and More to
  reload, without the full-screen loader. If a background refresh fails, a notice says the screen is
  showing the last loaded data instead of failing silently.
- **One error message per failure:** failed saves used to show both a red banner at the top of the app and the
  message on the form. Each screen now shows the error once, next to what the person was doing, starting with
  what failed ("Couldn't add the stock: ...").
- **Consistent messages:** Log in, Register and Business Information use the same error banner as the other
  forms. Business Information marks the name field itself and scrolls to the message; a failed language save is
  reported. Register offers "Log in instead" when the email already has an account.
- **Long lists:** Transactions shows 60 at a time ("Show more"); past appointments 10 at a time; the customer
  list gets a search box once there are more than five customers.
- **Data accuracy:** customer phone numbers are checked (app and server) so WhatsApp / SMS reminders work;
  customer emails are checked on the server as well; an appointment needs a title or a service.
- **Speed:** the server trusts a just-checked login for up to 30 seconds (never past the token's own expiry), so
  the 7 requests a screen load makes no longer each wait for a separate Supabase Auth check
  (`AUTH_CACHE_SECONDS`, 0 turns it off).
- **Hardening:** the API sends `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy` headers.


## Preferred language: English, Afrikaans and isiZulu only

The "Preferred language" picker (Business Profile under More, and Business Information) now offers exactly
**English, Afrikaans and isiZulu (Zulu)**. Its look is unchanged; only the list of options changed.

- **App:** `src/i18n/languages.js` lists only the three languages; the isiXhosa, Sesotho and Setswana resource
  files are removed. "Zulu", "zu" and "isiZulu (Zulu)" all resolve to the stored value `isiZulu`.
- **Saved preferences:** the account's `business.language` and the copy kept on the device can only hold one of
  the three. A choice saved by an older version (isiXhosa, Sesotho, Setswana) is treated as "not chosen": the app
  shows English, the picker shows its placeholder, and the device copy is cleared. Nothing else is changed.
- **Server validation:** `PUT /business` accepts only English, Afrikaans or isiZulu (aliases are saved as the
  picker's name) and answers 400 for anything else; `GET /business` and the AI's business data report an
  old value as not chosen. The interface language sent with AI requests is checked the same way.
- **Unchanged:** the language a person *speaks* to the assistant. Live Voice, voice notes and chat still
  understand and answer in whatever language is spoken, and the interpreter's language list is separate from
  this setting.
- **Tests:** `i18n.test.js` checks that exactly these three are offered and fully translated;
  `businessForm.test.js` and the backend `interfaceLanguage` / `languages` tests cover aliases and old values.

---

# Page-by-page review: what was wrong and what changed

Every page was checked for its purpose, whether it works, and whether what it shows is accurate.
The existing design system (colours, gradient, components) is unchanged; established workflows are kept.

## Problems that affected everyone

| Problem | Fix |
|---|---|
| The server cut the saved currency to 20 characters, so "South African Rand (R)" became "South African Rand (" (no symbol, garbled value in Business Information). | Limit raised to 60. Clipped values are repaired when read (server and app), so existing businesses are fixed without a migration. |
| Several actions used `Alert.alert`, which does nothing in the browser: **cancelling a subscription, deleting a voice note, Team Members, microphone and playback errors.** | Replaced with the app's own dialog / on-screen messages, which work on phone and web. |
| AI insights always said "R", whatever the business currency. | They now use the business's own currency symbol. |
| Form boxes on Services, Customers and Stock & Services were invisible (grey inputs on a grey card). | Forms are now white cards with a border, matching the rest of the app. |
| Long pick-lists (customers, products) were cut off in the selection sheet. | The list scrolls. |
| Many texts were hard-coded in English. | 173 texts added in English, Afrikaans and isiZulu. |
| The database schema and `.env.example` were referenced but missing, so the project couldn't be set up from scratch. | Added `backend/supabase/schema.sql`, `backend/.env.example`, `.env.example` and `README.md`. |

## Log in / Register / Verify email

- The label said "Phone number or Email" but only email works: now "Email", with an email keyboard.
- **"Forgot password?" did nothing: it now opens a working reset** (email a 6-digit code, then choose a new
  password). Codes use the same protections as sign-up codes (hashed, expire, limited attempts, single use)
  but are stored separately, so they never cancel an unfinished sign-up.
- "Continue with Google" always failed: hidden until Google sign-in is actually connected (the code is kept).
- Password fields have a show/hide button; Enter submits; double taps can't send twice.
- The verification screen's explanation is translated.

## Home (product, service and hybrid dashboards)

- New businesses were told their "expenses outpace R0": empty data now gets a helpful message.
- Out-of-stock products were left out of "low stock" counts and insights: now included, with a
  "N products need restocking" shortcut to Stock.
- Recent activity showed raw dates (`2026-10-18`): now "Today", "Yesterday", "Mon 12 Oct"; "See all" opens Transactions; empty state added.
- Service: "Customers served" was simply the number of saved customers: now customers with a completed booking.
  "Transactions" relabelled "Payments recorded" (it counts sales). Popular-service revenue counted unpaid
  bookings: now only completed ones; "customer(s)" text fixed and translated.
- Hybrid: "Customers served this month" now really counts this month; product/service revenue matching ignores upper/lower case.

## Record transaction

- **No quantity: selling 5 loaves took only 1 off stock.** Quantity added for sales.
- Amount fills in from price × quantity (still editable); shows stock left after the sale and warns before overselling.
- The date was UTC (a sale just after midnight was saved as yesterday) and couldn't be changed: local date, date picker, no future dates.
- Amounts like `25,50` or `R 1 250` are accepted; clear messages for missing title/amount/quantity; server errors are shown and nothing is lost.
- Switching between income and expense no longer keeps a product as an expense category.

## Transactions

- Totals (income, expenses, net) for whatever is filtered; newest first within a day.
- Tap a transaction for its details and **delete it** (with confirmation). Deleting a sale puts the units back in stock (new `DELETE /transactions/:id`).
- Search also looks at notes; separate empty states for "nothing yet" and "no match".

## Stock (product businesses) and Stock & Services (hybrid)

- **Products could not be edited** (cost, low-stock level, name, category, stock count were fixed forever).
  Tap a product to edit everything, including a stock-take correction (new `PUT /products/:id`, duplicate names refused).
- **Products were deleted with one tap and no confirmation.** Delete now lives in the product sheet, behind a confirmation.
- Tapping a product used to open the Pro-only Pricing Assistant (free users hit a lock screen): it opens the product details; the assistant is a link inside.
- The restock plan's "Record" button logged an expense that did NOT add stock: "Restock" now fills the Add stock form.
- Add stock: field errors, "adds to Bread (20 in stock)" vs "new product" hint, cost per unit, success message (including the starting selling price for a new product).
- Filter chips show counts; header shows number of products and stock value at cost; search can be cleared.
- The meaningless Back button on the tab screen was removed.

## Services

- One shared, tested form for the Services tab and hybrid Stock & Services.
- Delete asks for confirmation; duplicate names refused; free services (price 0) allowed; duration hint ("About 60 minutes");
  Edit scrolls to the form; "Edit service"/"Add a service" translated; price placeholder uses the business currency.

## Customers & work

- Tabs were hard-coded English; now translated with counts.
- Customers were assigned to bookings **by name**, so two customers with the same name were mixed up: now by ID (phone shown to tell them apart).
- Email addresses are checked; deleting a customer reports success/failure; Edit scrolls to the form.

## Business Analytics

- **The sales trend was hard-coded sample data and This Week / Month / Year did nothing.**
  Now real figures for each period (Monday to today, 1st of the month to today, 1 January to today), a real
  trend (per day / week / month), best sellers for the period, and a comparison with the same number of days
  before. Empty periods say so instead of showing numbers. (`src/lib/analytics.js`, with tests.)

## AI Pricing Assistant

- "Apply price" didn't wait for the save, ignored failures and jumped to Home: now asks to confirm, saves, and shows the result on the page.
- Could suggest a price below cost (lower-cost areas): the suggestion now stays above cost and says why.
- Disabled when the suggestion equals the current price; shows "R2.00 more than now".
- "Ask AI why" only hid the text: it now asks the real AI Co-Founder chat with the numbers.
- Products/services picked by ID; empty state links to Stock/Services; note when no cost price is saved.

## More / Profile / Subscription / Voice notes / AI chat

- More: plan badge translated; "Pro" badge on the Pricing Assistant for free plans; "Coming soon" on Team Members (web-safe dialog); log out asks first; business type and login email in the header.
- Profile: saving didn't wait or report errors, and could silently start a login-email change. It now saves name and phone with clear feedback; the login email is shown read-only.
- Subscription: cancel works on the web; expired-plan notice translated.
- Voice notes: delete confirmation and errors work on the web.
- AI chat: the opening profit line was frozen at the moment the chat was first opened and claimed "sales are up" — now always current and accurate; microphone errors appear in the chat; remaining English texts translated.

## Tests

- Backend (`cd backend && npm test`): new `bookkeeping.test.js` (product edits, transaction delete restores stock,
  currency repair) and `passwordReset.test.js`.
- App (`npm test`): new `analytics.test.js`, `numbers.test.js`, currency case in `businessForm.test.js`; the
  translation test still enforces that English, Afrikaans and isiZulu are complete.
- Every screen was also rendered in all three business models (with and without data) and the main
  flows were clicked through in a browser: validation, success, server failure and retry.

## Not changed (needs a decision)

- The Premium plan lists "Multi-business support" and "Priority support", which the app doesn't provide yet.
  The plan texts are shared with the server's price list, so they were left as they are.
- ~~`SplashScreen` is registered but nothing navigates to it~~ Fixed: the designer's splash now opens on every launch (see top entry).
