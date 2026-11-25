import { expect, it } from "vitest";
import { resolveReviewInvocation } from "../../../../../src/scripts/review-gate/runtime/invocation.js";
import { storedLocalApproval } from "../../../../fixtures/review-family-access.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createReviewEvidencePort } from "../../../../../src/lib/store/kinds/review/evidence/access.js";

it("retains the injected project and work-item state across a nested invocation", async () => {
  const { harness, owner, original, fixture, evidence } = await storedLocalApproval();
  const exec = scriptGitExec([]).exec;
  const first = resolveReviewInvocation({ cwd: "/unavailable", exec, store: harness.store, workItem: owner });
  const nested = resolveReviewInvocation({ cwd: "/different-materialization", exec, ...first });
  expect(await nested.projectId()).toBe(fixture.state.repositoryId);
  const approvals = createReviewEvidencePort(nested.store, nested.workItem!);
  expect(await approvals.readDispositionRecord(original.operationId)).toEqual(await evidence.readDispositionRecord(original.operationId));
});
