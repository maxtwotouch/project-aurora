// Tinted to the "Fjord Line" ground hue (H~160, same as src/theme/palette.ts)
// instead of the old blue-black -- each color below is the same
// saturation/lightness as before, hue-rotated only, so the map keeps
// reading as "night" while cohering with the rest of the app's brand shift.
export const mapDarkStyle = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#0b2019' }]
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8fc7b4' }]
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#0b2019' }]
  },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#1e4236' }]
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#112d24' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#1d4538' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#15382c' }]
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#061a13' }]
  }
];
