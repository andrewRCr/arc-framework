/** Purpose admission for cohort documents created by a decomposition. */
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeNames } from "./check-names.js";
import type { DecomposeRefusal } from "./refusal.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";

/** Require a Purpose exactly for each newly created cohort document. */
export function checkDecomposePurposes(map: CutMap, names: DecomposeNames): DecomposeRefusal | undefined {
  const placement = map.authoring.placement;
  if (placement.kind === "direct-member" || placement.kind === "at-cap") return undefined;
  const own = checkPurpose(names, placement.cohort, "purpose", placement.purpose);
  if (own !== undefined || placement.kind !== "subcohort") return own;
  return checkPurpose(names, placement.cohort.split("/")[0] ?? placement.cohort, "parentPurpose", placement.parentPurpose);
}

function checkPurpose(names: DecomposeNames, path: string, field: string, value: string | undefined): DecomposeRefusal | undefined {
  const created = names.newCohorts.some(cohort => cohort.path === path);
  if (created && (value === undefined || value.trim() === "" || value.trim() === "—"))
    return decomposeMapRuleRefusal("purpose", `authoring.placement.${field}`,
      `Add a substantive ${field} for the new cohort document ${JSON.stringify(path)} in the map, then retry.`);
  if (!created && value !== undefined) return decomposeMapRuleRefusal("purpose", `authoring.placement.${field}`,
    `Remove ${field} for the reused cohort document ${JSON.stringify(path)} from the map; edit its Purpose through write-back, then retry.`);
  return undefined;
}
