/** Malformed continuation references name their real producer, keep the parser's reason, and fit the storage arm. */
import { expect, it } from "vitest";
import { ZodError } from "zod";
import { HostedSettleEnvelopeSchema } from "../../../../../src/scripts/review-gate/hosted/settle.js";
import { ReviewContinuationReferenceError, resolveReviewOperationInvocation, reviewContinuationRequestError }
  from "../../../../../src/scripts/review-gate/runtime/continuation-invocation.js";
import { resolveReviewSourceInvocation } from "../../../../../src/scripts/review-gate/runtime/source-invocation.js";
import type { Store } from "../../../../../src/lib/store/contract.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";

const digest = `sha256:${"a".repeat(64)}`;
const settle = (response: Record<string, unknown>) => ({ schemaVersion: 1,
  response: { attemptRef: "hosted-attempt", dispositionSetId: digest, findingId: "finding-1", ...response },
  target: { repository: "example/repo", pullRequest: 1, headSha: "a".repeat(40) }, fixTarget: null, actorIdentity: "owner",
  finding: { commentId: "comment-1", threadId: "thread-1" }, disposition: "defer", reply: "Deferred." });

function settleError(response: Record<string, unknown>): ZodError {
  const parsed = HostedSettleEnvelopeSchema.safeParse(settle(response));
  if (parsed.success) throw new Error("expected the settle envelope to refuse");
  return parsed.error;
}

function inRepoInvocation() {
  const base = createReviewHarness().store;
  const store: Store = { ...base, capabilities: { ...base.capabilities, stateOffBranch: false },
    read: input => base.read(input), list: input => base.list(input), write: input => base.write(input),
    batch: input => base.batch(input), version: () => base.version(), history: input => base.history(input),
    changes: input => base.changes(input), lookup: input => base.lookup(input), push: input => base.push(input),
    pull: input => base.pull(input), maintain: () => base.maintain() };
  return { cwd: "/unavailable", exec: scriptGitExec([]).exec, store, projectId: async () => "project" };
}

it("reports a malformed settle reference against its producer, and leaves other response fields as schema errors", () => {
  const reference = reviewContinuationRequestError("review-hosted-settle", settleError({ attemptRef: "" }), true);
  expect(reference).toBeInstanceOf(ReviewContinuationReferenceError);
  expect((reference as Error).message).toContain("arc review hosted await");
  const container = settleError({ dispositionSetId: "not-a-digest" });
  expect(reviewContinuationRequestError("review-hosted-settle", container, true)).toBe(container);
});

it("keeps the source parser's reason in the reference error", async () => {
  const error = await resolveReviewSourceInvocation(inRepoInvocation(), "git-common:review-gate/evidence/receipts-v2.json#1",
    "frontline").catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ReviewContinuationReferenceError);
  expect((error as Error).message).toContain("review source reference kind mismatch");
});

it("tells an in-repo caller to omit an operation reference rather than resubmit one", async () => {
  const error = await resolveReviewOperationInvocation(inRepoInvocation(), { operationId: "operation-1",
    operationRef: "native-reference" }, "arc review local prepare").catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ReviewContinuationReferenceError);
  expect((error as Error).message).toContain("omit `operationRef`");
  expect((error as Error).message).not.toContain("resubmit");
  const accepted = await resolveReviewOperationInvocation(inRepoInvocation(), { operationId: "operation-1" },
    "arc review local prepare");
  expect(accepted).toMatchObject({ store: { capabilities: { stateOffBranch: false } } });
});
