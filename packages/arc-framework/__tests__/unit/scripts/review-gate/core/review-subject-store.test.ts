/** Stored branch ownership replaces branch-name inference in native review subject selection. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { resolveReviewSubject } from "../../../../../src/scripts/review-gate/core/review-subject.js";
import type { DeliveryMemberLookup } from "../../../../../src/scripts/review-gate/core/delivery-member-lookup.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099", headSha = "a".repeat(40);
const unbound = async () => ({ status: "unbound" as const });
const memberLookup: DeliveryMemberLookup = {
  resolveMemberByHead: unbound, resolveMemberByRef: unbound, resolveMemberByVehicle: unbound,
};
it("resolves a linked adopted head ref without a work-unit name in the branch", async () => {
  const harness = createReviewHarness();
  await harness.seedProject(projectId);
  await harness.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "opaque", linkedAs: "adopted", excluded: [] }],
  });
  const input = { store: harness.store, projectId: harness.projectId, headRef: "opaque", headSha, memberLookup };
  expect(await resolveReviewSubject(input)).toEqual({ status: "resolved", workUnitId: "example", member: null });
});

it("leaves an unlinked conventional branch unbound even when another repository links it", async () => {
  const harness = createReviewHarness();
  await harness.seedProject(projectId);
  await harness.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: "another-project", ref: "feat/unlinked", linkedAs: "adopted", excluded: [] }],
  });
  expect(await resolveReviewSubject({ store: harness.store, projectId: harness.projectId,
    headRef: "feat/unlinked", headSha, memberLookup })).toEqual({ status: "unbound" });
});
