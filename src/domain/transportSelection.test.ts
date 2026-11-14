import { describe, expect, it } from 'vitest';
import { networkRoutes } from '../data/transportNetwork';
import { changeMinuteChoices, defaultComparisons, defaultTransport, parseChangeMinutes, parseComparisonSelection, parseTransitSelection, transitTypeAllowed, transitTypes } from './transportSelection';

describe('Transport and transfer selection', () => {
  it('offers every minute from 0 through 60, retaining the three-minute default', () => {
    expect(changeMinuteChoices).toHaveLength(61);
    expect(changeMinuteChoices).toEqual(Array.from({ length: 61 }, (_, i) => i));
    for (const minutes of changeMinuteChoices) expect(parseChangeMinutes(String(minutes))).toBe(minutes);
    expect(parseChangeMinutes(null)).toBe(3);
    for (const value of ['', ' ', '-1', '61', '1.5', 'NaN', 'Infinity']) expect(() => parseChangeMinutes(value)).toThrow();
  });
  it('covers every transit mode present in the imported routing network', () => {
    expect(new Set(transitTypes.map(type => type.id))).toEqual(new Set(networkRoutes.map(route => route[5])));
    expect(Object.values(defaultTransport()).every(level => level === 'normal')).toBe(true);
    expect(defaultComparisons()).toEqual({ walk: true, cycle: true, taxi: true });
  });
  it('distinguishes omitted, empty and restricted mode selections', () => {
    expect(parseTransitSelection(null)).toBeUndefined();
    expect(parseTransitSelection('')).toEqual([]);
    expect(parseTransitSelection('BUS,BUS,FERRY')).toEqual(['BUS', 'FERRY']);
    expect(transitTypeAllowed('BUS', [])).toBe(false);
    expect(transitTypeAllowed('BUS')).toBe(true);
    expect(transitTypeAllowed('SUBWAY', ['BUS'])).toBe(false);
    expect(parseComparisonSelection('taxi,walk')).toEqual(['taxi', 'walk']);
    expect(() => parseTransitSelection('TAXI')).toThrow();
    expect(() => parseComparisonSelection('SUBWAY')).toThrow();
  });
});
