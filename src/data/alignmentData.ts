import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import manifest from './alignments/manifest.json';
import { getAssetsBinding } from '../lib/cloudflare';

export type RoadAlignment = [string, string, string[]];
export type TrackAlignment = [string, string[]];

/** Keep full-resolution geometry in static assets instead of the Worker script. */
export async function loadAlignmentData(): Promise<{ roads: RoadAlignment[]; tracks: TrackAlignment[] }> {
  const assets = await getAssetsBinding();
  async function chunk(filename: string): Promise<unknown[]> {
    let value: unknown;
    if (assets) {
      const response = await assets.fetch(new Request('https://assets.internal/__alignments/' + filename));
      if (!response.ok) throw new Error('Alignment asset unavailable: ' + filename);
      value = await response.json();
    } else value = JSON.parse(await readFile(join(process.cwd(), 'src/data/alignments', filename), 'utf8'));
    if (!Array.isArray(value)) throw new Error('Invalid alignment asset: ' + filename);
    return value;
  }
  const [roads, tracks] = await Promise.all([
    Promise.all(manifest.files.roads.map(chunk)), Promise.all(manifest.files.tracks.map(chunk)),
  ]);
  return { roads: roads.flat() as RoadAlignment[], tracks: tracks.flat() as TrackAlignment[] };
}
