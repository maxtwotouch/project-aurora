export type LiveCamera = {
  id: string;
  name: string;
  provider: string;
  area: string;
  imageUrl?: string;
  sourceUrl: string;
  note?: string;
};

export const liveCameras: LiveCamera[] = [
  {
    id: 'uit-cs-wcam0',
    name: 'UiT Weather Camera South',
    provider: 'UiT Department of Computer Science',
    area: 'Tromso city view',
    imageUrl: 'https://weather.cs.uit.no/cam/cam_south.jpg',
    sourceUrl: 'http://weather.cs.uit.no',
    note: 'Live still image; refreshes regularly.'
  },
  {
    id: 'uit-cs-wcam1',
    name: 'UiT Weather Camera East',
    provider: 'UiT Department of Computer Science',
    area: 'Tromso city view',
    imageUrl: 'https://weather.cs.uit.no/cam/cam_east.jpg',
    sourceUrl: 'https://weather.cs.uit.no/wcam1_latest.html',
    note: 'Live still image; refreshes regularly.'
  },
  {
    id: 'uit-cs-wcam2',
    name: 'UiT Weather Camera West',
    provider: 'UiT Department of Computer Science',
    area: 'Tromso city view',
    imageUrl: 'https://weather.cs.uit.no/cam/cam_west.jpg',
    sourceUrl: 'https://weather.cs.uit.no/wcam2_latest.html',
    note: 'Live still image; refreshes regularly.'
  },
  {
    id: 'uit-cs-wcam3',
    name: 'UiT Weather Camera North',
    provider: 'UiT Department of Computer Science',
    area: 'Tromso city view',
    imageUrl: 'https://weather.cs.uit.no/cam/cam_north.jpg',
    sourceUrl: 'https://weather.cs.uit.no/wcam3_latest.html',
    note: 'Live still image; refreshes regularly.'
  },
  {
    id: 'yr-vervarslinga',
    name: 'Yr Tromso (Vervarslinga)',
    provider: 'MET Norway / Yr',
    area: 'Tromso',
    sourceUrl:
      'https://www.yr.no/nb/andre-varsler/5-90450/Norge/Troms/Troms%C3%B8/Troms%C3%B8%20(Vervarslinga)',
    note: 'Weather warning and live feed source page.'
  },
  {
    id: 'uit-spaceweather-tromso',
    name: 'UiT Aurora Tromso Portal',
    provider: 'UiT NO-SPACE Weather Lab',
    area: 'Tromso region',
    sourceUrl: 'https://site.uit.no/spaceweather/data-and-products/aurora/tromso/',
    note: 'Official aurora nowcast and forecast products.'
  }
];
