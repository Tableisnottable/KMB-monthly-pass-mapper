import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { arrivalRemark, groupStationDepartures } from './jointArrivals';
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
  it('groups ordinary departures into one board without mislabelling non-bus services as joint buses', () => {
    expect(groupStationDepartures([{ ...row, operator: 'CTB', networkOperator: 'CTB' },
      { ...row, id: 'second', operator: 'CTB', networkOperator: 'CTB' }])).toHaveLength(1);
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
    expect(html).toContain('data-departure-type="ADDITIONAL"');
    expect(html).toContain('加班');
    expect(departures[0].minutes).toBe(46);
  });
  it('does not invent a company or turn invalid/unavailable predictions into live arrivals', () => {
    const departures: LiveDeparture[] = [{ time: 'invalid', minutes: 2, operator: 'CTB', scheduleMatch: 'MATCHED' },
      { time: '2026-11-13T18:54:00Z', minutes: -1, operator: 'CTB', scheduleMatch: 'MATCHED' }];
    const empty = renderToStaticMarkup(createElement(JointArrivalBoard, { departures, operator: 'KMB+CTB', locale: 'en' }));
    expect(empty).toContain('No verified live predictions');
    expect(empty).not.toContain('<tr ');
    const unknown = renderToStaticMarkup(createElement(JointArrivalBoard, { departures: [
      { time: '2026-11-13T18:54:00Z', minutes: 1, scheduleMatch: 'UNVERIFIED' },
    ], operator: 'KMB+CTB', locale: 'en' }));
    expect(unknown).toContain('Operator not supplied');
  });
  it('shows a scheduled estimate on ordinary routes without labelling it live', () => {
    const html = renderToStaticMarkup(createElement(JointArrivalBoard, { departures: [], operator: 'KMB', routeNumber: '44', locale: 'en',
      scheduledTime: '2026-11-14T02:00:00Z', timetableOnly: true }));
    expect(html).toContain('10:00'); expect(html).toContain('Boarding estimate'); expect(html).toContain('not live');
    expect(html).not.toContain('Published headway'); expect(html).not.toContain('Live arrivals');
  });
  it.each(['zh', 'en'] as const)('labels live, provider-scheduled and additional rows separately in %s', locale => {
    const departures: LiveDeparture[] = [
      { time: '2026-11-14T09:08:00Z', minutes: 10, operator: 'CTB', scheduleMatch: 'MATCHED' },
      { time: '2026-11-14T09:36:00Z', minutes: 38, operator: 'KMB', remark: '原定班次 · Scheduled Bus', scheduleMatch: 'MATCHED' },
      { time: '2026-11-14T09:47:00Z', minutes: 49, operator: 'KMB', remark: '加班車', scheduleMatch: 'ADDED', addedReason: 'PROVIDER' },
    ];
    const html = renderToStaticMarkup(createElement(JointArrivalBoard, { departures, operator: 'KMB+CTB', routeNumber: '112', locale }));
    expect(html).toContain('<tr data-departure-type="LIVE"'); expect(html).toContain('<tr data-departure-type="SCHEDULED"');
    expect(html).toContain('<tr data-departure-type="ADDITIONAL"');
    expect(html).toContain(locale === 'zh' ? '時間表班次' : 'Scheduled · timetable');
    expect(html).toContain(locale === 'zh' ? '加班' : 'Additional');
    expect(html).not.toContain('Live arrivals · HKT');
  });
  it('keeps the board compact, preserving useful notices but hiding repeated status text and matching references', () => {
    const html = renderToStaticMarkup(createElement(JointArrivalBoard, { locale: 'zh', operator: 'KMB', departures: [
      { time: '2026-11-14T13:30:00Z', minutes: 20, operator: 'KMB', remark: '原定班次 · Scheduled Bus · 行車受阻', scheduleMatch: 'MATCHED',
        timetableTime: '2026-11-14T13:30:00Z', deviationMinutes: 0 },
    ] }));
    expect(html).not.toContain('原定班次 · Scheduled Bus');
    expect(html).toContain('行車受阻');
    expect(html).not.toContain('與參考時間相同');
    expect(html).not.toContain('公布班距');
    expect(html).toMatch(/<details class="arrival-help"><summary>班次說明<\/summary>/);
    expect(html).not.toMatch(/<details[^>]*open/);
    const body = html.match(/<tbody>([\s\S]*?)<\/tbody>/)![1];
    expect(body).toContain('時間表內');
    expect(body).not.toContain('時間表班次');
    expect(body.match(/class="departure-type /g)).toHaveLength(1);
  });
  it('shows a compact possible-move arrow and keeps long-range timetable estimates separate from provider times', () => {
    const html = renderToStaticMarkup(createElement(JointArrivalBoard, { locale: 'zh', operator: 'KMB', departures: [
      { time: '2026-11-14T13:20:00Z', minutes: 10, remark: 'Scheduled Bus', scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE',
        departureType: 'CHANGED', changedReason: 'POSSIBLE_SHIFT', timetableTime: '2026-11-14T13:15:00Z', deviationMinutes: 5 },
      { time: '2026-11-14T14:30:00Z', minutes: 80, scheduleMatch: 'MATCHED', departureType: 'SCHEDULED', timetableEstimate: true },
    ] }));
    expect(html).toContain('班次調整?');
    expect(html).toContain('21:15 → 21:20');
    expect(html).toContain('+5分 ?');
    expect(html).toContain('時間表估算');
    expect(html).toContain('<strong>80</strong>');
    const changed = html.match(/<tr data-departure-type="CHANGED"[\s\S]*?<\/tr>/)![0];
    expect(changed.match(/class="departure-type /g)).toHaveLength(1);
  });
  it('offers more departures while initially showing three rows', () => {
    const departures: LiveDeparture[] = Array.from({ length: 13 }, (_, i) => ({
      time: new Date(Date.parse('2026-11-14T13:00:00Z') + i * 15 * 60000).toISOString(), minutes: i * 15,
      departureType: 'SCHEDULED', timetableEstimate: true, scheduleMatch: 'MATCHED',
    }));
    const html = renderToStaticMarkup(createElement(JointArrivalBoard, { locale: 'en', operator: 'KMB', departures }));
    expect(html.match(/<tr /g)).toHaveLength(3);
    expect(html).toContain('More departures (+10)');
    expect(html).toContain('aria-expanded="false"');
  });
  it('removes stock provider remarks without swallowing useful service messages', () => {
    expect(arrivalRemark('原定班次 · Scheduled Bus')).toBe('');
    expect(arrivalRemark('加班車 · Additional Bus')).toBe('');
    expect(arrivalRemark('Scheduled Bus · 巴士已滿載')).toBe('巴士已滿載');
  });
});
