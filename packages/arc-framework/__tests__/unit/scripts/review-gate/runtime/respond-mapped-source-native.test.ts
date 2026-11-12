/** Native respond accepts the response source an imported boundary carries, from a checkout naming no work item. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { scriptRawGitExec } from "../../../../helpers/git-exec-fake.js";
import { createLocalMappingFixture } from "../../../../fixtures/review-mapping.js";
import { mappingBoundaryFixture } from "../../../../fixtures/review-mapping-boundary.js";
import { approvedRecord } from "../../../../fixtures/review-response-proof.js";
import { withReviewReport } from "../../../../fixtures/review-report-input.js";
import { mapReviewRecords } from "../../../../../src/lib/store/kinds/review/mapping.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../../src/lib/store/kinds/review/integration-boundary/schema.js";
import { IntegrationBoundaryLocusSchema } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { resolveReviewSourceInvocation } from "../../../../../src/scripts/review-gate/runtime/source-invocation.js";
import { createRespondDependencies } from "../../../../../src/scripts/review-gate/runtime/respond-composition.js";
import { respondToReviewCommand } from "../../../../../src/scripts/review-gate/runtime/respond-command.js";

it("responds natively to the local source a mapped pre-publication action names", async () => {
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  const h = createReviewHarness();
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example"), owner = primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected work-item generation");
  const { input: base, boundary } = mappingBoundaryFixture("candidate-fix-pending");
  const fixture = await createLocalMappingFixture({ repositoryId: projectId,
    lineage: { kind: "candidate", candidateId: boundary.candidateId }, vehicle: { kind: "work-unit", identity: "example" },
    imported: { workItems: [{ kind: "work-unit", slug: "example", uid: owner.uid, live: true }],
      candidates: base.candidates.map(candidate => ({ ...candidate, workItem: owner.uid! })) } });
  await fixture.conclude();
  const producer = await fixture.resultReader.readResult(fixture.state.operationId);
  if (producer.kind !== "attested-local") throw new Error("Expected a local producer");
  const approval = approvedRecord(producer, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "defer" }]);
  if (approval.source.kind !== "attested-local") throw new Error("Expected a local producer source");
  const input = fixture.input();
  input.candidates[0]!.boundary = JSON.stringify(IntegrationBoundaryLocusSchema.parse({ ...boundary,
    nextAction: { kind: "continue-pre-publication-review", command: "arc review respond -", interactionText: "Respond.",
      responseOperationId: producer.producerId,
      responseSource: { kind: "attested-local", receiptRef: approval.source.receiptRef },
      resumeCommand: `arc review pre-publication example --resume ${Buffer.from("{}").toString("base64url")}` } }));
  const mapped = mapReviewRecords(input);
  lifecycleSuccess(await h.store.batch({ writes: mapped.records.map(({ reference, contents }) => ({
    action: "put", reference, expected: null, content: contents[0]!,
  })), provenance: { verb: "review", lifecycleAction: "create" } }));
  const mappedBoundary = IntegrationBoundaryLocusV2Schema.parse(JSON.parse(mapped.records
    .find(({ reference }) => reference.kind === "review/integration-boundary")!.contents[0]!));
  if (mappedBoundary.nextAction.kind !== "continue-pre-publication-review"
    || mappedBoundary.nextAction.responseSource?.kind !== "attested-local") throw new Error("Expected a mapped local response");
  const source = mappedBoundary.nextAction.responseSource;
  const checkout = await createReviewCheckout(h);
  onTestFinished(checkout.cleanup);

  const selected = await resolveReviewSourceInvocation({ cwd: checkout.cwd, exec: checkout.exec, store: h.store,
    projectId: h.projectId }, source.receiptRef, "attested-local");
  expect(selected.invocation.workItem).toEqual(owner);
  const response = await respondToReviewCommand(withReviewReport({ schemaVersion: 1, source,
    proposal: { proposedVerification: "full", severityGatingPolicy: { minorGating: "record-only" },
      findings: producer.findings.map(finding => ({ findingId: finding.findingId, sourceVerification: "verified",
        verificationRefs: [finding.evidenceUrlOrId], verifiedSeverity: finding.severity, disposition: "defer",
        title: "Known limitation", issue: "The reported behavior remains.", rationale: "Defer this bounded repair.",
        recommendation: "Track the deferred repair.", openQuestions: [] })) } }), {
    ...createRespondDependencies({ ...selected.invocation, rawGit: scriptRawGitExec([]).exec }),
    confirmTarget: async () => ({ state: "current", target: producer.target }),
    resolveLocalActors: async () => ({ approverIdentity: producer.request.authorIdentity, proposerIdentity: "arc-cli/0.1.0" }),
  });
  expect(response).toMatchObject({ state: "awaiting-approval", payload: { operationId: producer.producerId,
    proposal: { dispositionSet: { producerId: producer.producerId } } } });
});
