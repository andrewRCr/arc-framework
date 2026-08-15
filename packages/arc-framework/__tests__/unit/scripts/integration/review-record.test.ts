/** Composition of the pull request's `## Review` record from approved review dispositions. */

import { describe, expect, it } from "vitest";

import { composeReviewRecordMarkdown } from "../../../../src/scripts/integration/review-record.js";
import { replaceReviewSection } from "../../../../src/scripts/integration/merge-composition.js";
import type { ApprovedDispositionRecord } from "../../../../src/scripts/review-gate/core/advisory-records.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../src/scripts/review-gate/core/dispositions.js";

const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;

interface FindingInput {
  findingId: string;
  disposition: "fix" | "defer" | "reject";
  severity?: "blocker" | "major" | "minor";
  nit?: true;
}

function record(input: {
  operationId: string;
  source: ApprovedDispositionRecord["source"];
  sourceIdentity: string;
  approvedBy?: string;
  findings: FindingInput[];
}): ApprovedDispositionRecord {
  const dispositionSet = createDispositionSet({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    targetId: digest("a"),
    policyVersion: digest("1"),
    rubricVersion: "standard-review/v1",
    rubricDigest: digest("2"),
    proposedBy: "review-runtime",
    findings: input.findings.map((finding) => ({
      findingId: finding.findingId,
      sourceIdentity: input.sourceIdentity,
      locus: `src/example.ts:${finding.findingId}`,
      sourceVerification: finding.disposition === "reject" ? "not-supported" as const : "verified" as const,
      verificationRefs: ["receipt:1"],
      severity: finding.severity ?? (finding.nit === true ? "minor" as const : "major" as const),
      ...(finding.nit === true ? { nit: true as const } : {}),
      disposition: finding.disposition,
      rationale: "The finding is supported by the reviewed source.",
      recommendation: "Apply the bounded correction.",
      openQuestions: [],
    })),
  });
  return {
    schemaVersion: 1,
    semanticsVersion: "review-advisory/v1",
    repositoryId: "owner/repo",
    operationId: input.operationId,
    source: input.source,
    approvedDisposition: approveDispositionState({
      proposed: proposeDispositionSet(dispositionSet),
      approvedBy: input.approvedBy ?? "andrew",
      approvedAt: "2026-08-15T02:00:00Z",
    }),
    fixAuthorization: null,
  };
}

const LOCAL_SOURCE = {
  kind: "attested-local" as const,
  receiptRef: "local:operation:receipt",
  localSourceRef: "local:operation:source",
};
const FRONTLINE_SOURCE = { kind: "frontline" as const, outcomeRef: "frontline:operation:outcome" };

describe("review record composition", () => {
  it("reports each lane from the source kind its approved records carry", () => {
    const markdown = composeReviewRecordMarkdown([
      record({
        operationId: "operation-1",
        source: LOCAL_SOURCE,
        sourceIdentity: "reviewer-1",
        findings: [{ findingId: "finding-1", disposition: "fix" }],
      }),
      record({
        operationId: "operation-2",
        source: FRONTLINE_SOURCE,
        sourceIdentity: "coderabbit",
        findings: [{ findingId: "finding-2", disposition: "defer" }],
      }),
    ]);

    expect(markdown).toContain("- **Local:** reviewer-1 — 1 pass");
    expect(markdown).toContain("- **Hosted PR:** coderabbit — 1 review");
  });

  it("renders an unrepresented lane as None and pluralizes a repeated one", () => {
    const markdown = composeReviewRecordMarkdown([
      record({
        operationId: "operation-1",
        source: LOCAL_SOURCE,
        sourceIdentity: "reviewer-1",
        findings: [{ findingId: "finding-1", disposition: "fix" }],
      }),
      record({
        operationId: "operation-2",
        source: LOCAL_SOURCE,
        sourceIdentity: "reviewer-2",
        findings: [{ findingId: "finding-2", disposition: "fix" }],
      }),
    ]);

    expect(markdown).toContain("- **Local:** reviewer-1, reviewer-2 — 2 passes");
    expect(markdown).toContain("- **Hosted PR:** None");
  });

  it("counts distinct material findings by disposition and always states the unresolved count", () => {
    const markdown = composeReviewRecordMarkdown([
      record({
        operationId: "operation-1",
        source: LOCAL_SOURCE,
        sourceIdentity: "reviewer-1",
        findings: [
          { findingId: "finding-1", disposition: "fix" },
          { findingId: "finding-2", disposition: "fix" },
          { findingId: "finding-3", disposition: "reject" },
          { findingId: "finding-4", disposition: "defer", severity: "minor" },
        ],
      }),
    ]);

    expect(markdown).toContain("- **Triage:** @andrew — 2 addressed, 1 declined, 1 deferred, 0 unresolved");
  });

  it("excludes nit findings and reports a nit-only cycle as clean", () => {
    const markdown = composeReviewRecordMarkdown([
      record({
        operationId: "operation-1",
        source: LOCAL_SOURCE,
        sourceIdentity: "reviewer-1",
        findings: [{ findingId: "finding-1", disposition: "defer", nit: true }],
      }),
    ]);

    expect(markdown).toContain("- **Triage:** @andrew — no material findings");
  });

  it("takes the disposition the last approved set gave a finding carried across passes", () => {
    const markdown = composeReviewRecordMarkdown([
      record({
        operationId: "operation-1",
        source: LOCAL_SOURCE,
        sourceIdentity: "reviewer-1",
        findings: [{ findingId: "finding-1", disposition: "defer" }],
      }),
      record({
        operationId: "operation-2",
        source: LOCAL_SOURCE,
        sourceIdentity: "reviewer-1",
        findings: [{ findingId: "finding-1", disposition: "fix" }],
      }),
    ]);

    expect(markdown).toContain("1 addressed, 0 unresolved");
    expect(markdown).not.toContain("deferred");
  });

  it("names every distinct approver", () => {
    const markdown = composeReviewRecordMarkdown([
      record({
        operationId: "operation-1",
        source: LOCAL_SOURCE,
        sourceIdentity: "reviewer-1",
        approvedBy: "andrew",
        findings: [{ findingId: "finding-1", disposition: "fix" }],
      }),
      record({
        operationId: "operation-2",
        source: LOCAL_SOURCE,
        sourceIdentity: "reviewer-1",
        approvedBy: "blake",
        findings: [{ findingId: "finding-2", disposition: "fix" }],
      }),
    ]);

    expect(markdown).toContain("- **Triage:** @andrew, @blake —");
  });

  it("composes a section the merge verb can splice into a pull-request body", () => {
    const markdown = composeReviewRecordMarkdown([
      record({
        operationId: "operation-1",
        source: LOCAL_SOURCE,
        sourceIdentity: "reviewer-1",
        findings: [{ findingId: "finding-1", disposition: "fix" }],
      }),
    ]);

    expect(markdown.startsWith("## Review\n")).toBe(true);
    expect(replaceReviewSection("## Summary\n\nBody.\n\n## Review\n\n- stale\n", markdown))
      .toBe(`## Summary\n\nBody.\n\n${markdown.trimEnd()}\n`);
  });

  it("refuses to compose a record no approved disposition backs", () => {
    expect(() => composeReviewRecordMarkdown([])).toThrow(/at least one approved disposition/u);
  });
});
