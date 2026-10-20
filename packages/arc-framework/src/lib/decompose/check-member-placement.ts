/** Member existence, current names, and placement decisions retained during authoring. */
import type { DecomposeTerminalRecords } from "./acquire-terminal.js";
import type { DecomposeRefusal } from "./refusal.js";
import type { CutMap } from "./cut-map-schema.js";
import type { ParsedMetaRecord } from "../active/meta-schema.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeReviseArgv } from "./command-argv.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import { checkDecomposeRecordConflicts } from "./source-conflicts.js";
import { planDecomposeTopology } from "./topology.js";
type PlacementInput = Pick<DecomposeTerminalRecords, "map" | "acquired" | "members" | "cohorts">;

/** Validate authenticated members before checking their seeded dependency providers. */
export function checkDecomposeMemberPlacement(input: PlacementInput): DecomposeRefusal | undefined {
  const fields: { slug: string; fields: ParsedMetaRecord }[] = [];
  for (const member of input.members) {
    if (member.primary === null) {
      const argv = decomposeReviseArgv(input.acquired.primary.reference.owner.name);
      return { status: "refused", reason: "member-gone", class: "recoverable", locus: member.slug,
        remedy: { text: `Drop the gone member ${JSON.stringify(member.slug)} with ${renderV3DecomposeArgv(argv)}; an item that took its slug is left untouched.`, argv: [...argv] } };
    }
    if (member.primary.reference.owner.name !== member.slug) {
      const argv = ["arc", "rename", member.primary.reference.owner.name, member.slug];
      return { status: "refused", reason: "member-renamed", class: "recoverable", locus: member.slug,
        remedy: { text: `Restore the member's map name with ${renderV3DecomposeArgv(argv)} before finishing; rename it again after the cut lands.`, argv } };
    }
    const conflicts = checkDecomposeRecordConflicts([member.primary], "member decision");
    if (conflicts !== undefined) return conflicts;
    const parsed = readLifecycleMetaFields(member.primary);
    if (parsed.status === "refused") return decomposeStoreRefusal(parsed.refusal);
    fields.push({ slug: member.slug, fields: parsed.result });
  }
  const topology = planDecomposeTopology(input.map, { cohorts: input.cohorts, newCohorts: [] });
  if (topology.status === "refused") return topology;
  const changed = fields.find(member => member.fields.cohort !== topology.result.memberCohort);
  if (changed === undefined) return undefined;
  const revision = canReviseCohort(input, fields.map(member => member.fields.cohort))
    ? `, or ${renderV3DecomposeArgv(decomposeReviseArgv(input.acquired.primary.reference.owner.name))} to choose the common placement` : "";
  return { status: "refused", reason: "seed-divergence", class: "recoverable", locus: `${changed.slug}.Cohort`,
    remedy: { text: `Restore Cohort to ${JSON.stringify(topology.result.memberCohort ?? "[none]")} on ${changed.slug} through write-back${revision}, then finish the cut.` } };
}

function canReviseCohort(input: PlacementInput, cohorts: readonly (string | null)[]): boolean {
  const cohort = cohorts[0];
  if (cohort === undefined || !cohorts.every(value => value === cohort)) return false;
  const placement: CutMap["authoring"]["placement"] = cohort === null ? { kind: "direct-member" }
    : cohort.includes("/") ? { kind: "subcohort", cohort } : { kind: "cohort", cohort };
  const destinations = input.map.authoring.destinations.flatMap<CutMap["authoring"]["destinations"][number]>(destination => {
    if (destination.kind !== "cohort-coordination") return [destination];
    return cohort === null ? [] : [{ ...destination, cohort }];
  });
  const candidate = { ...input.map, authoring: { ...input.map.authoring, placement, destinations } };
  return planDecomposeTopology(candidate, { cohorts: input.cohorts, newCohorts: [] }).status === "ok";
}
