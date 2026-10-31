/** Pure recovery instructions for ranked lifecycle lookup ties. */
import type { RecordReference } from "./identity.js";
import type { Remedy, StoreRefusal } from "./refusal.js";
/** Ranking facts carried by a lifecycle ambiguity. */
export type ClashTie = NonNullable<Extract<StoreRefusal, { code: "ambiguous-match" }>["tie"]>;
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
