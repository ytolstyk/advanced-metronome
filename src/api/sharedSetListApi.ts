import { ANONYMOUS_SUB, BAND_LIMITS, PUBLIC_READ_PAGES, type SharedSetListResult } from '../bandTypes';
import { isCleanText, isSetListShared } from '../bandUtils';
import { assembleBandView, assembleSetListView } from '../bandViews';
import { fetchPublicSetListRows } from './bandReads';
import {
  bandsClient as client,
  getBand,
  getSetListRow,
  listRoster,
  resolveReader,
  throwOnError,
  toMember,
} from './bandsShared';

/**
 * Loads a shared set list for the public page, signed in or not. This is the ONE place that reads
 * the Bands tables as an anonymous visitor (the schema's `allow.guest()` rules). The `Band` row is
 * the root of trust: the list must be alive, one of its set lists and in its owner-written
 * `sharedSetListIds`, and everything fetched goes through the same validators as the members' page.
 * A visitor has no write path anywhere.
 *
 * Two round trips after the credentials: the set list row, then the band, roster and own membership
 * once the row names its band. The songs and votes (which only need the id from the URL) load
 * alongside both and are discarded unread when the list turns out not to be shared.
 *
 * Every reason a visitor can't see the list (missing, archived, deleted band, not shared, forged
 * rows) is one `unavailable` result, so the page never confirms that a private list exists.
 */
export async function loadSharedSetList(setListId: string): Promise<SharedSetListResult> {
  const { sub, authMode } = await resolveReader();

  // The songs/votes only need the id from the URL, so they start now and overlap everything else.
  const rowsPromise = fetchPublicSetListRows(setListId, authMode);
  rowsPromise.catch(() => undefined); // an early `unavailable` return must not leave an unhandled rejection

  const setListRow = await getSetListRow(setListId, authMode);
  if (!setListRow) return { status: 'unavailable' };

  const bandId = setListRow.bandId;
  const [band, roster, ownRes] = await Promise.all([
    getBand(bandId, authMode),
    listRoster(bandId, { authMode, maxPages: PUBLIC_READ_PAGES.roster }),
    // Signed-in readers only (the page links members to their band); guests have no member row.
    sub ? client.models.Member.get({ bandId, owner: sub }) : null,
  ]);
  if (!band || !isSetListShared(band, setListId) || !isCleanText(band.name, BAND_LIMITS.nameMax, true)) {
    return { status: 'unavailable' };
  }
  if (ownRes) throwOnError(ownRes, 'getMember');
  const rows = await rowsPromise;

  const view = assembleBandView({
    band,
    sub: sub ?? ANONYMOUS_SUB,
    rosterRows: roster.rows,
    rosterIncomplete: roster.incomplete,
    ownRow: ownRes?.data ? toMember(ownRes.data) : null,
    setListRows: [setListRow],
  });
  const list = assembleSetListView(view, setListId, rows);
  return list?.shared ? { status: 'ok', view, list } : { status: 'unavailable' };
}
