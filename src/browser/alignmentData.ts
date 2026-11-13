import manifest from '../data/alignments/manifest.json';
import type { RoadAlignment, TrackAlignment } from '../data/alignmentData';

/** Browser loads the very same full-resolution chunks as the Node server. */
export async function loadAlignmentData(): Promise<{ roads: RoadAlignment[]; tracks: TrackAlignment[] }> {
  async function chunk(filename: string) {
    const response = await fetch('/__alignments/' + filename);
    if (!response.ok) throw new Error('Alignment asset unavailable: ' + filename);
    const value: unknown = await response.json();
    if (!Array.isArray(value)) throw new Error('Invalid alignment asset: ' + filename);
    return value;
  }
  const [roads, tracks] = await Promise.all([
    Promise.all(manifest.files.roads.map(chunk)), Promise.all(manifest.files.tracks.map(chunk)),
  ]);
  return { roads: roads.flat() as RoadAlignment[], tracks: tracks.flat() as TrackAlignment[] };
}
