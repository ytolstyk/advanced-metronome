import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AuthGate } from '../components/AuthGate/AuthGate';
import { AvailabilityAlerts } from '../components/Bands/AvailabilityAlerts';
import { AvailabilityMine } from '../components/Bands/AvailabilityMine';
import { AvailabilityNotice } from '../components/Bands/AvailabilityNotice';
import { AvailabilityOverlap } from '../components/Bands/AvailabilityOverlap';
import { AvailabilityWeekNav } from '../components/Bands/AvailabilityWeekNav';
import { BandsShell } from '../components/Bands/BandsShell';
import { LoaderBoundary } from '../components/Bands/LoaderBoundary';
import { StatusNotice } from '../components/Bands/StatusNotice';
import { loadAvailabilityPage, type AvailabilityPageOk, type AvailabilityPageResult } from '../api/availabilityApi';
import { bandPath } from '../bandRoutes';
import { BAND_GONE_TITLES, type AvailabilityRead } from '../bandTypes';
import { getViewerTimeZone, practiceSlots, type LocalDay } from '../availabilityCalendar';
import { SLOTS_PER_HOUR, slotOf } from '../availabilitySlots';
import { NO_ROW_READ, hasCurrentRow, parseGroup, subsOfKind } from '../availabilityUtils';
import { useAvailabilityEditor } from '../hooks/useAvailabilityEditor';
import { useAvailabilityPrefs, useDisclosureNotice } from '../hooks/useAvailabilityPrefs';
import { useAvailabilityModel, useHorizonDays, useWeekFocus } from '../hooks/useAvailabilityView';
import { useClock } from '../hooks/useClock';
import { useDaysPerPage } from '../hooks/useDaysPerPage';
import { useLoader } from '../hooks/useLoader';

/** Cloud reads are cheap but not free: refetch on focus at most this often. */
const AVAILABILITY_FOCUS_REFETCH_MS = 3 * 60_000;

export function AvailabilityPage() {
  const { bandId = '' } = useParams<{ bandId: string }>();
  return (
    <BandsShell label="Availability" back={{ to: bandPath(bandId), text: '← Back to band' }}>
      <AuthGate message="Sign in to share your availability">
        <AvailabilityContent key={bandId} bandId={bandId} />
      </AuthGate>
    </BandsShell>
  );
}

function AvailabilityContent({ bandId }: { bandId: string }) {
  // A member whose row fails to load on a refresh keeps the row from the last good load.
  const previous = useRef<ReadonlyMap<string, AvailabilityRead> | undefined>(undefined);
  const { state, refreshing, refreshError, reload } = useLoader(
    async () => {
      const result = await loadAvailabilityPage(bandId, previous.current);
      if (result.status === 'ok') previous.current = result.reads;
      return result;
    },
    { focusRefetchMs: AVAILABILITY_FOCUS_REFETCH_MS },
  );
  return (
    <LoaderBoundary
      state={state}
      refreshing={refreshing}
      refreshError={refreshError}
      reload={reload}
      loadingText="Loading availability…"
      errorPrefix="Couldn’t load availability"
    >
      {(result) => <AvailabilityResult bandId={bandId} result={result} refreshing={refreshing} reload={reload} />}
    </LoaderBoundary>
  );
}

function AvailabilityResult({
  bandId,
  result,
  refreshing,
  reload,
}: {
  bandId: string;
  result: AvailabilityPageResult;
  refreshing: boolean;
  reload: () => Promise<void>;
}) {
  const toBand = (
    <Link to={bandPath(bandId)} className="text-primary underline">
      Go to the band page
    </Link>
  );
  if (result.status === 'unavailable') {
    return (
      <StatusNotice title="Availability isn’t available yet">
        The app is still being updated. Please try again in a few minutes.
      </StatusNotice>
    );
  }
  if (result.status === 'not-found') {
    return <StatusNotice title={BAND_GONE_TITLES['not-found']}>This link may be wrong, or the band no longer exists.</StatusNotice>;
  }
  if (result.status === 'deleted' || result.status === 'removed') {
    return <StatusNotice title={BAND_GONE_TITLES[result.status]}>{toBand} to remove it from your list.</StatusNotice>;
  }
  if (!result.view.isMember) {
    return <StatusNotice title="Join this band first">{toBand} to join, then come back to share your availability.</StatusNotice>;
  }
  return <AvailabilityBody data={result} refreshing={refreshing} reload={reload} />;
}

type Mode = 'group' | 'mine';

/** Under a day's name in the group view: the most members free together that day. */
function groupDayNote(day: LocalDay, timeZone: string, nowSlot: number, countAt: (slot: number) => number, total: number): string {
  let peak = 0;
  for (const slot of practiceSlots(day, timeZone)) if (slot > nowSlot) peak = Math.max(peak, countAt(slot));
  return peak > 0 ? `peak ${peak}/${total}` : 'none';
}

/** Under a day's name in "My times": how many hours you have marked that day. */
function mineDayNote(day: LocalDay, timeZone: string, nowSlot: number, isFree: (slot: number) => boolean): string | null {
  const marked = practiceSlots(day, timeZone).filter((slot) => slot > nowSlot && isFree(slot)).length;
  return marked > 0 ? `${marked / SLOTS_PER_HOUR} h` : null;
}

function AvailabilityBody({ data, refreshing, reload }: { data: AvailabilityPageOk; refreshing: boolean; reload: () => Promise<void> }) {
  const { view, reads, fetchedAt } = data;
  const { sub } = view;
  const nowMs = useClock();
  const [timeZone] = useState(getViewerTimeZone);
  const days = useHorizonDays(nowMs, timeZone);
  const perPage = useDaysPerPage();
  const week = useWeekFocus(days, perPage);
  const lastDay = days[days.length - 1];
  const lastVisibleSlot = lastDay.slots[lastDay.slots.length - 1];

  const [prefs, setPrefs] = useAvailabilityPrefs();
  const notice = useDisclosureNotice(view.band.id, sub);

  const editor = useAvailabilityEditor({
    band: view.band,
    sub,
    ownRead: reads.get(sub) ?? NO_ROW_READ,
    fetchedAt,
    disclosureAccepted: notice.accepted,
    nowMs,
  });

  // Opens on the group view for someone who already has times, on their own times otherwise.
  const [mode, setMode] = useState<Mode>(() =>
    hasCurrentRow(parseGroup(reads, data.participants, view.band), sub, nowMs) ? 'group' : 'mine',
  );
  const mine = useMemo(
    () => (editor.blocked ? undefined : { sub, free: editor.free, lastSaved: editor.lastSaved }),
    [editor.blocked, sub, editor.free, editor.lastSaved],
  );
  const { resolution, overlap, windows } = useAvailabilityModel({
    data,
    nowMs,
    mine,
    wantGroup: mode === 'group',
    minSlots: prefs.minSlots,
    days,
    timeZone,
  });

  const nameOf = (who: string) => view.displayNames.get(who) ?? (who === view.band.owner ? 'Owner' : 'A member');
  const nowSlot = slotOf(nowMs);
  const total = resolution.participants.length;
  const note = (d: LocalDay) =>
    overlap ? groupDayNote(d, timeZone, nowSlot, overlap.countAt, total) : mineDayNote(d, timeZone, nowSlot, (slot) => editor.free.has(slot));

  return (
    <>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Availability</h1>
          <p className="break-words text-sm text-muted-foreground">{view.band.name}</p>
        </div>
        <Button variant="outline" className="min-h-11 min-w-11" onClick={() => void reload()} disabled={refreshing} aria-label="Refresh">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </Button>
      </header>

      <p className="mb-1 text-sm text-muted-foreground">Times are shown in {timeZone}.</p>
      <p className="mb-3 text-sm text-muted-foreground">
        Anyone with an account who has this band’s link, including a shared set list link, can see your times.
      </p>

      <AvailabilityAlerts
        rosterIncomplete={view.incomplete}
        excluded={resolution.excluded}
        unreadableNames={subsOfKind(resolution, 'unreadable').map(nameOf)}
        blocked={editor.blocked}
        willReplaceUnreadable={editor.willReplaceUnreadable}
        replacedUnreadable={editor.replacedUnreadable}
        onReload={() => void reload()}
      />
      {!notice.accepted && <AvailabilityNotice hasUnsavedEdits={editor.hasUnsavedEdits} onAccept={notice.accept} />}

      {/* Radix hands back a plain string; both items are modes, and an empty value (re-pressing the active one) is ignored. */}
      <ToggleGroup
        type="single"
        variant="outline"
        aria-label="View"
        className="mb-3 justify-start"
        value={mode}
        onValueChange={(v) => v && setMode(v as Mode)}
      >
        <ToggleGroupItem value="group" className="min-h-11 px-4">Group</ToggleGroupItem>
        <ToggleGroupItem value="mine" className="min-h-11 px-4">My times</ToggleGroupItem>
      </ToggleGroup>

      <AvailabilityWeekNav
        days={days}
        start={week.start}
        perPage={perPage}
        timeZone={timeZone}
        onEarlier={() => week.shiftPage(-1)}
        onLater={() => week.shiftPage(1)}
        onGoToDay={week.goToDay}
      />

      {mode === 'mine' || !overlap ? (
        <AvailabilityMine
          days={week.visibleDays}
          todayKey={days[0].key}
          dayNote={note}
          lastVisibleSlot={lastVisibleSlot}
          timeZone={timeZone}
          nowMs={nowMs}
          editor={editor}
          noticeAccepted={notice.accepted}
        />
      ) : (
        <AvailabilityOverlap
          days={week.visibleDays}
          todayKey={days[0].key}
          dayNote={note}
          resolution={resolution}
          overlap={overlap}
          windows={windows}
          minSlots={prefs.minSlots}
          onMinSlots={(minSlots) => setPrefs({ ...prefs, minSlots })}
          selectedSlot={week.selectedSlot}
          onSelectSlot={week.selectSlot}
          onShowWindow={week.showSlot}
          timeZone={timeZone}
          nowMs={nowMs}
          nameOf={nameOf}
        />
      )}
    </>
  );
}
