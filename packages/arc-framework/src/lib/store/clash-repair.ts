/** Pure recovery instructions for ranked lifecycle lookup ties. */
import type { RecordReference } from "./identity.js";
import type { Remedy, StoreRefusal } from "./refusal.js";
import { workBranchName } from "./lifecycle-branch.js";
/** Ranking facts carried by a lifecycle ambiguity. */
export type ClashTie = NonNullable<Extract<StoreRefusal, { code: "ambiguous-match" }>["tie"]>;
/** Build recovery instructions for owners sharing a branch link. */
export function branchLinkRepair(candidates: readonly RecordReference[], tie: ClashTie, branch: string): Remedy {
  if (tie.liveness === "completed") return clashRepair(candidates, tie);
  const moves = candidates.map(reference => {
    const uid = holderUid(reference) ?? "<uid>";
    if (reference.kind === "work-item/record") return `\`arc errand close ${uid}\``;
    const currentBranch = workBranchName(branch);
    const parts = currentBranch.split("/");
    if (parts.length !== 2 || parts[0] === "" || parts[1] === "") {
      return `No rename-based repair is available for \`${reference.owner.name}\` (UID ${uid}) on \`${currentBranch}\``;
    }
    if (parts[1] === reference.owner.name) return `\`arc rename ${uid} <new-slug>\``;
    return `\`arc rename ${uid} ${reference.owner.name}\` only if \`${parts[1]}\` is a former slug of \`${reference.owner.name}\`; otherwise rename cannot move this branch link`;
  });
  return { text: `On the machine holding each holder's checkout: ${moves.join("; ")}.`,
    argv: ["arc", "status", "--json"] };
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
