import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BackingTrackDialog, type BackingTrackFormValues, type BackingTrackSubmitOptions } from './BackingTrackDialog';

type AddSubmit = (values: BackingTrackFormValues & { file: File }, options: BackingTrackSubmitOptions) => Promise<void>;
type EditSubmit = (values: BackingTrackFormValues, options: BackingTrackSubmitOptions) => Promise<void>;

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const file = (name = 'No Drums.mp3', size = 1024) => {
  const f = new File(['x'], name, { type: 'audio/mpeg' });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

function setup() {
  const onSubmit = vi.fn<AddSubmit>().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(<BackingTrackDialog mode="add" songTitle="Kashmir" onOpenChange={onOpenChange} onSubmit={onSubmit} />);
  return { onSubmit, onOpenChange };
}

function setupEdit(initial: BackingTrackFormValues) {
  const onSubmit = vi.fn<EditSubmit>().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(<BackingTrackDialog mode="edit" songTitle="Kashmir" initial={initial} onOpenChange={onOpenChange} onSubmit={onSubmit} />);
  return { onSubmit, onOpenChange };
}

const fileInput = () => screen.getByLabelText('Audio file') as HTMLInputElement;
const nameInput = () => screen.getByLabelText('Name') as HTMLInputElement;
const pick = (f: File) => fireEvent.change(fileInput(), { target: { files: [f] } });
const typeName = (value: string) => fireEvent.change(nameInput(), { target: { value } });
const submitButton = () => screen.getByRole('button', { name: /^(Add track|Uploading…|Save|Saving…)$/ });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BackingTrackDialog add mode', () => {
  it('shows the add title, the song, the sharing warning and the format hint', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Add a backing track' })).toBeInTheDocument();
    expect(screen.getByText(/For “Kashmir”\..*Only add audio you have the right to share/)).toBeInTheDocument();
    expect(screen.getByText('MP3, M4A, WAV, FLAC · up to 50 MB')).toBeInTheDocument();
  });

  it('has a file picker limited to audio and a name field with the label limit', () => {
    setup();
    expect(fileInput()).toHaveAttribute('type', 'file');
    expect(fileInput().accept).toContain('.mp3');
    expect(fileInput().accept).toContain('audio/*');
    expect(nameInput()).toHaveAttribute('maxlength', '30');
    expect(nameInput()).toBeRequired();
  });

  it('cannot be submitted until a file is chosen', () => {
    const { onSubmit } = setup();
    expect(submitButton()).toBeDisabled();
    fireEvent.submit(submitButton().closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an audio file first.');
  });

  describe('file picker', () => {
    it('enables Add track once a valid file is picked', () => {
      setup();
      pick(file());
      expect(submitButton()).toBeEnabled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('prefills the name from the file name (extension dropped, underscores to spaces)', () => {
      setup();
      pick(file('no_drums_take_2.mp3'));
      expect(nameInput()).toHaveValue('no drums take 2');
    });

    it('follows a newly picked file until the person types a name', () => {
      setup();
      pick(file('first.mp3'));
      expect(nameInput()).toHaveValue('first');
      pick(file('second.wav'));
      expect(nameInput()).toHaveValue('second');
    });

    it('never overwrites a name the person typed', () => {
      setup();
      typeName('My name');
      pick(file('something.mp3'));
      expect(nameInput()).toHaveValue('My name');
    });

    it('stops following the file once the person edits the prefilled name', () => {
      setup();
      pick(file('first.mp3'));
      typeName('Edited');
      pick(file('second.mp3'));
      expect(nameInput()).toHaveValue('Edited');
    });

    it.each(['a.flac', 'a.m4a', 'a.WAV'])('accepts %s', (name) => {
      setup();
      pick(file(name));
      expect(submitButton()).toBeEnabled();
    });

    it('rejects an unsupported type with a readable message and keeps Add track disabled', () => {
      setup();
      pick(file('notes.txt'));
      expect(screen.getByRole('alert')).toHaveTextContent('Choose a MP3, M4A, WAV, FLAC file.');
      expect(submitButton()).toBeDisabled();
    });

    it('rejects an empty file', () => {
      setup();
      pick(file('a.mp3', 0));
      expect(screen.getByRole('alert')).toHaveTextContent('That file is empty.');
      expect(submitButton()).toBeDisabled();
    });

    it('rejects a file over 50 MB', () => {
      setup();
      pick(file('big.mp3', 50 * 1024 * 1024 + 1));
      expect(screen.getByRole('alert')).toHaveTextContent('Files can be up to 50 MB');
      expect(submitButton()).toBeDisabled();
    });

    it('a bad pick clears a previously good one (and its error clears on the next good pick)', () => {
      setup();
      pick(file('good.mp3'));
      pick(file('bad.txt'));
      expect(submitButton()).toBeDisabled();
      pick(file('good2.mp3'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(submitButton()).toBeEnabled();
    });

    it('clearing the selection disables the submit again', () => {
      setup();
      pick(file());
      fireEvent.change(fileInput(), { target: { files: [] } });
      expect(submitButton()).toBeDisabled();
    });
  });

  describe('submitting', () => {
    it('sends the file, the cleaned name and the tags, then closes', async () => {
      const user = userEvent.setup();
      const { onSubmit, onOpenChange } = setup();
      const f = file('x.mp3');
      pick(f);
      typeName('  No   drums ');
      await user.click(screen.getByRole('button', { name: 'Drums' }));
      await user.click(screen.getByRole('button', { name: 'Bass' }));
      await user.click(submitButton());
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const [values, options] = onSubmit.mock.calls[0] as [Parameters<AddSubmit>[0], BackingTrackSubmitOptions];
      expect(values.file).toBe(f);
      expect(values.label).toBe('No drums');
      expect(values.tags).toEqual(['drums', 'bass']);
      expect(typeof options.onProgress).toBe('function');
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.signal.aborted).toBe(false);
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });

    it('sends no tags when none are chosen (for everyone)', async () => {
      const user = userEvent.setup();
      const { onSubmit } = setup();
      pick(file());
      await user.click(submitButton());
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0].tags).toEqual([]);
    });

    it('rejects a name with nothing printable and does not call onSubmit', async () => {
      const user = userEvent.setup();
      const { onSubmit } = setup();
      pick(file());
      typeName('   ');
      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent('Give the track a name');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit an empty name (the field is required)', async () => {
      const user = userEvent.setup();
      const { onSubmit } = setup();
      pick(file());
      typeName('');
      await user.click(submitButton());
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('while uploading', () => {
    it('shows percent progress, then "Checking the file…" at 100%', async () => {
      const user = userEvent.setup();
      const gate = deferred();
      let report!: (fraction: number) => void;
      const { onSubmit } = setup();
      onSubmit.mockImplementation(async (_values, options) => {
        report = options.onProgress;
        await gate.promise;
      });
      pick(file());
      await user.click(submitButton());

      expect(await screen.findByText('Uploading… 0%')).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute('value', '0');

      report(0.4);
      expect(await screen.findByText('Uploading… 40%')).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveAttribute('value', '40');

      report(1);
      expect(await screen.findByText('Checking the file…')).toBeInTheDocument();
      gate.resolve();
    });

    it('can still be cancelled at 99%, but not once the whole file is sent (only the server check is left)', async () => {
      const user = userEvent.setup();
      const gate = deferred();
      let report!: (fraction: number) => void;
      const { onSubmit } = setup();
      onSubmit.mockImplementation(async (_values, options) => {
        report = options.onProgress;
        await gate.promise;
      });
      pick(file());
      await user.click(submitButton());
      await screen.findByText('Uploading… 0%');
      report(0.99);
      await screen.findByText('Uploading… 99%');
      expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeEnabled();
      report(1);
      await screen.findByText('Checking the file…');
      expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeDisabled();
      gate.resolve();
    });

    it('disables Cancel once the whole file is sent, because only the server check is left and it cannot be undone', async () => {
      const user = userEvent.setup();
      const gate = deferred();
      let report!: (fraction: number) => void;
      const { onSubmit } = setup();
      onSubmit.mockImplementation(async (_values, options) => {
        report = options.onProgress;
        await gate.promise;
      });
      pick(file());
      await user.click(submitButton());
      await screen.findByText('Uploading… 0%');
      report(0.6);
      expect(await screen.findByText('Uploading… 60%')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeEnabled();

      report(1);
      await screen.findByText('Checking the file…');
      expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeDisabled();
      gate.resolve();
    });

    it('rounds the percentage', async () => {
      const user = userEvent.setup();
      const gate = deferred();
      let report!: (fraction: number) => void;
      const { onSubmit } = setup();
      onSubmit.mockImplementation(async (_values, options) => {
        report = options.onProgress;
        await gate.promise;
      });
      pick(file());
      await user.click(submitButton());
      await screen.findByText('Uploading… 0%');
      report(0.666);
      expect(await screen.findByText('Uploading… 67%')).toBeInTheDocument();
      gate.resolve();
    });

    it('disables the fields and labels the buttons for an upload in flight', async () => {
      const user = userEvent.setup();
      const gate = deferred();
      const { onSubmit } = setup();
      onSubmit.mockReturnValue(gate.promise);
      pick(file());
      await user.click(submitButton());
      await screen.findByText('Uploading… 0%');
      expect(submitButton()).toHaveTextContent('Uploading…');
      expect(submitButton()).toBeDisabled();
      expect(fileInput()).toBeDisabled();
      expect(nameInput()).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeEnabled();
      gate.resolve();
    });

    it('Cancel upload aborts the signal and closes', async () => {
      const user = userEvent.setup();
      const gate = deferred();
      const { onSubmit, onOpenChange } = setup();
      onSubmit.mockReturnValue(gate.promise);
      pick(file());
      await user.click(submitButton());
      await screen.findByText('Uploading… 0%');
      const signal = (onSubmit.mock.calls[0][1] as BackingTrackSubmitOptions).signal;
      expect(signal.aborted).toBe(false);
      await user.click(screen.getByRole('button', { name: 'Cancel upload' }));
      expect(signal.aborted).toBe(true);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      gate.resolve();
    });

    it('closing with Escape during an upload cancels it too', async () => {
      const user = userEvent.setup();
      const gate = deferred();
      const { onSubmit, onOpenChange } = setup();
      onSubmit.mockReturnValue(gate.promise);
      pick(file());
      await user.click(submitButton());
      await screen.findByText('Uploading… 0%');
      const signal = (onSubmit.mock.calls[0][1] as BackingTrackSubmitOptions).signal;
      await user.keyboard('{Escape}');
      expect(signal.aborted).toBe(true);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      gate.resolve();
    });

    it('does not close by itself until the upload succeeds', async () => {
      const user = userEvent.setup();
      const gate = deferred();
      const { onSubmit, onOpenChange } = setup();
      onSubmit.mockReturnValue(gate.promise);
      pick(file());
      await user.click(submitButton());
      await screen.findByText('Uploading… 0%');
      expect(onOpenChange).not.toHaveBeenCalled();
      gate.resolve();
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    });
  });

  describe('when the upload fails', () => {
    it('shows the message inline, stays open, hides the progress bar and allows a retry', async () => {
      const user = userEvent.setup();
      const { onSubmit, onOpenChange } = setup();
      onSubmit.mockRejectedValueOnce(new Error('Another upload took over. Please try again.'));
      pick(file());
      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent('Another upload took over. Please try again.');
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
      expect(submitButton()).toHaveTextContent('Add track');
      expect(submitButton()).toBeEnabled();

      await user.click(submitButton());
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(onSubmit).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('uses a generic message for a failure that carries none', async () => {
      const user = userEvent.setup();
      const { onSubmit } = setup();
      onSubmit.mockRejectedValueOnce('weird');
      pick(file());
      await user.click(submitButton());
      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    });

    it('each attempt gets a fresh abort signal', async () => {
      const user = userEvent.setup();
      const { onSubmit } = setup();
      onSubmit.mockRejectedValueOnce(new Error('first')).mockResolvedValueOnce(undefined);
      pick(file());
      await user.click(submitButton());
      await screen.findByRole('alert');
      await user.click(submitButton());
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      const first = (onSubmit.mock.calls[0][1] as BackingTrackSubmitOptions).signal;
      const second = (onSubmit.mock.calls[1][1] as BackingTrackSubmitOptions).signal;
      expect(second).not.toBe(first);
      expect(second.aborted).toBe(false);
    });
  });

  it('Cancel before uploading just closes', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('BackingTrackDialog edit mode', () => {
  const initial = { label: 'Click + guide', tags: ['guitar' as const] };

  it('shows the edit title and song, with no file picker', () => {
    setupEdit(initial);
    expect(screen.getByRole('heading', { name: 'Edit backing track' })).toBeInTheDocument();
    expect(screen.getByText(/Rename the track or change who it is for\. “Kashmir”/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Audio file')).not.toBeInTheDocument();
    expect(screen.queryByText(/up to 50 MB/)).not.toBeInTheDocument();
  });

  it('prefills the name and the tags', () => {
    setupEdit({ label: 'Click + guide', tags: ['guitar', 'keys'] });
    expect(nameInput()).toHaveValue('Click + guide');
    expect(screen.getByRole('button', { name: 'Guitar' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Keys' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Drums' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('can be saved without a file, passing only the edited name and tags', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = setupEdit(initial);
    expect(submitButton()).toHaveTextContent('Save');
    expect(submitButton()).toBeEnabled();
    typeName('  Guide   only ');
    await user.click(screen.getByRole('button', { name: 'Guitar' })); // off
    await user.click(screen.getByRole('button', { name: 'Vocals' })); // on
    await user.click(submitButton());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({ label: 'Guide only', tags: ['vocals'] });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('file');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('rejects an emptied name', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setupEdit(initial);
    typeName('   ');
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Give the track a name');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows "Saving…" but no progress bar while saving, and the plain Cancel label', async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const { onSubmit } = setupEdit(initial);
    onSubmit.mockReturnValue(gate.promise);
    await user.click(submitButton());
    await waitFor(() => expect(submitButton()).toHaveTextContent('Saving…'));
    expect(submitButton()).toBeDisabled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(nameInput()).toBeDisabled();
    gate.resolve();
  });

  it('shows a failure inline and stays open', async () => {
    const user = userEvent.setup();
    const { onSubmit, onOpenChange } = setupEdit(initial);
    onSubmit.mockRejectedValueOnce(new Error("You can't change that track."));
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent("You can't change that track.");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
