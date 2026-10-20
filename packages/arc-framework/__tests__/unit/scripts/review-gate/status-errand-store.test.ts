/** Native Errand status reads the stored claim without requiring checkout occupancy. */
import { expect, it, onTestFinished } from "vitest";
import { readStoredStatusErrandSelection } from "../../../../src/scripts/review-gate/status-errand-selection.js";
import { readErrandRoutedObligation } from "../../../../src/scripts/review-gate/status-errand.js";
import { createProjectIdentityReader } from "../../../../src/lib/store/project-identity.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../helpers/store/review-checkout.js";
import { scriptRawGitExec } from "../../../helpers/git-exec-fake.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { createReviewDecisionPort } from "../../../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../../../src/lib/store/kinds/review/decision/key.js";
import type { ReviewCeilingOverride, ReviewAdditionalPassAuthorization } from "../../../../src/scripts/review-gate/policy/review-policy-driver.js";

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
    ...[head, base].map(revision => ({ match: ["rev-parse", "--verify", `${revision}^{tree}`], responses: [{ stdout: "c".repeat(40) }] })),
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
    run: (grant: { ceilingOverride?: ReviewCeilingOverride; additionalPassAuthorization?: ReviewAdditionalPassAuthorization } = {}) => readErrandRoutedObligation({
    ...checkout, projectId: createProjectIdentityReader(checkout.store), rawExec,
    target: { repository: "owner/repository", headRef: branch, headSha: head }, pullRequest: 42,
    currentBaseOid: base, changeRequestCandidate: { baseRefName: "main", url: "https://github.com/owner/repository/pull/42" }, ...grant,
  }) };
}

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
