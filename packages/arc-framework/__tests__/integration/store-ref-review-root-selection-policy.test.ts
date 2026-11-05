/** Multiple protected approvals remain an explicit unsupported policy outcome with no mutation. */
import { expect, it } from "vitest";
import { competingReviewRoots } from "../helpers/store/competing-review-roots.js";
import { runReviewRootRepair } from "../../src/lib/store/review-root-repair.js";
import { runArcWithStdin } from "../e2e/helpers.js";
import { ReviewRootRepairResultSchema } from "../../src/lib/store/review-root-repair-schema.js";

it.each(["default", "separate"] as const)("blocks exclusion of either present empty settlement (%s)", async layout => {
  const f = await competingReviewRoots(layout, "hosted");
  for (const record of [f.fix, f.defer]) expect(record.value.settlement).toMatchObject({ evidence: [] });
  const before = await f.nativeB.evidence.list();
  const request = { schemaVersion: 1, operation: "preview", workItem: f.owner, producerId: f.outcome.attemptId };
  expect(await runReviewRootRepair({ store: f.b.store, request, now: () => "2026-11-03T10:00:00Z" }))
    .toMatchObject({ status: "ok", result: { state: "policy-blocked", retryable: false, eligibleChoices: [],
      selector: { value: null, observation: { expected: null } },
      branches: expect.arrayContaining([expect.objectContaining({ records: [expect.objectContaining({ settled: true })] })]) } });
  const output = await runArcWithStdin(["store", "repair-review-roots", "-"], f.b.root, JSON.stringify(request));
  expect(output.exitCode).toBe(1);
  const result = ReviewRootRepairResultSchema.parse(JSON.parse(output.stdout));
  expect(result).toMatchObject({ status: "ok", result: { state: "policy-blocked", retryable: false } });
  if (result.status !== "ok" || result.result.state !== "policy-blocked") throw new Error("Expected explicit policy boundary");
  expect(await f.b.store.read({ reference: result.result.selector.observation.reference }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(await f.nativeB.evidence.list()).toEqual(before);
  await expect(f.nativeB.responses.read(f.outcome.attemptId, "producer-result")).rejects.toMatchObject({
    refusal: { code: "record-malformed", rule: "review.evidence.root" } });
}, 180_000);
