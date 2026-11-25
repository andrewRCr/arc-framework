/** Minimal queue-rank reassignment preserves the earliest longest current subsequence. */
import { placeRankedStub, type RankedStub } from "../store/concurrency/rank.js";
/** Queue references qualify their list-local ID by the inbox. */
export interface QueueReference { inbox: "personal" | "project"; id: string }
/** Rank-bearing queue references in current order. */
export interface RankedQueueReference extends QueueReference { rank: string }
/** Plan only ranks that must change for the requested whole-queue order.
 * @param current - Existing members ordered by rank and identity.
 * @param desired - Requested members in execution order.
 * @returns Assignment for each added/moved member and any tied successors.
 */
export function queueRankAssignments(current: readonly RankedQueueReference[], desired: readonly QueueReference[]): RankedStub[] {
  const kept = longestCurrentSubsequence(current, desired);
  const wanted = new Set(desired.map((member) => member.id));
  let working = current.filter((member) => wanted.has(member.id)).map((member) => ({ uid: member.id, rank: member.rank }));
  const changed = new Map<string, RankedStub>();
  for (const [index, member] of desired.entries()) {
    if (kept.has(qualified(member))) continue;
    const remaining = working.filter((stub) => stub.uid !== member.id);
    const previous = desired[index - 1]?.id;
    const position = previous === undefined ? 0 : remaining.findIndex((stub) => stub.uid === previous) + 1;
    const assignments = placeRankedStub(working, position, member.id);
    for (const stub of assignments) changed.set(stub.uid, stub);
    const byId = new Map(working.map((stub) => [stub.uid, stub]));
    for (const stub of assignments) byId.set(stub.uid, stub);
    working = [...byId.values()].sort(rankOrder);
  }
  return [...changed.values()];
}

function longestCurrentSubsequence(current: readonly QueueReference[], desired: readonly QueueReference[]): Set<string> {
  const positions = new Map(desired.map((member, index) => [qualified(member), index]));
  const candidates = current.flatMap((member) => {
    const position = positions.get(qualified(member));
    return position === undefined ? [] : [{ member: qualified(member), position }];
  });
  const lengths = candidates.map(() => 1);
  for (let index = candidates.length - 1; index >= 0; index--) {
    for (let next = index + 1; next < candidates.length; next++) {
      if ((candidates[next]?.position ?? -1) > (candidates[index]?.position ?? -1)) lengths[index] = Math.max(lengths[index] ?? 1, 1 + (lengths[next] ?? 0));
    }
  }
  let remaining = Math.max(0, ...lengths), last = -1;
  const kept = new Set<string>();
  for (const [index, candidate] of candidates.entries()) {
    if (candidate.position <= last || (lengths[index] ?? 0) < remaining || remaining === 0) continue;
    kept.add(candidate.member); last = candidate.position; remaining--;
  }
  return kept;
}

function qualified(member: QueueReference): string { return `${member.inbox}:${member.id}`; }
function rankOrder(a: RankedStub, b: RankedStub): number {
  return a.rank === b.rank ? a.uid < b.uid ? -1 : a.uid === b.uid ? 0 : 1 : a.rank < b.rank ? -1 : 1;
}
