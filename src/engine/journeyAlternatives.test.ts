import { describe, expect, it } from 'vitest';
import { selectJourneyAlternatives } from './multimodalJourney';
import { scoreRoutes, type Route } from './UpgradedScoringEngine';

const make = (id: string, services: string[], ride: number, fare: number): Route => ({
  id, transferCount: services.length - 1, walkTransferTimeMinutes: 3,
  legs: services.map(routeNumber => ({ operator: 'TEST', mode: 'BUS', routeNumber,
    journeyTimeMinutes: ride / services.length, scheduledWaitMinutes: 0, fare: fare / services.length })),
});

describe('Journey alternatives', () => {
  it('keeps a slower direct service among the available comparisons', () => {
    const routes = scoreRoutes([make('direct', ['Direct'], 120, 30), ...Array.from({ length: 20 }, (_, i) => make('change-' + i, ['Feeder' + i, 'Express' + i], 30 + i, 20))]);
    expect(selectJourneyAlternatives(routes, 8).map(r => r.id)).toContain('direct');
  });
  it('excludes an unnecessary change from a bus already going to the destination', () => {
    const routes = scoreRoutes([make('direct', ['Direct'], 40, 15), make('unnecessary', ['Direct', 'Other'], 60, 30), make('useful', ['Feeder', 'Express'], 30, 20)]);
    expect(selectJourneyAlternatives(routes).map(r => r.id)).toEqual(['direct', 'useful']);
  });
  it('retains faster and cheaper onward services from the same feeder', () => {
    const routes = scoreRoutes([make('express', ['Feeder', 'Express'], 45, 28), make('budget', ['Feeder', 'Budget'], 52, 18), make('direct', ['Direct'], 40, 35)]);
    const chosen = selectJourneyAlternatives(routes);
    expect(chosen.map(r => r.id)).toEqual(expect.arrayContaining(['express', 'budget', 'direct']));
    expect(chosen.every((r, i) => i === 0 || r.finalScore >= chosen[i - 1].finalScore)).toBe(true);
  });
  it('respects small result limits even with several efficient trade-offs', () => {
    const routes = scoreRoutes([make('fast', ['Fast'], 30, 40), make('cheap', ['Cheap'], 60, 10), make('middle', ['Middle'], 45, 20)]);
    expect(selectJourneyAlternatives(routes, 1)).toHaveLength(1);
    expect(selectJourneyAlternatives(routes, 0)).toEqual([]);
  });
});
