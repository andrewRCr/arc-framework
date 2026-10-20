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

const projectId = "123e4567-e89b-42d3-a456-426614174099";
const head = "a".repeat(40), branch = "chore/repair";
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
    { match: ["rev-parse", "--verify", "--end-of-options", `refs/remotes/origin/${branch}^{commit}`],
      responses: [() => ({ stdout: branchHead })] },
    { match: ["rev-parse", "--verify", "--end-of-options", `refs/heads/${branch}^{commit}`],
      responses: [() => ({ stdout: branchHead })] },
    { match: ["ls-remote", "--heads", "origin", `refs/heads/${branch}`],
      responses: [() => ({ stdout: `${branchHead}\trefs/heads/${branch}` })] },
  ] });
  onTestFinished(checkout.cleanup);
  const rawExec = scriptRawGitExec([]).exec;
  return { ...checkout, record, primary, moveHead: (value: string) => { branchHead = value; }, run: () => readErrandRoutedObligation({
    ...checkout, projectId: createProjectIdentityReader(checkout.store), rawExec,
    target: { repository: "owner/repository", headRef: branch, headSha: head }, pullRequest: 42,
  }) };
}

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
