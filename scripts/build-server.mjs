// Bundles the server into dist/server (entry: dist/server/index.js) and
// copies SQL migrations next to it. npm packages stay external.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist/server');
fs.rmSync(out, { recursive: true, force: true });

await build({
  entryPoints: {
    index: path.join(root, 'server/index.ts'),
    migrate: path.join(root, 'server/db/migrate-cli.ts'),
  },
  outdir: out,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'external',
  splitting: true,
  sourcemap: true,
  logLevel: 'info',
});

fs.cpSync(path.join(root, 'server/db/migrations'), path.join(out, 'migrations'), {
  recursive: true,
});
console.log('Server built to dist/server');
