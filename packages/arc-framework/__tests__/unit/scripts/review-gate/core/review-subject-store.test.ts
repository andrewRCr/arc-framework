/** Stored branch ownership replaces branch-name inference in native review subject selection. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { resolveReviewSubject } from "../../../../../src/scripts/review-gate/core/review-subject.js";
import type { DeliveryMemberLookup } from "../../../../../src/scripts/review-gate/core/delivery-member-lookup.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099", headSha = "a".repeat(40);
const unbound = async () => ({ status: "unbound" as const });
const memberLookup: DeliveryMemberLookup = {
  resolveMemberByHead: unbound, resolveMemberByRef: unbound, resolveMemberByVehicle: unbound,
};
it("resolves a linked adopted head ref without a work-unit name in the branch", async () => {
  const harness = createReviewHarness();
  await harness.seedProject(projectId);
  const primary = await harness.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "opaque", linkedAs: "adopted", excluded: [] }],
  });
  const input = { store: harness.store, projectId: harness.projectId, headRef: "opaque", headSha, memberLookup };
  expect(await resolveReviewSubject(input)).toEqual({ status: "resolved", workUnitId: "example", member: null,
    workItem: primary.reference.owner });
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

it("returns the linked primary's generation after its slug is reused", async () => {
  const h = createReviewHarness();
  await h.seedProject(projectId);
  const links = { branches: [{ repository: projectId, ref: "opaque", linkedAs: "adopted" as const, excluded: [] }] };
  const original = await h.seedMeta("example", { branch: null }, { kind: "active" }, links);
  const input = { store: h.store, projectId: h.projectId, headRef: "opaque", headSha, memberLookup };
  const selected = await resolveReviewSubject(input);
  lifecycleSuccess(await h.store.write({ action: "remove", reference: original.reference, expected: original.version,
    provenance: { verb: "remove-fixture", lifecycleAction: "remove" } }));
  const replacement = await h.seedMeta("example", { branch: null }, { kind: "active" }, links);
  expect(replacement.reference.owner).not.toEqual(original.reference.owner);
  expect(selected).toMatchObject({ workItem: original.reference.owner });
  expect(await resolveReviewSubject(input)).toMatchObject({ workItem: replacement.reference.owner });
});
