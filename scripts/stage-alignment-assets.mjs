import { readFile, copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'src/data/alignments');
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
const destination = join(root, '.open-next/assets/__alignments');
await mkdir(destination, { recursive: true });
const files = [...manifest.files.roads, ...manifest.files.tracks];
for (const filename of files) {
  if (!/^(?:roads|tracks)-\d+\.json$/.test(filename)) throw new Error('Unexpected alignment filename');
  await copyFile(join(source, filename), join(destination, filename));
}
console.log(`Staged ${files.length} full-resolution road/track chunks as Cloudflare static assets.`);
