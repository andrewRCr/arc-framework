/** Default status and delivery admission bind native authority selected by production vehicle lookup. */
import { expect, it } from "vitest";
import { createNativeDeliveryReviewRepository } from "../helpers/store/native-delivery-repository.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import { ChangeRequestResolveResultSchema } from "../../src/scripts/review-gate/change-request.js";
import { ReviewStatusCommandResultSchema } from "../../src/scripts/review-gate/status.js";
import { LocalPrepareEnvelopeSchema, LocalResumeEnvelopeSchema, LocalAttestEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { parseNativeReviewOperationReference } from "../../src/scripts/review-gate/core/review-operation-reference.js";
import { handleReviewChangeRequestResolve, handleReviewStatus, handleReviewLocalPrepare, handleReviewLocalResume, handleReviewLocalAttest } from "../../src/handlers/review.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import type { OwnerIdentity } from "../../src/lib/store/identity.js";
import { createReviewDecisionPort } from "../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../src/lib/store/kinds/review/decision/key.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { readSubmissionBoundaryVersioned, writeSubmissionBoundary } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { createStandardReviewReservation, projectPublicationBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { localReviewResult } from "../helpers/in-process-review.js";

async function invokeLocal(h: Awaited<ReturnType<typeof fixture>>,
  handler: typeof handleReviewLocalPrepare | typeof handleReviewLocalResume | typeof handleReviewLocalAttest, request: unknown) {
  let output = "";
  const exits: number[] = [];
  await handler("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
    write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined,
  { store: h.reference.store, projectId: createProjectIdentityReader(h.reference.store) });
  expect(exits, output).toEqual([]);
  return JSON.parse(output) as unknown;
}

async function completeMember(h: Awaited<ReturnType<typeof fixture>>, runId: string, member = 0) {
  const status = await h.status(undefined, {}, member);
  if (status.nextAction !== "review-local-prepare") throw new Error(JSON.stringify(status));
  const prepared = LocalPrepareEnvelopeSchema.parse(await invokeLocal(h, handleReviewLocalPrepare, { schemaVersion: 1,
    evaluatorIdentity: "independent-delivery-reviewer", deliveryAdmission: status.action,
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" } }));
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const result = await invokeLocal(h, handleReviewLocalAttest,
    { ...localReviewResult(prepared.payload, runId, []), operationRef: prepared.payload.operationRef });
  expect(LocalAttestEnvelopeSchema.parse(result).state).toBe("attested-current");
  return prepared.payload.operationId;
}

async function fixture(errand = false, targetMember = 0) {
  const h = await createNativeDeliveryReviewRepository(errand ? "chore/repair" : "member-1");
  if (errand) {
    const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
      claimId: "1".repeat(32), intent: "Repair one issue", owner: "andrew", origin: "description", originEntry: null,
      branch: "chore/repair", state: "open", savedHead: null, changeRequest: null,
      createdAt: "2026-10-20T18:00:00Z", updatedAt: "2026-10-20T18:00:00Z" });
    if (record.kind !== "errand") throw new Error("Expected Errand");
    await h.reference.seedErrand(record);
  }
  let output = "";
  const exits: number[] = [];
  await handleReviewChangeRequestResolve({ headRef: h.branches[targetMember]!, headSha: h.heads[targetMember]!, requireRemote: true }, undefined,
    { resolveRoot: () => h.cwd, write: text => { output += text; }, setExitCode: code => exits.push(code) });
  expect(exits, output).toEqual([]);
  const resolved = ChangeRequestResolveResultSchema.parse(JSON.parse(output));
  if (resolved.state !== "open") throw new Error(JSON.stringify(resolved));
  const status = async (workItem?: OwnerIdentity, grants: { ceilingOverride?: string; additionalPass?: string } = {}, member = targetMember) => {
    let output = "";
    await handleReviewStatus({ target: JSON.stringify({ ...resolved.targetRef, headRef: h.branches[member], headSha: h.heads[member] }),
      source: "delegated-agent", coverage: "complete", ...grants }, undefined,
      { resolveRoot: () => h.cwd, write: text => { output += text; }, setExitCode: () => {} },
      { store: h.reference.store, projectId: createProjectIdentityReader(h.reference.store), ...(workItem === undefined ? {} : { workItem }) });
    return ReviewStatusCommandResultSchema.parse(JSON.parse(output));
  };
  return { ...h, status, policyTarget: { repository: resolved.targetRef.repository,
    pullRequest: resolved.candidate.number, headSha: resolved.targetRef.headSha } };
}

it.each([true, false])("records singleton status judgments before a reserved=%s return and validates relayed authority", async reserved => {
  const h = await fixture(false, 1);
  const previous = await readSubmissionBoundaryVersioned(h.cwd, "example", h.access);
  const boundary = projectPublicationBoundary({ workUnit: "example", branch: "member-2",
    candidateId: h.boundary.candidateId, candidateSubjectDigest: h.boundary.candidateSubjectDigest, reservation: reserved
    ? createStandardReviewReservation({ candidateId: h.boundary.candidateId, sourceId: "delegated-agent",
      repository: h.policyTarget.repository, headSha: h.policyTarget.headSha, obligation: h.obligation }) : null,
    changeRequest: null, readinessBinding: null }, 2);
  await writeSubmissionBoundary(h.cwd, boundary, previous.version, h.access);
  const decisions = createReviewDecisionPort(h.reference.store, h.primary.reference.owner);
  const grant = { target: h.policyTarget, lane: "standard", exhaustedPassCount: 0, nextPass: 1 };
  await h.status(undefined, { ceilingOverride: JSON.stringify(grant) });
  const listing = await decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  expect(listing.records).toHaveLength(1);
  const decision = listing.records[0]!, decisionKey = reviewDecisionKey(decision.value);
  expect(decision.value).toMatchObject({ decidedBy: "andrew", subject: { lineage: {
    kind: "candidate", candidateId: h.boundary.candidateId }, subjectDigest: h.boundary.candidateSubjectDigest },
  choice: { kind: "extra-pass", precondition: { kind: "ceiling", targetBinding: {
    kind: "policy-target", repository: h.policyTarget.repository, pullRequest: 42 } } } });
  const version = lifecycleSuccess(await h.reference.store.version());
  const refused = await h.status(undefined, { ceilingOverride: JSON.stringify({ ...grant, decisionKey: `sha256:${"f".repeat(64)}` }) });
  expect(refused).toMatchObject({ state: "blocked", routedObligation: { detail: expect.stringContaining("decision") } });
  const repaired = await h.status(undefined, { ceilingOverride: JSON.stringify({ ...grant, decisionKey }) });
  expect(repaired.routedObligation?.detail).not.toContain("decision reference");
  expect(lifecycleSuccess(await h.reference.store.version())).toBe(version);
}, 60_000);

it("records a delivery status judgment before pure admission and relays its exact native reference", async () => {
  const h = await fixture();
  const decisions = createReviewDecisionPort(h.reference.store, h.primary.reference.owner);
  const grant = { target: h.policyTarget, lane: "standard", exhaustedPassCount: 0, nextPass: 1 };
  await h.status(undefined, { ceilingOverride: JSON.stringify(grant) });
  const listing = await decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  expect(listing.records).toHaveLength(1);
  const record = listing.records[0]!, key = reviewDecisionKey(record.value);
  expect(record.value).toMatchObject({ decidedBy: "andrew", lane: "standard", subject: {
    lineage: { kind: "delivery-member", planId: h.plan.planId, deliverableId: h.plan.members[0]!.deliverableId },
    headSha: h.policyTarget.headSha }, choice: { kind: "extra-pass", passCount: 0, precondition: {
      kind: "ceiling", targetBinding: { kind: "policy-target", repository: h.policyTarget.repository, pullRequest: 41 } } } });
  const version = lifecycleSuccess(await h.reference.store.version());
  await h.status(undefined, { ceilingOverride: JSON.stringify({ ...grant, decisionKey: key }) });
  expect(lifecycleSuccess(await h.reference.store.version())).toBe(version);
}, 60_000);

it("reopens the queried converged member with one stored additional decision and an executable native continuation", async () => {
  const h = await fixture();
  const precedingProducerId = await completeMember(h, "member-one");
  await completeMember(h, "member-two", 1);
  const grant = { target: h.policyTarget, lane: "standard", precedingProducerId, completedPasses: 1, nextPass: 2 };
  const status = await h.status(undefined, { additionalPass: JSON.stringify(grant) });
  expect(status, JSON.stringify(status)).toMatchObject({ nextAction: "review-local-prepare", action: {
    pass: 2, vehicle: { deliverableId: h.plan.members[0]!.deliverableId }, additionalPassAuthorization: {
      ...grant, decisionKey: expect.any(String) } } });
  if (status.nextAction !== "review-local-prepare") throw new Error(JSON.stringify(status));
  const decisions = createReviewDecisionPort(h.reference.store, h.primary.reference.owner);
  const listing = await decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  expect(listing.records).toHaveLength(1);
  expect(status.action.additionalPassAuthorization?.decisionKey).toBe(reviewDecisionKey(listing.records[0]!.value));
  const prepared = LocalPrepareEnvelopeSchema.parse(await invokeLocal(h, handleReviewLocalPrepare, { schemaVersion: 1,
    evaluatorIdentity: "independent-delivery-reviewer", deliveryAdmission: status.action,
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" } }));
  expect(prepared.state).toBe("ready");
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  expect(prepared.payload.target.headSha).toBe(h.policyTarget.headSha);
  const after = await decisions.list();
  if (after.status !== "complete") throw new Error(after.reason);
  expect(after.records).toEqual(listing.records);
}, 60_000);

it("records a native Errand judgment and relays its key through default status without occupancy", async () => {
  const h = await fixture(true);
  const selected = lifecycleSuccess(await h.reference.store.lookup({ kind: "slug", slug: SlugSchema.parse("repair") }));
  const decisions = createReviewDecisionPort(h.reference.store, selected.reference.owner);
  const grant = { target: h.policyTarget, lane: "standard", exhaustedPassCount: 0, nextPass: 1 };
  expect(await h.status(undefined, { ceilingOverride: JSON.stringify(grant) })).toMatchObject({ state: "review-required" });
  const listing = await decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  expect(listing.records).toHaveLength(1);
  const record = listing.records[0]!, key = reviewDecisionKey(record.value);
  expect(record.value).toMatchObject({ decidedBy: "andrew", subject: { lineage: { vehicleKind: "errand",
    vehicleIdentity: "1".repeat(32) }, headSha: h.policyTarget.headSha } });
  const version = lifecycleSuccess(await h.reference.store.version());
  expect(await h.status(undefined, { ceilingOverride: JSON.stringify({ ...grant, decisionKey: key }) }))
    .toMatchObject({ state: "review-required" });
  expect(lifecycleSuccess(await h.reference.store.version())).toBe(version);
}, 60_000);

it("resolves native delivery through default status, repairs identity, and retains an explicitly selected generation", async () => {
  const h = await fixture();
  const ready = await h.status();
  expect(ready, JSON.stringify(ready)).toMatchObject({ nextAction: "review-local-prepare",
    action: { vehicle: { workUnitId: "example", planId: h.plan.planId, deliverableId: h.plan.members[0]!.deliverableId } } });
  lifecycleSuccess(await h.reference.store.write({ action: "remove", reference: h.project.reference, expected: h.project.version,
    provenance: { verb: "remove-project-identity", lifecycleAction: "edit" } }));
  expect(await h.status()).toMatchObject({ state: "blocked", nextAction: "stop", reason: "status-unavailable",
    remedy: { text: expect.stringContaining("project") } });
  await h.reference.seedProject(h.projectId);
  expect(await h.status()).toEqual(ready);
  lifecycleSuccess(await h.reference.store.write({ action: "remove", reference: h.primary.reference, expected: h.primary.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const replacement = await h.reference.seedMeta("example", { owner: "andrew", branch: null });
  expect(replacement.reference.owner).not.toEqual(h.primary.reference.owner);
  expect(await h.status()).toMatchObject({ state: "blocked", nextAction: "stop" });
  expect(await h.status(h.primary.reference.owner)).toEqual(ready);
}, 60_000);

it("prepares and resumes the explicit delivery vehicle emitted by default native status without owner injection", async () => {
  const h = await fixture();
  const status = await h.status();
  if (status.nextAction !== "review-local-prepare") throw new Error(JSON.stringify(status));
  const invoke = async (handler: typeof handleReviewLocalPrepare | typeof handleReviewLocalResume, request: unknown) => {
    let output = "";
    const exits: number[] = [];
    await handler("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined,
    { store: h.reference.store, projectId: createProjectIdentityReader(h.reference.store) });
    expect(exits, output).toEqual([]);
    return JSON.parse(output) as unknown;
  };
  const prepared = LocalPrepareEnvelopeSchema.parse(await invoke(handleReviewLocalPrepare, { schemaVersion: 1,
    evaluatorIdentity: "independent-delivery-reviewer", deliveryAdmission: status.action,
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" } }));
  expect(prepared.state).toBe("ready");
  expect(prepared.payload).toMatchObject({ target: { kind: "delivery-member", headSha: status.action.vehicle.head } });
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  expect(parseNativeReviewOperationReference(prepared.payload.operationRef).workItem).toEqual(h.primary.reference.owner);
  expect(LocalResumeEnvelopeSchema.parse(await invoke(handleReviewLocalResume, { schemaVersion: 1,
    operationId: prepared.payload.operationId, operationRef: prepared.payload.operationRef }))).toMatchObject({
    state: "suspended", payload: { operationId: prepared.payload.operationId } });
}, 60_000);

it("reads the native Errand claim through default status without its occupancy or an injected owner", async () => {
  const h = await fixture(true);
  const version = lifecycleSuccess(await h.reference.store.version());
  expect(await h.status()).toMatchObject({ state: "review-required", nextAction: "run-review",
    routedObligation: { state: "review-required", detail: "No standard review is recorded for this Errand head." } });
  expect(lifecycleSuccess(await h.reference.store.version())).toBe(version);
}, 60_000);

it("resolves the branch-linked native work unit through default status without an injected owner", async () => {
  const h = await fixture(false, 1);
  expect(await h.status()).toMatchObject({ nextAction: "review-local-prepare",
    target: { headRef: "member-2", headSha: h.heads[1] } });
}, 60_000);
