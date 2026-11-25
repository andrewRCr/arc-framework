/** Root choices retain a canonical complete inventory and explicit attribution. */
import { expect, it } from "vitest";
import { OwnerIdentitySchema } from "../../../../../../src/lib/store/identity.js";
import { ReviewEvidenceRootSelectionSchema } from "../../../../../../src/lib/store/kinds/review/evidence-root-selection/schema.js";
import { reviewEvidenceRootSelectionKey } from "../../../../../../src/lib/store/kinds/review/evidence-root-selection/key.js";

const roots = ["sha256:" + "a".repeat(64), "sha256:" + "b".repeat(64)];
const value = { schemaVersion: 1, producerId: "producer-1", outcomeKey: "outcome-1", resultDigest: "sha256:" + "c".repeat(64),
  roots, selectedRoot: roots[0], decidedBy: "andrew", decidedAt: "2026-11-03T10:00:00-06:00", reason: "Continue this response." };

it("requires at least two sorted unique roots and a choice in that exact inventory", () => {
  expect(ReviewEvidenceRootSelectionSchema.safeParse(value).success).toBe(true);
  for (const changes of [{ roots: [roots[0]] }, { roots: [roots[1], roots[0]] }, { roots: [roots[0], roots[0]] },
    { selectedRoot: value.resultDigest }]) {
    expect(ReviewEvidenceRootSelectionSchema.safeParse({ ...value, ...changes }).success).toBe(false);
  }
});

it("requires an explicit decider, offset timestamp, and nonempty reason", () => {
  for (const changes of [{ decidedBy: null }, { decidedAt: "2026-11-03T10:00:00" }, { reason: " " }]) {
    expect(ReviewEvidenceRootSelectionSchema.safeParse({ ...value, ...changes }).success).toBe(false);
  }
});

it("keys only the exact owner generation and producer", () => {
  const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: "123e4567-e89b-42d3-a456-426614174000" });
  const key = reviewEvidenceRootSelectionKey(owner, value.producerId);
  expect(reviewEvidenceRootSelectionKey(OwnerIdentitySchema.parse({ ...owner, name: "renamed" }), value.producerId)).toBe(key);
  expect(reviewEvidenceRootSelectionKey(OwnerIdentitySchema.parse({ ...owner, uid: "123e4567-e89b-42d3-a456-426614174001" }), value.producerId)).not.toBe(key);
  expect(reviewEvidenceRootSelectionKey(owner, "producer-2")).not.toBe(key);
});
