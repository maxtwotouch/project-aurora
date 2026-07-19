# Design: user-submitted spot reviews and photos

Status: **draft, awaiting owner sign-off**. No code in this PR. Requested
directly by the owner; this is the largest privacy-surface expansion the app
has taken on — free text and images can carry identity (typed-in
names/contacts, EXIF GPS, faces) even when we never *ask* for it. Read
against `CLAUDE.md`'s privacy guardrails, which are the constitution for
this doc: aggregate by default, no PII ever, opt-in with still-no-identity
for anything richer than the existing counters, human review before merge
for anything that receives/stores/exposes user data.

Grounding: `backend/src/{server,events,usageStore,stats}.ts`,
`src/analytics/{consent,events,core}.ts`, `docs/privacy-usage-events.md`,
`docs/design-aurora-alerts.md` (structure template), `.github/CODEOWNERS`,
`docs/privacy-policy.md`.

---

## 1. Product shape (phased — start minimal)

### Phase R1 — anonymous structured reviews (recommended start)

- **Star rating** (1–5), required.
- **Tag chips**, optional, multi-select from a fixed server-side vocabulary
  (`parking_easy`, `parking_crowded`, `dark_sky`, `wind_exposed`,
  `icy_path`, `worth_the_walk`, ...) — closed set, nothing free-text to
  moderate here.
- **Short free text**, optional, hard cap **280 characters**, enforced
  client-side for UX and server-side as the real limit (same "server is the
  source of truth" pattern `events.ts` uses for its type allowlist).
- **No accounts, no names, no reply threads.** A review is tied to
  `spotId` only — never to a person, device, or "the same submitter again."
- Publishes only after moderation (§3) — once free text exists, a human
  reads it before it's public, even in R1.

### Phase R2 — photos (only once R1's moderation loop is proven)

- Capped count/submission (proposed: 3) and size (proposed: 5 MB
  pre-compression, target ~500 KB–1 MB after).
- **EXIF stripped client-side before upload** — GPS/device/timestamp
  metadata never reaches our server or object storage. The headline
  mitigation is "never arrives," not "deleted after."
- Pre-publication moderation only — no auto-publish path for images, ever.

### What we will NEVER collect (either phase)

- Identity: no name, email, phone, or account.
- Contact info as a field — if typed into free text, that's a moderation
  catch (§2), not something we solicit.
- Precise *user* location. A review is tied to the spot's fixed location
  (like `usageStore.ts`'s `spotId`), never the submitter's GPS.
- Device identifiers of any kind — no install ID, no push token, no
  fingerprinting.

## 2. Privacy architecture

**Consent UX.** Per-submission notice, not a buried toggle and not a
one-time modal — submitting is an active act, unlike passive `spot_view`
counters. Shown every time, right above submit:

> "Your review is public and anonymous. Don't include your name, contact
> details, or anything personal — we can't remove information from other
> people's screens once seen, and reviews are moderated but not instant."
> *(needs i18n + legal pass before ship.)*

This is a warning at the point of harm, not a dismissible checkbox —
submission itself is the opt-in act, same philosophy as
`src/analytics/consent.ts` treating anything short of an explicit choice as
"no."

**Free-text risk.** The realistic threat is a user typing a name or phone
number into the 280-char field. Layered mitigations (no single one is
sufficient): (1) the length cap bounds worst-case exposure; (2) the
submission-time warning catches well-intentioned users first; (3)
**pre-publication human moderation (§3) is the real backstop** — a human
reading 280 characters beats a PII regex, and MVP volume should keep this
tractable.

**Image risks (R2).**
- *EXIF GPS/device metadata* — stripped client-side; **verified
  server-side as defense in depth** (re-parse on receipt, reject/re-strip
  if anything survived) — same "don't trust the edge" instinct as
  `events.ts` re-validating `type`/`spotId` server-side.
- *Faces/identifiable people* — no face-detection ML proposed for MVP
  (real cost, real false-negative risk, its own data-processing surface).
  Instead: an explicit **moderation rule** — reject any photo with an
  identifiable person, no exceptions. This makes photo review slower than
  text review; budgeted in §3.
- *Copyright* — a required attestation checkbox next to the consent notice
  ("I took this photo and I'm okay with it being shown publicly").

**Storage design.**
- *Reviews (text/rating/tags):* new `backend/src/reviewStore.ts`, same
  shape as `usageStore.ts` — small store behind an interface,
  JSON-mirrored (`backend/data/reviews.json`), swappable for a DB later.
  Unlike `usageStore.ts` this holds actual submitted content, so it's
  **protected from day one** (CODEOWNERS, §5).
- *Photos:* need **object storage** — a real owner decision with real
  recurring cost.

  | Option | Storage | Egress | Notes |
  |---|---|---|---|
  | **Cloudflare R2** (recommended) | ~$0.015/GB-mo | **$0** | Already on Cloudflare elsewhere; S3-compatible; free tier likely covers all MVP volume |
  | Fly volumes | ~$0.15/GB-mo | billed per region | Ties photos to one VM's disk; no built-in CDN; every image request round-trips the Fastify app |
  | AWS S3 | ~$0.023/GB-mo | ~$0.09/GB after free tier | Mature, but egress compounds if reviews get popular; new vendor relationship |

  **Rough MVP cost:** ~200 photos/month at ~800 KB average (client-compressed)
  ≈ 160 MB/month growth; ~5,000 views/month at similar size ≈ 4 GB/month
  egress. R2 ≈ **under $1/month** (likely $0, free tier), staying cheap at
  10× growth since egress is free — the line item that matters once photos
  get *viewed* more than uploaded. **Recommendation: R2.** Confirm before
  any bucket exists — new vendor credentials (`R2_*` env vars), same
  category of decision as provisioning `ADMIN_TOKEN`.

**Retention & deletion.** Same GDPR caveat as the usage counters
(`docs/privacy-usage-events.md`): a published anonymous review can't be
linked back to its submitter, so we cannot honor an identity-based deletion
request — there's no "mine" to look up. What we *can* offer: a
**deletion-code approach**. On successful submission, return a random,
single-use `deletionToken`, shown **exactly once**, with copy telling the
submitter to save it. `POST /v1/reviews/:token/delete` removes the review
(and photos) if the token matches — possession of the token is the only
credential, since requiring anything else would mean collecting an
identifier. A lost token means a genuinely unremovable review; that's an
accepted tradeoff (the alternative — an account system — would violate the
no-identity guardrail to make deletion more convenient), stated plainly in
the privacy policy (§4).

## 3. Moderation — the real operational cost

Pre-publication only, no exceptions: nothing is publicly visible until a
human approves it via an admin view gated by `ADMIN_TOKEN` (same mechanism
as `POST /v1/admin/refresh` / `GET /v1/stats/usage`). New:
`GET /v1/admin/reviews/pending`, `POST /v1/admin/reviews/:id/approve`,
`POST /v1/admin/reviews/:id/reject`.

**Estimated owner workload.** A plausible MVP ceiling is dozens of
submissions/week, but review isn't fast — a 280-char text takes seconds;
a photo needs an actual "is there an identifiable person" look, which is
slower. At ~30 reviews/week (mixed, once R2 ships), budget
**15–30 min/week** of focused owner time, as a **standing** commitment, not
a one-time setup — an abandoned queue leaves every submitter's content
invisible forever, worse for trust than not shipping the feature at all.
Treat "can I actually do this every week" as a real go/no-go input (§6).

**Spam/abuse — the honest tension.** Rate limiting normally keys on
*something* identifying — CLAUDE.md names IP addresses explicitly as
never-store. Anonymous-and-abuse-resistant is genuinely unresolved here,
not a solved problem:

1. **Submission caps per spot per hour** (e.g. 5/spot/hour), enforced
   purely against existing `reviewStore` counts — no requester identifier
   at all. Cleanest fit with the guardrail. Weakness: doesn't stop one
   determined actor from using the whole cap themselves; bounds blast
   radius per spot, not per abuser.
2. **Transient, never-persisted, never-logged per-IP throttling** — hold
   recent IPs only in an in-memory sliding-window `Map`, cleared on a
   timer, never written to disk or `app.log`. This doc will not decide
   this unilaterally: CLAUDE.md's "do not store or log IP addresses" has
   no explicit in-memory/process-lifetime carve-out. An in-memory
   rate-limit counter arguably isn't "storage" in the persistent-record
   sense the guardrail targets (contrast `usageStore.ts`'s JSON mirror) —
   but it's exactly the ambiguity CLAUDE.md's closing line ("stop and flag
   it") asks us to surface, not resolve silently. **Flagged for explicit
   owner decision (§6).**
3. **Proof-of-work** (small client-side computation before submit) —
   genuinely identifier-free; raises the cost of scripted spam without
   touching the IP question. Weakness: real engineering cost for a payoff
   limited to bulk/scripted abuse, plus a mild tax on real users' devices.

No option is free. Realistic MVP answer: **(1) alone at launch**, accepting
a higher spam ceiling for a clean privacy story; (2) held in reserve as an
explicit, documented exception if (1) proves insufficient — not shipped
preemptively.

## 4. Legal flags for the owner

- **UGC hosting obligations (EU DSA).** Once we host user content, the
  EU's Digital Services Act notice-and-takedown basics plausibly apply
  (Norway generally incorporates EU digital rules via the EEA agreement —
  confirm applicability with counsel, don't assume). Practical minimum
  regardless: a visible "report this" path for anyone, feeding the same
  moderation queue from §3, and a documented process to act on reports
  promptly.
- **Image rights.** Beyond the submitter's attestation (§2), a public
  viewpoint photo is generally low-risk, but one including a recognizable
  third party or private property overlaps the "identifiable person"
  moderation rule already in place — one rule covers both concerns.
- **Privacy policy needs a new section — yes.** Draft bullet for
  `docs/privacy-policy.md` (mirrors its existing "What we collect"
  structure):

  > **Spot reviews and photos (opt-in).** If you submit a review, we
  > publish your star rating, any tags you select, and any text you write
  > (up to 280 characters) — publicly, anonymously, and permanently unless
  > you use your one-time deletion link. We do not ask for your name or
  > contact details, and you should not include them. If you attach a
  > photo, we remove its location and device metadata before storing it,
  > and no photo is shown publicly until a human has reviewed it. We
  > cannot identify who submitted a review or photo after the fact, so we
  > also cannot honor a request to "delete everything I've submitted"
  > unless you kept your deletion link.

## 5. What this touches

**New CODEOWNERS entries**, mirroring the existing `events*`/`stats*`/
`usageStore*` pattern:
```
/backend/src/reviews*          @maxtwotouch
/backend/src/**/reviews*       @maxtwotouch
/backend/src/reviewStore*      @maxtwotouch
/backend/src/photoStore*       @maxtwotouch   # R2 only, added with that PR
/backend/src/moderation*       @maxtwotouch
/backend/data/reviews.json     @maxtwotouch
/src/reviews/                  @maxtwotouch   # submission UI, R1
/docs/privacy-spot-reviews.md  @maxtwotouch
/docs/privacy-policy.md        @maxtwotouch   # already user-facing, tightened here
```

**New privacy doc:** `docs/privacy-spot-reviews.md`, mirroring
`docs/privacy-usage-events.md`'s structure (collected / not collected /
retention / access control / open items) once R1 actually ships — this
design doc is the precursor, not a substitute.

**New backend routes** (none open raw content without moderation between):
- `POST /v1/spots/:id/reviews` — submit (public, rate-limited per §3).
- `GET /v1/spots/:id/reviews` — public read of **approved** reviews only.
- `POST /v1/reviews/:token/delete` — self-service deletion (§2).
- `GET /v1/admin/reviews/pending`, `POST /v1/admin/reviews/:id/approve`,
  `POST /v1/admin/reviews/:id/reject` — `ADMIN_TOKEN`-gated.
- R2 only: presigned-upload flow (client uploads directly to R2 via a
  short-lived signed URL) so raw image bytes never transit the Fastify
  process.

**New backend stores:** `reviewStore.ts` (JSON-mirrored like
`usageStore.ts`), `photoStore.ts` (R2 client wrapper, R2 phase only).

**Frontend submission UI** (consent-adjacent, not consent-gated like
analytics): star picker, tag chips, capped text field, the §2
point-of-submission notice, and (R2) camera/photo-picker with client-side
EXIF strip before any network call.

## 6. Decisions for the owner (explicit)

1. **Phase scope to start.** Recommend **R1 only** (stars + tags + capped
   text, no photos) — proves the moderation loop and consent copy before
   object storage and the harder photo-moderation workload.
2. **Storage provider + budget for R2.** Recommend **Cloudflare R2**;
   confirm a soft monthly budget cap/alert before the first bucket exists
   (estimate above is sub-$1/month at MVP volume, but the provider choice
   is a real decision, not a default).
3. **Moderation SLA/appetite.** Confirm a real cadence the owner can
   commit to (proposed: at least twice a week). An abandoned queue is
   worse than no feature — "not right now" is a valid reason to delay R1.
4. **Rate-limit approach given the no-identity constraint.** Confirm
   whether §3's option 2 (transient, never-persisted, never-logged per-IP
   throttling) is an acceptable reading of the "no IP" guardrail, or
   whether the owner wants the stricter option-1-only stance (per-spot
   caps only) even at a higher spam ceiling.
5. **Go/no-go on free text at all in R1.** Confirm accepting the
   free-text PII/moderation risk (§2) from day one, versus shipping
   stars+tags only first and adding text as a fast-follow once moderation
   is proven at lower risk.

## 7. Implementation plan (PR-sized slices)

- **PR 1 (this doc).** No code.
- **PR 2 — Submission UI, client-only.** Star picker, tag chips, capped
  text field, notice copy (i18n keys). No network call yet. Not
  privacy-sensitive.
- **PR 3 — Review store + submit/read routes (R1: text only).
  OWNER REVIEW REQUIRED.** First PR where user content lands in our
  store; add §5's CODEOWNERS entries in this same PR, not after.
- **PR 4 — Moderation admin routes + minimal admin view.
  OWNER REVIEW REQUIRED.** Approve/reject queue, `ADMIN_TOKEN`-gated;
  nothing from PR 3 is publicly visible before this ships.
- **PR 5 — Deletion-token flow.** Self-serve delete-by-token endpoint +
  the "save this" UI moment at submission. Privacy-sensitive, smaller
  surface than PR 3/4 — flag for review.
- **PR 6 — Rate limiting. OWNER REVIEW REQUIRED** regardless of which
  §6.4 option is chosen — this is the PR that resolves the open IP-vs-
  no-IP tension in code, not just in this doc.
- **PR 7 — `docs/privacy-spot-reviews.md` + `docs/privacy-policy.md`
  update.** Ships alongside/before R1 goes live publicly.
- **PR 8 (R2) — Client-side EXIF strip + photo capture UI.** Client-only,
  nothing uploaded yet. Not privacy-sensitive alone, but foundational —
  later R2 PRs assume EXIF is already gone before bytes leave the device.
- **PR 9 (R2) — Object storage wiring + server-side EXIF verification +
  photo moderation extension. OWNER REVIEW REQUIRED.** The largest single
  expansion in this feature — new vendor credentials, a new data category
  (images), and the "reject identifiable people" rule becomes
  load-bearing. Do not start before §6 decisions 1–3 are made.
- **PR 10 — Docs/checklist close-out.** Update
  `docs/prelaunch-checklist.md` and the roadmap decision log once R1 (and
  later R2) ship.
