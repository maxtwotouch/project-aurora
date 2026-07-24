# Owner setup: Firebase Cloud Messaging for aurora push alerts

This is a **human-only, one-time setup doc**. Nothing here can be automated
by an agent -- it walks the owner (`@maxtwotouch`) through creating the
Firebase project and secrets that `backend/src/fcm.ts` needs. See
`docs/design-aurora-alerts.md` for the design rationale (Option B:
topic-based FCM) and `backend/README.md`'s "Aurora push alerts" section for
what the backend does with these once configured.

**Status note:** `docs/design-aurora-alerts.md` is titled "Status: draft,
awaiting owner sign-off," and its §5 "Decisions for the owner" (provider
choice, threshold defaults, CODEOWNERS additions) isn't marked confirmed in
the doc itself. Read that section before doing the steps below -- this doc
assumes the decisions in §5 are confirmed as written (Option B, ≥70/≥45
thresholds, 01:00–16:00 quiet hours, 1/night cap), since that's what
`backend/src/alerts.ts` and `backend/src/fcm.ts` already implement. If any of
those aren't actually confirmed yet, hold off on the steps below (the code
works fine, and stays fully inert, without them).

## What this backend needs from you

Two secrets, both described in `backend/.env.example`:

- `FCM_PROJECT_ID` -- the Firebase project id.
- `FCM_SERVICE_ACCOUNT` -- a service-account key, as a **single inline JSON
  string** (not a file path -- see `backend/.env.example` for why this app
  chose inline JSON over a file path).

Until both are set, `backend/src/fcm.ts` is inert: the alerts engine still
evaluates triggers and persists state normally, it just skips the actual
publish and logs one line ("alerts engine active, publisher unconfigured").
So there's no rush and no risk in deploying the code before doing this.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com/> and sign in with whichever
   Google account should own this project (consider a dedicated
   project-aurora Google account rather than a personal one, so ownership
   transfers cleanly later).
2. **Add project** → name it something recognizable (e.g.
   `aurora-tromso-alerts`). Google Analytics is not needed for this feature;
   you can decline it.
3. Note the **Project ID** shown on the project's Settings page (gear icon →
   Project settings → General → "Project ID"). This is the exact value for
   `FCM_PROJECT_ID` -- not the display name, the ID (lowercase, hyphenated).

## 2. Enable Cloud Messaging

1. In the Firebase console, go to **Project settings → Cloud Messaging**.
2. Cloud Messaging (the "Firebase Cloud Messaging API (V1)") should already
   be enabled by default for a new project. If the page shows it as
   disabled, enable it there (it links out to the Google Cloud console's API
   library if needed).
3. Nothing else needs configuring here for this backend-only PR -- the
   client-side registration (topic subscription in the Expo app) is a
   separate PR (see `docs/design-aurora-alerts.md` §6, "PR 4"'s client half)
   and needs `google-services.json` / `GoogleService-Info.plist`, which
   don't belong in this backend setup.
   - One addition either way: `backend/src/fcm.ts` publishes now include a
     native APNs alert block for iOS (see `docs/design-aurora-alerts.md` §2
     / `docs/privacy-push-alerts.md`) -- this needs no new secret from you
     here, but FCM cannot deliver *anything* to an iOS device (with or
     without that block) until an APNs Authentication Key is uploaded under
     **Project settings → Cloud Messaging → Apple app configuration**,
     which itself needs the iOS app already registered in the project
     (client-side PR, per the bullet above). Not a blocker for this backend
     setup -- just don't be surprised if iOS delivery still doesn't work
     until that separate, client-side prerequisite is also done.

## 3. Generate a service account key

1. **Project settings → Service accounts**.
2. Firebase pre-creates a default "Firebase Admin SDK" service account here.
   Use that one (don't create a new custom one unless you specifically want
   a narrower-scoped identity) -- it already has the
   `roles/firebasecloudmessaging.admin`-equivalent permission this backend
   needs (send-only: publish to a topic). It cannot read/write your Firestore
   or Auth data or anything else in the project.
3. Click **Generate new private key** → confirm. A `.json` file downloads.
   **Treat this file as a secret from the moment it downloads** -- it grants
   send-as-this-project access to anyone who has it.
4. Do **not** commit this file anywhere, ever (not even to a private repo,
   not even briefly). Don't email it either -- use your organization's
   secret-sharing tool if it needs to move between people.

## 4. Set the secrets on Fly

This app deploys to Fly (`fly.toml`, deployed by
`.github/workflows/deploy.yml`). Secrets are set via `flyctl`, never in
`fly.toml` or any committed file (see `fly.toml`'s own comment on this for
`ADMIN_TOKEN`/`CORS_ORIGINS` -- same rule applies here).

```bash
# FCM_PROJECT_ID: the plain project id string.
flyctl secrets set FCM_PROJECT_ID="aurora-tromso-alerts" --app aurora-tromso-backend

# FCM_SERVICE_ACCOUNT: the ENTIRE downloaded JSON file, inline, as one
# string value. Reading the file directly (rather than retyping it) avoids
# any transcription error in the private_key's embedded newlines.
flyctl secrets set FCM_SERVICE_ACCOUNT="$(cat /path/to/downloaded-key.json)" --app aurora-tromso-backend
```

Notes:

- `--app aurora-tromso-backend` matches the `app` name in `fly.toml`; adjust
  if that's changed.
- Setting a Fly secret triggers a new deploy of the existing image (no code
  change needed) -- the running process picks up the new env vars on that
  restart.
- After it deploys, check the logs for the *absence* of "alerts engine
  active, publisher unconfigured" the next time a refresh cycle runs
  (default every 5 minutes, `REFRESH_MS`) -- that confirms both secrets
  parsed successfully. (There's currently no dedicated success log line for
  a real publish, since real publishes are rare -- at most 1 per night,
  system-wide, by design; see `docs/design-aurora-alerts.md` §1/§3.)
- **Delete the local downloaded `.json` key file** once it's set as a Fly
  secret, unless you have a specific reason (e.g. a password manager entry)
  to keep a copy somewhere secured.
- If the key is ever suspected leaked, **Project settings → Service
  accounts → Manage service account permissions** (opens Google Cloud
  console) → find the key → delete it, then generate a new one and re-run
  step 4. Deleting a key immediately invalidates it; the backend's cached
  OAuth2 access token (see `backend/src/fcm.ts`) expires within an hour on
  its own regardless.

## 5. Where the client-side config goes (reference only -- not this PR)

Native FCM registration on the client (so devices can actually subscribe to
`alerts-ge70` / `alerts-ge45`) needs `google-services.json` (Android) and
`GoogleService-Info.plist` (iOS), downloaded from **Project settings → Your
apps** in the Firebase console after registering the app's bundle
id/package name there. That's a separate, client-side PR (the "PR β" this
task brief refers to, and "PR 4"'s client half / "PR 5" in
`docs/design-aurora-alerts.md` §6) -- this doc stops here on purpose. Do not
add those files to this backend-only change.

Whatever build you test this on, it can never be Expo Go: its prebuilt
binary doesn't contain the `@react-native-firebase` native modules, and SDK
53 removed remote push from Expo Go entirely -- `firebaseSeam.ts`
short-circuits to "unavailable" there without attempting the import (see
`src/notifications/expoGoDetection.ts`). Test on a dev build
(`expo-dev-client`) or TestFlight instead.

## Rollback / disabling

To stop sending alerts without touching code: `flyctl secrets unset
FCM_PROJECT_ID FCM_SERVICE_ACCOUNT --app aurora-tromso-backend`. The engine
falls back to its inert mode immediately on the next restart -- nothing else
needs to change, and no data is lost (the alerts-state.json mirror keeps
tracking night keys/fired tiers regardless, so re-enabling later doesn't
cause a burst of stale pushes).
