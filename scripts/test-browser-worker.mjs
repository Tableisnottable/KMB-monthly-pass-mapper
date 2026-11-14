import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { strict as assert } from 'node:assert';
import { resolve } from 'node:path';

// Exercise the actual browser bundle in a web-standard worker shim. This is
// independent of Next.js and catches incorrect aliases or missing datasets.
const thread = new Worker(`
  const { parentPort, workerData } = require('node:worker_threads');
  globalThis.self = globalThis;
  globalThis.location = { origin: 'http://localhost:8787' };
  globalThis.postMessage = value => parentPort.postMessage(value);
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
  assert.equal(reply.id, id); assert.equal(reply.error, undefined); assert.equal(reply.status, status);
  return JSON.parse(reply.body);
}
try {
  const [ready] = await once(thread, 'message'); assert.equal(ready.ready, true);
  const catalogue = await request('/api/network?resource=routes&q=104');
  assert(catalogue.data.some(route => route.operator === 'KMB+CTB' && route.number === '104'));
  const operators = await request('/api/network?resource=operators'); assert(operators.data.length >= 17);
  const school = await request('/api/places?q=CSWCSS');
  assert(school.data[0].name.includes('CHEUNG SHA WAN CATHOLIC SECONDARY SCHOOL'));
  assert.equal(school.data[0].type, 'school');
  // These handlers must exist in the production browser bundle, not just Next.
  await request('/api/place-label?lat=nope', 400);
  await request('/api/travel-options?fromLat=nope', 400);
  const params = new URLSearchParams({ fromLat: '22.33882', fromLon: '114.15387', toLat: '22.31367', toLon: '113.93763',
    lang: 'en', timeMode: 'depart', time: '2026-11-14T10:00:00+08:00' });
  const result = await request('/api/journey?' + params);
  const names = result.data.map(route => route.legs.map(leg => leg.routeNumber).join('>'));
  for (const route of ['A20', 'A23', '44>A31', '44>E32']) assert(names.includes(route), 'Missing ' + route);
  assert.equal(result.meta.farePassenger, 'NORMAL_ADULT'); assert.equal(result.meta.weightingVersion, 2);
  for (const route of result.data) {
    assert(route.discountedFare > 0); assert.equal(Date.parse(route.departureTime), Date.parse(params.get('time')));
  }
  params.set('timeMode', 'arrive'); params.set('time', '2026-11-14T14:00:00+08:00');
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
    timeMode: 'depart', time: '2026-11-15T12:00:00+08:00' });
  const border = await request('/api/journey?' + borderParams);
  assert(border.data.length > 0, 'Missing Futian-to-Ap-Lei-Chau cross-border journeys');
  assert.equal(border.meta.originUncovered, false); assert.equal(border.meta.destinationUncovered, false);
  assert.equal(border.meta.maxTransfers, null);
  const borderComparison = await request('/api/travel-options?' + borderParams + '&modes=');
  assert.deepEqual(borderComparison.data, []);
  const empty = await request('/api/travel-options?fromLat=22.3&fromLon=114.1&toLat=22.31&toLon=114.11&modes=');
  assert.deepEqual(empty.data, []);
  console.log(`Browser bundle passed: catalogue, ${result.data.length} adult-priced departures, airport alternatives, ${reverse.data.length} arrive-by journeys, ${border.data.length} cross-border journeys, Must/Ban for companies and types, 0/15/60-minute changes and disabled comparisons.`);
} finally { await thread.terminate(); }
