/** Admit only explicitly versioned conflict removals on a lineage-ended history ref. */
import { sameReference } from "../identity.js";
import type { Mutation } from "../write.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { RefWriteTarget } from "./write-resolution.js";
import { retiredHistoryHome } from "./retired-history.js";

/** Resolve retired conflict coordinates without admitting the owner's other records. */
export async function resolveRetiredConflicts(context: RefBackendContext, writes: readonly Mutation[],
  tips: ReadonlyMap<string, string>): Promise<StoreResult<RefWriteTarget[]>> {
  const targets: RefWriteTarget[] = [];
  for (const reference of writes.flatMap((write) => [write.reference, ...write.resolves ?? []])) {
    if (!reference.kind.endsWith("/conflict-record") || targets.some((target) => sameReference(target.reference, reference))) continue;
    const retired = await retiredHistoryHome(context, reference, tips);
    if (retired.status === "refused") return retired;
    if (!retired.result) continue;
    const explicit = writes.some((write) => sameReference(write.reference, reference) && write.action === "remove");
    const otherMutation = writes.some((write) => sameReference(write.reference, reference) && write.action !== "remove");
    if (!explicit || otherMutation) return { status: "refused", refusal: {
      code: "not-found", class: "recoverable", reference,
      condition: "A retired conflict requires its own explicit removal with a nonnull expected version in this batch.",
      remedy: { text: "Inspect the exact conflict through history, then remove it with its current expected version; keep the owner retired." },
    } };
    targets.push({ reference, home: retired.result });
  }
  return { status: "ok", result: targets };
}

/** Re-resolve lifecycle and retained metadata when the validated capture changes before locking. */
export function retainedBasisChanged(targets: readonly RefWriteTarget[], before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>): boolean {
  const refs = targets.length ? ["refs/arc/project/registry", ...targets.flatMap(({ home }) => [home.ref, home.ref.replace("refs/arc/history/", "refs/arc/")])] : [];
  return refs.some((ref) => before.get(ref) !== after.get(ref));
}
