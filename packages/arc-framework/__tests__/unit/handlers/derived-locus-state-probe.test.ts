import { describe, expect, it } from "vitest";

import { projectDeliveryEntryCorrection } from
  "../../../src/handlers/derived-locus-state-probe.js";
import type { DeliveryEntryInspectionResult } from
  "../../../src/lib/delivery/entry-inspection.js";
import type { DeliveryCorrectionProjection } from
  "../../../src/lib/locus/subject-meta.js";

const EXPECTED_CORRECTION_BY_ENTRY_STATUS = {
  "not-applicable": "none",
  "authoring-required": "none",
  "canonicalize-provisional": "none",
  "validate-canonical": "none",
  "repair-required": "none",
  "resume-bound": "none",
  "correction-routing-required": "authoring-required",
  "review-fix-verification-required": "scoped-verification-required",
  "candidate-renewal-required": "candidate-renewal-required",
  "candidate-verification-required": "verification-required",
  "correction-route-ambiguous": "refused",
  "continue-publication": "none",
  "resolve-delivery-status": "none",
  "reopen-permitted": "none",
  "reopen-bound": "none",
  refused: "refused",
} as const satisfies Record<
  DeliveryEntryInspectionResult["status"],
  DeliveryCorrectionProjection["status"]
>;

describe("delivery-entry correction projection", () => {
  it.each(Object.entries(EXPECTED_CORRECTION_BY_ENTRY_STATUS))(
    "projects %s to %s",
    (entryStatus, correctionStatus) => {
      const recommendedActionText = `Remedy ${entryStatus}.`;
      const projected = projectDeliveryEntryCorrection({
        status: entryStatus as DeliveryEntryInspectionResult["status"],
        recommendedActionText,
      });

      expect(projected).toEqual(correctionStatus === "refused"
        ? { status: "refused", message: recommendedActionText }
        : { status: correctionStatus });
    },
  );
});
