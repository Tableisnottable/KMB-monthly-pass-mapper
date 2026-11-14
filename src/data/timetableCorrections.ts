/** Small, dated operator corrections to the imported government snapshot. */
export const timetableCorrections = [{
  operator: 'KMB', route: 'B10', originStopId: '13393', verifiedOn: '2026-11-14',
  source: 'https://search.kmb.hk/KMBWebSite/Function/FunctionRequest.ashx?action=getSchedule&route=B10&bound=1&serviceType=1',
  // KMB: Kwai Chung (Kwai Tsui Estate) → Huanggang, daily.
  windows: [[360, 1410, 15], [1410, 1470, 20]],
}];
