# Pre-Launch Checklist

## Must Fix Before Launch

- Add branded app assets: app icon, splash image, and Android adaptive icon.
- Decide whether Android launch is in scope now. If yes, verify Play-ready config, build, and store metadata.
- Run native release builds for iOS and Android, not just `tsc` and web export.
- Confirm backend production env: `ADMIN_TOKEN`, `CORS_ORIGINS`, host, monitoring, and uptime checks.
- Verify every external source used by the app: MET, NOAA, UiT aurora frames, and camera feeds.
- Ship a privacy policy, support contact, screenshots, store copy, and TestFlight / store metadata.

## App QA

- Test first launch on a real iPhone.
- Test low-connectivity and offline behavior.
- Verify the degraded-data banner appears when upstream APIs fail.
- Pull to refresh from `Tonight` and `All spots`.
- Open navigation links for at least 5 spots.
- Verify live camera links still resolve.
- Check long text, no-data states, and daylight/no-aurora nights.

## Build And Release Checks

- `npm run typecheck`
- `npm run backend:typecheck`
- `npm run test:kp`
- `npx expo export --platform web`
- `npx eas build --platform ios --profile beta`
- `npx eas build --platform android --profile preview` if Android launch is planned

## Go / No-Go

Do not launch if:

- release assets are still placeholder or missing
- native release builds have not been tested
- backend CORS or env vars are unverified
- upstream data failures are not visible in the app
- store/legal materials are not ready
