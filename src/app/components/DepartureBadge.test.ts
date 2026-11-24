import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DepartureBadge } from './DepartureBadge';
import type { DepartureEvidence } from '../../domain/departureType';

const render = (departure: DepartureEvidence) => renderToStaticMarkup(createElement(DepartureBadge, { departure, locale: 'en' }));
describe('Independent timing and service badges', () => {
  it('shows Live and Additional together for a live extra departure', () => {
    const html = render({ status: 'LIVE', scheduleMatch: 'ADDED', addedReason: 'PROVIDER' });
    expect(html).toContain('data-departure-type="LIVE"');
    expect(html).toContain('data-departure-type="ADDITIONAL"');
    expect(html).not.toContain('data-departure-type="SCHEDULED"');
  });
  it('labels an upstream projection as a live estimate', () => {
    expect(render({ timingType: 'LIVE', projectedArrival: true })).toContain('>Live estimate</span>');
  });
  it('keeps provider-scheduled extras separate from live predictions', () => {
    const html = render({ timingType: 'SCHEDULED', remark: 'Scheduled Bus', scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' });
    expect(html).toContain('data-departure-type="SCHEDULED"');
    expect(html).toContain('data-departure-type="ADDITIONAL"');
    expect(html).not.toContain('data-departure-type="LIVE"');
  });
  it('omits changed-service labels while preserving the timing source', () => {
    for (const reason of ['OBSERVED_SPACING', 'POSSIBLE_SHIFT', 'PROVIDER'] as const) {
      const html = render({ timingType: 'SCHEDULED', departureType: 'CHANGED', changedReason: reason });
      expect(html).toContain('data-departure-type="SCHEDULED"');
      expect(html).not.toContain('data-departure-type="CHANGED"');
      expect(html).not.toContain('Changed');
    }
  });
  it('uses one Scheduled badge for timetable estimates and matching scheduled trips', () => {
    const html = render({ timingType: 'SCHEDULED', departureType: 'SCHEDULED', timetableEstimate: true, scheduleMatch: 'MATCHED' });
    expect(html).toContain('>Scheduled</span>');
    expect(html).toContain('not an operator live prediction');
    expect(html.match(/class="departure-type /g)).toHaveLength(1);
    expect(html).not.toContain('Timetabled');
  });
  it('only shows Missed when explicitly reported, without calling it live', () => {
    expect(render({ remark: '脫班', status: 'LIVE' })).toContain('>Missed</span>');
    expect(render({ remark: '脫班', status: 'LIVE' })).not.toContain('data-departure-type="LIVE"');
    expect(render({ status: 'NO_UPCOMING' })).toBe('');
  });
});
