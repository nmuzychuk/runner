// Copies the runtime libraries we ship to GitHub Pages out of .toolchain/node_modules
// into a flat `vendor/` folder at the repo root, so the site has NO npm dependency at
// runtime and works as a purely static deploy.
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const nm = path.join(here, 'node_modules');
const out = path.join(root, 'vendor');

await mkdir(out, { recursive: true });

const files = [
  [path.join(nm, 'three', 'build', 'three.module.js'), path.join(out, 'three.module.js')],
  [path.join(nm, '@picocss', 'pico', 'css', 'pico.min.css'), path.join(out, 'pico.min.css')],
];

for (const [src, dest] of files) {
  await cp(src, dest);
  console.log('vendored', path.relative(root, dest));
}
console.log('Done. vendor/ now contains three.js + Pico CSS.');
