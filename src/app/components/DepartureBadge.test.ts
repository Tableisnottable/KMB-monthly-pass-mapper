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
  it('keeps provider-scheduled extras separate from live predictions', () => {
    const html = render({ timingType: 'SCHEDULED', remark: 'Scheduled Bus', scheduleMatch: 'ADDED', addedReason: 'NOT_IN_TIMETABLE' });
    expect(html).toContain('data-departure-type="SCHEDULED"');
    expect(html).toContain('data-departure-type="ADDITIONAL"');
    expect(html).not.toContain('data-departure-type="LIVE"');
  });
  it('shows the inferred caveat with Changed and preserves its timing source', () => {
    const html = render({ timingType: 'SCHEDULED', departureType: 'CHANGED', changedReason: 'OBSERVED_SPACING' });
    expect(html).toContain('Changed · inferred');
    expect(html).toContain('feed may be incomplete');
    expect(html).toContain('data-departure-type="SCHEDULED"');
    expect(render({ timingType: 'LIVE', departureType: 'CHANGED' })).toContain('data-departure-type="LIVE"');
  });
  it('marks a possible earlier/later move as uncertain, with an explanatory tooltip', () => {
    const html = render({ timingType: 'SCHEDULED', departureType: 'CHANGED', changedReason: 'POSSIBLE_SHIFT' });
    expect(html).toContain('Changed?');
    expect(html).toContain('No trip ID confirms the match');
    expect(html).toContain('multiple times may be candidates');
    expect(html).toContain('data-departure-type="SCHEDULED"');
  });
  it('explicitly labels generated timetable estimates', () => {
    const html = render({ timingType: 'SCHEDULED', departureType: 'SCHEDULED', timetableEstimate: true });
    expect(html).toContain('Timetable estimate');
    expect(html).toContain('not an operator live prediction');
    expect(html).not.toContain('data-departure-type="LIVE"');
  });
});
