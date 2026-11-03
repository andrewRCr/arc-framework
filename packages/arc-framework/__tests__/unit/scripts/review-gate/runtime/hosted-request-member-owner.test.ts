/** A native hosted request binds its delivery member's stored work unit, and refuses actionably when none is stored. */
import { expect, it } from "vitest";
import { HostedRequestEnvelopeSchema } from "../../../../../src/scripts/review-gate/hosted/request.js";
import { resolveHostedRequestInvocation } from "../../../../../src/scripts/review-gate/runtime/hosted-invocation.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { SlugSchema } from "../../../../../src/lib/kernel/index.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";

const head = "c".repeat(40);
const request = HostedRequestEnvelopeSchema.parse({ schemaVersion: 1, provider: "codex-pr", coverage: "complete",
  target: { repository: "owner/repo", pullRequest: 42, headSha: head },
  vehicle: { kind: "delivery-member", workUnitId: "example", planId: "123e4567-e89b-42d3-a456-426614174002",
    deliverableId: `sha256:${"7".repeat(64)}`, head } });

it("refuses a member whose work unit is not stored as invalid input, and binds it once stored", async () => {
  const h = createReviewHarness();
  await h.seedProject("123e4567-e89b-42d3-a456-426614174099");
  const options = { cwd: "/unavailable", exec: scriptGitExec([]).exec, store: h.store, projectId: h.projectId };

  await expect(resolveHostedRequestInvocation(options, request, null)).rejects.toMatchObject({ code: "invalid-input",
    message: expect.stringContaining("Name the member's stored work unit, then retry arc review hosted request -.") });
  const primary = await h.seedMeta("example");
  expect(await resolveHostedRequestInvocation(options, request, null)).toMatchObject({ workItem: primary.reference.owner });
});

it.each([false, true])("corroborates a fresh member owner by generation (matching name: %s)", async matchingName => {
  const h = createReviewHarness();
  await h.seedProject("123e4567-e89b-42d3-a456-426614174099");
  const primary = await h.seedMeta("example"), foreign = await h.seedMeta("elsewhere");
  const options = { cwd: "/unavailable", exec: scriptGitExec([]).exec, store: h.store, projectId: h.projectId };
  const workItem = { ...foreign.reference.owner, ...(matchingName ? { name: SlugSchema.parse("example") } : {}) };
  await expect(resolveHostedRequestInvocation({ ...options, workItem }, request, null))
    .rejects.toMatchObject({ code: "invalid-input" });
  expect((await resolveHostedRequestInvocation({ ...options, workItem: primary.reference.owner }, request, null)).workItem)
    .toEqual(primary.reference.owner);
});

it("retains the member's current name when fresh selection corroborates an earlier name under its UID", async () => {
  const h = createReviewHarness();
  await h.seedProject("123e4567-e89b-42d3-a456-426614174099");
  const { owner } = (await h.seedMeta("example")).reference;
  const input = { cwd: "/unavailable", exec: scriptGitExec([]).exec, store: h.store, projectId: h.projectId,
    workItem: { ...owner, name: SlugSchema.parse("former-name") } };
  expect((await resolveHostedRequestInvocation(input, request, null)).workItem).toEqual(owner);
});
