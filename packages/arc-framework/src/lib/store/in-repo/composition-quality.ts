/** Preserve native lifecycle acquisition quality at the Store selection boundary. */
import { ArcError } from "../../kernel/errors.js";
import type { ComposedLifecycleIndexResult, ComposedLifecycleSlugQuality } from "../../work-unit/composed-lifecycle-index.js";
import type { InFlightWarningCode } from "../../git/in-flight-derivation.js";
import { OwnerIdentitySchema, recordReferences } from "../identity.js";
import type { ListingDiagnostic } from "../read.js";
import { refuse } from "./refusals.js";

// Branch-minting quality also includes advisory branch and location metadata.
// Store acquisition depends on readable parsed records and a stable input view.
const ACQUISITION_WARNING_CODES: ReadonlySet<InFlightWarningCode> = new Set([
  "meta-enumeration-failed", "meta-read-failed", "meta-malformed", "state-unrecognized", "input-snapshot-disagreement",
]);

/** One unsafe named selection, or uncertainty about the complete namespace. */
export interface ComposedMetaFailure { slug?: string; diagnostic: ListingDiagnostic }

/** Project native quality channels without treating omitted entries as absence.
 * @param composition - Completed local oracle composition, including its quality facts.
 * @param authoritative - Flat-active owners whose existing copy supplies independent authority.
 * @returns Original warning conditions and uncovered indeterminate/global selection facts.
 */
export function composedMetaFailures(composition: ComposedLifecycleIndexResult,
  authoritative: ReadonlySet<string> = new Set()): ComposedMetaFailure[] {
  const failures: ComposedMetaFailure[] = [];
  for (const warning of composition.qualityFacts.warnings) {
    if (!ACQUISITION_WARNING_CODES.has(warning.code)
      || (warning.workUnit !== undefined && authoritative.has(warning.workUnit))) continue;
    const key = warning.workUnit === undefined ? `branch:${warning.branch ?? "in-flight"}` : `work-item:${warning.workUnit}`;
    failures.push({ ...(warning.workUnit === undefined ? {} : { slug: warning.workUnit }), diagnostic: {
      kind: warning.code === "meta-malformed" || warning.code === "state-unrecognized" ? "malformed" : "unreadable",
      key, condition: warning.rendered, remedy: { text: `Restore readable valid lifecycle metadata for ${key}, then retry the operation.` },
    } });
  }
  for (const [slug, quality] of composition.qualityFacts.bySlug) {
    if (!hasUnreportedSlugFailure(slug, quality, authoritative, failures)) continue;
    failures.push({ slug, diagnostic: { kind: "unreadable", key: `work-item:${slug}`,
      condition: `Lifecycle selection for ${slug} is incomplete.`,
      remedy: { text: `Restore readable lifecycle metadata for ${slug}, then retry the operation.` } } });
  }
  if (composition.qualityFacts.resultMarks.includes("indeterminate") && !failures.some((failure) => failure.slug === undefined)) {
    failures.push({ diagnostic: { kind: "unreadable", key: "in-flight",
      condition: "The in-flight lifecycle inventory is indeterminate.",
      remedy: { text: "Restore complete local branch and lifecycle metadata, then retry the operation." } } });
  }
  return mergeDuplicateFailures(failures);
}
function mergeDuplicateFailures(failures: readonly ComposedMetaFailure[]): ComposedMetaFailure[] {
  const byKey = new Map<string, ComposedMetaFailure>();
  for (const failure of failures) {
    const previous = byKey.get(failure.diagnostic.key);
    if (previous === undefined) { byKey.set(failure.diagnostic.key, failure); continue; }
    previous.diagnostic = { ...previous.diagnostic,
      kind: previous.diagnostic.kind === "unreadable" ? "unreadable" : failure.diagnostic.kind,
      condition: [...new Set([previous.diagnostic.condition, failure.diagnostic.condition])].join("; "),
      remedy: { text: [...new Set([previous.diagnostic.remedy.text, failure.diagnostic.remedy.text])].join("; ") } };
  }
  return [...byKey.values()];
}
function hasUnreportedSlugFailure(slug: string, quality: ComposedLifecycleSlugQuality,
  authoritative: ReadonlySet<string>, failures: readonly ComposedMetaFailure[]): boolean {
  return !authoritative.has(slug) && !failures.some((failure) => failure.slug === slug)
    && quality.marks.includes("indeterminate");
}

/** Refuse malformed selected metadata and preserve failed acquisition as an environment error.
 * @param composition - Oracle evidence used for selecting the requested owner.
 * @param slug - Owner whose absence or creation must not be inferred from incomplete evidence.
 * @returns Nothing when the owner selection is determinate.
 */
export function requireComposedMetaSelection(composition: ComposedLifecycleIndexResult, slug: string): void {
  const failures = composedMetaFailures(composition).filter((failure) => failure.slug === undefined || failure.slug === slug);
  if (failures.length === 0) return;
  const diagnostics = failures.map((failure) => failure.diagnostic);
  const condition = diagnostics.map((item) => item.condition).join("; ");
  const remedy = { text: diagnostics.map((item) => item.remedy.text).join("; ") };
  if (failures.every((failure) => failure.slug === slug && failure.diagnostic.kind === "malformed")) {
    return refuse({ code: "record-malformed", class: "recoverable", rule: "composition",
      reference: recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })), condition, remedy });
  }
  throw new ArcError(`${condition} ${remedy.text}`, "store.lifecycle-incomplete", { cause: diagnostics });
}
