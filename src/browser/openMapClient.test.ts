import { describe, expect, it, vi } from 'vitest';
import { loadOpenMapArea } from './openMapClient';

describe('Public map browser loading', () => {
  it('loads the public CORS feed without a hosting proxy or credentials', async () => {
    const fetcher = vi.fn(async () => Response.json({ elements: [] }));
    const data = await loadOpenMapArea('singapore', [1.284, 103.852], new AbortController().signal, fetcher);
    expect(data.source).toBe('OpenStreetMap contributors');
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/api\.openstreetmap\.org\/api\/0.6\/map.json\?bbox=/);
    expect(options.credentials).toBe('omit');
    expect(options.headers).not.toHaveProperty('Authorization');
  });
  it('falls back to the same-origin streaming proxy on a network failure', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Network unavailable')).mockResolvedValueOnce(Response.json({ elements: [] }));
    await loadOpenMapArea('japan', [35.6812, 139.7671], new AbortController().signal, fetcher);
    expect(fetcher.mock.calls[1][0]).toMatch(/^\/api\/open-map\?region=japan&/);
  });
  it('does not make a fallback request after the user switches cities', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn(async () => { controller.abort(); throw new Error('Cancelled'); });
    await expect(loadOpenMapArea('japan', [35.6812, 139.7671], controller.signal, fetcher)).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
