import directory from './residentsDirectory.json';

export const residentsRoutes = directory.routes;
export const residentsDirectoryMeta = { importedOn: directory.importedOn, sources: directory.sources };
export const residentsOperator = {
  id: 'RESIDENTS', nameEn: 'Residents’ services (NR / HR / KR)', nameTc: '居民巴士服務（NR／HR／KR）',
  urls: ['https://www.td.gov.hk/en/transport_in_hong_kong/public_transport/non_franchised/index.html'],
  routeCount: residentsRoutes.length, timetablePatterns: 0, scheduleRecords: 0, liveArrivals: false,
  officialDocuments: true,
};
export function residentsRoute(id: string) { return residentsRoutes.find(route => route.id === id); }
