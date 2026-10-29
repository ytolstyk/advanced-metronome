// Builds the standalone Jam Station wiring page.
//
//   node scripts/build-jam-station.mjs [output.html]
//
// Default output: ~/Downloads/jam_station_architecture_v2.html. The page is one self-contained file
// (Tailwind and fonts come from CDNs). Layout and cable routing are the app's own src/rigRouting.ts,
// bundled here with esbuild, so the page and the app's rig editor can't drift apart. The gain
// staging modal text lives in scripts/jam-station/template.html; the example gear and cables come
// from src/rigPresets.ts.

import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? join(homedir(), 'Downloads', 'jam_station_architecture_v2.html'));

const repoRoot = resolve(here, '..');

const result = await build({
  // metafile paths are relative to this, so the allow-list below works from any working directory
  absWorkingDir: repoRoot,
  entryPoints: [join(here, 'jam-station', 'render.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  metafile: true,
});

// The page must stay small and self-contained: only the router and its data may go in. An innocent
// import that pulled in the Bands code or the Amplify client would otherwise bloat the HTML unnoticed.
const ALLOWED = [/^scripts\/jam-station\//, /^src\/rig(Types|Utils|Routing|Presets|View)\.ts$/];
const stray = Object.keys(result.metafile.inputs).filter((f) => !ALLOWED.some((re) => re.test(f)));
if (stray.length > 0) throw new Error(`The standalone page bundled unexpected files:\n  ${stray.join('\n  ')}`);

// "</script" inside the bundle would end the inline script early.
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const template = await readFile(join(here, 'jam-station', 'template.html'), 'utf8');
if (!template.includes('/*__BUNDLE__*/')) throw new Error('template.html is missing the bundle placeholder');

await writeFile(out, template.replace('/*__BUNDLE__*/', () => js));
console.log(`Wrote ${out} (${Math.round((template.length + js.length) / 1024)} KB)`);
