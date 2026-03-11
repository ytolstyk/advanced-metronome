import type { InstrumentId, TimeSignature, Measure } from "./types";

export interface InstrumentConfig {
  id: InstrumentId;
  label: string;
  color: string;
}

export const INSTRUMENTS: InstrumentConfig[] = [
  { id: "kick", label: "Kick", color: "#e74c3c" },
  { id: "snare", label: "Snare", color: "#e67e22" },
  { id: "hihat", label: "Hi-Hat", color: "#f1c40f" },
  { id: "openhat", label: "Open Hat", color: "#2ecc71" },
  { id: "clap", label: "Clap", color: "#3498db" },
  { id: "rim", label: "Rim", color: "#9b59b6" },
  { id: "tom", label: "Tom", color: "#1abc9c" },
];

export const INSTRUMENT_IDS: InstrumentId[] = INSTRUMENTS.map((i) => i.id);

export const DEFAULT_TIME_SIGNATURE: TimeSignature = {
  beats: 4,
  subdivision: 4,
};

export const DEFAULT_MEASURE: Measure = {
  timeSignature: { ...DEFAULT_TIME_SIGNATURE },
};

export const DEFAULT_BPM = 120;
export const DEFAULT_MEASURE_COUNT = 2;
export const DEFAULT_LOOP_COUNT = 0; // infinite

export const MIN_BPM = 40;
export const MAX_BPM = 300;
export const MAX_MEASURES = 8;

export const DEFAULT_HUMANIZE = 0;
export const DEFAULT_VOLUME = 80;

export const DONATION_LINKS = {
  paypal:
    "https://www.paypal.com/donate/?business=GBLCRWQ5EDX92&no_recurring=0&item_name=If+you+like+what+I+do%2C+support+my+work.&currency_code=USD",
  venmo:
    "https://venmo.com/code?user_id=4550168657528426354&created=1773191320",
};
