import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SongLinkMetadata } from '../../api/songMetadataApi';
import { NotSignedInError } from '../../api/bandsShared';
import { SONG_COLOR_KEYS, type SongColorKey } from '../../bandTypes';

const { lookupSongLink } = vi.hoisted(() => ({ lookupSongLink: vi.fn() }));
// Same shape as the real allow-list check, without pulling the amplify-function parser into the test.
vi.mock('../../api/songMetadataApi', () => ({
  lookupSongLink,
  isLookupSupported: (url: string) => /spotify|youtube|youtu\.be|apple|soundcloud/.test(url),
}));

import { SuggestSongDialog } from './SuggestSongDialog';

beforeEach(() => {
  lookupSongLink.mockReset();
  lookupSongLink.mockResolvedValue(null);
});

const setup = (props: Partial<React.ComponentProps<typeof SuggestSongDialog>> = {}) => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(<SuggestSongDialog open onOpenChange={onOpenChange} onSubmit={onSubmit} {...props} />);
  return { onSubmit, onOpenChange };
};
const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('SuggestSongDialog', () => {
  it('submits the entered fields and closes', async () => {
    const { onSubmit, onOpenChange } = setup();
    type('Title', 'Wonderwall');
    type('Artist (optional)', 'Oasis');
    type('Key (optional)', 'F#m');
    type('BPM (optional)', '87');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      { title: 'Wonderwall', artist: 'Oasis', key: 'F#m', tuning: 'E Standard', bpm: '87', notes: '', songUrl: '', tabUrl: '' },
      null, // no color chosen
    );
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('submits the typed song and tab links as raw text', async () => {
    const { onSubmit } = setup();
    type('Title', 'Wonderwall');
    type('Song link (optional)', 'open.spotify.com/track/1');
    type('Tab link (optional)', 'https://tabs.example.com/w');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      songUrl: 'open.spotify.com/track/1',
      tabUrl: 'https://tabs.example.com/w',
    });
  });

  it('renders both link inputs as optional url inputs', () => {
    setup();
    for (const label of ['Song link (optional)', 'Tab link (optional)']) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveValue('');
      expect(input).toHaveAttribute('inputmode', 'url');
      expect(input).not.toBeRequired();
    }
  });

  it('blocks a javascript: song link or an invalid tab link with a readable message', async () => {
    const { onSubmit } = setup();
    type('Title', 'x');
    type('Song link (optional)', 'javascript:alert(1)');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Song link must be a web address');
    type('Song link (optional)', '');
    type('Tab link (optional)', 'https://user:pw@example.com/x');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tab link must be a web address');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('blocks invalid input with a readable message and never calls the API', async () => {
    const { onSubmit } = setup();
    type('Title', 'x');
    type('BPM (optional)', '999');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('BPM must be a whole number from 40 to 300');
    type('BPM (optional)', '');
    type('Key (optional)', 'H');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Key must look like');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows API failures inline and stays open', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('This set list is full (100 songs)'));
    const { onOpenChange } = setup({ onSubmit });
    type('Title', 'Another');
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This set list is full');
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeEnabled();
  });

  it('edit mode is prefilled and says Save', async () => {
    const { onSubmit } = setup({ initial: { title: 'Old', artist: 'A', key: 'C', bpm: 100, notes: 'n' } });
    expect(screen.getByRole('heading', { name: 'Edit song' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Old');
    expect(screen.getByLabelText('BPM (optional)')).toHaveValue('100');
    type('Title', 'New');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'New', artist: 'A' });
  });

  it('edit mode prefills the existing links', () => {
    setup({
      initial: { title: 'Old', songUrl: 'https://a.example/s', tabUrl: 'https://b.example/t' },
    });
    expect(screen.getByLabelText('Song link (optional)')).toHaveValue('https://a.example/s');
    expect(screen.getByLabelText('Tab link (optional)')).toHaveValue('https://b.example/t');
  });

  describe('tuning', () => {
    // Radix Select leans on pointer-capture and scrolling APIs jsdom does not implement.
    beforeAll(() => {
      Element.prototype.hasPointerCapture = vi.fn(() => false);
      Element.prototype.setPointerCapture = vi.fn();
      Element.prototype.releasePointerCapture = vi.fn();
      Element.prototype.scrollIntoView = vi.fn();
    });
    const tuningTrigger = () => screen.getByRole('combobox', { name: 'Tuning' });
    const suggest = () => fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));

    it('defaults a new song to E Standard', () => {
      setup();
      expect(tuningTrigger()).toHaveTextContent('E Standard');
      expect(screen.queryByRole('textbox', { name: 'Custom tuning' })).not.toBeInTheDocument();
    });

    it('submits a preset picked from the dropdown', async () => {
      const user = userEvent.setup();
      const { onSubmit } = setup();
      type('Title', 'Song');
      await user.click(tuningTrigger());
      await user.click(await screen.findByRole('option', { name: 'Drop D' }));
      suggest();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ tuning: 'Drop D' });
    });

    it('submits a custom tuning typed after choosing Custom…', async () => {
      const user = userEvent.setup();
      const { onSubmit } = setup();
      type('Title', 'Song');
      await user.click(tuningTrigger());
      await user.click(await screen.findByRole('option', { name: 'Custom…' }));
      type('Custom tuning', 'D G D G B D');
      suggest();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ tuning: 'D G D G B D' });
    });

    it('blocks a custom tuning that is blank (the required input), without calling the API', async () => {
      const user = userEvent.setup();
      const { onSubmit } = setup();
      type('Title', 'Song');
      await user.click(tuningTrigger());
      await user.click(await screen.findByRole('option', { name: 'Custom…' }));
      expect(screen.getByRole('textbox', { name: 'Custom tuning' })).toBeRequired();
      suggest();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('edit mode shows the song own preset', () => {
      setup({ initial: { title: 'Old', tuning: 'Open G' } });
      expect(tuningTrigger()).toHaveTextContent('Open G');
    });

    it('edit mode opens a non-preset tuning in Custom with its text', () => {
      setup({ initial: { title: 'Old', tuning: 'Half step down + capo 2' } });
      expect(tuningTrigger()).toHaveTextContent('Custom…');
      expect(screen.getByRole('textbox', { name: 'Custom tuning' })).toHaveValue('Half step down + capo 2');
    });

    it('edit mode keeps the existing tuning when only the title changes', async () => {
      const { onSubmit } = setup({ initial: { title: 'Old', tuning: 'DADGAD' } });
      type('Title', 'New');
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'New', tuning: 'DADGAD' });
    });
  });

  describe('color choice', () => {
    const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));

    it('offers an optional color choice on a new song, starting with no color', () => {
      setup();
      expect(screen.getByText('Color (optional)')).toBeInTheDocument();
      expect(screen.getByRole('group', { name: 'Color (optional)' })).toBeInTheDocument();
      expect(screen.getAllByRole('radio')).toHaveLength(SONG_COLOR_KEYS.length);
      for (const radio of screen.getAllByRole('radio')) expect(radio).toHaveAttribute('aria-checked', 'false');
      expect(screen.getByText('No color')).toBeInTheDocument();
    });

    it('does not offer a color choice when editing an existing song', () => {
      setup({ initial: { title: 'Old' } });
      expect(screen.queryByText('Color (optional)')).not.toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Color (optional)' })).not.toBeInTheDocument();
      expect(screen.queryAllByRole('radio')).toHaveLength(0);
    });

    it('passes the chosen color as the second onSubmit argument', async () => {
      const { onSubmit } = setup();
      type('Title', 'Wonderwall');
      fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
      submit();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Wonderwall' });
      expect(onSubmit.mock.calls[0][1]).toBe('blue');
    });

    it('passes null when no color was chosen', async () => {
      const { onSubmit } = setup();
      type('Title', 'Wonderwall');
      submit();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][1]).toBeNull();
    });

    it('choosing the same color again clears it, so null is passed', async () => {
      const { onSubmit } = setup();
      type('Title', 'Wonderwall');
      fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
      submit();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][1]).toBeNull();
    });

    it('the last color picked wins', async () => {
      const { onSubmit } = setup();
      type('Title', 'Wonderwall');
      fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Red' }));
      expect(screen.getByRole('radio', { name: 'Red' })).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute('aria-checked', 'false');
      submit();
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][1]).toBe('red');
    });

    it('shows the band\'s labels in the choice', () => {
      setup({ colorLabels: new Map<SongColorKey, string>([['red', 'Ballad']]) });
      expect(screen.getByRole('radio', { name: 'Red, Ballad' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('radio', { name: 'Red, Ballad' }));
      expect(screen.getByText('Ballad')).toBeInTheDocument();
    });

    it('does not submit (and keeps the color) when the form is invalid', async () => {
      const { onSubmit } = setup();
      fireEvent.click(screen.getByRole('radio', { name: 'Green' }));
      type('Title', 'x');
      type('BPM (optional)', '999');
      submit();
      expect(await screen.findByRole('alert')).toHaveTextContent('BPM must be');
      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByRole('radio', { name: 'Green' })).toHaveAttribute('aria-checked', 'true');
    });

    it('keeps the color after a failed submit so the retry sends it', async () => {
      const onSubmit = vi.fn().mockRejectedValueOnce(new Error('This set list is full')).mockResolvedValue(undefined);
      setup({ onSubmit });
      type('Title', 'Another');
      fireEvent.click(screen.getByRole('radio', { name: 'Pink' }));
      submit();
      expect(await screen.findByRole('alert')).toHaveTextContent('This set list is full');
      expect(screen.getByRole('radio', { name: 'Pink' })).toHaveAttribute('aria-checked', 'true');
      submit();
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      expect(onSubmit.mock.calls[1][1]).toBe('pink');
    });

    it('resets the color after a successful submit, so the next song starts uncolored', async () => {
      const { onSubmit } = setup();
      type('Title', 'First');
      fireEvent.click(screen.getByRole('radio', { name: 'Teal' }));
      submit();
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Teal' })).toHaveAttribute('aria-checked', 'false'));
      expect(screen.getByLabelText('Title')).toHaveValue('');
      type('Title', 'Second');
      submit();
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
      expect(onSubmit.mock.calls[1][1]).toBeNull();
    });

    it('edit mode submits with a null color', async () => {
      const { onSubmit } = setup({ initial: { title: 'Old' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][1]).toBeNull();
    });
  });

  describe('song link lookup', () => {
    const SPOTIFY = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
    const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const RICK: SongLinkMetadata = { title: 'Never Gonna Give You Up', artist: 'Rick Astley' };
    const QUEEN: SongLinkMetadata = { title: 'Bohemian Rhapsody', artist: 'Queen' };
    const LINK = 'Song link (optional)';
    const FAILED = /Couldn’t read details from that link\. Type the title and artist instead\./;
    const ERRORED = 'Couldn’t look that link up right now. Click out of the field to try again.';
    const SIGNED_OUT = 'Sign in to fill the title and artist from a link. You can still type them.';
    const FOUND_RICK = 'Found “Never Gonna Give You Up” by Rick Astley.';
    const FOUND_QUEEN = 'Found “Bohemian Rhapsody” by Queen.';

    const paste = (text: string) =>
      fireEvent.paste(screen.getByLabelText(LINK), { clipboardData: { getData: () => text } });
    const blurWith = (value: string) => {
      type(LINK, value);
      fireEvent.blur(screen.getByLabelText(LINK));
    };
    const deferred = () => {
      let resolve!: (value: SongLinkMetadata | null) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<SongLinkMetadata | null>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
    /** Lets every pending promise continuation (and the state updates it triggers) run. */
    const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const title = () => screen.getByLabelText('Title');
    const artist = () => screen.getByLabelText('Artist (optional)');

    it('fills an empty title and artist when a link is pasted', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      setup();
      paste(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue('Never Gonna Give You Up'));
      expect(artist()).toHaveValue('Rick Astley');
      expect(lookupSongLink).toHaveBeenCalledWith(SPOTIFY);
      expect(screen.getByRole('status')).toHaveTextContent(FOUND_RICK);
    });

    it('fills an empty title and artist when the link field loses focus', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      setup();
      blurWith(YOUTUBE);
      await waitFor(() => expect(title()).toHaveValue('Never Gonna Give You Up'));
      expect(artist()).toHaveValue('Rick Astley');
      expect(lookupSongLink).toHaveBeenCalledWith(YOUTUBE);
    });

    it('looks up a scheme-less link using its canonical https form', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      setup();
      blurWith('open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
      await waitFor(() => expect(lookupSongLink).toHaveBeenCalledWith(SPOTIFY));
    });

    it('shows a busy status while the lookup is in flight', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      setup();
      paste(SPOTIFY);
      expect(await screen.findByText('Looking up title and artist…')).toBeInTheDocument();
      pending.resolve(RICK);
      await waitFor(() => expect(screen.queryByText('Looking up title and artist…')).not.toBeInTheDocument());
    });

    it.each([
      ['an empty link', ''],
      ['whitespace', '   '],
      ['a javascript: link', 'javascript:alert(1)'],
      ['a link with credentials', 'https://user:pw@open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'],
    ])('does not look anything up for %s', async (_label, value) => {
      setup();
      blurWith(value);
      paste(value);
      await flush();
      expect(lookupSongLink).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('does not overwrite a title the person already typed, but still fills the empty artist', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      setup();
      type('Title', 'My own title');
      paste(SPOTIFY);
      await waitFor(() => expect(artist()).toHaveValue('Rick Astley'));
      expect(title()).toHaveValue('My own title');
    });

    it('does not overwrite an artist the person already typed, but still fills the empty title', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      setup();
      type('Artist (optional)', 'Typed Artist');
      paste(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue('Never Gonna Give You Up'));
      expect(artist()).toHaveValue('Typed Artist');
    });

    it('treats a whitespace-only title as empty', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      setup();
      type('Title', '   ');
      paste(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue('Never Gonna Give You Up'));
    });

    it('makes no lookup when editing a song and the saved link is blurred unchanged', async () => {
      setup({ initial: { title: 'Existing', artist: 'Someone', songUrl: SPOTIFY } });
      fireEvent.blur(screen.getByLabelText(LINK));
      paste(SPOTIFY);
      await flush();
      expect(lookupSongLink).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(title()).toHaveValue('Existing');
      expect(artist()).toHaveValue('Someone');
    });

    it('treats a scheme-less spelling of the saved link as unchanged when editing', async () => {
      setup({ initial: { title: 'Existing', songUrl: SPOTIFY } });
      blurWith('open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
      await flush();
      expect(lookupSongLink).not.toHaveBeenCalled();
    });

    it('leaves an existing title and artist alone when editing a song and the link is changed', async () => {
      lookupSongLink.mockResolvedValue(QUEEN);
      setup({ initial: { title: 'Existing', artist: 'Someone', songUrl: SPOTIFY } });
      blurWith(YOUTUBE);
      await waitFor(() => expect(lookupSongLink).toHaveBeenCalledWith(YOUTUBE));
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(FOUND_QUEEN));
      expect(title()).toHaveValue('Existing');
      expect(artist()).toHaveValue('Someone');
    });

    it('fills a blank artist when editing a song and the link is changed', async () => {
      lookupSongLink.mockResolvedValue(QUEEN);
      setup({ initial: { title: 'Existing', artist: '', songUrl: SPOTIFY } });
      blurWith(YOUTUBE);
      await waitFor(() => expect(artist()).toHaveValue('Queen'));
      expect(title()).toHaveValue('Existing');
    });

    it('replaces previously auto-filled values when a new link is pasted', async () => {
      lookupSongLink.mockResolvedValueOnce(RICK).mockResolvedValueOnce(QUEEN);
      setup();
      paste(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue(RICK.title));
      paste(YOUTUBE);
      await waitFor(() => expect(title()).toHaveValue('Bohemian Rhapsody'));
      expect(artist()).toHaveValue('Queen');
    });

    it('keeps text the person edited after an auto-fill when a new link arrives', async () => {
      lookupSongLink.mockResolvedValueOnce(RICK).mockResolvedValueOnce(QUEEN);
      setup();
      paste(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue(RICK.title));
      type('Title', 'Never Gonna Give You Up (live)');
      paste(YOUTUBE);
      await waitFor(() => expect(artist()).toHaveValue('Queen'));
      expect(title()).toHaveValue('Never Gonna Give You Up (live)');
    });

    it('does not look the same link up twice once it has filled the form', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      setup();
      paste(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue(RICK.title));
      blurWith(SPOTIFY);
      paste(SPOTIFY);
      await flush();
      expect(lookupSongLink).toHaveBeenCalledTimes(1);
    });

    it('looks the same link up again after a successful submit resets the form', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const { onSubmit } = setup();
      paste(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue(RICK.title));
      fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      await waitFor(() => expect(title()).toHaveValue(''));
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      paste(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue(RICK.title));
      expect(lookupSongLink).toHaveBeenCalledTimes(2);
    });

    it('ignores a stale response that resolves after a newer link was pasted', async () => {
      const first = deferred();
      const second = deferred();
      lookupSongLink.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      setup();
      paste(SPOTIFY);
      paste(YOUTUBE);
      second.resolve(QUEEN);
      await waitFor(() => expect(title()).toHaveValue('Bohemian Rhapsody'));
      first.resolve(RICK);
      await flush();
      expect(title()).toHaveValue('Bohemian Rhapsody');
      expect(artist()).toHaveValue('Queen');
      expect(screen.getByRole('status')).toHaveTextContent(FOUND_QUEEN);
    });

    it('ignores a stale failure that arrives after a newer link succeeded', async () => {
      const first = deferred();
      const second = deferred();
      lookupSongLink.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      setup();
      paste(SPOTIFY);
      paste(YOUTUBE);
      second.resolve(QUEEN);
      await waitFor(() => expect(title()).toHaveValue('Bohemian Rhapsody'));
      first.reject(new Error('boom'));
      await flush();
      expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
      expect(screen.queryByText(ERRORED)).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(FOUND_QUEEN);
    });

    it('ignores a response that arrives after the dialog was cancelled', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      setup();
      paste(SPOTIFY);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      pending.resolve(RICK);
      await flush();
      expect(title()).toHaveValue('');
      expect(artist()).toHaveValue('');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('shows no "Looking up…" when the dialog is closed mid-lookup and reopened', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onOpenChange = vi.fn();
      const view = (open: boolean) => <SuggestSongDialog open={open} onOpenChange={onOpenChange} onSubmit={onSubmit} />;
      const { rerender } = render(view(true));

      paste(SPOTIFY);
      expect(await screen.findByText('Looking up title and artist…')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
      rerender(view(false));
      await flush();
      rerender(view(true));

      expect(screen.queryByText('Looking up title and artist…')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();

      // the abandoned lookup must not land in the reopened form, even when it finally resolves
      pending.resolve(RICK);
      await flush();
      expect(title()).toHaveValue('');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('looks the link up afresh after a close and reopen', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const onOpenChange = vi.fn();
      const view = (open: boolean) => <SuggestSongDialog open={open} onOpenChange={onOpenChange} onSubmit={onSubmit} />;
      const { rerender } = render(view(true));
      paste(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue(RICK.title));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      rerender(view(false));
      rerender(view(true));
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      paste(SPOTIFY);
      await waitFor(() => expect(lookupSongLink).toHaveBeenCalledTimes(2));
    });

    it('shows a failure message when nothing could be read', async () => {
      lookupSongLink.mockResolvedValue(null);
      setup();
      paste(SPOTIFY);
      expect(await screen.findByText(FAILED)).toBeInTheDocument();
      expect(title()).toHaveValue('');
    });

    it('asks to retry when the lookup itself throws', async () => {
      lookupSongLink.mockRejectedValue(new Error('Could not look up that link.'));
      setup();
      paste(SPOTIFY);
      expect(await screen.findByText(ERRORED)).toBeInTheDocument();
      expect(screen.queryByText(FAILED)).not.toBeInTheDocument();
      expect(title()).toHaveValue('');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says to sign in when the lookup is refused because nobody is signed in', async () => {
      lookupSongLink.mockRejectedValue(new NotSignedInError());
      setup();
      paste(SPOTIFY);
      expect(await screen.findByText(SIGNED_OUT)).toBeInTheDocument();
      expect(title()).toHaveValue('');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not look a link up again after it could not be read', async () => {
      lookupSongLink.mockResolvedValue(null);
      setup();
      paste(SPOTIFY);
      await screen.findByText(FAILED);
      blurWith(SPOTIFY);
      paste(SPOTIFY);
      await flush();
      expect(lookupSongLink).toHaveBeenCalledTimes(1);
      expect(screen.getByText(FAILED)).toBeInTheDocument();
    });

    it('retries the same link after the lookup threw, as the message promises', async () => {
      lookupSongLink.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(RICK);
      setup();
      blurWith(SPOTIFY);
      await screen.findByText(ERRORED);
      fireEvent.blur(screen.getByLabelText(LINK));
      await waitFor(() => expect(title()).toHaveValue(RICK.title));
      expect(lookupSongLink).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(ERRORED)).not.toBeInTheDocument();
    });

    it('makes no request for a link the lookup cannot read, and says nothing', async () => {
      setup();
      blurWith('https://example.com/some-song');
      paste('https://example.com/some-song');
      await flush();
      expect(lookupSongLink).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('drops an in-flight lookup when the link is changed to one that cannot be read', async () => {
      const pending = deferred();
      lookupSongLink.mockReturnValue(pending.promise);
      setup();
      paste(SPOTIFY);
      expect(await screen.findByText('Looking up title and artist…')).toBeInTheDocument();
      blurWith('https://example.com/some-song');
      await flush();
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      pending.resolve(RICK);
      await flush();
      expect(title()).toHaveValue('');
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
    });

    it('does not block submitting while a lookup is still pending', async () => {
      lookupSongLink.mockReturnValue(new Promise(() => undefined));
      const { onSubmit } = setup();
      type('Title', 'Typed Title');
      paste(SPOTIFY);
      expect(screen.getByRole('button', { name: 'Suggest' })).toBeEnabled();
      fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Typed Title' });
    });

    it('does not block submitting after a failed lookup, and submits the link as typed', async () => {
      lookupSongLink.mockResolvedValue(null);
      const { onSubmit } = setup();
      type('Title', 'Typed Title');
      blurWith(SPOTIFY);
      await screen.findByText(FAILED);
      fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: 'Typed Title', songUrl: SPOTIFY });
    });

    it('submits the auto-filled values', async () => {
      lookupSongLink.mockResolvedValue(RICK);
      const { onSubmit } = setup();
      blurWith(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue(RICK.title));
      fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ title: RICK.title, artist: RICK.artist, songUrl: SPOTIFY });
    });

    it('clears an auto-filled artist when the next link has none, but keeps a typed one', async () => {
      lookupSongLink.mockResolvedValueOnce(RICK).mockResolvedValueOnce({ title: 'Anonymous Track', artist: '' });
      setup();
      paste(SPOTIFY);
      await waitFor(() => expect(artist()).toHaveValue('Rick Astley'));
      paste(YOUTUBE);
      await waitFor(() => expect(title()).toHaveValue('Anonymous Track'));
      expect(artist()).toHaveValue('');
      expect(screen.getByRole('status')).toHaveTextContent('Found “Anonymous Track”.');
    });

    it('leaves an empty artist alone when the lookup found none', async () => {
      lookupSongLink.mockResolvedValue({ title: 'Solo Title', artist: '' });
      setup();
      type('Artist (optional)', 'Typed Artist');
      paste(SPOTIFY);
      await waitFor(() => expect(title()).toHaveValue('Solo Title'));
      expect(artist()).toHaveValue('Typed Artist');
    });
  });
});
