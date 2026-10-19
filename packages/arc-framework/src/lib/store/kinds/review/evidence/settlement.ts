/** Per-response hosted settlement facts independent of outcome lookup. */
import type { z } from "zod";
import { canonicalize } from "../../../../kernel/index.js";
import { validateHostedDispositionSetSettlement } from "../../../../../scripts/review-gate/core/operation-state-schema.js";
import type { ReviewEvidence } from "./schema.js";

/** Validate one set's settlement, its canonical finding dispositions, and direct-predecessor carry. */
export function validateEvidenceSettlement(value: ReviewEvidence, context: z.RefinementCtx): void {
  const settlement = value.settlement;
  if (settlement === undefined) return;
  const issues = validateHostedDispositionSetSettlement({ dispositionSetId: value.dispositionSet.dispositionSetId,
    predecessorDispositionSetId: value.predecessorDispositionSetId, ...settlement });
  for (const issue of issues) context.addIssue({ code: "custom", path: ["settlement", issue.field], message: issue.message });
  const actual = settlement.findingActions.map(({ findingId, disposition }) => ({ findingId, disposition }))
    .sort((left, right) => left.findingId.localeCompare(right.findingId));
  const expected = value.dispositionSet.findings.map(({ findingId, disposition }) => ({ findingId, disposition }))
    .sort((left, right) => left.findingId.localeCompare(right.findingId));
  if (canonicalize(actual) !== canonicalize(expected)) context.addIssue({ code: "custom", path: ["settlement", "findingActions"],
    message: "settlement finding actions must cover the canonical set with its exact dispositions" });
}
