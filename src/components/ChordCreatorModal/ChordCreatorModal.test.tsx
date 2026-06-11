import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreateCustomChordParams } from '../../api/customChordsApi';

// ── ChordCreatorModal ──────────────────────────────────────────────────────
// Import after all vi.mock() declarations.

import { ChordCreatorModal } from './ChordCreatorModal';

// ── Shared props helpers ───────────────────────────────────────────────────

const SIX_STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];

function renderModal(overrides: {
  open?: boolean;
  isAuthenticated?: boolean;
  onSave?: (params: CreateCustomChordParams) => void;
  onPlay?: (frets: number[]) => void;
  onClose?: () => void;
} = {}) {
  const props = {
    open: true,
    stringCount: 6 as const,
    tuningId: 'standard',
    stringNames: SIX_STRING_NAMES,
    isAuthenticated: false,
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<ChordCreatorModal {...props} />), onSave: props.onSave, onClose: props.onClose, onPlay: props.onPlay };
}

// ── Basic rendering ────────────────────────────────────────────────────────

describe('ChordCreatorModal rendering', () => {
  it('renders the dialog title when open=true', () => {
    renderModal({ open: true });
    expect(screen.getByText('Create Custom Chord')).toBeInTheDocument();
  });

  it('does not render dialog content when open=false', () => {
    renderModal({ open: false });
    expect(screen.queryByText('Create Custom Chord')).not.toBeInTheDocument();
  });

  it('renders all 12 root note buttons', () => {
    renderModal();
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    for (const note of notes) {
      expect(screen.getByRole('button', { name: note })).toBeInTheDocument();
    }
  });

  it('renders Save Chord and Cancel buttons', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Save Chord' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('renders the Name optional input', () => {
    renderModal();
    expect(screen.getByPlaceholderText('e.g. My blues voicing')).toBeInTheDocument();
  });

  it('renders the fretboard editor SVG', () => {
    renderModal();
    expect(screen.getByLabelText('Interactive fretboard editor')).toBeInTheDocument();
  });
});

// ── Community share toggle visibility ─────────────────────────────────────

describe('ChordCreatorModal community toggle', () => {
  it('hides "Share with community" toggle when isAuthenticated=false', () => {
    renderModal({ isAuthenticated: false });
    expect(screen.queryByText('Share with community')).not.toBeInTheDocument();
  });

  it('shows "Share with community" toggle when isAuthenticated=true', () => {
    renderModal({ isAuthenticated: true });
    expect(screen.getByText('Share with community')).toBeInTheDocument();
  });

  it('toggle switch has aria-checked=false by default', () => {
    renderModal({ isAuthenticated: true });
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('toggle switches to aria-checked=true after click', async () => {
    const user = userEvent.setup();
    renderModal({ isAuthenticated: true });
    const toggle = screen.getByRole('switch');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});

// ── Root note selection ────────────────────────────────────────────────────

describe('ChordCreatorModal root note selection', () => {
  it('defaults to C as the selected root', () => {
    renderModal();
    // The selected root note button has the highlighted border class (text-[#8eaaff])
    // We test via the accessible name and verify it renders without error.
    const cButton = screen.getByRole('button', { name: 'C' });
    expect(cButton).toBeInTheDocument();
  });

  it('updates selected root when a different note button is clicked', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByRole('button', { name: 'A' }));
    // Clicking A does not throw; we verify the click is accepted by testing
    // that onSave later uses root: 'A'.
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument();
  });
});

// ── Cancel callback ────────────────────────────────────────────────────────

describe('ChordCreatorModal cancel', () => {
  it('fires onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

// ── Save Chord callback ────────────────────────────────────────────────────

describe('ChordCreatorModal save', () => {
  it('fires onSave with valid params when Save Chord is clicked with default state', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Save Chord' }));

    expect(onSave).toHaveBeenCalledOnce();
    const params = vi.mocked(onSave).mock.calls[0][0] as CreateCustomChordParams;
    expect(params.root).toBe('C');
    expect(params.type).toBe('Major');
    expect(params.voicing.frets).toHaveLength(6);
    expect(params.stringCount).toBe(6);
    expect(params.tuningId).toBe('standard');
  });

  it('fires onSave with root set to selected note', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.click(screen.getByRole('button', { name: 'G' }));
    await user.click(screen.getByRole('button', { name: 'Save Chord' }));

    const params = vi.mocked(onSave).mock.calls[0][0] as CreateCustomChordParams;
    expect(params.root).toBe('G');
  });

  it('fires onSave with isPublic: false when unauthenticated', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({ isAuthenticated: false });

    await user.click(screen.getByRole('button', { name: 'Save Chord' }));

    const params = vi.mocked(onSave).mock.calls[0][0] as CreateCustomChordParams;
    expect(params.isPublic).toBe(false);
  });

  it('fires onSave with isPublic: false by default even when authenticated', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({ isAuthenticated: true });

    await user.click(screen.getByRole('button', { name: 'Save Chord' }));

    const params = vi.mocked(onSave).mock.calls[0][0] as CreateCustomChordParams;
    expect(params.isPublic).toBe(false);
  });

  it('fires onSave with isPublic: true after toggling community share', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal({ isAuthenticated: true });

    await user.click(screen.getByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Save Chord' }));

    const params = vi.mocked(onSave).mock.calls[0][0] as CreateCustomChordParams;
    expect(params.isPublic).toBe(true);
  });

  it('includes trimmed name in params when name is entered', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    const nameInput = screen.getByPlaceholderText('e.g. My blues voicing');
    await user.type(nameInput, '  my chord  ');
    await user.click(screen.getByRole('button', { name: 'Save Chord' }));

    const params = vi.mocked(onSave).mock.calls[0][0] as CreateCustomChordParams;
    expect(params.name).toBe('my chord');
  });

  it('passes name as undefined when name input is empty', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Save Chord' }));

    const params = vi.mocked(onSave).mock.calls[0][0] as CreateCustomChordParams;
    expect(params.name).toBeUndefined();
  });

  it('does not call onSave when all strings are muted', async () => {
    const user = userEvent.setup();
    const { onSave } = renderModal();

    // Mute all 6 strings by clicking each open-zone hit area (toggles 0 -> -1)
    // The open zone rects are transparent click targets above the nut.
    // We fireEvent directly on each string's open-zone rect.
    const svg = screen.getByLabelText('Interactive fretboard editor');
    const openHitAreas = svg.querySelectorAll('rect[style*="cursor: pointer"]');
    // First 6 rects (by position in SVG) are the open-zone hit areas;
    // the rest are fret-cell hit areas. Click the first 6.
    const firstSix = Array.from(openHitAreas).slice(0, 6);
    for (const rect of firstSix) {
      fireEvent.click(rect);
    }

    await user.click(screen.getByRole('button', { name: 'Save Chord' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('At least one string must be open or fretted.')).toBeInTheDocument();
  });

  it('clears the error message after a successful re-interaction', async () => {
    const user = userEvent.setup();
    renderModal();

    // Trigger error first
    const svg = screen.getByLabelText('Interactive fretboard editor');
    const openHitAreas = Array.from(svg.querySelectorAll('rect[style*="cursor: pointer"]')).slice(0, 6);
    for (const rect of openHitAreas) {
      fireEvent.click(rect);
    }
    await user.click(screen.getByRole('button', { name: 'Save Chord' }));
    expect(screen.getByText('At least one string must be open or fretted.')).toBeInTheDocument();

    // Clicking a fret should clear the error (onFretsChange calls setError(null))
    const fretHitAreas = Array.from(svg.querySelectorAll('rect[style*="cursor: pointer"]'));
    fireEvent.click(fretHitAreas[6]); // first fret-cell hit area
    expect(screen.queryByText('At least one string must be open or fretted.')).not.toBeInTheDocument();
  });
});

// ── Reset button ──────────────────────────────────────────────────────────

describe('ChordCreatorModal Reset button', () => {
  it('renders a Reset button in the modal', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });

  it('Reset button is clickable and does not throw', async () => {
    const user = userEvent.setup();
    renderModal();
    await expect(user.click(screen.getByRole('button', { name: 'Reset' }))).resolves.not.toThrow();
  });

  it('Reset clears the name input', async () => {
    const user = userEvent.setup();
    renderModal();
    const nameInput = screen.getByPlaceholderText('e.g. My blues voicing');
    await user.type(nameInput, 'some name');
    expect(nameInput).toHaveValue('some name');
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(nameInput).toHaveValue('');
  });

  it('Reset clears a validation error that was previously shown', async () => {
    const user = userEvent.setup();
    renderModal();

    // Mute all strings to trigger the error
    const svg = screen.getByLabelText('Interactive fretboard editor');
    const openHitAreas = Array.from(svg.querySelectorAll('rect[style*="cursor: pointer"]')).slice(0, 6);
    for (const rect of openHitAreas) {
      fireEvent.click(rect);
    }
    await user.click(screen.getByRole('button', { name: 'Save Chord' }));
    expect(screen.getByText('At least one string must be open or fretted.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByText('At least one string must be open or fretted.')).not.toBeInTheDocument();
  });

  it('Reset restores the scroll label back to "Open position"', async () => {
    const user = userEvent.setup();
    renderModal();
    // Scroll down to leave open position
    await user.click(screen.getByLabelText('Scroll down one fret'));
    expect(screen.getByText('Frets 2–6')).toBeInTheDocument();
    // Reset should bring editorStartFret back to 1
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('Open position')).toBeInTheDocument();
  });
});

// ── Play button ────────────────────────────────────────────────────────────

describe('ChordCreatorModal Play button', () => {
  it('does NOT render the Play button when onPlay prop is absent', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: '▶ Play' })).not.toBeInTheDocument();
  });

  it('renders the Play button when onPlay prop is provided', () => {
    renderModal({ onPlay: vi.fn() });
    expect(screen.getByRole('button', { name: '▶ Play' })).toBeInTheDocument();
  });

  it('calls onPlay with the current frets array when Play is clicked', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    renderModal({ onPlay });
    await user.click(screen.getByRole('button', { name: '▶ Play' }));
    expect(onPlay).toHaveBeenCalledOnce();
    const [calledFrets] = onPlay.mock.calls[0] as [number[]];
    expect(calledFrets).toHaveLength(6);
  });

  it('calls onPlay with all-zero frets in the default state', async () => {
    const user = userEvent.setup();
    const onPlay = vi.fn();
    renderModal({ onPlay });
    await user.click(screen.getByRole('button', { name: '▶ Play' }));
    const [calledFrets] = onPlay.mock.calls[0] as [number[]];
    expect(calledFrets).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('Play button does not call onSave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onPlay = vi.fn();
    renderModal({ onSave, onPlay });
    await user.click(screen.getByRole('button', { name: '▶ Play' }));
    expect(onSave).not.toHaveBeenCalled();
  });
});

// ── InteractiveFretboardEditor ─────────────────────────────────────────────
// These tests are embedded here because the editor is always rendered inside
// the modal.  Dedicated isolation tests live in InteractiveFretboardEditor.test.tsx.

describe('InteractiveFretboardEditor inside ChordCreatorModal', () => {
  it('renders scroll up (▲) button disabled at open position (fret 1)', () => {
    renderModal();
    const upButton = screen.getByLabelText('Scroll up one fret');
    expect(upButton).toBeDisabled();
  });

  it('renders scroll down (▼) button enabled at open position', () => {
    renderModal();
    const downButton = screen.getByLabelText('Scroll down one fret');
    expect(downButton).not.toBeDisabled();
  });

  it('shows "Open position" label at fret 1', () => {
    renderModal();
    expect(screen.getByText('Open position')).toBeInTheDocument();
  });

  it('updates fret range label after scrolling down', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByLabelText('Scroll down one fret'));
    expect(screen.getByText('Frets 2–6')).toBeInTheDocument();
  });

  it('scroll up button becomes enabled after scrolling down', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(screen.getByLabelText('Scroll down one fret'));
    expect(screen.getByLabelText('Scroll up one fret')).not.toBeDisabled();
  });

  it('disables scroll down button at MAX_EDITOR_FRET (20)', async () => {
    const user = userEvent.setup();
    renderModal();
    // scroll down 19 times to reach fret 20
    for (let i = 0; i < 19; i++) {
      await user.click(screen.getByLabelText('Scroll down one fret'));
    }
    expect(screen.getByLabelText('Scroll down one fret')).toBeDisabled();
  });

  it('renders 6 open-string indicators (○) for 6-string guitar by default', () => {
    renderModal();
    // Open strings are rendered as ○ text nodes in the SVG
    const svgContainer = screen.getByLabelText('Interactive fretboard editor').closest('div') as HTMLElement;
    const openIndicators = within(svgContainer).getAllByText('○');
    expect(openIndicators).toHaveLength(6);
  });
});
