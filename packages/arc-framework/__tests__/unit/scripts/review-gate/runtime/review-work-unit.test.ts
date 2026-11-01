/** A named review invocation binds that work unit's exact native generation, never a selection for another one. */
import { expect, it } from "vitest";
import { OwnerIdentitySchema } from "../../../../../src/lib/store/identity.js";
import { resolveNamedReviewWorkUnitInvocation } from "../../../../../src/scripts/review-gate/runtime/review-work-unit.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createLifecycleHarness } from "../../../../helpers/store/lifecycle-harness.js";

const { exec } = scriptGitExec([]);

it("refuses a retained selection for another work unit, and binds the named one's generation without it", async () => {
  const h = createLifecycleHarness();
  const other = (await h.seedMeta("other")).reference.owner, { owner } = (await h.seedMeta("example")).reference;
  const input = { cwd: "/unavailable", exec, store: h.store };
  await expect(resolveNamedReviewWorkUnitInvocation({ ...input, workItem: other }, "example")).rejects.toMatchObject({
    code: "invalid-input", condition: "The selected work item `other` is not work unit `example`.",
    remedy: { text: "Name work unit `other`, or run the command from `example`'s checkout." } });
  expect((await resolveNamedReviewWorkUnitInvocation(input, "example")).workItem).toEqual(owner);
  expect((await resolveNamedReviewWorkUnitInvocation({ ...input, workItem: owner }, "example")).workItem).toEqual(owner);
});

it("rebinds a retained selection carrying a work item's earlier name to its current name under the same UID", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  const earlier = OwnerIdentitySchema.parse({ ...owner, name: "earlier-example" });
  const input = { cwd: "/unavailable", exec, store: h.store, workItem: earlier };
  expect((await resolveNamedReviewWorkUnitInvocation(input, "example")).workItem).toEqual(owner);
});
