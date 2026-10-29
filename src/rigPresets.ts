// Starter gear for the rig editor, plus the Jam Station example diagram (also the data the standalone
// Jam Station page is generated from). Presets are deliberately generic: real units differ, so the UI
// tells people to check theirs. Ids match the row validator (lowercase alphanumeric, 4-12 chars).

import type { RigCable, RigDiagram, RigGear, RigPort } from './rigTypes';

export interface RigPreset {
  /** Stable tag; minted gear records it in `copiedFrom` so the same preset isn't added twice. */
  key: string;
  gear: Omit<RigGear, 'id' | 'copiedFrom'>;
}

const port = (id: string, label: string, dir: RigPort['dir'], connector: RigPort['connector'], note?: string): RigPort =>
  note ? { id, label, dir, connector, note } : { id, label, dir, connector };

export const RIG_PRESETS: RigPreset[] = [
  {
    key: 'guitar',
    gear: { name: 'Electric guitar', kind: 'guitar', specs: 'Passive or active pickups, Hi-Z mono output', ports: [port('out1', 'Output', 'out', 'ts', 'Hi-Z')] },
  },
  {
    key: 'bass',
    gear: { name: 'Electric bass', kind: 'bass', specs: '4 or 5 string, Hi-Z mono output', ports: [port('out1', 'Output', 'out', 'ts', 'Hi-Z')] },
  },
  {
    key: 'edrums',
    gear: {
      name: 'E-drum module', kind: 'drums', specs: 'Stereo line outs, headphone out, USB',
      ports: [
        port('outl', 'Out L / Mono', 'out', 'trs', 'Line level'),
        port('outr', 'Out R', 'out', 'trs', 'Line level'),
        port('phon', 'Phones', 'out', 'minijack'),
        port('usb1', 'USB', 'io', 'usb'),
      ],
    },
  },
  {
    key: 'interface2',
    gear: {
      name: 'USB interface 2-in', kind: 'interface', specs: '2 combo inputs, 2 line outs, headphones',
      ports: [
        port('in01', 'Input 1', 'in', 'combo', 'Mic / line / inst'),
        port('in02', 'Input 2', 'in', 'combo', 'Mic / line / inst'),
        port('outl', 'Out L', 'out', 'trs', 'Balanced'),
        port('outr', 'Out R', 'out', 'trs', 'Balanced'),
        port('phon', 'Phones', 'out', 'trs'),
        port('usb1', 'USB', 'io', 'usb'),
      ],
    },
  },
  {
    key: 'interface8',
    gear: {
      name: 'USB interface 4-in / 4-out', kind: 'interface', specs: '4 combo inputs, 4 line outs, headphones',
      ports: [
        port('in01', 'Input 1', 'in', 'combo'),
        port('in02', 'Input 2', 'in', 'combo'),
        port('in03', 'Input 3', 'in', 'combo'),
        port('in04', 'Input 4', 'in', 'combo'),
        port('out1', 'Out 1', 'out', 'trs', 'Balanced'),
        port('out2', 'Out 2', 'out', 'trs', 'Balanced'),
        port('out3', 'Out 3', 'out', 'trs', 'Balanced'),
        port('out4', 'Out 4', 'out', 'trs', 'Balanced'),
        port('phon', 'Phones', 'out', 'trs'),
        port('usb1', 'USB', 'io', 'usb'),
      ],
    },
  },
  {
    key: 'laptop',
    gear: {
      name: 'Laptop / DAW', kind: 'computer', specs: 'Recording or amp-sim host',
      ports: [port('usb1', 'USB 1', 'io', 'usb'), port('usb2', 'USB 2', 'io', 'usb'), port('phon', 'Headphones', 'out', 'minijack')],
    },
  },
  {
    key: 'speaker',
    gear: {
      name: 'Powered speaker', kind: 'speaker', specs: 'Active PA or full-range monitor',
      ports: [port('in01', 'Input 1', 'in', 'combo', 'Mic / line'), port('in02', 'Input 2', 'in', 'combo', 'Mic / line'), port('thru', 'Link out', 'out', 'xlr')],
    },
  },
  {
    key: 'comboamp',
    gear: {
      name: 'Combo amp', kind: 'amp', specs: 'Instrument amp with FX loop and DI out',
      ports: [
        port('inpt', 'Input', 'in', 'ts', 'Hi-Z'),
        port('send', 'FX send', 'out', 'ts'),
        port('retn', 'FX return', 'in', 'ts'),
        port('di01', 'DI out', 'out', 'xlr', 'Balanced'),
      ],
    },
  },
  {
    key: 'mixer',
    gear: {
      name: 'Mixer 4-channel', kind: 'mixer', specs: '4 combo channels, main L/R, aux send, USB',
      ports: [
        port('ch01', 'Channel 1', 'in', 'combo'),
        port('ch02', 'Channel 2', 'in', 'combo'),
        port('ch03', 'Channel 3', 'in', 'combo'),
        port('ch04', 'Channel 4', 'in', 'combo'),
        port('mnl1', 'Main L', 'out', 'xlr'),
        port('mnr1', 'Main R', 'out', 'xlr'),
        port('aux1', 'Aux send', 'out', 'trs'),
        port('usb1', 'USB', 'io', 'usb'),
      ],
    },
  },
  {
    key: 'multifx',
    gear: {
      name: 'Pedal / multi-FX', kind: 'pedal', specs: 'Mono in, stereo out, MIDI and USB',
      ports: [
        port('in01', 'Input', 'in', 'ts'),
        port('outl', 'Out L / Mono', 'out', 'ts'),
        port('outr', 'Out R', 'out', 'ts'),
        port('usb1', 'USB', 'io', 'usb'),
        port('midi', 'MIDI', 'io', 'midi'),
      ],
    },
  },
  {
    key: 'mic',
    gear: { name: 'Microphone', kind: 'mic', specs: 'Dynamic or condenser', ports: [port('out1', 'Output', 'out', 'xlr', 'Balanced')] },
  },
];

// ── Jam Station example ────────────────────────────────────────────────────

const GUITAR: RigGear = {
  id: 'gearguitar', name: 'Electric Guitar', kind: 'guitar', specs: 'Hi-Z mono. Bridge/neck, passive or active',
  ports: [port('out1', 'Output', 'out', 'ts', 'Hi-Z')],
};
const BASS: RigGear = {
  id: 'gearbass', name: 'Electric Bass', kind: 'bass', specs: 'Hi-Z mono. 4-string or 5-string',
  ports: [port('out1', 'Output', 'out', 'ts', 'Hi-Z')],
};
const DRUMS: RigGear = {
  id: 'geardrums', name: 'Alesis Nitro Max', kind: 'drums', specs: 'E-drum module. Master out ~75% (2 o\'clock)',
  ports: [port('outl', 'Out L / Mono', 'out', 'trs', 'Line level')],
};
const SCARLETT: RigGear = {
  id: 'gearscarlet', name: 'Focusrite Scarlett 18i8', kind: 'interface', specs: '3rd Gen. 24-bit / 192 kHz. Monitor knob 12:00 to 2:00',
  ports: [
    port('in01', 'Ch 1 · Guitar', 'in', 'combo', 'INST on'),
    port('in02', 'Ch 2 · Bass', 'in', 'combo', 'INST on'),
    port('in05', 'Line In 5 · Drums', 'in', 'trs', '+4 dBu'),
    port('usb1', 'USB', 'io', 'usb', '18 in / 8 out'),
    port('out1', 'Line Out 1 · Main', 'out', 'trs', 'Balanced'),
  ],
};
const LAPTOP: RigGear = {
  id: 'gearlaptop', name: 'Laptop (DAW or amp sims)', kind: 'computer', specs: '128 samples @ 48 kHz, under 5.8 ms latency',
  ports: [port('usb1', 'USB-C', 'io', 'usb', 'CoreAudio / ASIO')],
};
const SPEAKER: RigGear = {
  id: 'gearspeaker', name: 'HeadRush FRFR-108 MKII', kind: 'speaker', specs: '2000 W peak. 8" driver + horn. HPF 100 Hz on',
  ports: [port('in01', 'Input 1 · Master in', 'in', 'xlr', 'Vol 10:00'), port('in02', 'Input 2 · Spare', 'in', 'combo', 'Available')],
};

export const JAM_STATION_GEAR: RigGear[] = [GUITAR, BASS, DRUMS, SCARLETT, LAPTOP, SPEAKER];

const cable = (id: string, from: [string, string], to: [string, string], label: string): RigCable => ({
  id, from: { n: from[0], p: from[1] }, to: { n: to[0], p: to[1] }, label,
});

export const JAM_STATION_DIAGRAM: RigDiagram = {
  id: 'jamstation',
  name: 'Jam Station',
  nodes: [
    { id: 'nguitar', gearId: GUITAR.id, col: 0 },
    { id: 'nbass', gearId: BASS.id, col: 0 },
    { id: 'ndrums', gearId: DRUMS.id, col: 0 },
    { id: 'nscarlet', gearId: SCARLETT.id, col: 1 },
    { id: 'nlaptop', gearId: LAPTOP.id, col: 2 },
    { id: 'nspeaker', gearId: SPEAKER.id, col: 2 },
  ],
  cables: [
    cable('cguitar', ['nguitar', 'out1'], ['nscarlet', 'in01'], '1/4" TS Instrument Cable'),
    cable('cbass', ['nbass', 'out1'], ['nscarlet', 'in02'], '1/4" TS Instrument Cable'),
    cable('cdrums', ['ndrums', 'outl'], ['nscarlet', 'in05'], '1/4" TRS to TRS Balanced'),
    cable('cusb', ['nscarlet', 'usb1'], ['nlaptop', 'usb1'], 'USB 2.0 (Type-C / Type-A)'),
    cable('cspeaker', ['nscarlet', 'out1'], ['nspeaker', 'in01'], '1/4" TRS to XLR Male Balanced'),
  ],
};

/** Column headings for the example (diagrams in the app just show "Stage n"). */
export const JAM_STATION_STAGE_TITLES = ['Sound sources', 'Central hardware hub', 'Host and room projection'];
