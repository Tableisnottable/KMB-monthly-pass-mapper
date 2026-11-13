import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as getBusNews } from './route';
import { GET as getRoadNews } from '../traffic/route';
import { getTrafficNews, parseTrafficNews } from '../../../data/officialTrafficNews';
import type { TrafficFeed } from '../../../data/trafficAlerts';

vi.mock('../../../data/officialTrafficNews', async importOriginal => ({
  ...await importOriginal<typeof import('../../../data/officialTrafficNews')>(), getTrafficNews: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

const fixture: TrafficFeed = {
  data: parseTrafficNews(readFileSync('src/data/fixtures/td-special-traffic-news.xml', 'utf8')),
  meta: { status: 'AVAILABLE', source: 'TD recorded fixture', fetchedAt: '2026-11-13T18:00:00Z',
    checkedAt: '2026-11-13T18:00:00Z', timezone: 'Asia/Hong_Kong', scope: 'Test fixture' },
};
describe('Bus and road news API separation', () => {
  it('returns disjoint category-specific payloads from the same source feed', async () => {
    vi.mocked(getTrafficNews).mockResolvedValue(fixture);
    const busResponse = await getBusNews(), roadResponse = await getRoadNews();
    const buses = await busResponse.json(), roads = await roadResponse.json();
    expect(buses.data.map((item: { id: string }) => item.id)).toEqual(['td:281117']);
    expect(roads.data).toHaveLength(5);
    expect(roads.data.every((item: { category: string }) => item.category === 'ROAD')).toBe(true);
    expect(roads.data.some((item: { id: string }) => buses.data.some((bus: { id: string }) => bus.id === item.id))).toBe(false);
    expect(buses.meta.category).toBe('BUS'); expect(roads.meta.category).toBe('ROAD');
    expect(busResponse.headers.get('Cache-Control')).toBe('no-store');
    expect(roadResponse.headers.get('Cache-Control')).toBe('no-store');
  });
  it('keeps failures explicit rather than claiming there are no bus or road disruptions', async () => {
    vi.mocked(getTrafficNews).mockResolvedValue({ ...fixture, data: [], meta: { ...fixture.meta, status: 'UNAVAILABLE', fetchedAt: null } });
    for (const get of [getBusNews, getRoadNews]) expect(await (await get()).json()).toMatchObject({ data: [], meta: { status: 'UNAVAILABLE', fetchedAt: null } });
  });
});
