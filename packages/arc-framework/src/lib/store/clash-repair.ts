/** Pure recovery instructions for ranked lifecycle lookup ties. */
import type { RecordReference } from "./identity.js";
import type { Remedy, StoreRefusal } from "./refusal.js";
import type { StoreRecord } from "./read.js";
import type { LookupInput } from "./lookup.js";
import { selectWorkBranchLink, workBranchName } from "./lifecycle-branch.js";
/** Ranking facts carried by a lifecycle ambiguity. */
export type ClashTie = NonNullable<Extract<StoreRefusal, { code: "ambiguous-match" }>["tie"]>;
/** Captured primary facts used to qualify branch-link recovery without new reads. */
export type BranchLinkRepairCandidate = Pick<StoreRecord, "reference" | "placement" | "links"> & { aliases: readonly string[] };
/** Build recovery instructions from captured holders and the exact branch lookup. */
export function branchLinkRepair(candidates: readonly BranchLinkRepairCandidate[], tie: ClashTie,
  input: Extract<LookupInput, { kind: "ref" }>): Remedy {
  if (tie.liveness === "completed") return clashRepair(candidates.map(({ reference }) => reference), tie);
  const moves = candidates.map(candidate => candidate.reference.kind === "work-item/record"
    ? `\`arc errand close ${holderUid(candidate.reference) ?? "<uid>"}\`` : workUnitBranchMove(candidate, input));
  return { text: `On the machine holding each holder's checkout: ${moves.join("; ")}.`,
    argv: ["arc", "status", "--json"] };
}
function workUnitBranchMove(candidate: BranchLinkRepairCandidate, input: Extract<LookupInput, { kind: "ref" }>): string {
  const { reference } = candidate, branch = workBranchName(input.ref), uid = holderUid(reference) ?? "<uid>";
  const unavailable = `No direct rename repair for \`${reference.owner.name}\` (UID ${uid}) on \`${branch}\``;
  if (reference.kind !== "work-item/meta" || candidate.placement?.kind !== "active" || !/^[^/]+\/[^/]+$/u.test(branch)) return unavailable;
  const selected = selectWorkBranchLink(candidate, { repository: input.repository });
  if (selected.kind !== "linked") return unavailable;
  const linked = candidate.links?.branches?.some(link => link.repository === input.repository && workBranchName(link.ref) === branch);
  if (!linked) return unavailable;
  const suffix = branch.slice(branch.lastIndexOf("/") + 1);
  if (suffix === reference.owner.name) {
    if (workBranchName(selected.link.ref) !== branch) return `${unavailable}; ordinary rename selects \`${workBranchName(selected.link.ref)}\` instead`;
    return `\`arc rename ${uid} <new-slug>\` only with \`${branch}\` checked out in that holder's UID-bound checkout`;
  }
  if (!candidate.aliases.includes(suffix)) return unavailable;
  return `\`arc rename ${uid} ${reference.owner.name}\` only after a prior work-unit rename and with \`${branch}\` checked out in that holder's UID-bound checkout`;
}
/** Build a human repair and one executable next observation or action. */
export function clashRepair(candidates: readonly RecordReference[], tie: ClashTie): Remedy {
  const observe = ["arc", "status", "--json"];
  if (tie.liveness === "completed") return {
    text: `No lifecycle repair is available for completed holders: ${candidates.map(reference =>
      `${reference.owner.name} (UID ${holderUid(reference) ?? "unavailable"})`).join("; ")}.`,
    argv: observe,
  };
  if (tie.name === "former") return {
    text: `Name the intended holder by its current name: ${candidates.map(reference => `\`${reference.owner.name}\``).join(", ")}.`,
    argv: observe,
  };
  const cohort = candidates.find(reference => reference.kind === "cohort/document");
  if (cohort !== undefined) return {
    text: `Rename the cohort holder with \`arc rename ${holderUid(cohort) ?? "<uid>"} <new-slug>\`.`, argv: observe,
  };
  const errand = candidates.find(reference => reference.kind === "work-item/record");
  if (errand !== undefined) {
    const uid = holderUid(errand);
    return { text: `Close the Errand holder with \`arc errand close ${uid ?? "<uid>"}\`.`,
      argv: uid === undefined ? observe : ["arc", "errand", "close", uid] };
  }
  return { text: `Rename either work-unit holder: ${candidates.map(reference =>
    `\`arc rename ${holderUid(reference) ?? "<uid>"} <new-slug>\``).join(" or ")}.`, argv: observe };
}
function holderUid(reference: RecordReference): string | undefined {
  return reference.owner.type === "person" ? undefined : reference.owner.uid;
}
