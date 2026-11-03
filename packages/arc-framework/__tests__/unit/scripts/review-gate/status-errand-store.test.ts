/** Native Errand status reads the stored claim without requiring checkout occupancy. */
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { readStoredStatusErrandSelection } from "../../../../src/scripts/review-gate/status-errand-selection.js";
import { readErrandRoutedObligation } from "../../../../src/scripts/review-gate/status-errand.js";
import { createProjectIdentityReader } from "../../../../src/lib/store/project-identity.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../helpers/store/review-checkout.js";
import { scriptRawGitExec } from "../../../helpers/git-exec-fake.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordKey } from "../../../helpers/store/model.js";
import { createReviewDecisionPort } from "../../../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../../../src/lib/store/kinds/review/decision/key.js";
import type { ReviewCeilingOverride, ReviewAdditionalPassAuthorization } from "../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import type { OwnerIdentity } from "../../../../src/lib/store/identity.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { localOutcome } from "../../../fixtures/review-outcome.js";
import { createReviewOutcomePort } from "../../../../src/lib/store/kinds/review/outcome/access.js";
import { ReviewOutcomeSchema } from "../../../../src/lib/store/kinds/review/outcome/schema.js";
import { createReviewTarget } from "../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../../../src/scripts/review-gate/policy/standard-review.js";
import { createReviewEvidencePort } from "../../../../src/lib/store/kinds/review/evidence/access.js";
import { composeReviewDispositionRecord } from "../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { performedEvidenceFixture } from "../../../fixtures/review-evidence.js";
import { publishNativeReviewApproval } from "../../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { publishNativeConditionalPass } from "../../../../src/scripts/review-gate/runtime/native-conditional-pass.js";
import { publishNativeReviewPerformance } from "../../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { createFixAuthorization, consumeFixAuthorization } from "../../../../src/scripts/review-gate/core/fix-authorization.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
const head = "a".repeat(40), branch = "chore/repair";
const base = "b".repeat(40);
async function fixture(project = true, owner = "test-user") {
  const h = createReviewHarness();
  if (project) await h.seedProject(projectId);
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
    claimId: "1".repeat(32), intent: "Repair one issue", owner, origin: "description", originEntry: null,
    branch, state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
  if (record.kind !== "errand") throw new Error("Expected ordinary Errand");
  const primary = await h.seedErrand(record);
  let branchHead = head;
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["merge-base", "--all", head, base], responses: [{ stdout: base }] },
    ...[base, head].map(revision => ({ match: ["merge-base", "--is-ancestor", base, revision], responses: [{ stdout: "" }] })),
    ...[head, base].map(revision => ({ match: ["rev-parse", "--verify", `${revision}^{tree}`], responses: [{ stdout: "c".repeat(40) }] })),
    { match: ["merge-base", "--is-ancestor", "c".repeat(40), head], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", "--end-of-options", `refs/remotes/origin/${branch}^{commit}`],
      responses: [() => ({ stdout: branchHead })] },
    { match: ["rev-parse", "--verify", "--end-of-options", `refs/heads/${branch}^{commit}`],
      responses: [() => ({ stdout: branchHead })] },
    { match: ["ls-remote", "--heads", "origin", `refs/heads/${branch}`],
      responses: [() => ({ stdout: `${branchHead}\trefs/heads/${branch}` })] },
  ] });
  onTestFinished(checkout.cleanup);
  const rawExec = scriptRawGitExec([]).exec;
  return { ...checkout, record, primary, moveHead: (value: string) => { branchHead = value; },
    run: (grant: { ceilingOverride?: ReviewCeilingOverride; additionalPassAuthorization?: ReviewAdditionalPassAuthorization; sourceId?: string } = {},
      store: Store = checkout.store, workItem?: OwnerIdentity) => readErrandRoutedObligation({
    ...checkout, store, ...(workItem === undefined ? {} : { workItem }), projectId: createProjectIdentityReader(store), rawExec,
    target: { repository: "owner/repository", headRef: branch, headSha: head }, pullRequest: 42,
    currentBaseOid: base, changeRequestCandidate: { baseRefName: "main", url: "https://github.com/owner/repository/pull/42" }, ...grant,
  }) };
}

it("relays an unconsumed conditional approval for an Errand's complete hosted pass at the ceiling", async () => {
  const h = await fixture(), priorHead = "c".repeat(40);
  await appendFile(join(h.cwd, ".arc/system/arc-config.yml"), "review.standard_sources: [coderabbit-pr,delegated-agent]\n");
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: projectId, baseRef: "main", diffBaseSha: base, diffBaseTree: "c".repeat(40), headSha: priorHead, headTree: "d".repeat(40) });
  const outcomes = createReviewOutcomePort(h.store, h.primary.reference.owner);
  const evidence = createReviewEvidencePort(h.store, h.primary.reference.owner);
  const decisions = createReviewDecisionPort(h.store, h.primary.reference.owner);
  const makeOutcome = (logicalPass: number) => {
    const value = localOutcome({ target, logicalPass, lineage: { kind: "head-bound", vehicleKind: "errand",
      vehicleIdentity: h.record.claimId, headSha: priorHead }, vehicle: { kind: "errand", identity: h.record.slug, claimId: h.record.claimId },
      ...(logicalPass === 2 ? { outcome: "findings" as const, findings: [{ findingId: "finding-1", severity: "minor" as const,
        locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] } : {}) });
    return ReviewOutcomeSchema.parse({ ...value, local: { ...value.local, rubricIdentity: STANDARD_REVIEW_RUBRIC_IDENTITY } });
  };
  await outcomes.create(makeOutcome(1));
  const outcome = makeOutcome(2);
  await outcomes.create(outcome);
  const { value } = performedEvidenceFixture("errand", outcome);
  if (value.performance?.fixResponse === undefined) throw new Error("Expected the fix transition");
  const { performance: original, ...approved } = value;
  const binding = { kind: "errand" as const, errand: { key: h.record.slug, claimId: h.record.claimId, branch: h.record.branch } };
  const record = composeReviewDispositionRecord(outcome, [{ ...approved, binding }], h.primary.reference.owner);
  const ports = { outcomes, evidence, decisions, readProjectId: h.projectId };
  await publishNativeReviewApproval({ ...ports, record, now: () => "2026-10-20T12:01:00Z" });
  const captured = await publishNativeConditionalPass({ ...ports, capture: { lane: "standard", repositoryId: projectId,
    headSha: priorHead, lineage: outcome.lineage, producerId: outcome.attemptId,
    dispositionSetId: approved.dispositionSet.dispositionSetId, authorizedBy: approved.approval.approvedBy,
    exhaustedPassCount: 2, nextPass: 3, now: "2026-10-20T12:02:00Z" } });
  const { targetId: ignored, ...coordinates } = target;
  void ignored;
  const current = createReviewTarget({ ...coordinates, headSha: head, headTree: "c".repeat(40) });
  const authorization = createFixAuthorization({ oldTarget: target, dispositionState: { schemaVersion: 2,
    semanticsVersion: "review-gate/v2", state: "approved", dispositionSet: approved.dispositionSet, approval: approved.approval } });
  const fixConsumption = consumeFixAuthorization({ authorization, oldTarget: target, newTarget: current, appliedBy: "andrew",
    consumedAt: "2026-10-20T12:03:00Z", verificationRefs: ["test:passed"], priorConsumptions: [] });
  const performance = { ...original, producedHeadSha: head,
    fixResponse: { ...original.fixResponse, newTarget: current, fixConsumption }, performedAt: "2026-10-20T12:04:00Z" };
  await publishNativeReviewPerformance({ ...ports, record, performance });
  const version = lifecycleSuccess(await h.store.version()), before = await decisions.list();
  const omitted = await h.run({ sourceId: "coderabbit-pr" });
  expect(omitted, JSON.stringify(omitted)).toMatchObject({ state: "approval-required" });
  const ceilingOverride = { target: { repository: "owner/repository", pullRequest: 42, headSha: head }, lane: "standard" as const,
    exhaustedPassCount: 2, nextPass: 3, conditionalPassAuthorizationId: reviewDecisionKey(captured.value) };
  const result = await h.run({ ceilingOverride, sourceId: "coderabbit-pr" });
  expect(result, JSON.stringify(result)).toMatchObject({ state: "review-required", action: { provider: "coderabbit-pr",
    coverage: "complete", ceilingOverride } });
  expect(await decisions.list()).toEqual(before);
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});

it("drops a spent keyless additional-pass input on native Errand re-entry without renewing authority", async () => {
  const h = await fixture();
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: projectId, baseRef: "main", diffBaseSha: base, diffBaseTree: "c".repeat(40), headSha: head, headTree: "c".repeat(40) });
  const outcomes = createReviewOutcomePort(h.store, h.primary.reference.owner);
  const producers = [];
  for (let logicalPass = 1; logicalPass <= 3; logicalPass++) {
    const value = localOutcome({ target, logicalPass, lineage: { kind: "head-bound", vehicleKind: "errand",
      vehicleIdentity: h.record.claimId, headSha: head }, vehicle: { kind: "errand", identity: h.record.slug, claimId: h.record.claimId } });
    const outcome = ReviewOutcomeSchema.parse({ ...value, local: { ...value.local, rubricIdentity: STANDARD_REVIEW_RUBRIC_IDENTITY } });
    await outcomes.create(outcome);
    producers.push(outcome);
  }
  const decisions = createReviewDecisionPort(h.store, h.primary.reference.owner);
  const before = await decisions.list(), version = lifecycleSuccess(await h.store.version());
  const spent = await h.run({ additionalPassAuthorization: { target: { repository: "owner/repository", pullRequest: 42, headSha: head },
    lane: "standard", precedingProducerId: producers[1]!.attemptId, completedPasses: 2, nextPass: 3 } });
  expect(spent, JSON.stringify(spent)).toMatchObject({ state: "settled" });
  expect(await h.run()).toEqual(spent);
  expect(await decisions.list()).toEqual(before);
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});

it.each(["ceiling", "additional"] as const)("records a native %s grant before the unrecorded-lane return and relays its key", async kind => {
  const h = await fixture();
  const target = { repository: "owner/repository", pullRequest: 42, headSha: head };
  const grant = kind === "ceiling" ? { ceilingOverride: { target, lane: "standard" as const, exhaustedPassCount: 0, nextPass: 1 } }
    : { additionalPassAuthorization: { target, lane: "standard" as const, precedingProducerId: "previous-result", completedPasses: 0, nextPass: 1 } };
  expect(await h.run(grant)).toMatchObject({ state: "review-required" });
  const decisions = createReviewDecisionPort(h.store, h.primary.reference.owner), listing = await decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  expect(listing.records).toHaveLength(1);
  const record = listing.records[0]!;
  expect(record.value).toMatchObject({ decidedBy: "test-user", subject: { lineage: { kind: "head-bound", vehicleKind: "errand",
    vehicleIdentity: h.record.claimId }, headSha: head }, choice: { kind: "extra-pass", precondition: { kind } } });
  const field = kind === "ceiling" ? "ceilingOverride" : "additionalPassAuthorization", key = reviewDecisionKey(record.value);
  const version = lifecycleSuccess(await h.store.version());
  expect(await h.run({ [field]: { ...grant[field], decisionKey: key } })).toMatchObject({ state: "review-required" });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  expect(await decisions.read(key)).toEqual(record);
});

it("reports the unrecorded native lane from the actual stored Errand without an injected owner or marker", async () => {
  const h = await fixture();
  const version = lifecycleSuccess(await h.store.version());
  const result = await h.run();
  expect(result, JSON.stringify(result)).toEqual({ state: "review-required", detail: "No standard review is recorded for this Errand head." });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});

it("retains project-identity refusal and reads the lane after the project is restored", async () => {
  const h = await fixture(false);
  await expect(h.run()).rejects.toMatchObject({ name: "ProjectIdentityError", failure: { reason: "Project identity record is missing.", remedy: { text: expect.stringContaining("Restore") } } });
  await h.seedProject(projectId);
  expect(await h.run()).toMatchObject({ state: "review-required" });
});

it("keeps exact-head refusal and reads the lane after the branch is repaired", async () => {
  const h = await fixture();
  h.moveHead("b".repeat(40));
  expect(await h.run()).toEqual({ state: "blocked", detail: "The Errand identity's branch does not match the exact review head." });
  h.moveHead(head);
  expect(await h.run()).toMatchObject({ state: "review-required" });
});

it("retains the exact primary generation returned by stored claim selection", async () => {
  const h = await fixture();
  expect(await readStoredStatusErrandSelection(h.store, "test-user", {
    repository: "owner/repository", headRef: branch, headSha: head,
  })).toMatchObject({ kind: "matched", record: { claimId: h.record.claimId }, workItem: h.primary.reference.owner });
});

it("keeps claim selection scoped to the current identity", async () => {
  const h = await fixture(true, "another-user");
  expect(await h.run()).toBeNull();
});

it("selects this identity's Errand past another owner's malformed record, refusing absence only while it stays malformed", async () => {
  const h = await fixture();
  const foreign = TransientIdentityRecordSchema.parse({ ...h.record, slug: "elsewhere", claimId: "2".repeat(32),
    owner: "other-user", branch: "chore/elsewhere" });
  if (foreign.kind !== "errand") throw new Error("Expected ordinary Errand");
  const { reference } = await h.seedErrand(foreign);
  const saved = h.store.state.snapshots.get(lifecycleSuccess(await h.store.version()))?.get(recordKey(reference));
  if (saved === undefined) throw new Error("Expected the foreign Errand in the saved state");
  const original = saved.content;
  saved.content = "{not an Errand";
  const target = { repository: "owner/repository", headRef: branch, headSha: head };
  expect(await readStoredStatusErrandSelection(h.store, "test-user", target)).toMatchObject({ kind: "matched", record: h.record });
  expect(await readStoredStatusErrandSelection(h.store, "someone-else", target)).toMatchObject({ kind: "blocked",
    detail: expect.stringContaining("incomplete") });
  saved.content = original;
  expect(await readStoredStatusErrandSelection(h.store, "someone-else", target)).toEqual({ kind: "none" });
});

it("raises a native outcome-listing refusal from the Errand's lane read, and reads the lane after repair", async () => {
  const h = await fixture();
  let unreadable = true;
  const store = Object.create(h.store) as Store;
  store.list = async input => unreadable && input.kind === "review/outcome" ? { status: "ok", result: { status: "unreadable",
    condition: "The review outcome index cannot be read.", remedy: { text: "Restore the review outcome index, then retry." } } }
    : h.store.list(input);
  await expect(h.run({}, store)).rejects.toMatchObject({ name: "StoreRefusalError", offBranch: true,
    message: expect.stringContaining("The review outcome index cannot be read.") });
  unreadable = false;
  expect(await h.run({}, store)).toMatchObject({ state: "review-required" });
});

it.each(["version", "list"] as const)("preserves a native %s refusal during Errand acquisition and retries after repair", async method => {
  const h = await fixture();
  const refusal = StoreRefusalSchema.parse({ code: "record-malformed", class: "recoverable", reference: h.primary.reference,
    rule: "fixture.inventory", condition: "The selected Errand inventory cannot be acquired.",
    remedy: { text: "Restore the selected inventory, then retry.", argv: ["arc", "store", "status", "--json"] } });
  const store = Object.create(h.store) as Store;
  let broken = true;
  if (method === "version") store.version = async () => broken ? { status: "refused", refusal } : h.store.version();
  else store.list = async input => broken && input.kind === "work-item/record"
    ? { status: "refused", refusal } : h.store.list(input);
  await expect(h.run({}, store)).rejects.toMatchObject({ name: "StoreRefusalError", offBranch: true, refusal });
  broken = false;
  expect(await h.run({}, store)).toMatchObject({ state: "review-required" });
});

it("refuses an injected different Errand generation before recording grants and continues with the selected owner", async () => {
  const h = await fixture();
  const foreign = TransientIdentityRecordSchema.parse({ ...h.record, slug: "elsewhere", claimId: "2".repeat(32), branch: "chore/elsewhere" });
  if (foreign.kind !== "errand") throw new Error("Expected an Errand");
  const other = await h.seedErrand(foreign);
  const grant = { ceilingOverride: { target: { repository: "owner/repository", pullRequest: 42, headSha: head },
    lane: "standard" as const, exhaustedPassCount: 0, nextPass: 1 } };
  const before = lifecycleSuccess(await h.store.version());
  expect(await h.run(grant, h.store, other.reference.owner)).toMatchObject({ state: "blocked",
    detail: expect.stringContaining("generation") });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await h.run(grant, h.store, h.primary.reference.owner)).toMatchObject({ state: "review-required" });
  const own = await createReviewDecisionPort(h.store, h.primary.reference.owner).list();
  const foreignDecisions = await createReviewDecisionPort(h.store, other.reference.owner).list();
  expect(own).toMatchObject({ status: "complete", records: [expect.anything()] });
  expect(foreignDecisions).toMatchObject({ status: "complete", records: [] });
});
