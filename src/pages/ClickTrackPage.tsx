import { useState, useEffect, useRef, useCallback } from 'react';
import { GripVertical, Play, Pause, Square, Pencil, Trash2, Plus, Download, RotateCcw, Cloud, ChevronDown, FolderOpen, Share2 } from 'lucide-react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { ClickTrackEngine } from '@/audio/ClickTrackEngine';
import type { TrackPiece, SubdivisionLabel } from '@/audio/ClickTrackEngine';
import { exportClickTrack } from '@/audio/exportClickTrack';
import { saveCloudClickTrack, loadCloudClickTracks, deleteCloudClickTrack } from '@/api/clickTrackApi';
import type { SegmentGroup, CloudClickTrack } from '@/api/clickTrackApi';
import './ClickTrackPage.css';

// ── Color palette ──────────────────────────────────────────────────────────
const PALETTE: { name: string; hex: string }[] = [
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'sky',    hex: '#38bdf8' },
  { name: 'emerald',hex: '#34d399' },
  { name: 'amber',  hex: '#fbbf24' },
  { name: 'rose',   hex: '#fb7185' },
  { name: 'orange', hex: '#fb923c' },
  { name: 'teal',   hex: '#2dd4bf' },
  { name: 'slate',  hex: '#94a3b8' },
];

// ── Subdivision options ────────────────────────────────────────────────────
const SUBDIVISIONS: { value: SubdivisionLabel; label: string }[] = [
  { value: 'whole',           label: 'Whole'           },
  { value: 'half',            label: 'Half'            },
  { value: 'quarter',         label: 'Quarter'         },
  { value: 'eighth',          label: 'Eighth'          },
  { value: 'sixteenth',       label: 'Sixteenth'       },
  { value: 'quarter-triplet', label: 'Quarter Triplet' },
  { value: 'eighth-triplet',  label: 'Eighth Triplet'  },
];

// ── Common time signatures ─────────────────────────────────────────────────
const COMMON_TIME_SIGS = ['2/4','3/4','4/4','5/4','6/8','7/8','12/8','custom'] as const;

type DraftPiece = Omit<TrackPiece, 'id'> & { customNum: string; customDen: string; useCustom: boolean };

const DEFAULT_DRAFT: DraftPiece = {
  label: '',
  color: PALETTE[0].hex,
  groupId: null,
  timeSignature: { numerator: 4, denominator: 4 },
  subdivision: 'quarter',
  bpm: 120,
  repeats: 4,
  customNum: '4',
  customDen: '4',
  useCustom: false,
};

// ── localStorage ───────────────────────────────────────────────────────────
const STORAGE_KEY = 'click-track-state';

interface PersistedState {
  pieces: TrackPiece[];
  groups: SegmentGroup[];
  speedPercent: number;
  expandView: boolean;
  countdownEnabled: boolean;
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedState;
  } catch { /* ignore */ }
  return { pieces: [], groups: [], speedPercent: 100, expandView: false, countdownEnabled: false };
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length].hex;
}

// ── Time-sig helpers ───────────────────────────────────────────────────────
function parseSig(str: string): { numerator: number; denominator: number } | null {
  const [n, d] = str.split('/').map(Number);
  if (!n || !d || n < 1 || d < 1) return null;
  return { numerator: n, denominator: d };
}

function sigLabel(ts: { numerator: number; denominator: number }): string {
  return `${ts.numerator}/${ts.denominator}`;
}

// ── Sub-display label ──────────────────────────────────────────────────────
function subLabel(s: SubdivisionLabel): string {
  return SUBDIVISIONS.find(x => x.value === s)?.label ?? s;
}

// ── Share encoding ──────────────────────────────────────────────────────────
function encodeTrack(pieces: TrackPiece[], groups: SegmentGroup[]): string {
  return btoa(encodeURIComponent(JSON.stringify({ pieces, groups })));
}

function decodeTrack(s: string): { pieces: TrackPiece[]; groups: SegmentGroup[] } | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(atob(s))) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    if (!Array.isArray(p.pieces)) return null;
    return { pieces: p.pieces as TrackPiece[], groups: Array.isArray(p.groups) ? p.groups as SegmentGroup[] : [] };
  } catch { return null; }
}

// ── Score view dot computation ──────────────────────────────────────────────
function getMeasureDots(piece: TrackPiece): Array<'accent' | 'beat' | 'sub'> {
  const { numerator } = piece.timeSignature;
  const sub = piece.subdivision;
  if (sub === 'whole') return ['accent'];
  if (sub === 'half') {
    const count = Math.ceil(numerator / 2);
    return Array.from({ length: count }, (_, i) => (i === 0 ? 'accent' : 'beat') as 'accent' | 'beat');
  }
  const subsPerBeat = sub === 'eighth' || sub === 'eighth-triplet' ? 1 : sub === 'sixteenth' ? 3 : 0;
  const result: Array<'accent' | 'beat' | 'sub'> = [];
  for (let b = 0; b < numerator; b++) {
    result.push(b === 0 ? 'accent' : 'beat');
    for (let s = 0; s < subsPerBeat; s++) result.push('sub');
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
export function ClickTrackPage() {
  const saved = loadState();
  const [pieces, setPieces] = useState<TrackPiece[]>(saved.pieces);
  const [groups, setGroups] = useState<SegmentGroup[]>(saved.groups);
  const [speedPercent, setSpeedPercent] = useState(saved.speedPercent);
  const [expandView, setExpandView] = useState(saved.expandView);
  const [countdownEnabled, setCountdownEnabled] = useState(saved.countdownEnabled);

  const [isPlaying, setIsPlaying] = useState(false);
  const [countdownDisplay, setCountdownDisplay] = useState<number | null>(null);
  const [currentPieceIndex, setCurrentPieceIndex] = useState<number | null>(null);
  const [currentRepetition, setCurrentRepetition] = useState<number | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftPiece>(DEFAULT_DRAFT);
  const [draft, setDraft] = useState<DraftPiece>({ ...DEFAULT_DRAFT });

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');

  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDraft, setGroupDraft] = useState<{ name: string; color: string }>({ name: '', color: PALETTE[0].hex });
  const [groupTarget, setGroupTarget] = useState<string | null>(null); // existing group id or null = create

  const [exporting, setExporting] = useState(false);

  const { authStatus } = useAuthenticator(ctx => [ctx.authStatus]);

  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [savedTracks, setSavedTracks] = useState<CloudClickTrack[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  const [sharedOffer, setSharedOffer] = useState<{ pieces: TrackPiece[]; groups: SegmentGroup[] } | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const engineRef = useRef<ClickTrackEngine | null>(null);
  const dragIndex = useRef<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Engine singleton
  if (!engineRef.current) engineRef.current = new ClickTrackEngine();

  // Persist to localStorage
  useEffect(() => {
    const s: PersistedState = { pieces, groups, speedPercent, expandView, countdownEnabled };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  }, [pieces, groups, speedPercent, expandView, countdownEnabled]);

  // Live speed update
  useEffect(() => {
    if (isPlaying) engineRef.current?.updateSpeed(speedPercent / 100);
  }, [speedPercent, isPlaying]);

  // Load shared track from URL param on mount
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('t');
    if (t) {
      const decoded = decodeTrack(t);
      if (decoded) setSharedOffer(decoded);
      history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setCurrentPieceIndex(null);
    setCurrentRepetition(null);
    setCountdownDisplay(null);
  }, []);

  const handleProgress = useCallback((pi: number, rep: number) => {
    setCurrentPieceIndex(pi);
    setCurrentRepetition(rep);
    setCountdownDisplay(null);
  }, []);

  const handleCountdown = useCallback((n: number) => {
    setCountdownDisplay(n);
  }, []);

  function startFrom(startIdx: number) {
    if (pieces.length === 0) return;
    engineRef.current!.start(
      pieces, startIdx, speedPercent / 100, countdownEnabled,
      handleProgress, handleCountdown, handleStop,
    );
    setIsPlaying(true);
    setCountdownDisplay(countdownEnabled ? 3 : null);
    setCurrentPieceIndex(startIdx);
    setCurrentRepetition(0);
  }

  function togglePlay() {
    if (isPlaying) {
      engineRef.current!.pause();
      setIsPlaying(false);
    } else if (currentPieceIndex !== null) {
      engineRef.current!.resume();
      setIsPlaying(true);
    } else {
      startFrom(0);
    }
  }

  function stopPlayback() {
    engineRef.current!.stop();
    handleStop();
  }

  // ── Draft helpers ──────────────────────────────────────────────────────
  function applyDraftTimeSig(d: DraftPiece): DraftPiece {
    if (!d.useCustom) return d;
    const n = parseInt(d.customNum, 10);
    const den = parseInt(d.customDen, 10);
    if (n > 0 && den > 0) {
      return { ...d, timeSignature: { numerator: n, denominator: den } };
    }
    return d;
  }

  function addPiece() {
    const d = applyDraftTimeSig(draft);
    const label = d.label.trim() || `Segment ${pieces.length + 1}`;
    const piece: TrackPiece = {
      id: uid(),
      label,
      color: d.color,
      groupId: d.groupId,
      timeSignature: d.timeSignature,
      subdivision: d.subdivision,
      bpm: d.bpm,
      repeats: d.repeats,
    };
    setPieces(p => [...p, piece]);
    setDraft(prev => ({
      ...DEFAULT_DRAFT,
      color: colorForIndex(pieces.length + 1),
      bpm: prev.bpm,
      subdivision: prev.subdivision,
      timeSignature: prev.timeSignature,
      customNum: prev.customNum,
      customDen: prev.customDen,
      useCustom: prev.useCustom,
    }));
  }

  function removePiece(id: string) {
    setPieces(p => p.filter(x => x.id !== id));
    setSelectedIds(s => { const n = new Set(s); n.delete(id); return n; });
    if (editingId === id) setEditingId(null);
  }

  function startEdit(piece: TrackPiece) {
    const commonSig = COMMON_TIME_SIGS.find(s => s !== 'custom' && parseSig(s)?.numerator === piece.timeSignature.numerator && parseSig(s)?.denominator === piece.timeSignature.denominator);
    setEditingId(piece.id);
    setEditDraft({
      label: piece.label,
      color: piece.color,
      groupId: piece.groupId,
      timeSignature: piece.timeSignature,
      subdivision: piece.subdivision,
      bpm: piece.bpm,
      repeats: piece.repeats,
      customNum: String(piece.timeSignature.numerator),
      customDen: String(piece.timeSignature.denominator),
      useCustom: !commonSig,
    });
  }

  function saveEdit(id: string) {
    const d = applyDraftTimeSig(editDraft);
    const label = d.label.trim() || (pieces.find(p => p.id === id)?.label ?? 'Segment');
    setPieces(p => p.map(x => x.id === id ? { ...x, label, color: d.color, groupId: d.groupId, timeSignature: d.timeSignature, subdivision: d.subdivision, bpm: d.bpm, repeats: d.repeats } : x));
    setEditingId(null);
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────
  function onDragStart(i: number) { dragIndex.current = i; }

  function onDragOver(e: React.DragEvent, i: number) {
    e.preventDefault();
    dragOverIndex.current = i;
    setDragOverIdx(i);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const from = dragIndex.current;
    const to = dragOverIndex.current;
    if (from === null || to === null || from === to) { setDragOverIdx(null); return; }
    setPieces(p => {
      const arr = [...p];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
    dragIndex.current = null;
    dragOverIndex.current = null;
    setDragOverIdx(null);
  }

  function onDragEnd() {
    dragIndex.current = null;
    dragOverIndex.current = null;
    setDragOverIdx(null);
  }

  // ── Selection ──────────────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function openGroupDialog(existingGroupId?: string) {
    if (existingGroupId) {
      const g = groups.find(x => x.id === existingGroupId);
      if (g) { setGroupDraft({ name: g.name, color: g.color }); setGroupTarget(existingGroupId); }
    } else {
      setGroupDraft({ name: '', color: PALETTE[groups.length % PALETTE.length].hex });
      setGroupTarget(null);
    }
    setGroupDialogOpen(true);
  }

  function saveGroup() {
    if (!groupDraft.name.trim()) return;
    if (groupTarget) {
      setGroups(g => g.map(x => x.id === groupTarget ? { ...x, ...groupDraft } : x));
      setPieces(p => p.map(x => selectedIds.has(x.id) ? { ...x, groupId: groupTarget, color: groupDraft.color } : x));
    } else {
      const id = uid();
      setGroups(g => [...g, { id, name: groupDraft.name.trim(), color: groupDraft.color }]);
      setPieces(p => p.map(x => selectedIds.has(x.id) ? { ...x, groupId: id, color: groupDraft.color } : x));
    }
    setGroupDialogOpen(false);
    setSelectedIds(new Set());
  }

  function unassignGroup() {
    setPieces(p => p.map(x => selectedIds.has(x.id) ? { ...x, groupId: null } : x));
    setSelectedIds(new Set());
  }

  // ── Reset ──────────────────────────────────────────────────────────────
  function reset() {
    if (!window.confirm('Clear the entire click track?')) return;
    engineRef.current!.stop();
    handleStop();
    setPieces([]);
    setGroups([]);
    setSelectedIds(new Set());
    setEditingId(null);
  }

  // ── Load from cloud ────────────────────────────────────────────────────
  async function openLoadDialog() {
    setLoadDialogOpen(true);
    setLoadingTracks(true);
    setSavedTracks(await loadCloudClickTracks());
    setLoadingTracks(false);
  }

  function loadTrack(track: CloudClickTrack) {
    if (pieces.length > 0 && !window.confirm('Replace current track with the saved one?')) return;
    stopPlayback();
    setPieces(track.pieces);
    setGroups(track.groups);
    setLoadDialogOpen(false);
  }

  async function deleteTrack(id: string) {
    await deleteCloudClickTrack(id);
    setSavedTracks(t => t.filter(x => x.id !== id));
  }

  // ── Share ──────────────────────────────────────────────────────────────
  function handleShare() {
    const encoded = encodeTrack(pieces, groups);
    const url = `${window.location.origin}${window.location.pathname}?t=${encoded}`;
    void navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  // ── Save to cloud ──────────────────────────────────────────────────────
  async function saveCloud() {
    setSaveStatus('saving');
    const result = await saveCloudClickTrack(saveName.trim() || 'Click Track', pieces, groups);
    setSaveStatus(result ? 'ok' : 'error');
    setTimeout(() => { setSaveStatus('idle'); setSaveDialogOpen(false); }, 1500);
  }

  // ── Export ─────────────────────────────────────────────────────────────
  async function doExport() {
    setExporting(true);
    try { await exportClickTrack(pieces, speedPercent); } finally { setExporting(false); }
  }

  // ── Helpers for rendering ──────────────────────────────────────────────
  function getEffectiveColor(piece: TrackPiece): string {
    if (piece.groupId) {
      const g = groups.find(x => x.id === piece.groupId);
      if (g) return g.color;
    }
    return piece.color;
  }

  function groupName(groupId: string | null): string | null {
    if (!groupId) return null;
    return groups.find(x => x.id === groupId)?.name ?? null;
  }

  // ── Time sig select handler ────────────────────────────────────────────
  function applyTimeSigSelect(val: string, setD: React.Dispatch<React.SetStateAction<DraftPiece>>) {
    if (val === 'custom') {
      setD(d => ({ ...d, useCustom: true }));
    } else {
      const sig = parseSig(val);
      if (sig) setD(d => ({ ...d, useCustom: false, timeSignature: sig, customNum: String(sig.numerator), customDen: String(sig.denominator) }));
    }
  }

  function currentTimeSigValue(d: DraftPiece): string {
    if (d.useCustom) return 'custom';
    const match = COMMON_TIME_SIGS.find(s => s !== 'custom' && parseSig(s)?.numerator === d.timeSignature.numerator && parseSig(s)?.denominator === d.timeSignature.denominator);
    return match ?? 'custom';
  }

  // ── Piece form (shared by Add and Edit) ────────────────────────────────
  function PieceForm({ d, setD, onSubmit, submitLabel }: {
    d: DraftPiece;
    setD: React.Dispatch<React.SetStateAction<DraftPiece>>;
    onSubmit: () => void;
    submitLabel: string;
  }) {
    const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } };

    return (
      <div className="ct-edit-form">
        <div className="ct-form-row">
          <Label className="ct-form-label">Label</Label>
          <Input
            className="h-7 text-xs w-36"
            value={d.label}
            placeholder="Segment name"
            onChange={e => setD(x => ({ ...x, label: e.target.value }))}
            onKeyDown={handleKey}
          />
          <Label className="ct-form-label">Color</Label>
          <div className="ct-color-swatches">
            {PALETTE.map(p => (
              <button
                key={p.name}
                type="button"
                className={cn('ct-swatch', d.color === p.hex && 'selected')}
                style={{ background: p.hex }}
                onClick={() => setD(x => ({ ...x, color: p.hex }))}
                title={p.name}
              />
            ))}
          </div>
        </div>

        <div className="ct-form-row">
          <Label className="ct-form-label">Time sig</Label>
          <Select value={currentTimeSigValue(d)} onValueChange={v => applyTimeSigSelect(v, setD)}>
            <SelectTrigger className="h-7 text-xs w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIME_SIGS.map(s => (
                <SelectItem key={s} value={s}>{s === 'custom' ? 'Custom…' : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {d.useCustom && (
            <div className="ct-timesig-custom">
              <Input className="h-7 text-xs w-12 text-center" value={d.customNum} onChange={e => setD(x => ({ ...x, customNum: e.target.value }))} onKeyDown={handleKey} />
              <span className="ct-timesig-slash">/</span>
              <Input className="h-7 text-xs w-12 text-center" value={d.customDen} onChange={e => setD(x => ({ ...x, customDen: e.target.value }))} onKeyDown={handleKey} />
            </div>
          )}

          <Label className="ct-form-label">Subdivision</Label>
          <Select value={d.subdivision} onValueChange={v => setD(x => ({ ...x, subdivision: v as SubdivisionLabel }))}>
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBDIVISIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="ct-form-row">
          <Label className="ct-form-label">BPM</Label>
          <Input
            type="number" className="h-7 text-xs w-20"
            value={d.bpm} min={20} max={400}
            onChange={e => setD(x => ({ ...x, bpm: Math.max(20, Math.min(400, parseInt(e.target.value) || 120)) }))}
            onKeyDown={handleKey}
          />

          <Label className="ct-form-label">Repeats</Label>
          <Input
            type="number" className="h-7 text-xs w-16"
            value={d.repeats} min={1} max={99}
            onChange={e => setD(x => ({ ...x, repeats: Math.max(1, Math.min(99, parseInt(e.target.value) || 1)) }))}
            onKeyDown={handleKey}
          />

          {groups.length > 0 && (
            <>
              <Label className="ct-form-label">Group</Label>
              <Select value={d.groupId ?? 'none'} onValueChange={v => setD(x => ({ ...x, groupId: v === 'none' ? null : v }))}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </>
          )}

          <Button size="sm" className="h-7 text-xs ml-auto" onClick={onSubmit}>{submitLabel}</Button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="click-track-page">

      {/* Countdown overlay */}
      {countdownDisplay !== null && (
        <div className="ct-countdown-overlay" key={countdownDisplay}>
          <div className="ct-countdown-number">{countdownDisplay}</div>
        </div>
      )}

      {/* Header */}
      <div className="ct-header">
        <h1>Click Track Builder</h1>
        <div className="ct-header-actions">
          <Button size="sm" variant="ghost" onClick={reset} className="gap-1 text-xs">
            <RotateCcw size={13} /> Reset
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={doExport}
            disabled={pieces.length === 0 || isPlaying || exporting}
            className="gap-1 text-xs"
          >
            <Download size={13} /> {exporting ? 'Exporting…' : 'Download WAV'}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={handleShare}
            disabled={pieces.length === 0}
            className="gap-1 text-xs"
          >
            <Share2 size={13} /> {shareCopied ? 'Copied!' : 'Share'}
          </Button>
          {authStatus === 'authenticated' && (
            <>
              <Button
                size="sm" variant="outline"
                onClick={() => void openLoadDialog()}
                className="gap-1 text-xs"
              >
                <FolderOpen size={13} /> Load
              </Button>
              <Button
                size="sm" variant="outline"
                onClick={() => { setSaveName(''); setSaveStatus('idle'); setSaveDialogOpen(true); }}
                disabled={pieces.length === 0}
                className="gap-1 text-xs"
              >
                <Cloud size={13} /> Save to Cloud
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Playback bar */}
      <div className="ct-playback-bar">
        <Button
          size="sm"
          onClick={togglePlay}
          disabled={pieces.length === 0}
          className="gap-1 text-xs"
        >
          {isPlaying ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Play</>}
        </Button>

        {(isPlaying || currentPieceIndex !== null) && (
          <Button size="sm" variant="ghost" onClick={stopPlayback} className="gap-1 text-xs">
            <Square size={13} /> Stop
          </Button>
        )}

        <div className="ct-speed-label">
          Speed:
          <Slider
            className="ct-speed-slider"
            min={25} max={200} step={5}
            value={[speedPercent]}
            onValueChange={([v]) => setSpeedPercent(v)}
          />
          <span>{speedPercent}%</span>
        </div>

        <label className="ct-toggle-row">
          <button
            type="button"
            className={cn('ct-toggle', expandView && 'on')}
            onClick={() => setExpandView(v => !v)}
            aria-label="Toggle expand view"
          />
          Expand
        </label>

        <label className="ct-toggle-row">
          <button
            type="button"
            className={cn('ct-toggle', countdownEnabled && 'on')}
            onClick={() => setCountdownEnabled(v => !v)}
            aria-label="Toggle countdown"
          />
          Countdown
        </label>
      </div>

      {/* Shared track banner */}
      {sharedOffer !== null && (
        <div className="ct-shared-banner">
          <span>Shared track available — load it?</span>
          <Button size="sm" className="h-7 text-xs" onClick={() => {
            if (pieces.length > 0 && !window.confirm('Replace current track with the shared one?')) return;
            stopPlayback();
            setPieces(sharedOffer.pieces);
            setGroups(sharedOffer.groups);
            setSharedOffer(null);
          }}>Load</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSharedOffer(null)}>Dismiss</Button>
        </div>
      )}

      {/* Track list */}
      <div className="ct-track-list">
        {pieces.length === 0 && (
          <div className="ct-empty-state">No segments yet — add one below</div>
        )}

        {/* Score view (expand mode) */}
        {expandView && pieces.length > 0 && (
          <div className="ct-score-view">
            {pieces.map((piece, pi) => {
              const color = getEffectiveColor(piece);
              const dots = getMeasureDots(piece);
              return Array.from({ length: piece.repeats }, (_, r) => {
                const isActiveCell = currentPieceIndex === pi && currentRepetition === r;
                return (
                  <div
                    key={`${piece.id}-${r}`}
                    className={cn('ct-measure-cell', isActiveCell && 'is-active-rep')}
                    style={{ '--piece-color': color } as React.CSSProperties}
                  >
                    {r === 0 && <div className="ct-measure-label">{piece.label}</div>}
                    <div className="ct-dots-row">
                      {dots.map((type, di) => (
                        <span key={di} className={`ct-dot ct-dot--${type}`} />
                      ))}
                    </div>
                    <div className="ct-measure-rep">{r + 1}/{piece.repeats}</div>
                  </div>
                );
              });
            })}
          </div>
        )}

        {/* Normal card list (non-expand mode) */}
        {!expandView && pieces.map((piece, i) => {
          const color = getEffectiveColor(piece);
          const gName = groupName(piece.groupId);
          const isActive = currentPieceIndex === i;
          const isEditing = editingId === piece.id;

          return (
            <div
              key={piece.id}
              className={cn('ct-piece-card', isActive && 'is-active', dragOverIdx === i && 'drag-over')}
              style={{ '--piece-color': color } as React.CSSProperties}
              draggable
              onDragStart={() => onDragStart(i)}
              onDragOver={e => onDragOver(e, i)}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            >
              <div className="ct-piece-row">
                <input
                  type="checkbox"
                  className="ct-checkbox"
                  checked={selectedIds.has(piece.id)}
                  onChange={() => toggleSelect(piece.id)}
                />

                <span className="ct-drag-handle" title="Drag to reorder">
                  <GripVertical size={14} />
                </span>

                {/* Start-from button */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-[#666] hover:text-[#f0f0f0]"
                  disabled={isPlaying}
                  onClick={() => startFrom(i)}
                  title="Start playback from here"
                >
                  <Play size={11} />
                </Button>

                <div className="ct-color-stripe" />

                <div className="ct-piece-info">
                  <div className="ct-piece-label">
                    {piece.label}
                    {gName && (
                      <span
                        className="ct-group-badge"
                        style={{ '--group-color': color } as React.CSSProperties}
                      >
                        {gName}
                      </span>
                    )}
                    {isActive && currentRepetition !== null && !expandView && (
                      <span className="ct-rep-badge">Rep {currentRepetition + 1}/{piece.repeats}</span>
                    )}
                  </div>
                  <div className="ct-piece-meta">
                    <span>{sigLabel(piece.timeSignature)}</span>
                    <span className="ct-piece-sep">·</span>
                    <span>{subLabel(piece.subdivision)}</span>
                    <span className="ct-piece-sep">·</span>
                    <span>{piece.bpm} BPM</span>
                    <span className="ct-piece-sep">·</span>
                    <span>×{piece.repeats}</span>
                  </div>
                </div>

                <div className="ct-piece-actions">
                  <Button
                    size="icon" variant="ghost"
                    className="h-6 w-6 text-[#666] hover:text-[#f0f0f0]"
                    onClick={() => isEditing ? setEditingId(null) : startEdit(piece)}
                    title="Edit"
                  >
                    <Pencil size={12} />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-6 w-6 text-[#666] hover:text-rose-400"
                    onClick={() => removePiece(piece.id)}
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>

              {/* Inline edit form */}
              {isEditing && (
                <PieceForm
                  d={editDraft}
                  setD={setEditDraft}
                  onSubmit={() => saveEdit(piece.id)}
                  submitLabel="Save"
                />
              )}

            </div>
          );
        })}
      </div>

      {/* Add Piece panel */}
      <div className="ct-add-panel">
        <h2>Add Segment</h2>
        <PieceForm
          d={draft}
          setD={setDraft}
          onSubmit={addPiece}
          submitLabel="+ Add"
        />
      </div>

      {/* Selection action bar */}
      {selectedIds.size > 0 && (
        <div className="ct-selection-bar">
          <span>{selectedIds.size} selected</span>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => openGroupDialog()}>
            <Plus size={12} /> Create Group
          </Button>
          {groups.map(g => (
            <Button key={g.id} size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
              setPieces(p => p.map(x => selectedIds.has(x.id) ? { ...x, groupId: g.id, color: g.color } : x));
              setSelectedIds(new Set());
            }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: g.color }} />
              {g.name}
            </Button>
          ))}
          {groups.length > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={unassignGroup}>
              Remove Group
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
            Deselect <ChevronDown size={12} />
          </Button>
        </div>
      )}

      {/* Load from Cloud dialog */}
      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Load Saved Track</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            {loadingTracks && <p className="text-xs text-[#888]">Loading…</p>}
            {!loadingTracks && savedTracks.length === 0 && (
              <p className="text-xs text-[#888]">No saved tracks found.</p>
            )}
            {savedTracks.map(track => (
              <div key={track.id} className="flex items-center gap-2">
                <button
                  type="button"
                  className="flex-1 text-left text-sm px-3 py-2 rounded-md bg-[#1a1a1a] hover:bg-[#252525] text-[#f0f0f0] transition-colors"
                  onClick={() => loadTrack(track)}
                >
                  {track.name}
                  <span className="text-[#666] text-xs ml-2">{track.pieces.length} segments</span>
                </button>
                <Button
                  size="icon" variant="ghost"
                  className="h-7 w-7 text-[#666] hover:text-rose-400 shrink-0"
                  onClick={() => void deleteTrack(track.id)}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save to Cloud dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Click Track</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ct-save-name">Track name</Label>
              <Input
                id="ct-save-name"
                value={saveName}
                placeholder="My Click Track"
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void saveCloud(); }}
                autoFocus
              />
            </div>
            <Button onClick={saveCloud} disabled={saveStatus === 'saving'} className="w-full">
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'ok' ? 'Saved!' : saveStatus === 'error' ? 'Error — try again' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Group dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{groupTarget ? 'Edit Group' : 'Create Group'}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-1.5">
              <Label>Group name</Label>
              <Input
                value={groupDraft.name}
                placeholder="e.g. Verse"
                onChange={e => setGroupDraft(x => ({ ...x, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') saveGroup(); }}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Color</Label>
              <div className="ct-color-swatches">
                {PALETTE.map(p => (
                  <button
                    key={p.name}
                    type="button"
                    className={cn('ct-swatch', groupDraft.color === p.hex && 'selected')}
                    style={{ background: p.hex }}
                    onClick={() => setGroupDraft(x => ({ ...x, color: p.hex }))}
                    title={p.name}
                  />
                ))}
              </div>
            </div>
            <Button onClick={saveGroup} disabled={!groupDraft.name.trim()} className="w-full">
              {groupTarget ? 'Update Group' : 'Create & Assign'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
