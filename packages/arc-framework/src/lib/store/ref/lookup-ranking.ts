/** Select a completed work-unit winner without changing typed name binding. */
import type { RefBackendContext } from "./context.js";
import type { RefLookupTree } from "./lookup.js";
import { lookupPrimary } from "./lookup-primary.js";
import { compareCompletedPlacements } from "../placement.js";

/** One primary-bearing owner in a captured lookup tier. */
export type LookupTree = [string, RefLookupTree];

/** Completed work units outrank Errands; live and cohort ties retain every candidate. */
export function completedLookupWinner(context: Pick<RefBackendContext, "registry">, trees: LookupTree[]): LookupTree[] {
  if (trees.length < 2 || trees.some(([ref, tree]) => !tree.liveRef || lookupPrimary(context, ref, tree)?.kind === "cohort/document")) return trees;
  const workUnits = trees.flatMap((entry) => {
    const [ref, tree] = entry, placement = tree.archived?.placement;
    return lookupPrimary(context, ref, tree)?.kind === "work-item/meta" && placement?.kind === "completed"
      ? [{ entry, placement }] : [];
  });
  return workUnits.length === 0 ? trees : workUnits.sort((left, right) => compareCompletedPlacements(left.placement, right.placement))
    .slice(-1).map(({ entry }) => entry);
}
