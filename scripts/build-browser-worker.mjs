import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
// esbuild does not remove chunks belonging to deleted handlers or old builds.
await rm(resolve(root, 'public/__planner'), { recursive: true, force: true });
const manifest = JSON.parse(await readFile(resolve(root, 'src/data/alignments/manifest.json'), 'utf8'));
await mkdir(resolve(root, 'public/__alignments'), { recursive: true });
for (const file of [...manifest.files.roads, ...manifest.files.tracks]) {
  if (!/^(?:roads|tracks)-\d+\.json$/.test(file)) throw new Error('Unexpected alignment filename');
  await copyFile(resolve(root, 'src/data/alignments', file), resolve(root, 'public/__alignments', file));
}
await build({
  absWorkingDir: root, entryPoints: ['src/browser/transport.worker.ts'],
  outdir: 'public/__planner', entryNames: 'transport.worker', chunkNames: 'chunks/[name]-[hash]',
  bundle: true, minify: true, splitting: true,
  platform: 'browser', format: 'esm', target: ['es2020'],
  define: { 'process.env.OSRM_FOOT_URL': 'undefined', 'process.env.OSRM_CAR_URL': 'undefined', 'process.env.OSRM_BIKE_URL': 'undefined',
    'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'web-platform-adapters', setup(builder) {
    builder.onResolve({ filter: /^next\/server$/ }, () => ({ path: resolve(root, 'src/browser/platform.ts') }));
    builder.onResolve({ filter: /(?:^|\/)lib\/cloudflare$/ }, () => ({ path: resolve(root, 'src/browser/platform.ts') }));
    builder.onResolve({ filter: /(?:^|\/)alignmentData$/ }, args => {
      if (args.kind === 'import-statement') return { path: resolve(root, 'src/browser/alignmentData.ts') };
    });
  } }],
});
// Node's smoke-test worker must interpret the same .js chunks as browser ESM.
const { writeFile } = await import('node:fs/promises');
await writeFile(resolve(root, 'public/__planner/package.json'), '{"type":"module"}');
console.log('Built the browser transport worker with the existing scoring engine.');
