/** Render status warnings from the store's typed current-name clash facts. */
import type { LifecycleEntry } from "../store/lifecycle-index.js";
import type { StandingLifecycleClash } from "../store/lifecycle-standing.js";
import { sameReference } from "../store/identity.js";
import type { ProjectReadinessWarning } from "./project-view.js";

/** Preserve status's warning policy while the shared selection remains presentation-independent. */
export function renderLifecycleClashWarnings(clashes: readonly StandingLifecycleClash[],
  entries: readonly LifecycleEntry[]): ProjectReadinessWarning[] {
  return clashes.filter(clash => clash.kind === "current-name").map(clash => clashWarning(clash.slug,
    clash.holders.flatMap(reference => entries.find(entry => sameReference(entry.reference, reference)) ?? [])));
}

function clashWarning(name: string, holders: readonly LifecycleEntry[]): ProjectReadinessWarning {
  const descriptions = holders.map(entry => {
    const owner = entry.reference.owner;
    const uid = owner.type === "person" ? undefined : owner.uid;
    return `UID ${uid ?? "unavailable"}, owner ${entry.fields.owner ?? "unowned"}, location ${entry.location}`;
  });
  return { code: "slug-clash", workUnit: name,
    rendered: `Slug ${name} has multiple live holders (${descriptions.join("; ")}). The view omits them. Rename one holder to repair the clash.` };
}
