// Regenerates the README screenshots in docs/screenshots/ from the signed-out app.
//
//   npm run dev            # in one terminal (any port; pass it below)
//   node scripts/take-screenshots.mjs [baseUrl] [only,these,names]
//
// Everything is fake data: seeded into localStorage (or built by importing the app's own modules through
// the dev server), never real user data. Cloud features (Bands, set lists, rigs, availability) need a
// signed-in backend and are not captured here. AWS calls are aborted so the app runs as a guest.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const ONLY = process.argv[3]?.split(',');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
mkdirSync(OUT, { recursive: true });

const seed = (key, value) => ({ key, value: JSON.stringify(value) });

const shots = [
  {
    name: 'drum-machine',
    path: '/drums',
    height: 1000,
    async setup(page) {
      // A funk groove from the built-in presets.
      await page.getByRole('combobox').filter({ hasText: '— select —' }).click();
      await page.getByRole('option', { name: 'Funk' }).click();
      await page.getByRole('button', { name: 'Apply', exact: true }).click();
    },
  },
  {
    name: 'click-track',
    path: '/click-track',
    height: 1000,
    seed: [
      seed('click-track-state', {
        speedPercent: 100,
        expandView: false,
        countdownEnabled: false,
        groups: [
          { id: 'g-verse', name: 'Verse', color: '#38bdf8' },
          { id: 'g-bridge', name: 'Bridge', color: '#fb923c' },
        ],
        pieces: [
          { id: 'p1', label: 'Intro', color: '#a78bfa', groupId: null, timeSignature: { numerator: 4, denominator: 4 }, subdivision: 'quarter', bpm: 96, repeats: 4 },
          { id: 'p2', label: 'Verse', color: '#38bdf8', groupId: 'g-verse', timeSignature: { numerator: 4, denominator: 4 }, subdivision: 'eighth', bpm: 120, repeats: 8 },
          { id: 'p3', label: 'Odd bar', color: '#34d399', groupId: 'g-verse', timeSignature: { numerator: 7, denominator: 8 }, subdivision: 'eighth', bpm: 120, repeats: 2 },
          { id: 'p4', label: 'Bridge (accelerando)', color: '#fb923c', groupId: 'g-bridge', timeSignature: { numerator: 6, denominator: 8 }, subdivision: 'eighth', bpm: 100, repeats: 8, rampMode: 'linear', rampEndBpm: 140 },
          { id: 'p5', label: 'Outro', color: '#fb7185', groupId: null, timeSignature: { numerator: 4, denominator: 4 }, subdivision: 'quarter', bpm: 84, repeats: 4 },
        ],
      }),
    ],
  },
  {
    name: 'tab-editor',
    path: '/tab-editor',
    height: 700,
    async setup(page) {
      // Build a riff with the app's own track model, then reload so the editor picks it up.
      await page.evaluate(async () => {
        const { createInitialTabState } = await import('/src/tabEditorState.ts');
        const { Duration } = await import('/src/tabEditorTypes.ts');
        const track = createInitialTabState().track;
        let n = 0;
        const note = (string, fret, mods = {}) => ({ string, fret, modifiers: mods });
        const beat = (duration, notes) => ({ id: `b${n++}`, duration, dot: { dotted: false, doubleDotted: false, triplet: false }, notes });
        // Strings are 1-based, 1 = lowest. A minor pentatonic lick, then a chordal bar.
        const lick = [
          [5, 0], [5, 3], [4, 0], [4, 2], [3, 0], [3, 2], [2, 0], [2, 3],
        ];
        const bar1 = lick.map(([s, f]) => beat(Duration.Eighth, [note(s, f)]));
        const bar2 = [
          beat(Duration.Quarter, [note(6, 5), note(5, 7), note(4, 7)]),
          beat(Duration.Quarter, [note(6, 5), note(5, 7), note(4, 7)]),
          beat(Duration.Eighth, [note(3, 5, { hammerOn: true })]),
          beat(Duration.Eighth, [note(3, 7, { vibrato: true })]),
          beat(Duration.Quarter, [note(2, 8, { palmMute: true })]),
        ];
        const mk = (beats, i) => ({ id: `m${i}`, beats });
        track.title = 'Midnight Lick';
        track.artist = 'Demo Band';
        track.tabAuthor = 'Fake Data';
        track.year = '2026';
        track.measures = [mk(bar1, 1), mk(bar2, 2), mk(bar1.map((b) => ({ ...b, id: `c${n++}` })), 3)];
        track.masterBars = track.measures.map((_, i) => ({ ...(track.masterBars[0] ?? {}), ...(track.masterBars[i] ?? {}) }));
        localStorage.setItem('tab-editor-track', JSON.stringify(track));
      });
      await page.reload();
    },
  },
  {
    name: 'chord-progression',
    path: '/chord-progression',
    height: 1000,
    seed: [
      seed('chord-progression-v1', {
        bpm: 92,
        instrument: 'guitar',
        selectedKey: null,
        slots: [
          { root: 'C', type: 'major', beats: 4 },
          { root: 'A', type: 'minor', beats: 4 },
          { root: 'F', type: 'major', beats: 4 },
          { root: 'G', type: 'dom7', beats: 4 },
          null, null, null, null,
        ],
      }),
    ],
  },
  {
    name: 'scales',
    path: '/scales',
    width: 2000, // a 24-fret neck needs the room
    scale: 1.25,
    height: 800,
    async setup(page) {
      await page.getByRole('radio', { name: 'A', exact: true }).click();
      await page.getByRole('radio', { name: 'Pentatonic Minor', exact: true }).click();
      await page.getByRole('button', { name: 'CAGED Overlay' }).click();
    },
  },
  {
    name: 'caged',
    path: '/caged',
    height: 1000,
    async setup(page) {
      await page.getByRole('button', { name: 'G', exact: true }).first().click();
    },
  },
  {
    name: 'circle-of-fifths',
    path: '/circle',
    height: 980,
    async setup(page) {
      await page.locator('svg text', { hasText: /^G$/ }).first().click({ force: true });
    },
  },
  {
    name: 'metronome',
    path: '/metronome',
    height: 900,
    async setup(page) {
      await page.getByRole('button', { name: 'Advanced', exact: true }).click();
    },
  },
  { name: 'arpeggios', path: '/arpeggios', height: 900 },
  { name: 'fret-memorizer', path: '/fret-memorizer', width: 2000, scale: 1.25, height: 900 },
];

const browser = await chromium.launch();
const failed = [];
for (const shot of shots) {
  if (ONLY && !ONLY.includes(shot.name)) continue;
  const context = await browser.newContext({
    viewport: { width: shot.width ?? 1280, height: shot.height },
    deviceScaleFactor: shot.scale ?? 2,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.route('**appsync**', (r) => r.abort());
  await page.route('**cognito**', (r) => r.abort());
  try {
    // Seed before the app's scripts run.
    await page.addInitScript((entries) => {
      for (const { key, value } of entries) localStorage.setItem(key, value);
    }, shot.seed ?? []);
    await page.goto(BASE + shot.path);
    await page.waitForLoadState('networkidle');
    await shot.setup?.(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
    console.log('ok  ', shot.name);
  } catch (err) {
    failed.push(shot.name);
    console.log('FAIL', shot.name, String(err.message).split('\n')[0]);
  }
  await context.close();
}
await browser.close();
if (failed.length) process.exit(1);
