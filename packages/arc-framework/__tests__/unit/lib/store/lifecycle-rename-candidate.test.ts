/** Rename uses stored Candidate ownership even when legacy metadata has no publication field. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../../../helpers/store/tracked-write-fixture.js";
import { readStoreRenameSubject } from "../../../../src/lib/store/lifecycle-rename.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";

it.each(["Active", "Shipped"] as const)("refuses an attested %s owner without changing its records, then admits rename after removal", async state => {
  const h = createReviewHarness();
  const primary = await h.seedMeta("example", { state, currentWorkflow: state === "Shipped" ? null : "process-task-loop" },
    state === "Shipped" ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" });
  const candidate = await h.seedCandidate(primary.reference.owner, candidateFixture());
  const version = lifecycleSuccess(await h.store.version());
  const request = { sourceSlug: "example", targetSlug: "renamed" };
  expect(await readStoreRenameSubject(h.store, request)).toMatchObject({ status: "refused",
    refusal: { condition: expect.stringContaining("Candidate publication state"), remedy: { text: expect.any(String) } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  lifecycleSuccess(await h.store.write({ action: "remove", reference: candidate.reference, expected: candidate.version,
    provenance: { verb: "remove-candidate", lifecycleAction: "edit" } }));
  expect(await readStoreRenameSubject(h.store, request)).toMatchObject({ status: "ok", result: { primary, resuming: false } });
});
