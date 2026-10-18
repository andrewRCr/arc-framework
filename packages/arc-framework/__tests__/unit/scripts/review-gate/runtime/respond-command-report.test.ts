/** Caller-owned report judgments render without entering approved disposition identity. */
import { expect, it } from "vitest";
import { fixture, dependencies, policyRequest, localRequest } from "../../../../fixtures/respond-command.js";
import { respondToReviewCommand } from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { reviewRespondRemedy } from "../../../../../src/scripts/review-gate/runtime/respond-remedy.js";
import { approveDispositionState } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { ApprovedDispositionRecordSchema, currentApprovedDispositionNode, type ApprovedDispositionRecord } from "../../../../../src/scripts/review-gate/core/advisory-records.js";

function proposalRequest(records: ReturnType<typeof fixture>) {
  return {
    schemaVersion: 1,
    source: { kind: "attested-local", receiptRef: records.receiptRef },
    proposal: { proposedVerification: "focused", severityGatingPolicy: { minorGating: "record-only" },
      findings: [{ findingId: records.finding.findingId, sourceVerification: "verified", verifiedSeverity: "major",
        verificationRefs: ["source:src/index.ts:7"], disposition: "fix", title: "Repair the branch",
        issue: "The branch mishandles the boundary.", recommendation: "Correct this branch.",
        rationale: "The source confirms the boundary failure.", openQuestions: ["Accept the repair boundary?"] }] },
    report: { tags: [{ findingId: records.finding.findingId, tag: "new-design" }],
      fails: [{ findingId: records.finding.findingId, fails: "Correctness and failure behavior" }],
      successorRecommendation: "Check the repair before considering another complete pass.",
      origin: [{ origin: "original artifact", findings: 1, newDesignFixes: 1 }],
      reading: { kind: "baseline", rationale: "This is the first look at the branch." } },
  } as const;
}

it("renders caller judgments beside computed facts without changing or storing the approved set", async () => {
  const records = fixture();
  const deps = dependencies(records);
  let stored: ApprovedDispositionRecord | null = null;
  deps.dispositionStore.readDispositionRecord = async () => stored;
  deps.dispositionStore.appendDispositionRecord = async record => {
    stored = record;
    return { dispositionRecordRef: "test:disposition" };
  };
  const request = proposalRequest(records);
  const response = await respondToReviewCommand(request, deps);
  expect(response.state).toBe("awaiting-approval");
  if (response.state !== "awaiting-approval") throw new Error("expected a proposed report");
  const text = response.payload.dispositionReportText;
  expect(text).toContain("Standard complete pass 1 of 2");
  expect(text).toContain("provisional");
  expect(text).toContain("FIX (new design)");
  expect(text).toContain("**Fails:** Correctness and failure behavior");
  expect(text.match(/\*\*Decisions\*\*/gu)).toHaveLength(1);
  expect(text).toContain(request.report.successorRecommendation);
  expect(text).toContain("Material trend:");
  expect(text).toContain("original artifact: 1 finding, 1 new-design fix");
  expect(text).toContain("baseline");
  expect(text).toContain(request.report.reading.rationale);
  expect(await deps.dispositionStore.readDispositionRecord(records.operation.operationId)).toBeNull();
  const different = await respondToReviewCommand({ ...request, report: { ...request.report,
    tags: [{ findingId: records.finding.findingId, tag: "local-correction" }],
    origin: [{ origin: "original artifact", findings: 1, newDesignFixes: 0 }],
    reading: { kind: "baseline", rationale: "An advisory alternative reading." } } }, deps);
  if (different.state !== "awaiting-approval") throw new Error("expected the alternative report");
  expect(different.payload.proposal).toEqual(response.payload.proposal);
  expect(JSON.stringify(response.payload.proposal)).not.toContain("new-design");
  expect(JSON.stringify(response.payload.proposal)).not.toContain("original artifact");
});

it.each(["missing tag", "non-fix tag", "foreign tag", "duplicate tag", "missing anchor", "duplicate anchor"])(
  "refuses %s with the finding identity, then accepts the corrected report", async variation => {
    const records = fixture();
    const deps = dependencies(records);
    const request = proposalRequest(records);
    const invalid = variation === "non-fix tag"
      ? { ...request, proposal: { ...request.proposal,
        findings: request.proposal.findings.map(finding => ({ ...finding, disposition: "defer" })) } }
      : { ...request, report: { ...request.report,
        ...(variation === "missing tag" ? { tags: [] }
          : variation === "foreign tag" ? { tags: [...request.report.tags, { findingId: "foreign-finding", tag: "new-design" }] }
            : variation === "duplicate tag" ? { tags: [...request.report.tags, ...request.report.tags] }
              : variation === "missing anchor" ? { fails: [] }
                : { fails: [...request.report.fails, ...request.report.fails] }) } };
    await expect(respondToReviewCommand(invalid, deps)).rejects.toMatchObject({ code: "invalid-input",
      message: expect.stringContaining(variation === "foreign tag" ? "foreign-finding" : records.finding.findingId) });
    await expect(respondToReviewCommand(request, deps)).resolves.toMatchObject({ state: "awaiting-approval" });
  },
);

it("returns a named-identity report repair that preserves the retry request", async () => {
  const records = fixture();
  const request = proposalRequest(records);
  const invalid = { ...request, report: { ...request.report, tags: [] } };
  let failure: unknown;
  try { await respondToReviewCommand(invalid, dependencies(records)); } catch (error) { failure = error; }
  const remedy = reviewRespondRemedy(failure, invalid);
  expect(remedy?.text).toContain(records.finding.findingId);
  expect(remedy?.text).toContain("tags");
  expect(remedy?.stdin).toEqual(invalid);
  expect(remedy?.argv).toEqual(["arc", "review", "respond", "-"]);
});

it("stores only advisory tags on first approval and reuses them on replay, including old records without tags", async () => {
  const records = fixture();
  const deps = dependencies(records);
  let stored: ApprovedDispositionRecord | null = null;
  deps.dispositionStore.readDispositionRecord = async () => stored;
  deps.dispositionStore.appendDispositionRecord = async record => {
    stored = record;
    return { dispositionRecordRef: "test:disposition" };
  };
  const request = proposalRequest(records);
  const proposal = await respondToReviewCommand(request, deps);
  if (proposal.state !== "awaiting-approval") throw new Error("expected a proposed report");
  const dispositions = approveDispositionState({ proposed: proposal.payload.proposal,
    approvedBy: records.authority.authorIdentity, approvedAt: "2026-07-23T20:00:00Z" });
  const approval = { schemaVersion: 1, source: request.source, dispositions, policyRequest: policyRequest(records),
    tags: request.report.tags };
  const response = await respondToReviewCommand(approval, deps);
  if (!("dispositionReportText" in response.payload)) throw new Error("expected an approved report");
  const text = response.payload.dispositionReportText;
  const record = await deps.dispositionStore.readDispositionRecord(records.operation.operationId);
  if (record === null) throw new Error("expected the approved response record");
  const node = currentApprovedDispositionNode(record);
  expect(node.advisoryFixTags).toEqual(request.report.tags);
  expect(node.approvedDisposition).toEqual(dispositions);
  expect(node.approvedDisposition.dispositionSet.dispositionSetId)
    .toBe(proposal.payload.proposal.dispositionSet.dispositionSetId);
  expect(text).toContain(`Approved disposition set ${dispositions.dispositionSet.dispositionSetId}`);
  expect(text).toContain("FIX (new design)");
  for (const absent of ["**Fails:**", "**Decisions**", "Loop reading"]) expect(text).not.toContain(absent);
  expect(JSON.stringify(record)).not.toContain(request.report.reading.rationale);
  expect(JSON.stringify(record)).not.toContain(request.report.successorRecommendation);
  const replay = await respondToReviewCommand({ ...approval,
    tags: [{ findingId: records.finding.findingId, tag: "local-correction" }] }, deps);
  expect(replay.payload).toMatchObject({ dispositionReportText: text });
  expect(currentApprovedDispositionNode((await deps.dispositionStore.readDispositionRecord(records.operation.operationId))!)
    .advisoryFixTags).toEqual(request.report.tags);
  stored = ApprovedDispositionRecordSchema.parse({ ...record,
    approvedDispositionLineage: record.approvedDispositionLineage.map(({ advisoryFixTags: _tags, ...oldNode }) => {
      void _tags; return oldNode;
    }) });
  const old = await respondToReviewCommand({ ...approval, tags: undefined }, deps);
  if (!("dispositionReportText" in old.payload)) throw new Error("expected the old record's report");
  expect(old.payload.dispositionReportText).toContain("| F1 | 🟠 major | Repair the branch | FIX |");
  expect(old.payload.dispositionReportText).not.toContain("FIX (new design)");
});

it("requires a tag for each fix at first approval and accepts the corrected approval", async () => {
  const records = fixture();
  const deps = dependencies(records);
  const request = localRequest(records);
  await expect(respondToReviewCommand(request, deps)).rejects.toMatchObject({ code: "invalid-input",
    message: expect.stringContaining(records.finding.findingId) });
  await expect(respondToReviewCommand({ ...request,
    tags: [{ findingId: records.finding.findingId, tag: "local-correction" }] }, deps))
    .resolves.toMatchObject({ state: "ready-to-fix" });
});
