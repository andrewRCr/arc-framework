/** Default status and delivery admission bind native authority selected by production vehicle lookup. */
import { expect, it } from "vitest";
import { createNativeDeliveryReviewRepository } from "../helpers/store/native-delivery-repository.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import { ChangeRequestResolveResultSchema } from "../../src/scripts/review-gate/change-request.js";
import { ReviewStatusCommandResultSchema } from "../../src/scripts/review-gate/status.js";
import { LocalPrepareEnvelopeSchema, LocalResumeEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { parseNativeReviewOperationReference } from "../../src/scripts/review-gate/core/review-operation-reference.js";
import { handleReviewChangeRequestResolve, handleReviewStatus, handleReviewLocalPrepare, handleReviewLocalResume } from "../../src/handlers/review.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import type { OwnerIdentity } from "../../src/lib/store/identity.js";

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
  const status = async (workItem?: OwnerIdentity) => {
    let output = "";
    await handleReviewStatus({ target: JSON.stringify(resolved.targetRef), source: "delegated-agent", coverage: "complete" }, undefined,
      { resolveRoot: () => h.cwd, write: text => { output += text; }, setExitCode: () => {} },
      { store: h.reference.store, projectId: createProjectIdentityReader(h.reference.store), ...(workItem === undefined ? {} : { workItem }) });
    return ReviewStatusCommandResultSchema.parse(JSON.parse(output));
  };
  return { ...h, status };
}

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
