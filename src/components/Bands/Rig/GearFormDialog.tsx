import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { sanitizeText } from '../../../bandUtils';
import { newRigId } from '../../../rigData';
import { RIG_PRESETS } from '../../../rigPresets';
import { CONNECTORS, GEAR_KINDS, PORT_DIRS, RIG_LIMITS } from '../../../rigTypes';
import type { Connector, GearKind, PortDir, RigGear } from '../../../rigTypes';
import { CONNECTOR_LABEL } from '../../../rigUtils';
import { FIELD_LABEL_CLASS, SELECT_CLASS } from '../cardStyles';
import { InlineAlert } from '../InlineAlert';

const DIR_LABEL: Record<PortDir, string> = { in: 'Input', out: 'Output', io: 'USB / MIDI' };

interface PortDraft {
  /** Kept for existing ports so cables stay attached when the gear is edited; absent for new ones. */
  id?: string;
  label: string;
  dir: PortDir;
  connector: Connector;
  note: string;
}

interface GearFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The gear being edited, or null to add new gear. Mount per target so the form resets. */
  initial: RigGear | null;
  onSave: (gear: RigGear) => void;
}

const blankPort = (): PortDraft => ({ label: '', dir: 'in', connector: 'ts', note: '' });

const portsOf = (g: RigGear): PortDraft[] =>
  g.ports.map((p) => ({ id: p.id, label: p.label, dir: p.dir, connector: p.connector, note: p.note ?? '' }));

/** Add or edit a piece of gear: name, kind, specs and its ports. Presets are starting points. */
export function GearFormDialog({ open, onOpenChange, initial, onSave }: GearFormDialogProps) {
  const uid = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<GearKind>(initial?.kind ?? 'other');
  const [specs, setSpecs] = useState(initial?.specs ?? '');
  const [ports, setPorts] = useState<PortDraft[]>(initial ? portsOf(initial) : [blankPort()]);
  const [error, setError] = useState<string | null>(null);

  const patchPort = (i: number, patch: Partial<PortDraft>) =>
    setPorts((list) => list.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const applyPreset = (key: string) => {
    const preset = RIG_PRESETS.find((p) => p.key === key);
    if (!preset) {
      // "Blank" starts over, so a preset chosen earlier doesn't linger.
      setName('');
      setKind('other');
      setSpecs('');
      setPorts([blankPort()]);
      return;
    }
    setName(preset.gear.name);
    setKind(preset.gear.kind);
    setSpecs(preset.gear.specs ?? '');
    setPorts(portsOf({ ...preset.gear, id: 'preset' }).map((p) => ({ ...p, id: undefined })));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeText(name, RIG_LIMITS.nameMax);
    if (!cleanName) return setError('Give the gear a name');
    if (ports.length === 0) return setError('Add at least one port');
    const built = ports.map((p) => ({
      id: p.id ?? newRigId(),
      label: sanitizeText(p.label, RIG_LIMITS.portLabelMax),
      dir: p.dir,
      connector: p.connector,
      note: sanitizeText(p.note, RIG_LIMITS.noteMax),
    }));
    if (built.some((p) => !p.label)) return setError('Every port needs a name');
    const cleanSpecs = sanitizeText(specs, RIG_LIMITS.specsMax);
    const gear: RigGear = {
      id: initial?.id ?? newRigId(),
      name: cleanName,
      kind,
      ports: built.map(({ note, ...p }) => (note ? { ...p, note } : p)),
    };
    if (cleanSpecs) gear.specs = cleanSpecs;
    if (initial?.copiedFrom) gear.copiedFrom = initial.copiedFrom;
    onSave(gear);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{initial ? 'Edit gear' : 'Add gear'}</DialogTitle>
            <DialogDescription>
              Name each port the way it is labelled on the unit. Presets are starting points: check them against your gear.
            </DialogDescription>
          </DialogHeader>

          {!initial && (
            <label className={FIELD_LABEL_CLASS}>
              Start from a preset
              <select className={SELECT_CLASS} defaultValue="" onChange={(e) => applyPreset(e.target.value)}>
                <option value="">Blank</option>
                {RIG_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>{p.gear.name}</option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={FIELD_LABEL_CLASS}>
              Name
              <Input className="min-h-11" value={name} maxLength={RIG_LIMITS.nameMax} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className={FIELD_LABEL_CLASS}>
              Kind
              <select className={SELECT_CLASS} value={kind} onChange={(e) => setKind(e.target.value as GearKind)}>
                {GEAR_KINDS.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </label>
          </div>
          <label className={FIELD_LABEL_CLASS}>
            Specs (optional)
            <Input className="min-h-11" value={specs} maxLength={RIG_LIMITS.specsMax} onChange={(e) => setSpecs(e.target.value)} />
          </label>

          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium text-foreground">Ports</legend>
            {ports.map((p, i) => (
              <div key={p.id ?? `new-${i}`} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_auto_auto]">
                <label className={FIELD_LABEL_CLASS}>
                  Port name
                  <Input
                    className="min-h-11"
                    value={p.label}
                    maxLength={RIG_LIMITS.portLabelMax}
                    id={`${uid}-label-${i}`}
                    onChange={(e) => patchPort(i, { label: e.target.value })}
                  />
                </label>
                <label className={FIELD_LABEL_CLASS}>
                  Direction
                  <select className={SELECT_CLASS} value={p.dir} onChange={(e) => patchPort(i, { dir: e.target.value as PortDir })}>
                    {PORT_DIRS.map((d) => (
                      <option key={d} value={d}>{DIR_LABEL[d]}</option>
                    ))}
                  </select>
                </label>
                <label className={FIELD_LABEL_CLASS}>
                  Connector
                  <select className={SELECT_CLASS} value={p.connector} onChange={(e) => patchPort(i, { connector: e.target.value as Connector })}>
                    {CONNECTORS.map((c) => (
                      <option key={c} value={c}>{CONNECTOR_LABEL[c]}</option>
                    ))}
                  </select>
                </label>
                <label className={cn(FIELD_LABEL_CLASS, 'sm:col-span-2')}>
                  Note (optional)
                  <Input className="min-h-11" value={p.note} maxLength={RIG_LIMITS.noteMax} onChange={(e) => patchPort(i, { note: e.target.value })} />
                </label>
                <div className="flex items-end justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11"
                    aria-label={`Remove port ${i + 1}`}
                    onClick={() => setPorts((list) => list.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="min-h-11 justify-self-start"
              disabled={ports.length >= RIG_LIMITS.portsPerGearMax}
              onClick={() => setPorts((list) => [...list, blankPort()])}
            >
              <Plus size={16} aria-hidden="true" /> Add port
            </Button>
          </fieldset>

          {error && <InlineAlert tone="error">{error}</InlineAlert>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">{initial ? 'Save gear' : 'Add gear'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
