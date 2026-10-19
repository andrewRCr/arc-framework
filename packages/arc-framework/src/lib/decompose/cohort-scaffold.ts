/** Cohort document creation and validated placement for an additive cut. */
import type { DecomposeContext } from "./context.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeNames } from "./check-names.js";
import type { DecomposeTopology } from "./topology.js";
import type { DecomposeResult } from "./refusal.js";
import type { RecordReference } from "../store/identity.js";
import type { Mutation } from "../store/write.js";
import { OwnerIdentitySchema, recordReferences } from "../store/identity.js";
import { writeCohortDocument } from "../store/kinds/cohort/index.js";
import { planDecomposeTopology } from "./topology.js";
import { checkDecomposePurposes } from "./check-purposes.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";

/** New documents and the common topology their members consume. */
export interface DecomposeCohortScaffolds {
  topology: DecomposeTopology;
  cohorts: readonly { path: string; reference: RecordReference }[];
  writes: readonly Mutation[];
}

/** Validate placement and prepare only the cohort documents absent from the acquired store. */
export function planDecomposeCohorts(ctx: DecomposeContext, map: CutMap,
  names: DecomposeNames): DecomposeResult<DecomposeCohortScaffolds> {
  const topology = planDecomposeTopology(map, names);
  if (topology.status === "refused") return topology;
  const purposes = checkDecomposePurposes(map, names);
  if (purposes !== undefined) return purposes;
  const placement = map.authoring.placement;
  const cohorts: DecomposeCohortScaffolds["cohorts"][number][] = [], writes: Mutation[] = [];
  for (const created of names.newCohorts) {
    const purpose = placement.kind === "cohort" || placement.kind === "subcohort"
      ? created.path === placement.cohort ? placement.purpose : placement.kind === "subcohort" ? placement.parentPurpose : undefined
      : undefined;
    const content = writeCohortDocument(ctx.cohortTemplate, created.path, purpose);
    if (content === null) return decomposeMapRuleRefusal("source-artifact", "cohort-template",
      "Restore the cohort template's canonical heading, Parent, and Purpose placeholders, then retry.");
    const owner = OwnerIdentitySchema.parse({ type: "cohort", name: created.path.split("/").at(-1) });
    const reference = recordReferences["cohort/document"](owner);
    cohorts.push({ path: created.path, reference });
    writes.push({ action: "put", reference, expected: null, content });
  }
  return { status: "ok", result: { topology: topology.result, cohorts, writes } };
}
