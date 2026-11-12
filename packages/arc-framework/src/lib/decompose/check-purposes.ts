/** Purpose admission for cohort documents created by a decomposition. */
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeNames } from "./check-names.js";
import type { DecomposeRefusal } from "./refusal.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";

/** Require a Purpose for new or cut-owned documents, keeping reused documents under write-back. */
export function checkDecomposePurposes(map: CutMap, names: DecomposeNames, ownedCohorts: ReadonlySet<string> = new Set()): DecomposeRefusal | undefined {
  const placement = map.authoring.placement;
  if (placement.kind === "direct-member" || placement.kind === "at-cap") return undefined;
  const own = checkPurpose(names, placement.cohort, "purpose", placement.purpose, ownedCohorts);
  if (own !== undefined || placement.kind !== "subcohort") return own;
  return checkPurpose(names, placement.cohort.split("/")[0] ?? placement.cohort, "parentPurpose", placement.parentPurpose, ownedCohorts);
}

function checkPurpose(names: DecomposeNames, path: string, field: string, value: string | undefined, ownedCohorts: ReadonlySet<string>): DecomposeRefusal | undefined {
  const created = ownedCohorts.has(path) || names.newCohorts.some(cohort => cohort.path === path);
  if (created && (value === undefined || value.trim() === "" || value.trim() === "—"))
    return decomposeMapRuleRefusal("purpose", `authoring.placement.${field}`,
      `Add a substantive ${field} for the new cohort document ${JSON.stringify(path)} in the map, then retry.`);
  if (!created && value !== undefined) return decomposeMapRuleRefusal("purpose", `authoring.placement.${field}`,
    `Remove ${field} for the reused cohort document ${JSON.stringify(path)} from the map; edit its Purpose through write-back, then retry.`);
  return undefined;
}
