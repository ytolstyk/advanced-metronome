import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RigPageOk } from '../../../api/rigApi';
import { useRigDraft } from '../../../hooks/useRigDraft';
import { hasPendingCleanup } from '../../../rigData';
import type { MemberRig, RigDraft } from '../../../rigData';
import {
  addCable,
  addDiagram,
  addExampleDiagram,
  addGear,
  addNode,
  copyGearToMine,
  gearImpact,
  hasImpact,
  moveNode,
  portAt,
  removeCable,
  removeDiagram,
  removeGear,
  removeNode,
  renameDiagram,
  setCableLabel,
  updateGear,
} from '../../../rigEdit';
import type { EditResult, Impact, MoveDirection, PortRef } from '../../../rigEdit';
import { RIG_LIMITS } from '../../../rigTypes';
import type { RigDiagram, RigGear } from '../../../rigTypes';
import { describeCables, describePort } from '../../../rigView';
import { CARD_SURFACE, FIELD_LABEL_CLASS, SELECT_CLASS } from '../cardStyles';
import { ConfirmDialog } from '../ConfirmDialog';
import { InlineAlert } from '../InlineAlert';
import { TextPromptDialog } from '../TextPromptDialog';
import { CableSchedule } from './CableSchedule';
import { GearFormDialog } from './GearFormDialog';
import { GearPanel } from './GearPanel';
import { RigCanvas } from './RigCanvas';

interface RigWorkspaceProps {
  data: RigPageOk;
  own: MemberRig;
  refreshing: boolean;
  reload: () => Promise<void>;
}

interface DiagramEntry {
  key: string;
  owner: string;
  ownerName: string;
  diagram: RigDiagram;
  gear: readonly RigGear[];
  mine: boolean;
}

type GearDialog = { gear: RigGear | null } | null;

const MOVES = [
  { dir: 'left', label: 'Move left', Icon: ArrowLeft },
  { dir: 'right', label: 'Move right', Icon: ArrowRight },
  { dir: 'up', label: 'Move up', Icon: ArrowUp },
  { dir: 'down', label: 'Move down', Icon: ArrowDown },
] as const satisfies readonly { dir: MoveDirection; label: string; Icon: unknown }[];

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function impactText(i: Impact): string {
  const parts = [i.nodes > 0 && plural(i.nodes, 'node'), i.cables > 0 && plural(i.cables, 'cable')].filter(Boolean);
  return `${parts.join(' and ')} in ${plural(i.diagrams, 'diagram')}`;
}

/** Everything on the gear and rig page once the data is loaded. */
export function RigWorkspace({ data, own, refreshing, reload }: RigWorkspaceProps) {
  const { view, members } = data;
  const sub = view.sub;
  const rig = useRigDraft({ bandId: view.band.id, own, reload });
  const { draft } = rig;

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [connectOrigin, setConnectOrigin] = useState<PortRef | null>(null);
  const [connectNote, setConnectNote] = useState<string | null>(null);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [gearDialog, setGearDialog] = useState<GearDialog>(null);
  const [pendingGear, setPendingGear] = useState<{ gear: RigGear; impact: Impact } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ gear: RigGear; impact: Impact } | null>(null);
  const [newDiagramOpen, setNewDiagramOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteDiagramOpen, setDeleteDiagramOpen] = useState(false);
  const [addGearId, setAddGearId] = useState('');

  const entries = useMemo<DiagramEntry[]>(() => {
    const all = members.flatMap((m) => {
      const mine = m.owner === sub;
      const source = mine ? draft : m.draft;
      return source.diagrams.map((diagram) => ({
        key: `${m.owner}:${diagram.id}`,
        owner: m.owner,
        ownerName: mine ? 'You' : m.name,
        diagram,
        gear: source.gear,
        mine,
      }));
    });
    return [...all.filter((e) => e.mine), ...all.filter((e) => !e.mine)];
  }, [members, sub, draft]);
  const current = entries.find((e) => e.key === selectedKey) ?? entries[0] ?? null;
  const editing = current?.mine === true && rig.blockedReason === null;
  // The origin of a half-made connection only counts while its port still exists (the gear may have
  // been edited or the draft replaced since).
  const connectFrom = connectOrigin && current && portAt(current.diagram, current.gear, connectOrigin) ? connectOrigin : null;

  const clearTransient = () => {
    setConnectOrigin(null);
    setConnectNote(null);
    setSelectedNodeId(null);
    setSelectedCableId(null);
    setEditNote(null);
  };
  const cancelConnect = () => {
    setConnectOrigin(null);
    setConnectNote(null);
  };
  const pickNode = (id: string | null) => {
    setSelectedNodeId(id);
    setSelectedCableId(null);
  };
  const pickCable = (id: string | null) => {
    setSelectedCableId(id);
    setSelectedNodeId(null);
  };
  const selectDiagram = (key: string) => {
    clearTransient();
    setSelectedKey(key);
  };

  useEffect(() => {
    if (!connectFrom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelConnect();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [connectFrom]);

  // Edits that can be refused (caps, rules): apply the change only when it is allowed, else say why.
  const tryEdit = (change: (d: RigDraft) => EditResult<RigDraft>, onDone?: () => void): boolean => {
    const result = change(draft);
    if (!result.ok) {
      setEditNote(result.reason);
      return false;
    }
    setEditNote(null);
    rig.edit(() => result.value);
    onDone?.();
    return true;
  };

  const onPortClick = (ref: PortRef) => {
    if (!editing || !current) return;
    const diagram = current.diagram;
    if (!connectFrom) {
      const cable = diagram.cables.find((c) => (c.from.n === ref.n && c.from.p === ref.p) || (c.to.n === ref.n && c.to.p === ref.p));
      if (cable) {
        pickCable(cable.id);
        setEditNote('That port already has a cable. It is selected below, where you can remove it.');
        return;
      }
      setEditNote(null);
      setConnectNote(null);
      setConnectOrigin(ref);
      return;
    }
    if (connectFrom.n === ref.n && connectFrom.p === ref.p) return cancelConnect();
    const result = addCable(draft, diagram.id, connectFrom, ref);
    if (!result.ok) {
      setConnectNote(result.reason);
      return;
    }
    rig.edit(() => result.value);
    cancelConnect();
  };

  const originText = (() => {
    if (!connectFrom || !current) return '';
    const node = current.diagram.nodes.find((n) => n.id === connectFrom.n);
    const gear = node && current.gear.find((g) => g.id === node.gearId);
    const port = gear?.ports.find((p) => p.id === connectFrom.p);
    return gear && port ? `${gear.name}: ${describePort(port)}` : '';
  })();

  const selectedNode = current?.diagram.nodes.find((n) => n.id === selectedNodeId) ?? null;
  const cableInfos = current ? describeCables(current.diagram, current.gear) : [];
  const otherMembers = members.filter((m) => m.owner !== sub);
  const unreadableOthers = otherMembers.filter((m) => m.state === 'unreadable' || m.state === 'failed' || m.state === 'newer');

  const addExample = () => {
    const result = addExampleDiagram(draft);
    if (!result.ok) return setEditNote(result.reason);
    rig.edit(() => result.value.draft);
    clearTransient();
    setSelectedKey(`${sub}:${result.value.diagram.id}`);
  };

  const onGearSaved = (gear: RigGear) => {
    if (gearDialog?.gear) {
      const impact = gearImpact(draft, gear.id, gear);
      if (hasImpact(impact)) return setPendingGear({ gear, impact });
      rig.edit((d) => updateGear(d, gear));
      return;
    }
    tryEdit((d) => addGear(d, gear));
  };

  const move = (dir: MoveDirection) => {
    if (!current || !selectedNodeId) return;
    rig.edit((d) => moveNode(d, current.diagram.id, selectedNodeId, dir));
  };

  return (
    <>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Gear &amp; rigs</h1>
          <p className="break-words text-sm text-muted-foreground">{view.band.name}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rig.dirty && <span className="rounded-md border border-amber-900/50 px-2 py-1 text-xs text-amber-300">Unsaved changes</span>}
          <Button className="min-h-11" onClick={() => void rig.save()} disabled={!rig.canSave}>
            {rig.saving ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="outline" className="min-h-11 min-w-11" onClick={() => void reload()} disabled={refreshing || rig.saving} aria-label="Refresh">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </header>

      <p className="mb-3 text-sm text-muted-foreground">
        Anyone with an account who has this band’s link, including a shared set list link, can see the band’s gear and rigs.
      </p>

      <div className="mb-3 grid gap-2">
        {view.incomplete && <InlineAlert tone="warning">Some members may be missing from this list.</InlineAlert>}
        {rig.blockedReason && <InlineAlert tone="warning">{rig.blockedReason}</InlineAlert>}
        {rig.willReplaceUnreadable && <InlineAlert tone="warning">Your saved gear and rigs couldn’t be read. Saving replaces them.</InlineAlert>}
        {hasPendingCleanup(own) && <PendingCleanup own={own} />}
        {unreadableOthers.length > 0 && (
          <InlineAlert tone="warning">Couldn’t read the gear and rigs of {unreadableOthers.map((m) => m.name).join(', ')}.</InlineAlert>
        )}
        {rig.conflict && (
          <div role="alert" className="grid gap-2 rounded-md border border-amber-900/50 bg-amber-950/20 p-3 text-sm text-amber-300">
            <p>Your gear and rigs changed somewhere else since you opened this page.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="min-h-11" onClick={() => void rig.discard()} disabled={rig.saving}>
                Reload and discard my edits
              </Button>
              <Button variant="destructive" className="min-h-11" onClick={() => void rig.overwrite()} disabled={rig.saving}>
                Overwrite with my edits
              </Button>
            </div>
          </div>
        )}
        {rig.error && <InlineAlert tone="error">{rig.error}</InlineAlert>}
        {editNote && <InlineAlert tone="warning">{editNote}</InlineAlert>}
      </div>

      <section aria-labelledby="diagrams-heading">
        <h2 id="diagrams-heading" className="mb-2 text-lg font-semibold text-foreground">Rig diagrams</h2>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          {entries.length > 0 && (
            <label className={FIELD_LABEL_CLASS}>
              Diagram
              <select className={SELECT_CLASS} value={current?.key ?? ''} onChange={(e) => selectDiagram(e.target.value)}>
                {entries.map((e) => (
                  <option key={e.key} value={e.key}>{e.diagram.name} ({e.ownerName})</option>
                ))}
              </select>
            </label>
          )}
          {rig.blockedReason === null && (
            <>
              <Button variant="outline" className="min-h-11" onClick={() => setNewDiagramOpen(true)} disabled={draft.diagrams.length >= RIG_LIMITS.diagramsMax}>
                New diagram
              </Button>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={draft.diagrams.length >= RIG_LIMITS.diagramsMax}
                onClick={addExample}
              >
                Add the Jam Station example
              </Button>
            </>
          )}
          {editing && (
            <>
              <Button variant="outline" className="min-h-11" onClick={() => setRenameOpen(true)}>Rename</Button>
              <Button variant="outline" className="min-h-11" onClick={() => setDeleteDiagramOpen(true)}>Delete diagram</Button>
            </>
          )}
        </div>

        {current === null ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No rig diagrams yet. Create one, or add the Jam Station example to see how a rig is drawn.
          </p>
        ) : (
          <>
            {!current.mine && <p className="mb-2 text-sm text-muted-foreground">{current.ownerName}’s diagram. Only they can change it.</p>}
            <RigCanvas
              diagram={current.diagram}
              gear={current.gear}
              editable={editing}
              selectedNodeId={selectedNodeId}
              onSelectNode={pickNode}
              selectedCableId={selectedCableId}
              onSelectCable={pickCable}
              connectFrom={connectFrom}
              onPortClick={onPortClick}
            />

            {editing && (
              <div className="mt-3 grid gap-3">
                {connectFrom ? (
                  <div role="status" className={cn('flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-sm', CARD_SURFACE)}>
                    <span>
                      Connecting from <strong>{originText}</strong>. Pick a highlighted port to finish.
                      {connectNote && <span className="block text-amber-300">{connectNote}</span>}
                    </span>
                    <Button variant="outline" className="min-h-11" onClick={cancelConnect}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    To connect two pieces of gear, select a free port, then the port it plugs into. Select a card or a cable number to change it.
                  </p>
                )}

                {selectedNode && (
                  <div role="group" aria-label="Selected gear" className={cn('flex flex-wrap items-center gap-2 rounded-lg p-3', CARD_SURFACE)}>
                    <span className="mr-2 text-sm font-medium text-foreground">
                      {current.gear.find((g) => g.id === selectedNode.gearId)?.name ?? 'Gear'}
                    </span>
                    {MOVES.map(({ dir, label, Icon }) => (
                      <Button key={dir} variant="outline" className="min-h-11 min-w-11" aria-label={label} onClick={() => move(dir)}>
                        <Icon size={16} />
                      </Button>
                    ))}
                    <Button
                      variant="destructive"
                      className="min-h-11"
                      onClick={() => {
                        rig.edit((d) => removeNode(d, current.diagram.id, selectedNode.id));
                        setSelectedNodeId(null);
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" /> Remove from diagram
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-2">
                  <label className={FIELD_LABEL_CLASS}>
                    Add gear to this diagram
                    <select className={SELECT_CLASS} value={addGearId} onChange={(e) => setAddGearId(e.target.value)} disabled={draft.gear.length === 0}>
                      <option value="">{draft.gear.length === 0 ? 'Add gear below first' : 'Choose gear…'}</option>
                      {draft.gear.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </label>
                  <Button
                    className="min-h-11"
                    disabled={!addGearId}
                    onClick={() => tryEdit((d) => addNode(d, current.diagram.id, addGearId, 0), () => setAddGearId(''))}
                  >
                    Add to diagram
                  </Button>
                </div>
              </div>
            )}

            <CableSchedule
              cables={cableInfos}
              editable={editing}
              selectedCableId={selectedCableId}
              onSelect={pickCable}
              onRemove={(id) => {
                rig.edit((d) => removeCable(d, current.diagram.id, id));
                setSelectedCableId(null);
              }}
              onLabel={(id, label) => rig.edit((d) => setCableLabel(d, current.diagram.id, id, label))}
            />
          </>
        )}
      </section>

      <GearPanel
        mine={draft.gear}
        others={otherMembers.map((m) => ({ owner: m.owner, name: m.name, gear: m.draft.gear }))}
        editable={rig.blockedReason === null}
        onAdd={() => setGearDialog({ gear: null })}
        onEdit={(gear) => setGearDialog({ gear })}
        onDelete={(gear) => setPendingDelete({ gear, impact: gearImpact(draft, gear.id, null) })}
        onCopy={(gear, fromName) => tryEdit((d) => draftOf(copyGearToMine(d, gear, fromName)))}
      />

      {gearDialog && (
        <GearFormDialog
          key={gearDialog.gear?.id ?? 'new'}
          open
          onOpenChange={(open) => !open && setGearDialog(null)}
          initial={gearDialog.gear}
          onSave={onGearSaved}
        />
      )}

      {pendingGear && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingGear(null)}
          title="This change removes cables"
          description={`Saving these ports removes ${impactText(pendingGear.impact)}, because the ports they use no longer fit.`}
          confirmLabel="Save gear and remove cables"
          destructive
          onConfirm={async () => rig.edit((d) => updateGear(d, pendingGear.gear))}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={`Delete ${pendingDelete.gear.name}?`}
          description={
            hasImpact(pendingDelete.impact)
              ? `It is used in your diagrams. Deleting it also removes ${impactText(pendingDelete.impact)}.`
              : 'It isn’t used in any of your diagrams.'
          }
          confirmLabel="Delete gear"
          destructive
          onConfirm={async () => rig.edit((d) => removeGear(d, pendingDelete.gear.id))}
        />
      )}

      {newDiagramOpen && (
        <TextPromptDialog
          open
          onOpenChange={(open) => !open && setNewDiagramOpen(false)}
          title="New diagram"
          label="Name"
          initialValue=""
          maxLength={RIG_LIMITS.nameMax}
          submitLabel="Create"
          onSubmit={async (name) => {
            const result = addDiagram(draft, name);
            if (!result.ok) throw new Error(result.reason);
            rig.edit(() => result.value.draft);
            clearTransient();
            setSelectedKey(`${sub}:${result.value.diagram.id}`);
          }}
        />
      )}

      {renameOpen && current?.mine && (
        <TextPromptDialog
          open
          onOpenChange={(open) => !open && setRenameOpen(false)}
          title="Rename diagram"
          label="Name"
          initialValue={current.diagram.name}
          maxLength={RIG_LIMITS.nameMax}
          submitLabel="Rename"
          onSubmit={async (name) => {
            const result = renameDiagram(draft, current.diagram.id, name);
            if (!result.ok) throw new Error(result.reason);
            rig.edit(() => result.value);
          }}
        />
      )}

      {deleteDiagramOpen && current?.mine && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDeleteDiagramOpen(false)}
          title={`Delete “${current.diagram.name}”?`}
          description="The diagram goes away when you save. Your gear stays."
          confirmLabel="Delete diagram"
          destructive
          onConfirm={async () => {
            rig.edit((d) => removeDiagram(d, current.diagram.id));
            clearTransient();
            setSelectedKey(null);
          }}
        />
      )}
    </>
  );
}

function PendingCleanup({ own }: { own: MemberRig }) {
  const parts = [
    own.hiddenGear > 0 && `${plural(own.hiddenGear, 'gear item')} couldn’t be read`,
    own.unreadableDiagrams > 0 && `${plural(own.unreadableDiagrams, 'diagram')} couldn’t be read`,
    own.brokenLinks > 0 && `${plural(own.brokenLinks, 'link')} point at gear or ports that changed`,
  ].filter(Boolean);
  return <InlineAlert tone="warning">{parts.join('; ')}. They are hidden, and saving removes them.</InlineAlert>;
}

/** Some edits return the new item as well as the draft; the page only needs the draft. */
const draftOf = (r: EditResult<{ draft: RigDraft }>): EditResult<RigDraft> => (r.ok ? { ok: true, value: r.value.draft } : r);
