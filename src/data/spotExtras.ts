import type { Spot } from '../types';

/**
 * One Commons photo, plus exactly the attribution data its license
 * requires (all three currently used are CC BY-SA, which is
 * attribution-required + share-alike -- see `commonsImage` below for where
 * these values came from). Never construct this by hand for a new file
 * without pulling the real `imageinfo`/`extmetadata` first: guessing an
 * author or license here is worse than not showing a photo at all.
 */
export type SpotImageCredit = {
  url: string;
  author: string;
  /** Short display form, e.g. "CC BY-SA 3.0". */
  license: string;
  /** Commons file description page -- what the credit caption links to. */
  sourceUrl: string;
};

type SpotExtra = {
  parking: string;
  images?: SpotImageCredit[];
};

/**
 * Builds a Wikimedia Commons credit record from real, looked-up
 * imageinfo/extmetadata (via
 * `https://commons.wikimedia.org/w/api.php?action=query&titles=File:...&prop=imageinfo&iiprop=extmetadata&format=json`)
 * -- never guessed. `url` uses the "Special:FilePath" redirect (stable
 * per-filename, doesn't rot if the file gets re-thumbnailed) rather than a
 * hand-copied upload.wikimedia.org thumb path. Only a handful of spots have
 * curated photography yet -- everyone else still gets the plain (non-photo)
 * hero layout, which is the deliberate, tested fallback (see
 * SpotHeroImage).
 *
 * Verified authors/licenses as of this PR (all CC BY-SA -- attribution
 * required, none more restrictive than CC BY-SA/CC BY/public domain, so no
 * substitutions were needed):
 *   - Telegrafbukta_tromso.jpg .......... Harald Groven, CC BY-SA 3.0
 *   - Fjellheisen Aussicht Stadt.jpg ..... Fjellheisen (de.wikipedia), CC BY-SA 2.0 DE
 *   - Tromsø Mount Fløya view 01.jpg ..... Ad Meskens, CC BY-SA 4.0
 */
function commonsImage(filename: string, author: string, license: string, width = 1200): SpotImageCredit {
  const encoded = encodeURIComponent(filename);
  return {
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encoded}?width=${width}`,
    author,
    license,
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename.replace(/ /g, '_'))}`
  };
}

const extras: Record<string, SpotExtra> = {
  ersfjordbotn: { parking: 'Roadside lay-by spots, limited capacity in peak hours.' },
  kattfjordvatnet: { parking: 'Roadside pull-offs around the lake; use marked areas only.' },
  grotfjord: { parking: 'Beach-side parking pockets; expect icy surfaces in winter.' },
  sommaroy: { parking: 'Marked visitor parking near bridges and beaches.' },
  sandvika_beach: { parking: 'Beach access parking nearby; avoid soft shoulder parking.' },
  skulsfjord: { parking: 'Sparse roadside parking; choose plowed sections only.' },
  tromvik: { parking: 'Village pull-ins and harbor-side parking options.' },
  grunnfjord: { parking: 'Limited roadside bays; park fully off the carriageway.' },
  telegrafbukta: {
    parking: 'Nearby city parking and short walk to the beach area.',
    images: [commonsImage('Telegrafbukta_tromso.jpg', 'Harald Groven', 'CC BY-SA 3.0')]
  },
  prestvannet: { parking: 'Street parking around the lake; observe local restrictions.' },
  fjellheisen_storsteinen: {
    parking: 'Use Fjellheisen base station parking where available.',
    images: [commonsImage('Fjellheisen Aussicht Stadt.jpg', 'Fjellheisen (de.wikipedia)', 'CC BY-SA 2.0 DE')]
  },
  floya: {
    parking: 'Trailhead parking is limited; arrive early during peak nights.',
    images: [commonsImage('Tromsø Mount Fløya view 01.jpg', 'Ad Meskens', 'CC BY-SA 4.0')]
  },
  vardentoppen: { parking: 'Local residential access roads; park only in legal marked spaces.' },
  breivikeidet_valley: { parking: 'Roadside lay-bys along the valley route; no private drives.' },
  oldervik: { parking: 'Roadside bays and local parking near service points.' },
  lyngseidet: { parking: 'Town-center and marina parking, then short walk to dark spots.' },
  skibotn: { parking: 'Fuel station and village parking options before heading to dark areas.' },
  signaldalen: { parking: 'Use established pull-offs in the valley; avoid narrow shoulders.' },
  kilpisjarvi: { parking: 'Public parking near village services and trail access points.' }
};

function getSpotParkingFallback(spot: Spot): string {
  const details = extras[spot.id]?.parking;
  if (!details) {
    return 'Parking information is not verified yet for this spot. Please check local signs and restrictions on arrival.';
  }

  return `Beta note: parking details are not yet verified. ${details}`;
}

export type SpotAccessField = {
  text: string;
  verified: boolean;
};

export type SpotAccessInfo = {
  /** Parking guidance: always present, either kommune-verified or a beta fallback note. */
  parking: SpotAccessField;
  /** Bus guidance: only present when the kommune has supplied a verified stop. */
  bus: SpotAccessField | null;
};

/**
 * Single source of truth for spot access copy. Each field is verified
 * independently -- a spot can have a verified bus stop with no verified
 * parking (or vice versa), so the "verified with Tromsø kommune" claim must
 * never be shown as a blanket statement covering both fields at once.
 */
export function getSpotAccessInfo(spot: Spot): SpotAccessInfo {
  const parking: SpotAccessField = spot.parking
    ? { text: `${spot.parking}.`, verified: true }
    : { text: getSpotParkingFallback(spot), verified: false };

  const bus: SpotAccessField | null = spot.busStop ? { text: spot.busStop, verified: true } : null;

  return { parking, bus };
}

/** Curated photos + required attribution for a spot, or `[]` when none yet. */
export function getSpotImages(spot: Spot): SpotImageCredit[] {
  const custom = extras[spot.id]?.images;
  if (custom && custom.length > 0) {
    return custom;
  }
  void spot;
  return [];
}
