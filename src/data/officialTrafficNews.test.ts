import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadTrafficNews, parseTrafficNews, parseTrafficReference } from './officialTrafficNews';
import { TRAFFIC_NEWS_URL } from './trafficAlerts';

// Recorded from the official TD feed on 2026-11-14 (HKT), trailing whitespace
// normalized for Git; never used as live data.
const fixture = readFileSync('src/data/fixtures/td-special-traffic-news.xml', 'utf8');
const empty = '<body xmlns="http://data.one.gov.hk/td"></body>';

describe('Official traffic news', () => {
  it('parses the recorded bilingual source without inventing routes, severity or effective dates', () => {
    const data = parseTrafficNews(fixture);
    expect(data).toHaveLength(9);
    const bus = data.find(row => row.id === 'td:281117')!;
    expect(bus.textTc).toContain('79K');
    expect(bus.textEn).toContain("bus company's website");
    expect(bus).toMatchObject({ publicTransport: true, sourceUrl: TRAFFIC_NEWS_URL, sourceStatus: '3' });
    expect(bus).not.toHaveProperty('severity'); expect(bus).not.toHaveProperty('effectiveFrom');
    expect(data.find(row => row.id === 'td:281122')?.publicTransport).toBe(false);
    expect(data.some(row => row.textEn.includes('High Speed Rail') && row.publicTransport)).toBe(true);
    expect(data.every(row => row.sourceReferenceAt === '2026-11-13T15:54:21.000Z')).toBe(true);
  });
  it('handles single and empty feeds, rejecting malformed or unexpected responses', () => {
    expect(parseTrafficNews(empty)).toEqual([]);
    const message = fixture.match(/<message>[\s\S]*?<\/message>/)![0];
    expect(parseTrafficNews(empty.replace('</body>', message + '</body>'))).toHaveLength(1);
    for (const bad of ['<html>down</html>', '<body><message>', '<body></body>', empty.replace('</body>', '<message><msgID>2</msgID></message></body>'), '<!DOCTYPE body [<!ENTITY x "data">]>' + empty]) {
      expect(() => parseTrafficNews(bad)).toThrow();
    }
  });
  it('parses Hong Kong reference times independently of server timezone', () => {
    expect(parseTrafficReference('2026/11/13 上午 12:30:00')).toBe('2026-11-12T16:30:00.000Z');
    expect(parseTrafficReference('2026/11/13 下午 12:30:00')).toBe('2026-11-13T04:30:00.000Z');
    expect(parseTrafficReference('2026/11/13 23:54:21')).toBe('2026-11-13T15:54:21.000Z');
    expect(parseTrafficReference('2026/11/13 11:54:21 PM')).toBe('2026-11-13T15:54:21.000Z');
    for (const bad of ['unknown', '2026/02/30 下午 2:00:00', '2026/11/13 下午 13:00:00']) expect(parseTrafficReference(bad)).toBeNull();
  });
  it('distinguishes an empty official feed from provider failure and never inserts demo notices', async () => {
    const ok = vi.fn<typeof fetch>().mockResolvedValue(new Response(empty));
    const feed = await loadTrafficNews(ok);
    expect(feed.data).toEqual([]); expect(feed.meta.status).toBe('AVAILABLE'); expect(feed.meta.fetchedAt).toBeTruthy();
    expect(ok).toHaveBeenCalledWith(TRAFFIC_NEWS_URL, expect.objectContaining({ cache: 'no-store' }));
    for (const fail of [vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
      vi.fn<typeof fetch>().mockResolvedValue(new Response('down', { status: 503 })),
      vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>maintenance</html>'))]) {
      expect(await loadTrafficNews(fail)).toMatchObject({ data: [], meta: { status: 'UNAVAILABLE', fetchedAt: null } });
    }
  });
});
