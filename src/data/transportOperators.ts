import agencies from './transport/agencies-0.json';

const rail = [
  { id: 'MTR', nameEn: 'MTR', nameTc: '港鐵', urls: ['https://opendata.mtr.com.hk'], timezone: 'Asia/Hong_Kong', source: 'https://opendata.mtr.com.hk/data/mtr_lines_and_stations.csv' },
  { id: 'LRT', nameEn: 'MTR Light Rail', nameTc: '港鐵輕鐵', urls: ['https://opendata.mtr.com.hk'], timezone: 'Asia/Hong_Kong', source: 'https://opendata.mtr.com.hk/data/light_rail_routes_and_stops.csv' },
];
export const transportOperators = [...agencies, ...rail];
const byId = new Map(transportOperators.map(operator => [operator.id, operator]));
export function operatorName(id: string, locale: 'zh' | 'en' = 'zh') {
  const operator = byId.get(id);
  return operator ? operator[locale === 'en' ? 'nameEn' : 'nameTc'] : id;
}
export function operatorInfo(id: string) { return byId.get(id); }
