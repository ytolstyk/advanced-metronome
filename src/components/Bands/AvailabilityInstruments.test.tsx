import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { buildHorizonDays } from '../../availabilityCalendar';
import { buildOverlap, resolveAvailability } from '../../availabilityUtils';
import { findBestWindows, type BestWindows } from '../../availabilityWindows';
import type { AvailabilityRead, BestWindow } from '../../bandTypes';
import type { InstrumentKey } from '../../bandInstruments';
import { BOB, CAT, NOW, OWNER, at, band, everyone, nameOf, ok, resolveMarks, row } from '../../availabilityTestHelpers';
import { AvailabilityOverlap } from './AvailabilityOverlap';

/* Instruments next to names, and the "Instruments free" line, on the group view. */

const TZ = 'UTC';
const all = buildHorizonDays(NOW, TZ);
const [today, wed, thu] = all;
const four = [at(19), at(19, 30), at(20), at(20, 30)];

type Plays = Record<string, readonly InstrumentKey[]>;
const playsOf = (table: Plays) => (sub: string) => table[sub] ?? [];

const win = (over: Partial<BestWindow> = {}): BestWindow => ({
  startSlot: at(19),
  endSlot: at(21),
  subs: [OWNER, BOB],
  missing: [],
  ...over,
});

interface Over {
  marks?: Record<string, number[]>;
  notResponded?: string[];
  reads?: Map<string, AvailabilityRead>;
  windows?: BestWindows | null;
  selectedSlot?: number | null;
  instrumentsOf?: ((sub: string) => readonly InstrumentKey[]) | null;
}

function mount({
  marks = { [OWNER]: four, [BOB]: four, [CAT]: [at(19)] },
  notResponded = [],
  reads,
  windows,
  selectedSlot = null,
  instrumentsOf = null,
}: Over = {}) {
  const resolution = reads ? resolveAvailability(reads, everyone(...reads.keys()), band(), NOW) : resolveMarks(marks, notResponded);
  const overlap = buildOverlap(resolution);
  render(
    <AvailabilityOverlap
      days={[wed, thu]}
      todayKey={today.key}
      resolution={resolution}
      overlap={overlap}
      windows={windows === undefined ? findBestWindows(overlap, { minSlots: 4 }) : windows}
      minSlots={4}
      selectedSlot={selectedSlot}
      timeZone={TZ}
      locale="en-US"
      nowMs={NOW}
      nameOf={nameOf}
      onMinSlots={vi.fn()}
      onSelectSlot={vi.fn()}
      onShowWindow={vi.fn()}
      {...(instrumentsOf ? { instrumentsOf } : {})}
    />,
  );
}

const card = () => screen.getByRole('region', { name: 'Best times' });
const detailLine = (label: string) => screen.getByText(`${label}:`, { selector: 'dt' }).parentElement!;
const instrumentLine = (root: HTMLElement | Document = document) =>
  within(root as HTMLElement).queryByText((_, el) => el?.tagName === 'P' && /^Instruments free:/.test(el.textContent ?? ''));

describe('AvailabilityOverlap instruments: icons beside names', () => {
  const plays: Plays = { [OWNER]: ['guitar'], [BOB]: ['drums', 'bass'], [CAT]: ['vocals'] };

  it('puts an icon image after each free person in a Best times window', () => {
    mount({ instrumentsOf: playsOf(plays) });
    const free = within(card()).getByText(/2 of 3 free:/);
    expect(within(free).getByRole('img', { name: 'plays Guitar' })).toBeInTheDocument();
    expect(within(free).getByRole('img', { name: 'plays Bass, Drums' })).toBeInTheDocument();
    expect(free.textContent).toMatch(/2 of 3 free: owner\s*, bob/);
  });

  it('puts the icon directly after the name, not before it', () => {
    mount({ instrumentsOf: playsOf(plays) });
    const owner = within(card()).getByRole('img', { name: 'plays Guitar' }).parentElement!;
    expect(owner.textContent?.trim()).toBe('owner');
    expect(owner.firstChild?.textContent).toBe('owner');
  });

  it('puts icons beside people in the Not free line, after the reason', () => {
    mount({ instrumentsOf: playsOf(plays) });
    const notFree = within(card()).getByText(/^Not free:/);
    expect(notFree).toHaveTextContent('Not free: cat (not marked)');
    expect(within(notFree).getByRole('img', { name: 'plays Vocals' })).toBeInTheDocument();
  });

  it('shows icons in the "Also close" list as well', () => {
    const six = [...four, at(21), at(21, 30)];
    mount({ marks: { [OWNER]: six, [BOB]: six, [CAT]: four }, instrumentsOf: playsOf(plays) });
    const alsoClose = screen.getByText('Also close (one person fewer)').parentElement!;
    expect(within(alsoClose).getAllByRole('img', { name: /^plays / }).length).toBeGreaterThan(0);
    expect(within(alsoClose).getByText(/Instruments free:/)).toBeInTheDocument();
  });

  it('shows no icon for a person who listed none', () => {
    mount({ instrumentsOf: playsOf({ [OWNER]: ['guitar'] }) });
    const free = within(card()).getByText(/2 of 3 free:/);
    expect(within(free).getAllByRole('img')).toHaveLength(1);
  });

  it('shows no icons anywhere when instrumentsOf is omitted, so the plain text lines still match', () => {
    mount();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(within(card()).getByText('2 of 3 free: owner, bob')).toBeInTheDocument();
    expect(within(card()).getByText('Not free: cat (not marked)')).toBeInTheDocument();
  });

  it('shows no icons when instrumentsOf says nobody plays anything', () => {
    mount({ instrumentsOf: () => [] });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(within(card()).getByText('2 of 3 free: owner, bob')).toBeInTheDocument();
  });

  it('keeps the heat map cell labels free of instruments', () => {
    mount({ instrumentsOf: playsOf(plays) });
    expect(screen.getByRole('button', { name: /^Wed, Nov 4, 7:00\sPM, 3 of 3 free: owner, bob, cat$/ })).toBeInTheDocument();
  });

  it('shows the instruments of the free members inside a heat map cell, hidden from assistive tech', () => {
    mount({ instrumentsOf: playsOf(plays) });
    const cell = screen.getByRole('button', { name: /^Wed, Nov 4, 7:00\sPM, 3 of 3 free/ });
    // guitar + bass + drums + vocals = 4 instruments, 3 icons and "+1".
    expect(cell.querySelectorAll('svg')).toHaveLength(3);
    expect(cell).toHaveTextContent('3+1');
    expect(cell.querySelector('[aria-hidden]')).not.toBeNull();
  });

  it('shows only the instruments of who is free in that cell, and none in an empty cell', () => {
    mount({ instrumentsOf: playsOf(plays) });
    const partial = screen.getByRole('button', { name: /^Wed, Nov 4, 7:30\sPM, 2 of 3 free/ });
    expect(partial.querySelectorAll('svg')).toHaveLength(3); // guitar, bass, drums; vocals is not free
    expect(partial).not.toHaveTextContent('+');
    const empty = screen.getByRole('button', { name: /^Wed, Nov 4, 9:00\sPM, 0 of 3 free/ });
    expect(empty.querySelectorAll('svg')).toHaveLength(0);
  });

  it('shows the stale note and the icon together', () => {
    const reads = new Map<string, AvailabilityRead>([
      [OWNER, ok(row(OWNER, four))],
      [BOB, ok(row(BOB, four, { updatedAt: '2026-09-01T00:00:00Z' }))],
    ]);
    mount({ reads, instrumentsOf: playsOf(plays) });
    const free = within(card()).getByText(/2 of 3 free:|2 of 2 free:/);
    expect(free.textContent).toMatch(/bob \(may be out of date\)/);
    expect(within(free).getByRole('img', { name: 'plays Bass, Drums' })).toBeInTheDocument();
  });
});

describe('AvailabilityOverlap instruments: the "Instruments free" line', () => {
  it('names what the free people play and what no one free plays', () => {
    mount({ instrumentsOf: playsOf({ [OWNER]: ['guitar'], [BOB]: ['drums'], [CAT]: ['vocals'] }) });
    const line = within(card()).getByText(/^Instruments free:/);
    expect(line).toHaveTextContent('Instruments free: Guitar, Drums · No one free plays: Vocals');
  });

  it('draws an icon beside each instrument label in the line', () => {
    mount({ instrumentsOf: playsOf({ [OWNER]: ['guitar'], [BOB]: ['drums'], [CAT]: ['vocals'] }) });
    const line = within(card()).getByText(/^Instruments free:/);
    expect(line.querySelectorAll('svg')).toHaveLength(3);
  });

  it('leaves out "No one free plays" when every instrument is covered', () => {
    mount({ instrumentsOf: playsOf({ [OWNER]: ['guitar'], [BOB]: ['drums'], [CAT]: ['guitar'] }) });
    const line = within(card()).getByText(/^Instruments free:/);
    expect(line).toHaveTextContent('Instruments free: Guitar, Drums');
    expect(line).not.toHaveTextContent('No one free plays');
  });

  it('says "none" when no one free plays a listed instrument', () => {
    mount({
      windows: { best: [win({ subs: [BOB], missing: [{ sub: OWNER, reason: 'not-marked' }] })], alsoClose: [] },
      instrumentsOf: playsOf({ [OWNER]: ['guitar'] }),
    });
    expect(within(card()).getByText(/^Instruments free:/)).toHaveTextContent('Instruments free: none · No one free plays: Guitar');
  });

  it('is hidden when nobody in the band listed an instrument', () => {
    mount({ instrumentsOf: () => [] });
    expect(screen.queryByText(/Instruments free/)).not.toBeInTheDocument();
  });

  it('is hidden when instrumentsOf is omitted', () => {
    mount();
    expect(screen.queryByText(/Instruments free/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No one free plays/)).not.toBeInTheDocument();
  });

  it('counts people who are in the band but not in the window as part of "no one free plays"', () => {
    mount({
      windows: { best: [win({ subs: [OWNER, BOB], missing: [{ sub: CAT, reason: 'not-marked' }] })], alsoClose: [] },
      instrumentsOf: playsOf({ [OWNER]: ['guitar'], [BOB]: ['guitar'], [CAT]: ['keys', 'strings'] }),
    });
    expect(within(card()).getByText(/^Instruments free:/)).toHaveTextContent(
      'Instruments free: Guitar · No one free plays: Keys, Strings',
    );
  });

  it('shows one line per window', () => {
    const second = win({ startSlot: at(21), endSlot: at(23), subs: [OWNER, CAT], missing: [{ sub: BOB, reason: 'not-marked' }] });
    mount({
      windows: { best: [win(), second], alsoClose: [] },
      instrumentsOf: playsOf({ [OWNER]: ['guitar'], [BOB]: ['drums'], [CAT]: ['vocals'] }),
    });
    const lines = within(card()).getAllByText(/^Instruments free:/);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('Instruments free: Guitar, Drums · No one free plays: Vocals');
    expect(lines[1]).toHaveTextContent('Instruments free: Guitar, Vocals · No one free plays: Drums');
  });

  it('is not shown when there are no windows to attach it to and nothing is selected', () => {
    mount({ windows: { best: [], alsoClose: [] }, instrumentsOf: playsOf({ [OWNER]: ['guitar'] }) });
    expect(screen.queryByText(/Instruments free/)).not.toBeInTheDocument();
  });
});

describe('AvailabilityOverlap instruments: the selected slot', () => {
  const plays: Plays = { [OWNER]: ['guitar'], [BOB]: ['drums'], [CAT]: ['vocals'] };

  it('puts icons beside people in the Free and Not marked lines', () => {
    mount({ selectedSlot: at(20), windows: null, instrumentsOf: playsOf(plays) });
    expect(within(detailLine('Free')).getByRole('img', { name: 'plays Guitar' })).toBeInTheDocument();
    expect(within(detailLine('Free')).getByRole('img', { name: 'plays Drums' })).toBeInTheDocument();
    expect(within(detailLine('Not marked')).getByRole('img', { name: 'plays Vocals' })).toBeInTheDocument();
  });

  it('shows the coverage line from who is free at that slot only', () => {
    mount({ selectedSlot: at(20), windows: null, instrumentsOf: playsOf(plays) });
    const heading = screen.getByRole('heading', { name: /Nov 4, 8:00\sPM/ });
    const line = instrumentLine(heading.parentElement!);
    expect(line).toHaveTextContent('Instruments free: Guitar, Drums · No one free plays: Vocals');
  });

  it('changes the coverage line to match a slot where more people are free', () => {
    mount({ selectedSlot: at(19), windows: null, instrumentsOf: playsOf(plays) });
    const heading = screen.getByRole('heading', { name: /Nov 4, 7:00\sPM/ });
    const line = instrumentLine(heading.parentElement!);
    expect(line).toHaveTextContent('Instruments free: Guitar, Drums, Vocals');
    expect(line).not.toHaveTextContent('No one free plays');
  });

  it('has no coverage line for a slot where nobody is free', () => {
    mount({ selectedSlot: at(10), windows: null, instrumentsOf: playsOf(plays) });
    const heading = screen.getByRole('heading', { name: /Nov 4, 10:00\sAM/ });
    expect(instrumentLine(heading.parentElement!)).toBeNull();
    expect(screen.queryByText(/Instruments free/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No one free plays/)).not.toBeInTheDocument();
  });

  it('says "none" when the people free at the slot listed no instrument', () => {
    mount({ selectedSlot: at(19), windows: null, instrumentsOf: playsOf({ [CAT]: ['vocals'], [OWNER]: ['guitar'] }), marks: { [OWNER]: [], [BOB]: [at(19)], [CAT]: [] } });
    const heading = screen.getByRole('heading', { name: /Nov 4, 7:00\sPM/ });
    expect(instrumentLine(heading.parentElement!)).toHaveTextContent('Instruments free: none · No one free plays: Guitar, Vocals');
  });

  it('puts icons beside people who have no data or could not be read', () => {
    const reads = new Map<string, AvailabilityRead>([
      [OWNER, ok(row(OWNER, four))],
      [BOB, { status: 'failed' }],
      [CAT, ok(row(CAT, four, { startDay: Math.floor(NOW / 86_400_000) + 40 }))],
    ]);
    mount({ reads, selectedSlot: at(19), windows: null, instrumentsOf: playsOf(plays) });
    expect(within(detailLine('Couldn’t be read')).getByRole('img', { name: 'plays Drums' })).toBeInTheDocument();
    expect(within(detailLine('No data for this time')).getByRole('img', { name: 'plays Vocals' })).toBeInTheDocument();
  });

  it('shows the saved-age note with the icon after it', () => {
    mount({ selectedSlot: at(20), windows: null, instrumentsOf: playsOf(plays) });
    const free = detailLine('Free');
    expect(free.textContent).toMatch(/owner \(last saved/);
    expect(within(free).getByRole('img', { name: 'plays Guitar' })).toBeInTheDocument();
  });

  it('shows no icons and no coverage line when instrumentsOf is omitted', () => {
    mount({ selectedSlot: at(20), windows: null });
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/Instruments free/)).not.toBeInTheDocument();
    expect(detailLine('Free')).toHaveTextContent(/Free:\s*owner \(last saved[^)]*\), bob/);
  });

  it('shows no coverage line when nobody listed an instrument', () => {
    mount({ selectedSlot: at(20), windows: null, instrumentsOf: () => [] });
    expect(screen.queryByText(/Instruments free/)).not.toBeInTheDocument();
  });
});

describe('AvailabilityOverlap instruments: Not responded yet', () => {
  it('shows an icon beside someone who has not responded', () => {
    mount({
      marks: { [OWNER]: four, [BOB]: four },
      notResponded: [CAT],
      windows: null,
      instrumentsOf: playsOf({ [CAT]: ['keys'] }),
    });
    const line = screen.getByText(/^Not responded yet:/);
    expect(line).toHaveTextContent('Not responded yet: cat');
    expect(within(line).getByRole('img', { name: 'plays Keys' })).toBeInTheDocument();
  });

  it('keeps the expired note and adds the icon', () => {
    const old = row(BOB, [], {
      startDay: Math.floor(NOW / 86_400_000) - 100,
      updatedAt: new Date(NOW - 100 * 86_400_000).toISOString(),
    });
    const reads = new Map<string, AvailabilityRead>([[OWNER, ok(row(OWNER, four))], [BOB, ok(old)]]);
    mount({ reads, windows: null, instrumentsOf: playsOf({ [BOB]: ['bass'] }) });
    const line = screen.getByText(/^Not responded yet:/);
    expect(line.textContent).toMatch(/bob \(last saved .* expired\)/);
    expect(within(line).getByRole('img', { name: 'plays Bass' })).toBeInTheDocument();
  });

  it('shows plain text, with no icons, when instrumentsOf is omitted', () => {
    mount({ marks: { [OWNER]: four, [BOB]: four }, notResponded: [CAT], windows: null });
    expect(screen.getByText('Not responded yet: cat')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
