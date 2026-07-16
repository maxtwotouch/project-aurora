import type { Spot } from '../types';

type SpotExtra = {
  parking: string;
  imageUrls?: string[];
};

const extras: Record<string, SpotExtra> = {
  ersfjordbotn: { parking: 'Roadside lay-by spots, limited capacity in peak hours.' },
  kattfjordvatnet: { parking: 'Roadside pull-offs around the lake; use marked areas only.' },
  grotfjord: { parking: 'Beach-side parking pockets; expect icy surfaces in winter.' },
  sommaroy: { parking: 'Marked visitor parking near bridges and beaches.' },
  sandvika_beach: { parking: 'Beach access parking nearby; avoid soft shoulder parking.' },
  skulsfjord: { parking: 'Sparse roadside parking; choose plowed sections only.' },
  tromvik: { parking: 'Village pull-ins and harbor-side parking options.' },
  grunnfjord: { parking: 'Limited roadside bays; park fully off the carriageway.' },
  telegrafbukta: { parking: 'Nearby city parking and short walk to the beach area.' },
  prestvannet: { parking: 'Street parking around the lake; observe local restrictions.' },
  fjellheisen_storsteinen: { parking: 'Use Fjellheisen base station parking where available.' },
  floya: { parking: 'Trailhead parking is limited; arrive early during peak nights.' },
  vardentoppen: { parking: 'Local residential access roads; park only in legal marked spaces.' },
  breivikeidet_valley: { parking: 'Roadside lay-bys along the valley route; no private drives.' },
  oldervik: { parking: 'Roadside bays and local parking near service points.' },
  lyngseidet: { parking: 'Town-center and marina parking, then short walk to dark spots.' },
  skibotn: { parking: 'Fuel station and village parking options before heading to dark areas.' },
  signaldalen: { parking: 'Use established pull-offs in the valley; avoid narrow shoulders.' },
  kilpisjarvi: { parking: 'Public parking near village services and trail access points.' }
};

export function getSpotParking(spot: Spot): string {
  const details = extras[spot.id]?.parking;
  if (!details) {
    return 'Parking information is not verified yet for this spot. Please check local signs and restrictions on arrival.';
  }

  return `Beta note: parking details are not yet verified. ${details}`;
}

/**
 * Prefers municipally verified access details (busStop/parking from spots.json)
 * over the unverified spotExtras beta copy, falling back to getSpotParking()
 * for spots that don't carry those fields yet.
 */
export function getSpotAccessInfo(spot: Spot): string {
  const parts: string[] = [];
  if (spot.parking) parts.push(`Parking: ${spot.parking}`);
  if (spot.busStop) parts.push(`Bus: ${spot.busStop}`);

  if (parts.length > 0) {
    return `${parts.join(' · ')} — verified with Tromsø kommune`;
  }

  return getSpotParking(spot);
}

export function getSpotImageUrls(spot: Spot): string[] {
  const custom = extras[spot.id]?.imageUrls;
  if (custom && custom.length > 0) {
    return custom;
  }
  void spot;
  return [];
}
