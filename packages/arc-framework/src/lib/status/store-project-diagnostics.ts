/** Render completeness and read failures consistently across store-backed status acquisition. */
import type { ListingDiagnostic } from "../store/read.js";
import type { Remedy } from "../store/refusal.js";
import type { ProjectReadinessWarning } from "./project-view.js";

/** Preserve the condition and repair route of a failed store observation. */
export function storeReadFailureWarning(failure: { condition: string; remedy: Remedy }): ProjectReadinessWarning {
  return { code: "store-read-failed", rendered: `${failure.condition} ${failure.remedy.text}` };
}

/** Retain listing diagnostics and disclose that their records are omitted from the view. */
export function listingDiagnosticWarnings(diagnostics: readonly ListingDiagnostic[]): ProjectReadinessWarning[] {
  return diagnostics.map(diagnostic => ({ code: "listing-diagnostic",
    rendered: `${diagnostic.condition} The view omits this record. ${diagnostic.remedy.text}` }));
}
