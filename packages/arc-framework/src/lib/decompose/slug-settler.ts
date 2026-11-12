/** Metadata writes for a before-state plan settling reused provider names. */
import type { DecomposeSlugSettlementPlan } from "./slug-settlement.js";
import type { DecomposeResult } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import type { Mutation } from "../store/write.js";
import { sameReference } from "../store/identity.js";
import { readLifecycleMetaFields, recordPut } from "../store/lifecycle-write.js";
import { writeMetaDependsOn } from "../store/kinds/meta/writers.js";
import { replaceDependencySlot } from "./dependency-slot.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** Collapse every settled slot on a stub into one expected-version metadata write. */
export function decomposeSlugSettlementWrites(plan: DecomposeSlugSettlementPlan): DecomposeResult<readonly Mutation[]> {
  const groups: { primary: StoreRecord; targets: readonly string[] }[] = [];
  for (const settlement of plan.settlements) {
    let group = groups.find(candidate => sameReference(candidate.primary.reference, settlement.primary.reference));
    if (group === undefined) {
      const fields = readLifecycleMetaFields(settlement.primary);
      if (fields.status === "refused") return decomposeStoreRefusal(fields.refusal);
      group = { primary: settlement.primary, targets: fields.result.dependsOn };
      groups.push(group);
    }
    group.targets = replaceDependencySlot(group.targets, new Set([settlement.edge]), settlement.disposition.kind === "drop"
      ? [] : settlement.disposition.replacementTargets);
  }
  return { status: "ok", result: groups.map(group => recordPut(group.primary,
    { content: writeMetaDependsOn(group.primary.content, group.targets) })) };
}
