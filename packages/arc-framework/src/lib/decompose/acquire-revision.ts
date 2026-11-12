/** One fresh source derivation and member-authentication pass shared by revision modes. */
import type { DecomposeContext } from "./context.js";
import type { DecomposeResult } from "./refusal.js";
import type { DecomposeStoredCut } from "./stored-cut.js";
import type { DecomposeTerminalMember } from "./acquire-terminal.js";
import type { DecomposeOriginRecords } from "./acquire-origin.js";
import type { CutMapMachine } from "./cut-map-machine.js";
import { acquireDecomposeStoredCut } from "./stored-cut.js";
import { acquireDecomposeMembers } from "./member-identity.js";
import { acquireDecomposeOrigin } from "./acquire-origin.js";
import { deriveDecomposeMachine } from "./machine-facts.js";
import { decomposeReadCache } from "./read-cache.js";

/** Stored authoring and fresh facts, with exactly one authenticated member selection. */
export interface DecomposeRevisionInput extends DecomposeStoredCut {
  members: readonly DecomposeTerminalMember[];
  acquired: DecomposeOriginRecords;
  machine: CutMapMachine;
}

/** Re-derive the origin without start-only guards, excluding only genuine current-cut member generations. */
export async function acquireDecomposeRevision(ctx: DecomposeContext, origin: string): Promise<DecomposeResult<DecomposeRevisionInput>> {
  const store = decomposeReadCache(ctx.executor.store);
  const stored = await acquireDecomposeStoredCut(store, origin);
  if (stored.status === "refused") return stored;
  const members = await acquireDecomposeMembers(store, stored.result.storedCut, stored.result.storedMap);
  if (members.status === "refused") return members;
  const excluded = new Set(members.result.flatMap(member => {
    const owner = member.primary?.reference.owner;
    return owner?.type === "work-item" && owner.uid !== undefined ? [owner.uid] : [];
  }));
  const acquired = await acquireDecomposeOrigin({ ...ctx, executor: { ...ctx.executor, store } }, origin, excluded);
  if (acquired.status === "refused") return acquired;
  const machine = deriveDecomposeMachine(acquired.result);
  return machine.status === "refused" ? machine : { status: "ok", result: { ...stored.result,
    members: members.result, acquired: acquired.result, machine: machine.result } };
}
