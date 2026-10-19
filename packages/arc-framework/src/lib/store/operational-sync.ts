/** Narrow synchronization seam until the reference backend supplies these operations on Store. */
import { z } from "zod";
import { RemedySchema } from "./refusal.js";

/** Pull records operational reachability independently of publication. */
export const PullResultSchema = z.union([
  z.strictObject({ status: z.enum(["no-remote", "no-identity", "pulled", "noop"]) }),
  z.strictObject({ status: z.literal("unreachable"), condition: z.string().min(1), remedy: RemedySchema }),
  z.strictObject({ status: z.literal("designation-needed"), remote: z.string().min(1),
    choices: z.array(z.string().min(1)).min(1), remedy: RemedySchema.extend({ argv: z.array(z.string()).min(1) }) }),
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
