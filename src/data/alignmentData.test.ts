import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAlignmentData } from './alignmentData';
import { getAssetsBinding } from '../lib/cloudflare';
import manifest from './alignments/manifest.json';

vi.mock('../lib/cloudflare', () => ({ getAssetsBinding: vi.fn() }));
afterEach(() => vi.resetAllMocks());
describe('Alignment assets for Cloudflare', () => {
  it('loads all original full-resolution local chunks when no binding exists', async () => {
    vi.mocked(getAssetsBinding).mockResolvedValue(undefined);
    const data = await loadAlignmentData();
    expect(data.roads).toHaveLength(manifest.roadAlignments);
    expect(data.tracks).toHaveLength(manifest.trackGroups);
  });
  it('uses the deployment asset binding and retains the geometry unchanged', async () => {
    const encoded = ['_p~iF~ps|U_ulLnnqC_mqNvxq`@'];
    const fetch = vi.fn(async (request: Request) => Response.json(new URL(request.url).pathname.includes('roads-')
      ? [['route-id', '1', encoded]] : [['mode:subway', encoded]]));
    vi.mocked(getAssetsBinding).mockResolvedValue({ fetch });
    const data = await loadAlignmentData();
    expect(fetch).toHaveBeenCalledTimes(manifest.files.roads.length + manifest.files.tracks.length);
    expect(data.roads[0]).toEqual(['route-id', '1', encoded]);
    expect(data.tracks[0]).toEqual(['mode:subway', encoded]);
    expect(fetch.mock.calls.every(([request]) => new URL(request.url).pathname.startsWith('/__alignments/'))).toBe(true);
  });
  it('fails explicitly for missing assets instead of substituting straight stop-to-stop lines', async () => {
    vi.mocked(getAssetsBinding).mockResolvedValue({ fetch: async () => new Response('missing', { status: 404 }) });
    await expect(loadAlignmentData()).rejects.toThrow('Alignment asset unavailable');
  });
});
