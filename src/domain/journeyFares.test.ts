import { describe, expect, it } from 'vitest';
import { scoreRoutes, type Route } from '../engine/UpgradedScoringEngine';
import { journeyFare, studentLegFares } from './journeyFares';
import { groupJourneysByStops, groupStudentFareLabel } from '../app/components/journeyGroups';
const train = (from: string, to: string, fare = 12): Route => ({ id: from + to, legs: [{ operator: 'MTR', mode: 'SUBWAY', routeNumber: 'TWL', fare,
  fareStatus: 'PUBLISHED', originStop: { id: from, name: from }, destinationStop: { id: to, name: to } }] });

describe('Student and selected-profile fares', () => {
  it('uses published Student Octopus OD fares rather than halving adult fares', () => {
    expect(journeyFare(scoreRoutes([train('mtr:1', 'mtr:3')])[0], 'student')).toMatchObject({ maximum: 5.4, available: true, adultFallback: false });
  });
  it('charges one complete rail OD fare across a paid-area interchange', () => {
    const route = train('mtr:1', 'mtr:2');
    route.legs!.push({ ...train('mtr:2', 'mtr:3').legs![0], fare: 0, fareBasis: 'Included in preceding adult rail fare' });
    expect(studentLegFares(scoreRoutes([route])[0]).map(f => f.maximum)).toEqual([5.4, 0]);
  });
  it('keeps Airport Express at adult fare and never treats missing student rail fares as free', () => {
    const airport = train('mtr:44', 'mtr:47', 120); airport.legs![0].routeNumber = 'AEL';
    expect(journeyFare(scoreRoutes([airport])[0], 'student')).toMatchObject({ maximum: 120, adultFallback: false });
    expect(journeyFare(scoreRoutes([train('missing', 'mtr:3')])[0], 'student').available).toBe(false);
  });
  it('labels the adult fallback on operators without an imported student tariff', () => {
    const route = train('start', 'end', 7.4); route.legs![0].mode = 'BUS'; route.legs![0].operator = 'KMB';
    expect(journeyFare(scoreRoutes([route])[0], 'student')).toMatchObject({ maximum: 7.4, adultFallback: true });
    expect(journeyFare(scoreRoutes([route])[0], 'pass').maximum).toBe(0);
  });
  it('sorts Cheapest using the selected fare, without mutating route scores', () => {
    const kmb = train('kmb', 'end', 20); kmb.id = 'kmb'; kmb.legs![0].mode = 'BUS'; kmb.legs![0].operator = 'KMB';
    const citybus = train('ctb', 'end', 5); citybus.id = 'ctb'; citybus.legs![0].mode = 'BUS'; citybus.legs![0].operator = 'CTB';
    const routes = scoreRoutes([kmb, citybus]), original = JSON.stringify(routes);
    expect(groupJourneysByStops(routes, 'cheapest', 'adult')[0].routes[0].id).toBe('ctb');
    expect(groupJourneysByStops(routes, 'cheapest', 'pass')[0].routes[0].id).toBe('kmb');
    expect(JSON.stringify(routes)).toBe(original);
  });
  it('calculates combined student fare ranges from the actual journeys', () => {
    const routes = scoreRoutes([train('mtr:1', 'mtr:2'), train('mtr:1', 'mtr:3')]);
    expect(groupStudentFareLabel({ id: 'test', routes }, 'en')).toBe('$3.20–$5.40');
  });
});
