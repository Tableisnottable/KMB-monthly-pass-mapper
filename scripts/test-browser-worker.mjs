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
  require(workerData);
  parentPort.on('message', data => globalThis.onmessage({ data }));
  parentPort.postMessage({ ready: true });
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
  console.log(`Browser bundle passed: catalogue, ${result.data.length} adult-priced departures, airport alternatives, ${reverse.data.length} arrive-by journeys, Must/Ban and 15-minute changes; new travel/label handlers registered.`);
} finally { await thread.terminate(); }
