import { describe, expect, it } from "vitest";
import { parseReviewEvidence } from "../../../../../../../src/lib/store/kinds/review/evidence/parser.js";
import { performedEvidenceFixture } from "../../../../../../fixtures/review-evidence.js";

describe("per-response hosted settlement", () => {
  it.each(["duplicate-entry", "wrong-disposition", "wrong-channel", "wrong-parent", "unknown-finding", "wrong-set"] as const)(
    "refuses %s evidence", (field) => {
      const { value } = performedEvidenceFixture("delivery-member");
      const settlement = value.settlement;
      const entry = settlement?.evidence[0];
      if (settlement === undefined || entry === undefined) throw new Error("expected hosted settlement");
      const digest = `sha256:${"d".repeat(64)}`;
      const changed = field === "duplicate-entry" ? [entry, entry]
        : [{ ...entry, ...(field === "wrong-disposition" ? { disposition: "reject" }
            : field === "wrong-parent" ? { carriedFromDispositionSetId: digest }
            : field === "unknown-finding" ? { findingId: "another-finding" } : { dispositionSetId: digest }) }];
      const proposed = field === "wrong-channel" ? { ...settlement,
        findingActions: settlement.findingActions.map((action) => ({ ...action, channelAction: "reply-and-resolve" })) }
        : { ...settlement, evidence: changed };
      expect(parseReviewEvidence(JSON.stringify({ ...value, settlement: proposed }))).toBeNull();
    },
  );
  it("binds internally consistent finding actions to the actual approved dispositions", () => {
    const { value } = performedEvidenceFixture("delivery-member");
    const settlement = value.settlement;
    if (settlement === undefined) throw new Error("expected hosted settlement");
    const changed = { findingActions: settlement.findingActions.map((action) => ({ ...action, disposition: "reject" })),
      evidence: settlement.evidence.map((entry) => ({ ...entry, disposition: "reject" })) };
    expect(parseReviewEvidence(JSON.stringify({ ...value, settlement: changed }))).toBeNull();
  });
});
