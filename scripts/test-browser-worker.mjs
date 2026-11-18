import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';

// Route fixtures use the imported snapshot's Saturday service calendar.
const serviceDay = '2026-11-14';

// Exercise the actual browser bundle in a web-standard worker shim. This is
// independent of Next.js and catches incorrect aliases or missing datasets.
const thread = new Worker(`
  const { parentPort, workerData } = require('node:worker_threads');
  globalThis.self = globalThis;
  globalThis.location = { origin: 'http://localhost:8787' };
  globalThis.postMessage = value => parentPort.postMessage(value);
  // Freeze the business date for those fixtures, while retaining real Date.now
  // for elapsed-time caches and provider-request throttling.
  const WallClockDate = Date;
  globalThis.Date = class extends WallClockDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-13T04:00:00Z'])); }
  };
  import(require('node:url').pathToFileURL(workerData).href).then(() => {
    parentPort.on('message', data => globalThis.onmessage({ data }));
    parentPort.postMessage({ ready: true });
  });
`, { eval: true, workerData: resolve('public/__planner/transport.worker.js') });
let sequence = 0;
async function request(path, status = 200) {
  const id = ++sequence;
  const message = once(thread, 'message');
  thread.postMessage({ id, url: 'http://localhost:8787' + path });
  const [reply] = await message;
  assert.equal(reply.id, id); assert.equal(reply.error, undefined); assert.equal(reply.status, status, reply.body);
  return JSON.parse(reply.body);
}
try {
  const [ready] = await once(thread, 'message'); assert.equal(ready.ready, true);
  // Macau is a separate lazy adapter, with no HK fare or timetable assumptions.
  const macau = await request('/api/macau?resource=routes');
  assert.equal(macau.data.length, 117); assert.equal(macau.coverage.routes, 90);
  const macauPlace = await request('/api/macau?resource=places&scope=local&q=Airport&lang=en');
  assert(macauPlace.data.length > 0); assert(macauPlace.data.every(p => p.lng < 113.62));
  const moParams = new URLSearchParams({ resource: 'journey', fromLat: '22.183668', fromLon: '113.529413',
    toLat: '22.159403', toLon: '113.574648', time: '2026-11-14T14:00:00+08:00', lang: 'en' });
  const moRoutes = await request('/api/macau?' + moParams); assert(moRoutes.data.length > 0);
  for (const route of moRoutes.data) {
    assert.equal(route.currency, 'MOP'); assert.equal(route.unverifiedBus, false);
    assert(route.legs.every(leg => leg.operator === 'MO_LRT' && !leg.realtimeEta));
  }
  const moGeometry = await request('/api/macau?resource=geometry&legs=' + encodeURIComponent(JSON.stringify(
    moRoutes.data[0].legs.map(leg => ({ id: leg.networkPatternId, board: leg.boardingIndex, alight: leg.alightingIndex })))));
  assert.equal(moGeometry.missing, 0); assert(moGeometry.data.flatMap(p => p.paths.flat()).length > 20);
  moParams.set('timeMode', 'arrive');
  const moReverse = await request('/api/macau?' + moParams); assert(moReverse.data.length > 0);
  assert(moReverse.data.every(route => Date.parse(route.arrivalTime) <= Date.parse(moParams.get('time'))));
  await request('/api/macau?resource=journey&fromLat=0', 400);
  console.log('Macau browser bundle passed: separate catalogue, bilingual local places, MOP fares, LRT depart/arrive and real tracks.');
  const catalogue = await request('/api/network?resource=routes&q=104');
  assert(catalogue.data.some(route => route.operator === 'KMB+CTB' && route.number === '104'));
  const macauCatalogue = await request('/api/macau?resource=routes&lang=en');
  assert(macauCatalogue.data.length >= 100, 'Missing Macao route patterns in the browser bundle');
  assert(macauCatalogue.data.some(route => route.number === '1' && route.operator === 'MO_TCM'));
  const macauPlaces = await request('/api/macau?resource=places&q=Airport&scope=local&lang=en');
  assert(macauPlaces.data.some(place => /airport/i.test(place.name)), 'Missing local Macao place search');
  const operators = await request('/api/network?resource=operators'); assert(operators.data.length >= 17);
  const nightBus = await request('/api/network?resource=timetable&route=1437&pattern=td%3A569&stop=9440&date=' + serviceDay);
  assert.equal(nightBus.route[2], 'N241');
  assert.equal(nightBus.slots.length, 11);
  assert.equal(nightBus.slots[0].time, '2026-11-13T17:54:00.000Z');
  assert.equal(nightBus.slots.at(-1).time, '2026-11-13T22:54:00.000Z');
  const nightBoard = await request('/api/network?resource=departures&scope=route-stop&route=1437&pattern=td%3A569&stop=9440&board=' + nightBus.boardingIndex);
  assert.deepEqual(nightBoard.data.map(row => row.time), nightBus.slots.map(row => row.time));
  const school = await request('/api/places?q=CSWCSS');
  assert(school.data[0].name.includes('CHEUNG SHA WAN CATHOLIC SECONDARY SCHOOL'));
  assert.equal(school.data[0].type, 'school');
  // These handlers must exist in the production browser bundle, not just Next.
  await request('/api/place-label?lat=nope', 400);
  await request('/api/travel-options?fromLat=nope', 400);
  const params = new URLSearchParams({ fromLat: '22.33882', fromLon: '114.15387', toLat: '22.31367', toLon: '113.93763',
    lang: 'en', timeMode: 'depart', time: serviceDay + 'T10:00:00+08:00' });
  const result = await request('/api/journey?' + params);
  const names = result.data.map(route => route.legs.map(leg => leg.routeNumber).join('>'));
  for (const route of ['A20', 'A23', '44>A31', '44>E32']) assert(names.includes(route), 'Missing ' + route);
  assert.equal(result.meta.farePassenger, 'NORMAL_ADULT'); assert.equal(result.meta.weightingVersion, 2);
  for (const route of result.data) {
    assert(route.discountedFare > 0); assert.equal(Date.parse(route.departureTime), Date.parse(params.get('time')));
  }
  params.set('timeMode', 'arrive'); params.set('time', serviceDay + 'T14:00:00+08:00');
  const reverse = await request('/api/journey?' + params); assert(reverse.data.length > 0);
  for (const route of reverse.data) assert(Date.parse(route.arrivalTime) <= Date.parse(params.get('time')));
  params.set('operators', 'KMB,LWB'); params.set('requiredOperators', 'KMB'); params.set('changeMinutes', '15');
  const filtered = await request('/api/journey?' + params); assert(filtered.data.length > 0);
  for (const route of filtered.data) {
    assert(route.legs.every(leg => ['KMB', 'LWB'].includes(leg.networkOperator)));
    assert(route.legs.some(leg => leg.networkOperator === 'KMB'));
    for (let i = 1; i < route.legs.length; i++) assert(Date.parse(route.legs[i].departureTime) - Date.parse(route.legs[i - 1].arrivalTime) >= 15 * 60000 - 1);
    assert(Date.parse(route.arrivalTime) <= Date.parse(params.get('time')));
  }
  params.set('modes', 'BUS'); params.set('requiredModes', 'BUS');
  for (const minutes of [0, 60]) {
    params.set('changeMinutes', String(minutes));
    const boundary = await request('/api/journey?' + params);
    assert.equal(boundary.meta.minimumChangeMinutes, minutes); assert(boundary.data.length > 0);
    for (const route of boundary.data) {
      assert(route.legs.every(leg => leg.mode === 'BUS'));
      for (let i = 1; i < route.legs.length; i++) assert(Date.parse(route.legs[i].departureTime) - Date.parse(route.legs[i - 1].arrivalTime)
        >= Math.max(minutes, route.legs[i].accessWalkMinutes ?? 3) * 60000 - 1);
    }
  }
  params.set('changeMinutes', '61'); await request('/api/journey?' + params, 400);
  const borderParams = new URLSearchParams({ fromLat: '22.534', fromLon: '114.057', toLat: '22.244', toLon: '114.156',
    timeMode: 'depart', time: serviceDay + 'T12:00:00+08:00' });
  const border = await request('/api/journey?' + borderParams);
  assert(border.data.length > 0, 'Missing Futian-to-Ap-Lei-Chau cross-border journeys');
  assert.equal(border.meta.originUncovered, false); assert.equal(border.meta.destinationUncovered, false);
  assert.equal(border.meta.maxTransfers, null);
  const borderComparison = await request('/api/travel-options?' + borderParams + '&modes=');
  assert.deepEqual(borderComparison.data, []);
  const viaParams = new URLSearchParams({ fromLat: '22.33882', fromLon: '114.15387', toLat: '22.2819', toLon: '114.1582',
    viaLat: '22.3192', viaLon: '114.1693', viaName: 'Mong Kok', modes: 'SUBWAY', operators: 'MTR', walkComparison: 'false',
    timeMode: 'depart', time: serviceDay + 'T12:00:00+08:00' });
  for (const timeMode of ['depart', 'arrive']) {
    viaParams.set('timeMode', timeMode);
    const via = await request('/api/journey?' + viaParams);
    assert(via.data.length > 0, 'Missing Via journeys');
    assert.equal(via.meta.via.name, 'Mong Kok');
    for (const route of via.data) {
      assert(route.viaLegIndex > 0 && route.viaLegIndex < route.legs.length);
      assert.equal(route.via.lat, 22.3192);
      const first = route.legs[route.viaLegIndex - 1], next = route.legs[route.viaLegIndex];
      assert(Date.parse(next.departureTime) >= Date.parse(first.arrivalTime));
      if (timeMode === 'arrive') assert(Date.parse(route.arrivalTime) <= Date.parse(viaParams.get('time')));
    }
  }
  viaParams.append('viaLat', '22.297'); viaParams.append('viaLon', '114.172'); viaParams.append('viaName', 'Tsim Sha Tsui');
  for (const timeMode of ['depart', 'arrive']) {
    viaParams.set('timeMode', timeMode);
    const multiple = await request('/api/journey?' + viaParams);
    assert(multiple.data.length > 0, 'Missing multiple Via journeys');
    for (const route of multiple.data) {
      assert.deepEqual(route.viaStops.map(marker => marker.stop.name), ['Mong Kok', 'Tsim Sha Tsui']);
      assert(route.viaStops[0].legIndex < route.viaStops[1].legIndex);
      for (let i = 1; i < route.legs.length; i++) assert(Date.parse(route.legs[i].departureTime) >= Date.parse(route.legs[i - 1].arrivalTime));
      if (timeMode === 'arrive') assert(Date.parse(route.arrivalTime) <= Date.parse(viaParams.get('time')));
    }
  }
  const mapLeg = result.data[0].legs[0];
  const mapToken = [mapLeg.networkPattern, mapLeg.boardingIndex, mapLeg.alightingIndex].join(':');
  const deepMap = await request('/api/journey-geometry?' + borderParams + '&legs=' + Array(5).fill(mapToken).join(','));
  assert.equal(deepMap.pieces.length, 11);
  assert.equal(deepMap.pieces.filter(piece => !piece.walk).length, 5);
  const empty = await request('/api/travel-options?fromLat=22.3&fromLon=114.1&toLat=22.31&toLon=114.11&modes=');
  assert.deepEqual(empty.data, []);
  console.log(`Browser bundle passed: catalogue, ${result.data.length} adult-priced departures, airport alternatives, ${reverse.data.length} arrive-by journeys, ${border.data.length} cross-border journeys, five-leg map requests, Must/Ban for companies and types, 0/15/60-minute changes and disabled comparisons.`);
} finally { await thread.terminate(); }
