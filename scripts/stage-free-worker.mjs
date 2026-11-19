import { build } from 'esbuild';
import { cp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assets = join(root, '.free-worker/assets');
// Stage only this build. Removed pages must not survive from an older release.
await rm(assets, { recursive: true, force: true });
await mkdir(assets, { recursive: true });
await cp(join(root, 'public'), assets, { recursive: true });
await cp(join(root, '.next/static'), join(assets, '_next/static'), { recursive: true });
const pages = ['index', 'en', 'coverage', 'timetables', 'traffic', 'updates', 'install', 'routes', 'taiwan', 'taiwan/en', 'japan', 'japan/en', 'asia', 'asia/en', 'world', 'world/en'];
for (const page of pages) {
  await mkdir(dirname(join(assets, page + '.html')), { recursive: true });
  await copyFile(join(root, '.next/server/app', page + '.html'), join(assets, page + '.html'));
}
await copyFile(join(root, '.next/server/app/_not-found.html'), join(assets, '404.html'));
await mkdir(join(assets, 'api'), { recursive: true });
await copyFile(join(root, '.next/server/app/api/sources.body'), join(assets, 'api/sources.json'));
const manifest = JSON.parse(await readFile(join(root, 'src/data/alignments/manifest.json'), 'utf8'));
await mkdir(join(assets, '__alignments'), { recursive: true });
for (const file of [...manifest.files.roads, ...manifest.files.tracks]) {
  if (!/^(?:roads|tracks)-\d+\.json$/.test(file)) throw new Error('Unexpected alignment filename');
  await copyFile(join(root, 'src/data/alignments', file), join(assets, '__alignments', file));
}
await writeFile(join(assets, '_headers'), `/*
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.openstreetmap.org; script-src 'self' 'unsafe-inline'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src https://www.openstreetmap.org https://www.google.com https://maps.google.com;
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=(self)
/__planner/transport.worker.js
  Cache-Control: public, max-age=0, must-revalidate
/__planner/chunks/*
  Cache-Control: public, max-age=31536000, immutable
/sw.js
  Cache-Control: no-cache
  Service-Worker-Allowed: /
/manifest.webmanifest
  Cache-Control: no-cache
  Content-Type: application/manifest+json
`);
await build({ absWorkingDir: root, entryPoints: ['src/cloudflare/worker.ts'], outfile: '.free-worker/worker.js',
  bundle: true, minify: true, platform: 'browser', format: 'esm', target: 'es2022' });
console.log('Staged static pages, complete browser planner, geometry and a lightweight provider proxy.');
