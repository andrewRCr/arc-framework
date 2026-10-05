/** Fractional ranks and atomic placement assignments for lists with concurrent ties. */
import { generateRankBetween } from "./rank-arithmetic.js";
export { generateRankBetween } from "./rank-arithmetic.js";

/** One persisted stub's ordering pair. */
export interface RankedStub { readonly uid: string; readonly rank: string }

/** Assign ranks for a move, including the tied successors that must move in the same batch.
 * @param list - Existing stubs in ascending rank and UID order.
 * @param position - Insertion index after removing the moved stub from the list.
 * @param movedUid - Identity of the moved or newly inserted stub.
 * @returns The moved stub's rank and any tied successors requiring new ranks.
 */
export function placeRankedStub(list: readonly RankedStub[], position: number, movedUid: string): RankedStub[] {
  validateList(list);
  const remaining = list.filter((stub) => stub.uid !== movedUid);
  if (!Number.isInteger(position) || position < 0 || position > remaining.length || movedUid.length === 0) {
    throw new Error("Invalid rank placement");
  }
  const lower = remaining[position - 1]?.rank ?? null;
  const upper = remaining[position]?.rank ?? null;
  if (lower === null || lower !== upper) return [{ uid: movedUid, rank: generateRankBetween(lower, upper) }];
  let end = position;
  while (remaining[end]?.rank === lower) end++;
  const bound = remaining[end]?.rank ?? null;
  const uids = [movedUid, ...remaining.slice(position, end).map((stub) => stub.uid)];
  let prior = lower;
  return uids.map((uid) => {
    const rank = generateRankBetween(prior, bound);
    prior = rank;
    return { uid, rank };
  });
}


function validateList(list: readonly RankedStub[]): void {
  const seen = new Set<string>();
  for (const [index, stub] of list.entries()) {
    generateRankBetween(stub.rank, null);
    if (stub.uid.length === 0 || seen.has(stub.uid)) throw new Error("Duplicate or empty stub UID");
    seen.add(stub.uid);
    const previous = list[index - 1];
    if (previous !== undefined && (previous.rank > stub.rank
      || (previous.rank === stub.rank && previous.uid >= stub.uid))) throw new Error("Stub neighbours are out of order");
  }
}
