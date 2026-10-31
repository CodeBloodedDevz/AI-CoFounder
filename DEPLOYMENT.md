# Deployment guide

How AI Co-Founder is deployed, and what you need to do to work on it, build the app, or test it.
For running everything on your own computer, see [README.md](README.md) first.

## How it fits together

```
Android phone (APK)  ──internet──▶  Backend on Render  ──▶  Supabase (database)
built with EAS                      (Express, backend/)      Groq (AI)
                                    holds the secret keys    Paystack (payments)
```

| Part | Where it lives | Address |
|---|---|---|
| App (Expo, `App.js` + `src/`) | Built into an APK by **EAS** (Expo's build service) | Expo project `@nkosingiphilemt/ai-cofounder` |
| Backend (`backend/`) | **Render** web service, free plan, Frankfurt | https://ai-cofounder-api-j7wa.onrender.com |
| Database | **Supabase** project `lkcarrbnfgpffmixcyqx` | — |

Why two services: the backend holds secret keys (Supabase service role, Groq, Paystack). Anything inside
an APK can be unpacked and read, so those keys must stay on a server. EAS only builds apps; it can't run
the Express server, so the backend runs on Render.

Health check: https://ai-cofounder-api-j7wa.onrender.com/health (add `?deep=1` to test every table).

## What you need

- **Node.js 22+** (`node -v`)
- **Access to this GitHub repo**
- **The secret values for `backend/.env`.** Ask the project owner, privately. Never send them in a
  group chat, and never commit them.
- **An Expo account** (expo.dev), only if you will build the app. See "Building the app" below.
- **Render access**, only if you will manage the backend. Ask the owner to invite you to the workspace.

> **Windows users:** if `npx` or `npm` fails with *"running scripts is disabled on this system"*, either use
> `npx.cmd` / `npm.cmd` instead, or run this once in PowerShell:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Working locally

1. Copy `backend/.env.example` to `backend/.env` and fill in the secret values you got from the owner.
2. Install and start the backend:
   ```bash
   cd backend
   npm ci
   npm start
   ```
   You should see `Database: connected, all tables found.`
3. In a second terminal, from the project root:
   ```bash
   npm ci
   npx expo start
   ```
   Press `w` for the browser, or scan the QR code with **Expo Go** (phone on the same Wi-Fi).

Expo Go is only for quick testing while you code: it needs your computer running. Testers get the
APK (see below).

To use the **deployed** backend from your local app instead of your own, copy `.env.example` to `.env`
in the project root (it already contains the Render address) and restart Expo.

## The backend on Render

The Render service deploys **automatically** whenever a commit that changes `backend/` lands on
`main`. Other branches do not deploy. Watch progress under the service's **Events** and **Logs** tabs.

Settings (Render dashboard → service → **Settings**), in case it ever needs re-creating:

| Setting | Value |
|---|---|
| Type | Web Service (Node) |
| Branch | `main` |
| Root Directory | `backend` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Region / Plan | Frankfurt / Free |

Environment variables (Render → **Environment**). These are the same as `backend/.env`, except:

| Variable | Value on Render |
|---|---|
| `PUBLIC_API_URL` | `https://ai-cofounder-api-j7wa.onrender.com` |
| `NODE_VERSION` | `22` |
| `TRUST_PROXY` | `1` |
| `PORT` | *not set (Render chooses the port)* |

After changing a variable, click **Save, rebuild, and deploy**.

**Free plan note:** the server goes to sleep after about 15 minutes without traffic. The first request
after that takes around 30 seconds; later ones are fast.

## Building the app (Android APK)

Build settings are in [eas.json](eas.json). Both profiles point the app at the Render backend through
`EXPO_PUBLIC_API_URL`.

| Profile | Produces | Use it for |
|---|---|---|
| `preview` | `.apk` you can install directly | Testers, friends, your own phone |
| `production` | `.aab` for Google Play | Play Store (needs a Google Play developer account) |

```bash
npx eas-cli@latest login                                   # once
npx eas-cli@latest build -p android --profile preview      # ~10–20 min on Expo's servers
```

When it finishes you get a link and a QR code. Builds are also listed at
https://expo.dev/accounts/nkosingiphilemt/projects/ai-cofounder/builds.

**Who can build:** the project belongs to the Expo account `nkosingiphilemt`, so only that account can
start builds. To let teammates build, the owner must move the project to the team account
`nkosingiphilemts-team` (expo.dev → project → Settings → Transfer project) and invite them.

**Signing key:** the first build created an Android keystore, stored by Expo. Don't delete it under
**Credentials**: every update to the app must be signed with the same key, or phones will refuse to
update it.

## Installing and testing the APK

**On a real phone:** open the build link on the Android phone → **Install** → allow installs from this
source when Android asks → open **AI Co-Founder**. The link can be shared with anyone; testers don't
need an Expo account.

**On an emulator (no phone needed):**
1. Install **Android Studio** (developer.android.com/studio) and choose the **Standard** setup.
2. **More Actions → Virtual Device Manager → +**, pick a Pixel phone and the newest system image.
3. Start it with ▶, then drag the downloaded `.apk` onto the emulator window,
   or run `npx eas-cli@latest build:run -p android --latest`.

**What to check:**
1. Sign up / log in (app ↔ backend ↔ database)
2. Send a message in the AI chat (Groq)
3. Add a product or customer (saving data)

While someone tests, Render → service → **Logs** shows their requests live.

## Releasing a change

1. Make the change on a branch, test it locally, open a pull request, merge into `main`.
2. **Backend changes** deploy to Render automatically after the merge.
3. **App changes** need a new build: run the `preview` build again and send testers the new link.
   (Changing `eas.json` or `app.json` always needs a new build.)

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Render logs: `Unregistered API key` | `SUPABASE_SERVICE_ROLE_KEY` is wrong or was deleted. Create a new secret key in Supabase → Project Settings → API Keys and update it on Render and in `backend/.env`. |
| Render logs: `voice: "llama-3.3-70b-versatile" is not available` | Harmless. The server falls back to `openai/gpt-oss-20b`. Run `npm run check-ai` in `backend/` to see the models on the account. |
| `GET / 404` in Render logs | Normal. The server has no home page. |
| App: "Couldn't reach the server" | The free server is waking up; wait 30 s and retry. Otherwise check `/health`. |
| `npx expo-doctor` reports problems | Run `npx expo install --check` and fix the versions before building; EAS builds can fail on mismatched packages. |

## Known issues

- 3 tests in `src/components/VoiceConversation.test.js` fail: icon fonts can't load inside Jest. This is a
  test setup problem, not an app bug; all other tests pass.
- The app has no icon set yet, so it shows Expo's default icon.
- The keys that were once committed in `backend/REMOVE.env` (now removed) are still in the git history.
  Groq, Paystack and `RECOVERY_SECRET` still need rotating; the Supabase key has already been replaced.
