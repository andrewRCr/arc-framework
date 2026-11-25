/** Survivor homes are derived from complete receipt history and live destination admission. */
import { acceptsEntries } from "./admission.js";
import { resolveEntryList, type ResolvedEntryList } from "./lists.js";
import { readRoutingReceipts, latestReceiptFrom, listCoordinate, sameRoutingList } from "./receipts.js";
import type { InboxContext, InboxOutcome, InboxRow } from "./types.js";

/** Mark only rows whose latest move left this inbox for a home still accepting work.
 * @param rows - Current entries, including edits that survived an observed removal.
 * @param list - Inbox being listed.
 * @param context - Complete store reader.
 * @returns Derived rows or a receipt/home observation refusal.
 */
export async function markSurvivors(rows: InboxRow[], list: ResolvedEntryList, context: InboxContext): Promise<InboxOutcome<InboxRow[]>> {
  if (list.inbox === null || rows.length === 0) return { status: "ok", result: rows };
  const receipts = await readRoutingReceipts(context);
  if (receipts.status === "refused") return receipts;
  const coordinate = listCoordinate(list);
  const marked: InboxRow[] = [];
  for (const row of rows) {
    const receipt = latestReceiptFrom(receipts.result, row.id, coordinate);
    if (receipt === null || !sameRoutingList(receipt.source, coordinate) || sameRoutingList(receipt.destination, coordinate)) { marked.push(row); continue; }
    const home = await resolveEntryList(receipt.destination.list, context);
    if (home.status === "refused") {
      if (home.refusal.code === "destination-refused") { marked.push(row); continue; }
      return home;
    }
    marked.push(acceptsEntries(home.result).status === "refused" ? row : { ...row, survivor: { home: receipt.destination } });
  }
  return { status: "ok", result: marked };
}
