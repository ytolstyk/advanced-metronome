# CLAUDE.md

## Commands

```bash
npm run dev      # Start development server (Vite + HMR)
npm run build    # Type-check + production build (tsc -b && vite build)
npm run lint     # Run ESLint
npm run preview  # Preview production build locally
```

No test framework is configured yet.

## Architecture

Drum machine / step sequencer built with React 19 + TypeScript + Vite + Web Audio API. Entry point: `index.html` → `src/main.tsx` → `src/App.tsx`.

- **Build:** ES2022 target, ESNext modules, bundler module resolution
- **JSX:** Automatic transform (react-jsx), no React import needed
- **Lint:** ESLint 9.x flat config with TypeScript, react-hooks, react-refresh plugins
- **CSS:** Vanilla CSS — `src/index.css` for globals, component-level `.css` files alongside components

## State management

All state lives in `App.tsx` via `useReducer`. The pure reducer and `Action` union type (9 actions) are in `src/state.ts`. Types are in `src/types.ts`:

- `Pattern = Record<InstrumentId, boolean[]>` — per-instrument beat grid
- `AppState` — config (measures, bpm, loopCount), pattern, playback state
- 7 instruments: kick, snare, hihat, openhat, clap, rim, tom

Dispatch is passed as props to all components — no external state library.

## Audio engine

Class-based `AudioEngine` in `src/audio/AudioEngine.ts`, held in a `useRef` in App. Uses Web Audio lookahead scheduling (25ms `setInterval`, 100ms lookahead). Drum sounds are fire-and-forget synthesis in `src/audio/drumSynths.ts` (no node pooling).

`useAudioEngine` hook (`src/hooks/useAudioEngine.ts`) bridges the engine to React dispatch — it wires `onBeat`/`onStop` callbacks and exposes play/pause/stop/resume/togglePlayback. During playback, `updateConfig()` live-patches BPM, pattern, and loop count without restarting.

## TypeScript strictness

Strict mode enabled. Notable settings in `tsconfig.app.json`:

- `erasableSyntaxOnly` — no enums or namespaces
- `verbatimModuleSyntax` — must use `import type` for type-only imports
- `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`

## Key design decisions

- **Mixed time signatures:** each measure can have a different time signature
- **Live editing during playback:** BPM, pattern toggles, and loop count update in real-time via `updateConfig()`
- **Structural changes stop playback:** changing measure count or time signatures resets playback (resizes the pattern array)

## Validations

Make sure all these checks pass before accepting changes:

1. **Lint** `npm run lint`
2. **Build** `npm run build`
