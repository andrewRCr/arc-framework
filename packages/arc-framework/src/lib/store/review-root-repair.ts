/** Explicit inventory and atomic choice of a competing approved-response root. */
import type { Store } from "./contract.js";
import { canonicalize } from "../kernel/index.js";
import { RecordVersionSchema, recordReferences } from "./identity.js";
import type { RecordObservation } from "./write.js";
import { ReviewRootRepairRequestSchema, ReviewRootRepairBasisSchema, type ReviewRootRepairBasis,
  type ReviewRootRepairRequest, type ReviewRootRepairResult } from "./review-root-repair-schema.js";
import type { StoreRefusal } from "./refusal.js";
import { StoreRefusalError } from "./refusal-error.js";
import { readReviewRootRepairView } from "./review-root-repair-view.js";
import { reviewRootSelectionRefusal, reviewRootSelectionPreviewRemedy } from "./kinds/review/evidence-root-selection/remedy.js";
import { ReviewEvidenceRootSelectionSchema } from "./kinds/review/evidence-root-selection/schema.js";
import { reviewEvidenceRootSelectionKey } from "./kinds/review/evidence-root-selection/key.js";

/** Execute an explicit root-repair request against the caller's authoritative ref store. */
export async function runReviewRootRepair(input: { store: Store; request: unknown; now(): string }): Promise<ReviewRootRepairResult> {
  const parsed = ReviewRootRepairRequestSchema.safeParse(input.request);
  if (!parsed.success) return { status: "refused", refusal: rootRepairRequestRefusal(parsed.error.message, input.request) };
  const request = parsed.data;
  try {
    const view = await readReviewRootRepairView(input.store, request);
    const context = { schemaVersion: 1 as const, workItem: request.workItem, producerId: request.producerId,
      outcome: { reference: view.outcome.reference, version: view.outcome.version,
        outcomeKey: view.outcomeKey, resultDigest: view.resultDigest },
      branches: view.branches, eligibleChoices: view.eligibleChoices,
      selector: { observation: view.basis?.selector ?? { reference: view.reference, expected: null }, value: view.selection,
        alternatives: view.alternatives.map(entry => ({ reference: entry.record.reference, version: entry.record.version, value: entry.value })) } };
    if (view.roots.length > 1 && view.eligibleChoices.length === 0) return { status: "ok" as const, result: { ...context, state: "policy-blocked" as const,
      retryable: false as const, condition: "This repair cannot reconcile performed or settled work on multiple branches. Preserve all evidence and obtain a separately designed reconciliation." } };
    if (request.operation === "apply" && (view.basis === null || normalizedBasis(request.basis) !== normalizedBasis(view.basis))) {
      return { status: "refused" as const, refusal: { code: "version-conflict" as const, class: "recoverable" as const,
        records: [view.reference], condition: "The named approval, outcome, selector, or conflict inventory changed since preview.",
        remedy: { text: reviewRootSelectionPreviewRemedy(request.workItem, request.producerId) } } };
    }
    if (view.roots.length < 2) return { status: "ok" as const, result: { ...context, state: "not-needed" as const } };
    if (view.basis === null) throw reviewRootSelectionRefusal(request.workItem, request.producerId, "outcome", "Restore the immutable result before previewing a root choice.");
    if (request.operation === "apply") return await applySelection(input, request, view);
    return { status: "ok" as const, result: { ...context, state: "preview-ready" as const, basis: view.basis } };
  } catch (error) {
    if (!(error instanceof StoreRefusalError)) throw error;
    return { status: "refused" as const, refusal: error.refusal };
  }
}

/** Keep malformed transport and request inputs inside the existing recoverable store refusal boundary. */
export function rootRepairRequestRefusal(condition: string, request?: unknown): Extract<StoreRefusal, { code: "record-malformed" }> {
  const coordinates = ReviewRootRepairBasisSchema.pick({ workItem: true, producerId: true }).strip().safeParse(request);
  return { code: "record-malformed", class: "recoverable", rule: "review.evidence-root-selection.request", condition,
    ...(coordinates.success ? { reference: recordReferences["review/evidence-root-selection"](coordinates.data.workItem,
      reviewEvidenceRootSelectionKey(coordinates.data.workItem, coordinates.data.producerId)) } : {}),
    remedy: { text: "Inspect arc store repair-review-roots --schema, correct the JSON request, then rerun arc store repair-review-roots <file|->." } };
}

async function applySelection(input: { store: Store; now(): string }, request: Extract<ReviewRootRepairRequest, { operation: "apply" }>,
  view: Awaited<ReturnType<typeof readReviewRootRepairView>>) {
  if (view.basis === null) throw new Error("Root selection lost its immutable result basis.");
  if (!view.eligibleChoices.includes(request.selectedRoot)) throw reviewRootSelectionRefusal(request.workItem, request.producerId,
    "choice", "Choose a currently eligible root without excluding performed or settled work.");
  const value = ReviewEvidenceRootSelectionSchema.parse({ schemaVersion: 1, producerId: request.producerId,
    outcomeKey: view.basis.outcomeKey, resultDigest: view.basis.resultDigest, roots: view.roots,
    selectedRoot: request.selectedRoot, decidedBy: request.decidedBy, decidedAt: input.now(), reason: request.reason });
  const result = await input.store.batch({ writes: [{ action: "put", reference: view.reference,
    expected: view.basis.selector.expected?.version ?? null, resolves: view.basis.selector.expected?.conflicts ?? [],
    content: JSON.stringify(value) }], observations: [...view.basis.evidence, view.basis.outcome, view.basis.selector, ...view.basis.selectorAlternatives],
    provenance: { verb: "repair-review-roots", lifecycleAction: "edit" } });
  if (result.status === "refused") return { ...result, refusal: { ...result.refusal,
    remedy: result.refusal.code === "version-conflict"
      ? { text: reviewRootSelectionPreviewRemedy(request.workItem, request.producerId) } : result.refusal.remedy } };
  const written = result.result.writes[0];
  if (written === undefined) throw new Error("The atomic root-selection write returned no selector.");
  return { status: "ok" as const, result: { schemaVersion: 1 as const, state: "applied" as const,
    workItem: request.workItem, producerId: request.producerId, selectedRoot: value.selectedRoot, roots: value.roots,
    selector: { reference: written.reference, version: RecordVersionSchema.parse(written.version) } } };
}

function normalizedBasis(basis: ReviewRootRepairBasis): string {
  const { asOf: ignored, evidence, selectorAlternatives, selector, outcome, roots, ...binding } = basis;
  void ignored;
  return canonicalize({ ...binding, roots: [...roots].sort(), evidence: normalizeObservations(evidence),
    selectorAlternatives: normalizeObservations(selectorAlternatives), selector: normalizeObservation(selector), outcome: normalizeObservation(outcome) });
}

function normalizeObservations(records: readonly RecordObservation[]): unknown[] {
  return records.map(normalizeObservation).sort((a, b) => canonicalize(a).localeCompare(canonicalize(b)));
}

function normalizeObservation(record: RecordObservation) {
  return { reference: record.reference, expected: record.expected === null ? null : { version: record.expected.version,
    conflicts: [...record.expected.conflicts].sort((a, b) => canonicalize(a).localeCompare(canonicalize(b))) } };
}
