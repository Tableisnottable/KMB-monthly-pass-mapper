/** The same supported endpoints must work in comparisons and map geometry. */
export const withinRoutingArea = (lat: number, lon: number) =>
  Number.isFinite(lat) && Number.isFinite(lon) && lat >= 22.1 && lat <= 22.9 && lon >= 113.75 && lon <= 114.65;
