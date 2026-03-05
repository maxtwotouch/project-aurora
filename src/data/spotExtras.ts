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
  return extras[spot.id]?.parking ?? 'Parking details not yet available for this spot.';
}

export function getSpotImageUrls(spot: Spot): string[] {
  const custom = extras[spot.id]?.imageUrls;
  if (custom && custom.length > 0) {
    return custom;
  }

  const lat = spot.lat.toFixed(4);
  const lon = spot.lon.toFixed(4);

  return [
    `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=11&size=800x420&markers=${lat},${lon},lightblue1`,
    `https://picsum.photos/seed/${spot.id}-aurora/1200/700`
  ];
}
