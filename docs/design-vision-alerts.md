# Design: camera-based "aurora visible now" alerts

Status: **Phase 0 approved for flag-gated implementation** (owner directed
in-session, 2026-09-02). Amendments to the original exploration:

- Phase 0 is built and shipped DARK behind env `VISION_ENABLED` (default
  off — the module never fetches a frame while unset). UiT camera-polling
  permission (section 7, decision 1) gates ACTIVATION, not engineering:
  the owner flips the flag only after UiT consents. Until then, zero
  automated fetches of UiT infrastructure — development and tests use
  synthetic fixtures only.
- Contrary to the original section 6 note, the Phase 0 implementation
  includes a minimal protected-path change (server bootstrap wiring for
  the module's own interval) — the PR is owner-merged accordingly.
- Remaining owner decisions (7.2–7.4) unchanged.

## 1. The idea, and why it's worth exploring

We already show four UiT weather-camera stills on the Live tab
(`src/data/liveCameras.ts`). The proposal: have the backend watch those same
images and push "aurora is visible over Tromsø **right now**" when northern
lights actually appear on them.

This would complete a funnel no competitor in Tromsø offers end-to-end:

| Layer | Signal | Says |
|---|---|---|
| Planning score | weather + Kp forecast | "tonight could be good" |
| Nowcast (#65/#67) | solar wind at L1, OVATION | "conditions are turning good, ~45 min heads-up" |
| **Vision (this doc)** | actual photons on a camera | **"it is happening, go outside"** |

A camera detection is ground truth — the only signal that can't be wrong
about whether aurora is visible from the city (it *is* the observation).

## 2. What we verified about the sources (2026-08-13, live probes)

- `weather.cs.uit.no/cam/cam_{south,east,west,north}.jpg`: 3072×1728 RGB
  JPEG, ~520–630 KB, **refreshed every minute** (Last-Modified tracks the
  burned-in frame timestamp), served over plain HTTPS, no auth.
- Frames have a large clean sky region (~upper 60%), UiT watermark,
  timestamp banner. City rooftops and light pollution occupy the lower band.
- These are **UiT CS department cameras, not ours.** Polling them
  server-side every minute for a commercial product is beyond the casual
  in-app display we do today — same category as the TGO magnetometer:
  **owner should email UiT for permission/terms first** (one email can cover
  both asks; attribution in-app is already present on the Live tab).
- UiT's NO-SPACE lab also operates dedicated aurora all-sky cameras
  (`site.uit.no/spaceweather`) — far more sensitive than city webcams and
  the better Phase-2 source, but access terms unknown (likely also by
  request).

## 3. Detection approach — phased, honesty-first

### Phase 0 — heuristic in shadow mode (no ML, no pushes)

Classical, explainable, cheap:

1. Poll each camera ~1/min, only when `solarElevationDeg` says it's dark
   (reuse `backend/src/solar.ts`) — outside darkness the pipeline sleeps.
2. Downsample to ~384px, mask the per-camera sky region (static masks,
   checked into the repo).
3. Score the masked sky for **green-channel excess** (aurora's 557.7 nm
   oxygen line dominates consumer-camera green): fraction of pixels where
   `G > 1.25·R && G > 1.25·B && G > threshold`.
4. Require **persistence**: N of the last M frames above threshold on ≥1
   camera (kills single-frame artifacts, headlights, JPEG noise).
5. Log every detection decision (per camera, per frame stats) into the
   validation loop's data dir — **no user-facing output at all.**

Measured on a real frame (naive Python, this sandbox): 142 ms per frame;
a `sharp`-based Node implementation lands well under 50 ms — nothing at
4 frames/min on the existing Fly instance. Bandwidth ~2.5 MB/min.

Shadow mode through the autumn season produces the thing ML actually needs:
**a labeled local dataset** (frames + heuristic verdict + observed Kp + TGO
disturbance if we get access + occasional manual review).

### Phase 1 — small classifier, still shadow

- Fine-tune a MobileNet-class CNN (ONNX, CPU inference via
  `onnxruntime-node`) on: the public **OATH** dataset (5 824 labeled
  all-sky aurora images; Clausen & Nickisch 2018) + our own shadow-mode
  frames. City webcams differ from all-sky cameras, so our own frames carry
  most of the weight; OATH bootstraps.
- Run heuristic AND model side by side in shadow; compare against observed
  Kp nights. **Gate for ever sending a push: precision ≳ 0.95 on held-out
  local frames.** A false "it's happening!" push at 23:00 to a tourist who
  runs outside to nothing is the most trust-destroying failure this app
  could produce; a missed detection costs almost nothing (other layers
  still fired).

### Phase 2 — wire into the existing alert engine

- New trigger in `backend/src/alerts.ts` (CODEOWNERS-protected → owner
  review): topic `alerts-visible`, reusing the engine's existing hysteresis,
  1-per-night cap, and quiet hours unchanged. Client work mirrors the
  existing tier topics (Settings opt-in, localized loc-keys, Localizable
  .strings plugin entries for the new messages).
- The push says visible-from-the-city ground truth, nothing more:
  "Northern lights are visible over Tromsø right now." All 5 languages.

## 4. Failure modes (and mitigations)

| Failure | Mitigation |
|---|---|
| Green LED/city lights in frame | sky masks exclude the rooftop band; persistence across frames |
| Moonlit clouds / white-balance drift | green-*excess* (ratio) not absolute green; moon data already in scoring |
| Auto-exposure night noise | downsample + threshold floor (`G > 40`) |
| Snow/rain on lens, camera down | per-camera health check (Last-Modified staleness); any-camera-of-4 voting |
| Faint aurora lost to JPEG/city glow | accepted: city cams detect *clearly visible* aurora — which is exactly the bar a "go outside now" push should have |
| Polar day / twilight | darkness gate — pipeline fully off |

## 5. Privacy & data handling

- **No user data anywhere in this pipeline.** Public rooftop city views;
  no identifiable people at this resolution and distance. Pushes go through
  the existing tokenless topic system — the backend still never sees a
  device.
- Frame retention only for training: rolling window (e.g. 14 days of
  negatives sampled, all positives), documented budget, deleted after
  model training. No third-party sharing. Attribution to UiT wherever
  frames are stored or shown.
- CLAUDE.md guardrails still apply to the *alert wiring* (protected files,
  owner-merged).

## 6. Fit with the 2026 roadmap

- **Phase 0** is small (one new backend module + masks + validation-loop
  logging; no protected files except none) and could ship right after
  offline hardening — collecting through Sep–Nov.
- **Phase 1** model work lands alongside the October calibration pass.
- **Phase 2** pushes could go live for the December peak season — but only
  if the precision gate is met; otherwise it stays shadow for the winter
  and ships spring 2027. The gate is the schedule.

## 7. Owner decisions needed before any code

1. **Email UiT CS** for camera-polling permission/terms (bundle the TGO
   data-access request — same institution). Blocking for everything.
2. Approve the phased plan and the precision-gate principle (pushes only
   at ≳0.95 precision, shadow mode until then).
3. Frame-retention budget for training data (~1–2 GB rolling) on the
   backend volume.
4. Phase 2 push copy + threshold sign-off when the time comes (protected
   alert engine, owner-merged by rule).
