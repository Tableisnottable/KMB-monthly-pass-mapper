/** Only list cities whose transport data and routing adapter are available. */
export const supportedCities = [
  { id: 'hong-kong', nameTc: '香港', nameEn: 'Hong Kong', timezone: 'Asia/Hong_Kong' },
] as const;
export const activeCity = supportedCities[0];
