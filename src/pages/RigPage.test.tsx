import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@aws-amplify/ui-react', () => ({
  useAuthenticator: () => ({ authStatus: 'authenticated' }),
  Authenticator: () => null,
}));
vi.mock('aws-amplify/data', () => ({ generateClient: vi.fn(() => ({ models: {}, graphql: vi.fn() })) }));
vi.mock('../api/authUtils', () => ({
  isAuthenticated: vi.fn().mockResolvedValue(true),
  getCurrentUserSub: vi.fn().mockResolvedValue('sub-me'),
}));
vi.mock('../api/rigApi', () => {
  class RigConflictError extends Error {}
  class RigBlockedError extends Error {
    reason: string;
    constructor(reason: string) {
      super(`blocked: ${reason}`);
      this.reason = reason;
    }
  }
  return { RigConflictError, RigBlockedError, loadRigPage: vi.fn(), saveMyRig: vi.fn() };
});

import { RigBlockedError, RigConflictError, loadRigPage, saveMyRig } from '../api/rigApi';
import type { RigPageResult } from '../api/rigApi';
import { BOB, ME, OWNER, makeView } from '../availabilityTestHelpers';
import { BAND_GONE_TITLES } from '../bandTypes';
import { RIG_FORMAT, assembleRigMembers, serializeDraft } from '../rigData';
import type { RigDraft, RigRead, RigRowRecord } from '../rigData';
import { JAM_STATION_DIAGRAM, JAM_STATION_GEAR } from '../rigPresets';
import type { RigDiagram } from '../rigTypes';
import { RigPage } from './RigPage';

type Ok = Extract<RigPageResult, { status: 'ok' }>;

const JAM: RigDraft = { gear: JAM_STATION_GEAR, diagrams: [JAM_STATION_DIAGRAM] };
const NO_CABLES: RigDraft = { gear: JAM_STATION_GEAR, diagrams: [{ ...JAM_STATION_DIAGRAM, cables: [] }] };

const rowOf = (owner: string, draft: RigDraft, over: Partial<RigRowRecord> = {}): RigRowRecord => ({
  bandId: 'band-1', owner, format: RIG_FORMAT, rev: 3, ...serializeDraft(draft), ...over,
});

/** The page data as the loader would produce it, from what each member has stored. */
function pageData(rows: Record<string, RigRead> = {}, view = makeView()): Ok {
  const reads = new Map<string, RigRead>([
    [OWNER, { status: 'ok', row: null }],
    [ME, { status: 'ok', row: null }],
    [BOB, { status: 'ok', row: null }],
    ...Object.entries(rows),
  ]);
  const members = assembleRigMembers({
    band: view.band, members: view.members, sub: view.sub, isMember: view.isMember, displayNames: view.displayNames, reads,
  });
  return { status: 'ok', view, members, reads };
}
const mine = (draft: RigDraft, over: Partial<RigRowRecord> = {}): Record<string, RigRead> => ({
  [ME]: { status: 'ok', row: rowOf(ME, draft, over) },
});
const load = (result: RigPageResult) => vi.mocked(loadRigPage).mockResolvedValue(result);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/bands/band-1/rig']}>
      <Routes>
        <Route path="/bands/:bandId/rig" element={<RigPage />} />
        <Route path="/bands/:bandId" element={<p>band page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(loadRigPage).mockReset();
  vi.mocked(saveMyRig).mockReset();
  vi.mocked(saveMyRig).mockImplementation(async (_bandId, _draft, opts) => rowOf(ME, JAM, { rev: (opts.baselineRev ?? 0) + 1 }));
});

const port = (re: RegExp) => screen.getByRole('button', { name: re });

describe('RigPage states', () => {
  it('says the feature is not available on a backend without it', async () => {
    load({ status: 'unavailable' });
    renderPage();
    expect(await screen.findByText('Gear and rigs aren’t available yet')).toBeInTheDocument();
  });

  it('tells a non-member to join first', async () => {
    load(pageData({}, makeView({ isMember: false })));
    renderPage();
    expect(await screen.findByText('Join this band first')).toBeInTheDocument();
  });

  it('handles a band that is gone', async () => {
    load({ status: 'not-found' });
    renderPage();
    expect(await screen.findByRole('heading', { name: BAND_GONE_TITLES['not-found'] })).toBeInTheDocument();
  });

  it('links back to the band', async () => {
    load({ status: 'unavailable' });
    renderPage();
    expect(await screen.findByRole('link', { name: '← Back to band' })).toHaveAttribute('href', '/bands/band-1');
  });
});

describe('RigPage content', () => {
  it('shows an empty state with nothing yet, and no cable schedule', async () => {
    load(pageData());
    renderPage();
    expect(await screen.findByText(/No rig diagrams yet/)).toBeInTheDocument();
    expect(screen.getByText(/You haven’t added any gear yet/)).toBeInTheDocument();
    expect(screen.queryByText('Cable schedule')).not.toBeInTheDocument();
  });

  it('draws your diagram with its cable schedule and lets you edit it', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    const group = await screen.findByRole('group', { name: 'Rig diagram: Jam Station' });
    expect(within(group).getByRole('button', { name: /Electric Guitar: Output/ })).toBeInTheDocument();
    const schedule = screen.getByRole('region', { name: 'Cable schedule' });
    expect(within(schedule).getAllByRole('listitem')).toHaveLength(5);
    expect(within(schedule).getByText(/Electric Guitar \(Output\) ➔ Focusrite Scarlett 18i8 \(Ch 1 · Guitar\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('shows someone else’s diagram read-only, with their name', async () => {
    load(pageData({ [BOB]: { status: 'ok', row: rowOf(BOB, JAM) } }));
    renderPage();
    expect(await screen.findByText(/Bob’s diagram/)).toBeInTheDocument();
    expect(screen.getByText(/Only they can change it/)).toBeInTheDocument();
    // ports are plain rows, not buttons, and there are no editing controls
    expect(screen.queryByRole('button', { name: /Electric Guitar: Output/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(screen.queryByText('Add gear to this diagram')).not.toBeInTheDocument();
  });

  it('lets you switch between diagrams', async () => {
    const other: RigDiagram = { id: 'other0001', name: 'Garage', nodes: [], cables: [] };
    load(pageData({
      ...mine(JAM),
      [BOB]: { status: 'ok', row: rowOf(BOB, { gear: JAM_STATION_GEAR, diagrams: [other] }) },
    }));
    renderPage();
    const picker = await screen.findByLabelText('Diagram');
    expect(within(picker).getAllByRole('option').map((o) => o.textContent)).toEqual(['Jam Station (You)', 'Garage (Bob)']);
    fireEvent.change(picker, { target: { value: `${BOB}:other0001` } });
    expect(await screen.findByText('This diagram is empty.')).toBeInTheDocument();
  });

  it('names members whose gear couldn’t be read, instead of treating them as empty', async () => {
    load(pageData({ [BOB]: { status: 'failed' } }));
    renderPage();
    expect(await screen.findByText(/Couldn’t read the gear and rigs of Bob/)).toBeInTheDocument();
  });

  it('lists everyone’s gear, and copies someone else’s into yours', async () => {
    load(pageData({ [BOB]: { status: 'ok', row: rowOf(BOB, JAM) } }));
    renderPage();
    expect(await screen.findByText('Bob’s gear')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Copy Electric Guitar to my gear/ })[0]);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByText(/copied from Bob/)).toBeInTheDocument();
  });
});

describe('RigPage connecting', () => {
  it('connects an output to an input, then saves with the loaded rev', async () => {
    load(pageData(mine(NO_CABLES, { rev: 7 })));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Electric Guitar: Output/ }));
    expect(screen.getByRole('status')).toHaveTextContent(/Connecting from/);
    fireEvent.click(port(/Focusrite Scarlett 18i8: Ch 1 · Guitar, input/));
    expect(screen.queryByText(/Connecting from/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveMyRig).toHaveBeenCalledTimes(1));
    const [bandId, draft, opts] = vi.mocked(saveMyRig).mock.calls[0];
    expect(bandId).toBe('band-1');
    expect(opts).toEqual({ baselineRev: 7, overwrite: false });
    expect(draft.diagrams[0].cables).toHaveLength(1);
    expect(draft.diagrams[0].cables[0].from).toEqual({ n: 'nguitar', p: 'out1' });
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
  });

  it('explains a pair that can’t be connected and keeps the connection going', async () => {
    load(pageData(mine(NO_CABLES)));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Electric Guitar: Output/ }));
    fireEvent.click(port(/Electric Bass: Output/));
    expect(screen.getByRole('status')).toHaveTextContent("Two outputs can't be connected");
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText(/Connecting from/)).not.toBeInTheDocument();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('cancels with Escape', async () => {
    load(pageData(mine(NO_CABLES)));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Electric Guitar: Output/ }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText(/Connecting from/)).not.toBeInTheDocument();
  });

  it('selects the cable when you click a port that already has one', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Electric Guitar: Output.*connected/ }));
    expect(screen.getByText(/already has a cable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove cable' })).toBeInTheDocument();
  });

  it('removes a selected cable', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Cable 1:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove cable' }));
    expect(within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('moves and removes a selected card', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Select Electric Guitar' }));
    expect(screen.getByRole('group', { name: 'Selected gear' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move right' }));
    fireEvent.click(screen.getByRole('button', { name: /Remove from diagram/ }));
    expect(screen.queryByRole('button', { name: /Electric Guitar: Output/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem')).toHaveLength(4);
  });
});

describe('RigPage connecting: a vanished origin', () => {
  it('drops the half-made connection when the port it started from is gone', async () => {
    load(pageData(mine(NO_CABLES, { rev: 2 })));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Electric Guitar: Output/ }));
    expect(screen.getByRole('status')).toHaveTextContent(/Connecting from/);
    // the other tab saved this gear without that card; a clean-draft refresh removes it
    load(pageData(mine({ gear: JAM_STATION_GEAR, diagrams: [{ ...JAM_STATION_DIAGRAM, nodes: JAM_STATION_DIAGRAM.nodes.filter((n) => n.id !== 'nguitar'), cables: [] }] }, { rev: 3 })));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByText(/Connecting from/)).not.toBeInTheDocument());
    // nothing is left dimmed waiting for a target
    expect(screen.getByRole('button', { name: /Electric Bass: Output/ }).className).not.toMatch(/opacity-50/);
  });
});

describe('RigPage saving', () => {
  it('shows a conflict, and "Overwrite" saves over what is stored', async () => {
    load(pageData(mine(NO_CABLES, { rev: 2 })));
    vi.mocked(saveMyRig).mockRejectedValueOnce(new RigConflictError());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Select Electric Guitar' }));
    fireEvent.click(screen.getByRole('button', { name: /Remove from diagram/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/changed somewhere else/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Overwrite with my edits' }));
    await waitFor(() => expect(saveMyRig).toHaveBeenCalledTimes(2));
    expect(vi.mocked(saveMyRig).mock.calls[1][2]).toMatchObject({ overwrite: true });
    await waitFor(() => expect(screen.queryByText(/changed somewhere else/)).not.toBeInTheDocument());
  });

  it('"Reload and discard" throws the edits away', async () => {
    load(pageData(mine(NO_CABLES, { rev: 2 })));
    vi.mocked(saveMyRig).mockRejectedValueOnce(new RigConflictError());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Select Electric Guitar' }));
    fireEvent.click(screen.getByRole('button', { name: /Remove from diagram/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reload and discard my edits' }));
    await waitFor(() => expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Electric Guitar: Output/ })).toBeInTheDocument();
  });

  it('shows a save failure and keeps the edits', async () => {
    load(pageData(mine(JAM)));
    vi.mocked(saveMyRig).mockRejectedValueOnce(new Error('Network down'));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Cable 1:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove cable' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it.each([
    ['too-big', /too large to save/],
    ['invalid', /isn’t valid, so it can’t be saved/],
    ['newer', /newer version of the app/],
  ] as const)('explains a refused save (%s) in plain language, not as an internal error', async (reason, text) => {
    load(pageData(mine(JAM)));
    vi.mocked(saveMyRig).mockRejectedValueOnce(new RigBlockedError(reason));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Cable 1:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove cable' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert).not.toHaveTextContent(/blocked:/);
  });

  it('edits made while a save is in flight stay unsaved', async () => {
    load(pageData(mine(JAM, { rev: 3 })));
    let finish!: () => void;
    vi.mocked(saveMyRig).mockImplementationOnce(
      () => new Promise((resolve) => { finish = () => resolve(rowOf(ME, JAM, { rev: 4 })); }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Cable 1:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove cable' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    // a second edit while the first save is still running
    fireEvent.click(screen.getByRole('button', { name: /Cable 2:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove cable' }));
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled());
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem')).toHaveLength(3);
  });

  it('a failed refresh of your own row never blanks the draft or invents a conflict', async () => {
    load(pageData(mine(JAM, { rev: 4 })));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Cable 1:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove cable' }));
    load(pageData({ [ME]: { status: 'failed' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/saving is off/)).toBeInTheDocument();
    expect(screen.queryByText(/changed somewhere else/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem')).toHaveLength(4);
    // and when a later load reads it again, the page recovers
    load(pageData(mine(JAM, { rev: 4 })));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByText(/saving is off/)).not.toBeInTheDocument());
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('a clean draft is not blanked by a failed refresh of your own row', async () => {
    load(pageData(mine(JAM, { rev: 4 })));
    renderPage();
    await screen.findByRole('region', { name: 'Cable schedule' });
    load(pageData({ [ME]: { status: 'failed' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText(/saving is off/);
    expect(within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem')).toHaveLength(5);
  });

  it('tabbing through a cable label without changing it leaves the draft clean', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Cable 1:/ }));
    const label = screen.getByLabelText('Label');
    fireEvent.focus(label);
    fireEvent.blur(label);
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('moving a card that cannot move any further is not an edit', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Select Electric Guitar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move left' }));
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('a refresh never overwrites a dirty draft', async () => {
    load(pageData(mine(JAM, { rev: 4 })));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Cable 1:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove cable' }));
    load(pageData(mine(JAM, { rev: 4 }))); // same stored rev: nothing changed elsewhere
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(loadRigPage).toHaveBeenCalledTimes(2));
    expect(within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByText(/changed somewhere else/)).not.toBeInTheDocument();
  });

  it('asks what to do when a refresh finds the stored row moved on while you have edits', async () => {
    load(pageData(mine(JAM, { rev: 4 })));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Cable 1:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove cable' }));
    load(pageData(mine(NO_CABLES, { rev: 5 })));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/changed somewhere else/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem')).toHaveLength(4);
  });

  it('a clean draft follows what is stored', async () => {
    load(pageData(mine(JAM, { rev: 4 })));
    renderPage();
    await screen.findByRole('region', { name: 'Cable schedule' });
    load(pageData(mine(NO_CABLES, { rev: 5 })));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Cable schedule' })).not.toBeInTheDocument());
  });
});

describe('RigPage gear', () => {
  it('adds gear from a preset', async () => {
    load(pageData());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add gear' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Start from a preset'), { target: { value: 'guitar' } });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Electric guitar');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add gear' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Electric guitar')).toBeInTheDocument();
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('"Blank" clears a preset chosen a moment ago', async () => {
    load(pageData());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add gear' }));
    const dialog = await screen.findByRole('dialog');
    const picker = within(dialog).getByLabelText('Start from a preset');
    fireEvent.change(picker, { target: { value: 'guitar' } });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Electric guitar');
    fireEvent.change(picker, { target: { value: '' } });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('');
  });

  it('refuses gear with no name or an unnamed port', async () => {
    load(pageData());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add gear' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add gear' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Give the gear a name');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Amp' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add gear' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Every port needs a name');
  });

  it('warns before deleting gear that a diagram uses, and removes it with its cables', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Focusrite Scarlett 18i8' }));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    expect(dialog).toHaveTextContent(/1 node and 5 cables in 1 diagram/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete gear' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Delete Focusrite Scarlett 18i8' })).not.toBeInTheDocument());
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });
});

describe('RigPage saved-row problems', () => {
  it('blocks editing and saving when a newer app wrote the row', async () => {
    load(pageData(mine(JAM, { format: 2 })));
    renderPage();
    expect(await screen.findByText(/newer version of the app/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add gear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New diagram' })).not.toBeInTheDocument();
  });

  it('blocks saving when the own row could not be read, rather than risk overwriting it', async () => {
    load(pageData({ [ME]: { status: 'failed' } }));
    renderPage();
    expect(await screen.findByText(/saving is off/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('tells you an unreadable row will be replaced, and saves over it', async () => {
    load(pageData({ [ME]: { status: 'ok', row: rowOf(ME, JAM, { gear: 'not json' }) } }));
    renderPage();
    expect(await screen.findByText(/couldn’t be read. Saving replaces them/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add the Jam Station example' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveMyRig).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveMyRig).mock.calls[0][2]).toMatchObject({ overwrite: true });
  });

  it('lets you save straight away to replace a row that can’t be read (no unrelated edit needed)', async () => {
    load(pageData({ [ME]: { status: 'ok', row: rowOf(ME, JAM, { diagrams: '{' }) } }));
    renderPage();
    expect(await screen.findByText(/Saving replaces them/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveMyRig).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveMyRig).mock.calls[0][2]).toMatchObject({ overwrite: true });
  });

  it('says what was hidden and lets you save to remove it', async () => {
    const trimmedGear = JAM_STATION_GEAR.filter((g) => g.id !== 'gearbass');
    load(pageData({ [ME]: { status: 'ok', row: rowOf(ME, { gear: trimmedGear, diagrams: [JAM_STATION_DIAGRAM] }) } }));
    renderPage();
    expect(await screen.findByText(/2 links point at gear or ports that changed/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });
});

describe('RigPage diagrams', () => {
  it('creates a diagram by name', async () => {
    load(pageData(mine({ gear: JAM_STATION_GEAR, diagrams: [] })));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'New diagram' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Garage rig' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(await screen.findByText('This diagram is empty. Add a piece of your gear below.')).toBeInTheDocument();
    expect(screen.getByLabelText('Diagram')).toHaveDisplayValue('Garage rig (You)');
  });

  it('adds the Jam Station example with its gear', async () => {
    load(pageData());
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add the Jam Station example' }));
    expect(await screen.findByRole('group', { name: 'Rig diagram: Jam Station' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Focusrite Scarlett 18i8' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem')).toHaveLength(5);
  });

  it('shows the example you just added even when you already have another diagram', async () => {
    const mineAlready: RigDiagram = { id: 'first0001', name: 'Garage', nodes: [], cables: [] };
    load(pageData(mine({ gear: [], diagrams: [mineAlready] })));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Add the Jam Station example' }));
    expect(await screen.findByRole('group', { name: 'Rig diagram: Jam Station' })).toBeInTheDocument();
    expect(screen.getByLabelText('Diagram')).toHaveDisplayValue('Jam Station (You)');
  });

  it('stops at the diagram cap', async () => {
    const three: RigDiagram[] = ['aaaa0001', 'aaaa0002', 'aaaa0003'].map((id) => ({ id, name: id, nodes: [], cables: [] }));
    load(pageData(mine({ gear: [], diagrams: three })));
    renderPage();
    expect(await screen.findByRole('button', { name: 'New diagram' })).toBeDisabled();
  });
});

describe('RigPage editing existing gear', () => {
  const openEditor = async (name: string) => {
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${name}` }));
    return screen.findByRole('dialog');
  };
  const scheduleItems = () => within(screen.getByRole('region', { name: 'Cable schedule' })).getAllByRole('listitem');

  it('renaming gear keeps its port ids, so every cable survives, and saves them unchanged', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    const dialog = await openEditor('Focusrite Scarlett 18i8');
    expect(within(dialog).getByRole('heading', { name: 'Edit gear' })).toBeInTheDocument();
    // editing has no preset picker: it would replace the ports and orphan the cables
    expect(within(dialog).queryByLabelText('Start from a preset')).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Scarlett' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save gear' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('This change removes cables')).not.toBeInTheDocument();
    expect(scheduleItems()).toHaveLength(5);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveMyRig).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(saveMyRig).mock.calls[0][1];
    const scarlett = saved.gear.find((g) => g.id === 'gearscarlet')!;
    expect(scarlett.name).toBe('Scarlett');
    const original = JAM_STATION_GEAR.find((g) => g.id === 'gearscarlet')!;
    expect(scarlett.ports.map((p) => p.id)).toEqual(original.ports.map((p) => p.id));
    expect(saved.diagrams[0].cables).toHaveLength(5);
  });

  it('removing a port that has a cable asks first, and Cancel leaves everything as it was', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    const dialog = await openEditor('Focusrite Scarlett 18i8');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove port 1' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save gear' }));

    const confirm = await screen.findByText('This change removes cables');
    expect(confirm.closest('[role="dialog"]')).toHaveTextContent(/removes 1 cable in 1 diagram/);
    fireEvent.click(within(confirm.closest('[role="dialog"]') as HTMLElement).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByText('This change removes cables')).not.toBeInTheDocument());
    expect(scheduleItems()).toHaveLength(5);
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument();
  });

  it('removing a port that has a cable drops just that cable once confirmed', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    const dialog = await openEditor('Focusrite Scarlett 18i8');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove port 1' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save gear' }));

    const confirm = (await screen.findByText('This change removes cables')).closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(confirm).getByRole('button', { name: 'Save gear and remove cables' }));

    await waitFor(() => expect(scheduleItems()).toHaveLength(4));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.queryByText(/Ch 1 · Guitar/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveMyRig).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(saveMyRig).mock.calls[0][1];
    expect(saved.diagrams[0].cables.map((c) => c.id).sort()).toEqual(['cbass', 'cdrums', 'cspeaker', 'cusb']);
  });

  it('removing a port nothing is plugged into needs no confirmation', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    const dialog = await openEditor('HeadRush FRFR-108 MKII');
    // port 2 ("Input 2 · Spare") has no cable
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove port 2' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save gear' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('This change removes cables')).not.toBeInTheDocument();
    expect(scheduleItems()).toHaveLength(5);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('changing a connected port to a direction that no longer fits asks first', async () => {
    load(pageData(mine(JAM)));
    renderPage();
    const dialog = await openEditor('Focusrite Scarlett 18i8');
    // the speaker cable leaves "Line Out 1 · Main" (port 5); turning it into an input breaks the pair
    const directions = within(dialog).getAllByLabelText('Direction');
    fireEvent.change(directions[4], { target: { value: 'in' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save gear' }));
    expect(await screen.findByText('This change removes cables')).toBeInTheDocument();
  });
});
