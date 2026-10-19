/** Owner boundaries and retained identities specific to cut revisions. */
import type { BoundDecomposeRevision } from "./bind-revision.js";
import type { DecomposeCohortObservation } from "./check-names.js";
import { renderV3DecomposeArgv } from "../work-unit/decompose-command-renderer.js";
import type { StoreRecord } from "../store/read.js";
import type { DecomposeRefusal } from "./refusal.js";
import { readLifecycleMetaFields } from "../store/lifecycle-write.js";
import { parseLifecycleMetaContent } from "../store/lifecycle-meta-content.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";

/** Leave a started member's actual seeded-field moves to its owner or a revised decision. */
export function checkDecomposeRevisionSeedMove(primary: StoreRecord, content: string): DecomposeRefusal | undefined {
  if (primary.placement?.kind === "backlog" || primary.content === content) return undefined;
  const before = readLifecycleMetaFields(primary);
  if (before.status === "refused") return decomposeStoreRefusal(before.refusal);
  const after = parseLifecycleMetaContent(content);
  if (!after.success) return decomposeMapRuleRefusal("source-artifact", primary.reference.owner.name, after.error);
  const changes: { field: string; target: string }[] = [];
  if (JSON.stringify(before.result.dependsOn) !== JSON.stringify(after.data.dependsOn)) {
    changes.push({ field: "Depends On", target: JSON.stringify(after.data.dependsOn) });
  }
  if (before.result.cohort !== after.data.cohort) changes.push({ field: "Cohort", target: JSON.stringify(after.data.cohort ?? "[none]") });
  const first = changes[0];
  if (first === undefined) return undefined;
  const slug = primary.reference.owner.name;
  return { status: "refused", reason: "started-member-seed", class: "recoverable", locus: `${slug}.${first.field}`,
    message: `The revision would move ${slug}'s ${changes.map(change => `${change.field} to ${change.target}`).join(" and ")}.`,
    remedy: { text: `Have ${slug}'s owner set ${changes.map(change => `${change.field} to ${change.target}`).join(" and ")} through write-back, or drop the named field move from the revised map, then retry.` } };
}

/** Require original member names and reject keeping missing generations or reparenting cut-owned documents. */
export function checkDecomposeRevisionIdentities(input: BoundDecomposeRevision,
  ownedCohorts: readonly DecomposeCohortObservation[]): DecomposeRefusal | undefined {
  const kept = new Set(input.map.authoring.destinations.flatMap(destination => destination.kind === "new-member" ? [destination.slug] : []));
  for (const member of input.prior.members) {
    if (member.primary !== null && member.primary.reference.owner.name !== member.slug) {
      const argv = ["arc", "rename", member.primary.reference.owner.name, member.slug];
      return { status: "refused", reason: "member-renamed", class: "recoverable", locus: member.slug,
        remedy: { text: `Restore the member's map name with ${renderV3DecomposeArgv(argv)} before revising; rename it again after the cut lands.`, argv } };
    }
    if (member.primary === null && kept.has(member.slug)) return { status: "refused", reason: "member-gone", class: "recoverable", locus: member.slug,
      remedy: { text: `Remove the gone member ${JSON.stringify(member.slug)} from the revised map; an item that took its slug remains untouched. Then preview the revision again.` } };
  }
  return checkRevisionCohortParents(input, ownedCohorts);
}

function checkRevisionCohortParents(input: BoundDecomposeRevision,
  ownedCohorts: readonly DecomposeCohortObservation[]): DecomposeRefusal | undefined {
  const placement = input.map.authoring.placement;
  const path = placement.kind === "direct-member" ? undefined : placement.kind === "at-cap" ? placement.parent : placement.cohort;
  const paths = path?.split("/").map((_, index, parts) => parts.slice(0, index + 1).join("/")) ?? [];
  for (const cohort of ownedCohorts) {
    const moved = paths.find(path => path !== cohort.path && path.split("/").at(-1) === cohort.record.reference.owner.name);
    if (moved === undefined) continue;
    return { status: "refused", reason: "cohort-parent", class: "recoverable",
      locus: placement.kind === "at-cap" ? "authoring.placement.parent" : "authoring.placement.cohort",
      message: `The revision would keep cut-owned ${JSON.stringify(cohort.path)} under another Parent at ${JSON.stringify(moved)}.`,
      remedy: { text: "Choose another name in the map for the cohort under its new Parent, then retry; a revision cannot reparent the existing document." } };
  }
  return undefined;
}
