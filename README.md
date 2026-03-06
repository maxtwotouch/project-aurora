# Tromso Northern Lights MVP

Mobile MVP built with React Native + Expo (TypeScript) to help tourists in Tromso decide where and when to go tonight for northern lights viewing.

## Features

- Tonight overview with:
  - Aurora Tonight Score (0-100)
  - Recommendation message
  - Best 3-hour visibility window
  - Explanation based on cloud cover and KP trend (now + peak in next 12h)
- Top 5 recommended aurora spots on the main screen
- Trend tags per spot: `Good now`, `Improving`, `Getting worse`
- All Spots page with full ranked list
- Spot details screen with:
  - Map preview
  - Score and best window
  - Cloud cover outlook
  - Navigate button
- Spots Map screen with all markers and quick bottom sheet info
- Aurora page using official UiT Tromso nowcast/forecast frames (+0h to +6h) with draggable timeline
- Live page with external camera/feed sources around Tromso
- In-memory API caching (10 minutes)

## Project Structure

```txt
src/
  api/
    yr.ts
    kp.ts
    auroraOval.ts
  data/
    spots.json
  scoring/
    score.ts
  screens/
    TonightScreen.tsx
    MapScreen.tsx
    AllSpotsScreen.tsx
    AuroraMapScreen.tsx
    SpotDetailScreen.tsx
  components/
    SpotCard.tsx
    ScoreBadge.tsx
  hooks/
    useForecast.ts
```

## Install Dependencies

```bash
npm install
```

## Run The App

```bash
npm run start
```

Then open in Expo Go (iOS/Android emulator or physical device).

## Backend (Fastify)

A backend MVP is included in `backend/` with:

- `GET /v1/tonight`
- `GET /v1/spots/:id`
- `GET /v1/health`
- `POST /v1/admin/refresh`

Run it:

```bash
cd backend
npm install
npm run dev
```

Default backend URL: `http://localhost:8080`

To make the app use backend snapshot mode, set Expo env vars:

```bash
EXPO_PUBLIC_USE_BACKEND=true
EXPO_PUBLIC_API_BASE_URL=http://localhost:8080
```

If backend mode is off (or unset), the app keeps using direct MET/NOAA APIs.

## API Configuration

No API key is required for current MVP endpoints.

- MET Norway forecast API is used in `src/api/yr.ts`.
- NOAA KP feed is used in `src/api/kp.ts`.
- UiT aurora frames are used in `src/screens/AuroraMapScreen.tsx`:
  - `https://spaceweather2.uit.no/noswe/Aurora/Nowcast/tromso.jpg`
  - `https://spaceweather2.uit.no/noswe/Aurora/Forecast{1..6}h/tromso.jpg`
- If KP endpoint fails, the app falls back to a deterministic safe default.

If you want to switch endpoints, update constants in:

- `src/api/yr.ts`
- `src/api/kp.ts`
- `src/api/auroraOval.ts`

## KP Fetch Verification

Run:

```bash
npm run test:kp
```

This verifies that KP now/forecast payloads are parseable and catches suspicious all-zero current samples when forecast is elevated.

## Add/Edit Spots

Edit `src/data/spots.json`.

Each spot entry must include:

```json
{
  "id": "ersfjordbotn",
  "name": "Ersfjordbotn",
  "lat": 69.67,
  "lon": 18.55,
  "distanceKm": 22,
  "lightPollution": 1,
  "horizon": "north",
  "description": "Optional short location description"
}
```

## Scoring Heuristic

Implemented in `src/scoring/score.ts`:

- `cloudFactor = 100 - cloudCover`
- `kpFactor = kp * 15`
- `distancePenalty = 0` for up to ~2 hours drive
- penalty applies only for drive-time above 2 hours
- `lightPenalty = lightPollution * 8`
- `score = clamp(0.7 * cloudFactor + 0.3 * kpFactor - distancePenalty - lightPenalty, 0, 100)`

Per spot, the app scores each hour in the next 12 hours and selects the best 3-hour window.
