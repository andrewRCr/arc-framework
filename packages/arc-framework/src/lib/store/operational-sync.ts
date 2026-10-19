/** Invocation-bound synchronization and orientation over the selected operational store. */
import { z } from "zod";
import { RemedySchema } from "./refusal.js";
import { PullNoticeSchema, type PullNotice, PullResultSchema as StorePullResultSchema } from "./sync.js";
import { pullSelectedStore, maintainSelectedStore } from "./operational-sync-bindings.js";
import type { Store } from "./contract.js";

const notices = { notices: z.array(PullNoticeSchema).optional() };
const partial = { partial: StorePullResultSchema.optional() };

/** Pull records operational reachability independently of publication. */
export const PullResultSchema = z.union([
  z.strictObject({ status: z.enum(["no-remote", "pulled", "noop"]), ...notices }),
  z.strictObject({ status: z.literal("no-identity"), remedy: RemedySchema.optional(), ...notices }),
  z.strictObject({ status: z.enum(["unreachable", "incomplete"]), condition: z.string().min(1), remedy: RemedySchema, ...partial, ...notices }),
  z.strictObject({ status: z.literal("designation-needed"), remote: z.string().min(1),
    choices: z.array(z.string().min(1)).min(1), remedy: RemedySchema, ...notices }),
]);
/** A pull outcome, including a remote whose state role needs an explicit decision. */
export type PullResult = z.infer<typeof PullResultSchema>;
/** Ref growth measured without a network operation. */
export interface RefMeasurement { ref: string; commits: number; diskBytes: number }
/** Unsupported measurements remain explicit rather than fabricated zeroes. */
export interface MaintainResult { measurements: RefMeasurement[] | null }
/** Synchronization operations bound to one selected store. */
export interface StoreSyncPort {
  pull(historyRefs?: readonly string[]): Promise<PullResult>;
  maintain(): Promise<MaintainResult>;
  historyRefs(refusal: unknown): readonly string[];
}
/** Bind available operations; unbound operations have no effect.
 * @param operations - Backend implementation, when present.
 * @returns Invocation-scoped synchronization port.
 */
export function createStoreSyncPort(operations: Partial<StoreSyncPort> = {}): StoreSyncPort {
  return {
    pull: operations.pull ?? (() => Promise.resolve({ status: "no-remote" })),
    maintain: operations.maintain ?? (() => Promise.resolve({ measurements: null })),
    historyRefs: operations.historyRefs ?? (operations.pull === undefined ? () => [] : historyRefs),
  };
}
function historyRefs(refusal: unknown): readonly string[] {
  if (typeof refusal !== "object" || refusal === null || !("code" in refusal)
    || refusal.code !== "state-unresolvable" || !("historyRefs" in refusal)
    || !Array.isArray(refusal.historyRefs) || !refusal.historyRefs.every((ref) => typeof ref === "string")) return [];
  return [...refusal.historyRefs];
}

/** Bind synchronization operations to the invocation's selected operational store. */
export function bindStoreSyncPort(store: Store): StoreSyncPort {
  return createStoreSyncPort({
    pull: refs => pullSelectedStore(store, refs),
    maintain: () => maintainSelectedStore(store),
  });
}

/** Retain notices from every partial remote outcome, coalescing the same explicitly surfaced notice. */
export function pullResultNotices(result: PullResult): PullNotice[] {
  const partial = "partial" in result ? result.partial : undefined;
  const notices = [...(result.notices ?? []), ...(partial?.pulls.flatMap(pull => pull.notices) ?? [])];
  return [...new Map(notices.map(notice => [JSON.stringify(notice), notice])).values()];
}
