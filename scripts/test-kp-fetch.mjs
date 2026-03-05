const KP_NOW_URL = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
const KP_FORECAST_URL = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';

function parseNowEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  for (const key of ['kp_index', 'kp', 'kP']) {
    const value = Number(entry[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function fail(message) {
  console.error(`KP verification failed: ${message}`);
  process.exit(1);
}

async function main() {
  const [nowResp, forecastResp] = await Promise.all([fetch(KP_NOW_URL), fetch(KP_FORECAST_URL)]);

  if (!nowResp.ok) fail(`KP now endpoint returned ${nowResp.status}`);
  if (!forecastResp.ok) fail(`KP forecast endpoint returned ${forecastResp.status}`);

  const nowPayload = await nowResp.json();
  const forecastPayload = await forecastResp.json();

  if (!Array.isArray(nowPayload) || nowPayload.length === 0) fail('KP now payload is empty');
  if (!Array.isArray(forecastPayload) || forecastPayload.length < 2) fail('KP forecast payload is invalid');

  const recent = nowPayload
    .slice(-30)
    .map(parseNowEntry)
    .filter((v) => Number.isFinite(v));

  if (recent.length === 0) fail('No parseable KP values in recent now feed');

  const latest = recent[recent.length - 1];
  const recentNonZeroCount = recent.filter((v) => v > 0).length;

  const forecastValues = forecastPayload
    .slice(1)
    .filter((row) => Array.isArray(row))
    .map((row) => Number(row[1]))
    .filter((v) => Number.isFinite(v));

  const forecastMax = forecastValues.length > 0 ? Math.max(...forecastValues) : 0;

  if (recentNonZeroCount === 0 && forecastMax >= 2) {
    fail(`All recent KP samples are zero while forecast max is ${forecastMax}`);
  }

  if (!(latest >= 0 && latest <= 9)) {
    fail(`Latest KP (${latest}) is out of expected range 0-9`);
  }

  console.log(`KP verification OK. latest=${latest.toFixed(1)} recent_non_zero=${recentNonZeroCount}/${recent.length} forecast_max=${forecastMax.toFixed(1)}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : 'Unknown error'));
