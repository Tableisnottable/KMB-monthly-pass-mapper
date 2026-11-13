import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { groupStationDepartures } from './jointArrivals';
import { JointArrivalBoard } from './JointArrivalBoard';
import type { LiveDeparture } from '../../data/networkTimetable';

const row = { id: 'first', routeId: 'joint-104', patternId: 'outbound', stopId: 'stop-A', destination: 'Central',
  operator: 'KMB', networkOperator: 'KMB+CTB', mode: 'BUS' };
describe('Joint operator arrival displays', () => {
  it('groups both companies into one service while retaining all individual arrivals', () => {
    const input = [row, { ...row, id: 'second', operator: 'CTB' }, { ...row, id: 'third' }];
    const groups = groupStationDepartures(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].jointOperator).toBe('KMB+CTB');
    expect(groups[0].rows).toEqual(input);
  });
  it('keeps different directions, destinations, boarding stops and routes separate', () => {
    const groups = groupStationDepartures([row, { ...row, id: 'direction', patternId: 'inbound' },
      { ...row, id: 'terminus', destination: 'Admiralty' }, { ...row, id: 'stop', stopId: 'stop-B' },
      { ...row, id: 'route', routeId: 'joint-112' }]);
    expect(groups).toHaveLength(5);
  });
  it('does not combine ordinary departures or mislabel non-bus services as joint buses', () => {
    expect(groupStationDepartures([{ ...row, operator: 'CTB', networkOperator: 'CTB' },
      { ...row, id: 'second', operator: 'CTB', networkOperator: 'CTB' }])).toHaveLength(2);
    expect(groupStationDepartures([{ ...row, mode: 'FERRY' }])[0].jointOperator).toBeUndefined();
  });
  it('renders clock times in Hong Kong time, chronological rows and the actual company on each row', () => {
    const departures: LiveDeparture[] = [
      { time: '2026-11-13T19:38:00Z', minutes: 46, operator: 'CTB', scheduleMatch: 'MATCHED' },
      { time: '2026-11-13T18:54:00Z', minutes: 1, operator: 'KMB', scheduleMatch: 'MATCHED' },
      { time: '2026-11-13T19:15:00Z', minutes: 23, operator: 'CTB', scheduleMatch: 'ADDED', addedReason: 'PROVIDER', remark: '加班車' },
    ];
    const html = renderToStaticMarkup(createElement(JointArrivalBoard, { departures, operator: 'KMB+CTB', routeNumber: '104', stopName: '彩虹道遊樂場', locale: 'zh' }));
    expect(html).toContain('彩虹道遊樂場');
    expect(html.indexOf('02:54')).toBeLessThan(html.indexOf('03:15'));
    expect(html.indexOf('03:15')).toBeLessThan(html.indexOf('03:38'));
    expect(html).toMatch(/02:54[\s\S]*?<strong>1<\/strong>[\s\S]*?九巴/);
    expect(html).toMatch(/03:15[\s\S]*?<strong>23<\/strong>[\s\S]*?城巴/);
    expect(html).toContain('（新增）');
    expect(html).toContain('加班車');
    expect(departures[0].minutes).toBe(46);
  });
  it('does not invent a company or turn invalid/unavailable predictions into live arrivals', () => {
    const departures: LiveDeparture[] = [{ time: 'invalid', minutes: 2, operator: 'CTB', scheduleMatch: 'MATCHED' },
      { time: '2026-11-13T18:54:00Z', minutes: -1, operator: 'CTB', scheduleMatch: 'MATCHED' }];
    const empty = renderToStaticMarkup(createElement(JointArrivalBoard, { departures, operator: 'KMB+CTB', locale: 'en' }));
    expect(empty).toContain('No verified live predictions');
    expect(empty).not.toContain('<tr>');
    const unknown = renderToStaticMarkup(createElement(JointArrivalBoard, { departures: [
      { time: '2026-11-13T18:54:00Z', minutes: 1, scheduleMatch: 'UNVERIFIED' },
    ], operator: 'KMB+CTB', locale: 'en' }));
    expect(unknown).toContain('Operator not supplied');
  });
});
