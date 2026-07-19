// Tinted to the "Fjord Line" ground hue (H~160, same as src/theme/palette.ts)
// instead of the old blue-black -- each color below is the same
// saturation/lightness as before, hue-rotated only, so the map keeps
// reading as "night" while cohering with the rest of the app's brand shift.
export const mapDarkStyle = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#0b1920' }]
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8fb8c7' }]
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0b1920' }]
  },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#1e3642' }]
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#11232d' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1d3845' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#152c38' }]
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#06141a' }]
  }
];
