import { describe, expect, it } from 'vitest';
import { buildBusTrack, scheduledBusPosition, type ScheduledBusRun } from './busMap';

const start: [number, number] = [22.3, 114.1], bend: [number, number] = [22.31, 114.1], end: [number, number] = [22.31, 114.11];
const run: ScheduledBusRun = { id: 'test', departureTime: '2026-11-19T10:00:00+08:00', arrivalTime: '2026-11-19T10:20:00+08:00', stopOffsetsMinutes: [0, 20] };
const time = (minutes: number) => Date.parse(run.departureTime) + minutes * 60000;

describe('Estimated bus positions on the road', () => {
  it('follows the road bend rather than a straight line between stops', () => {
    const track = buildBusTrack([[start, bend, end]], [start, end])!;
    const early = scheduledBusPosition(run, track, time(5))!;
    expect(early.point[1]).toBe(114.1);
    expect(early.point[0]).toBeGreaterThan(start[0]);
    expect(early.point[0]).toBeLessThan(bend[0]);
    const late = scheduledBusPosition(run, track, time(15))!;
    expect(late.point[0]).toBe(bend[0]);
    expect(late.point[1]).toBeGreaterThan(bend[1]);
    expect(late.nextStop).toBe(1);
    expect(late.arrivalTime).toBe('2026-11-19T02:20:00.000Z');
  });
  it('removes buses before departure and after arrival, and advances between stops', () => {
    const track = buildBusTrack([[start, bend, end]], [start, bend, end])!;
    const multiStop = { ...run, stopOffsetsMinutes: [0, 8, 20] };
    expect(scheduledBusPosition(multiStop, track, time(-1))).toBeNull();
    expect(scheduledBusPosition(multiStop, track, time(20))).toBeNull();
    expect(scheduledBusPosition(multiStop, track, time(8))).toMatchObject({ point: bend, nextStop: 2 });
    expect(scheduledBusPosition(multiStop, track, time(0))).toMatchObject({ point: start, nextStop: 1 });
  });
  it('retains the correct occurrence of a repeated stop on a circular route', () => {
    const track = buildBusTrack([[start, bend, end, start]], [start, bend, end, start])!;
    expect(track.stopDistances[3]).toBeGreaterThan(track.stopDistances[2]);
    const circular = { ...run, stopOffsetsMinutes: [0, 5, 10, 20] };
    expect(scheduledBusPosition(circular, track, time(15))?.nextStop).toBe(3);
  });
  it('does not put buses across missing road pieces or far away from their stops', () => {
    expect(buildBusTrack([], [start, end])).toBeNull();
    expect(buildBusTrack([[start, bend], [end, [22.32, 114.11]]], [start, end])).toBeNull();
    expect(buildBusTrack([[[22.5, 114.1], [22.5, 114.11]]], [start, end])).toBeNull();
    expect(buildBusTrack([[start, [NaN, 114.1], end]], [start, end])).toBeNull();
    expect(scheduledBusPosition({ ...run, stopOffsetsMinutes: [20, 0] }, buildBusTrack([[start, bend, end]], [start, end])!, time(5))).toBeNull();
  });
});
