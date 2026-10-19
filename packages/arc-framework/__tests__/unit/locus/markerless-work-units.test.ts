/** Only owned, linked work with a present unclaimed checkout is offered in place. */
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { expect, it } from "vitest";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { findMarkerlessWorkUnitCheckouts } from "../../../src/lib/locus/markerless-work-units.js";
import { DerivedCheckoutRowSchema } from "../../../src/lib/locus/derived-schema.js";

function unclaimed(path: string, branch: string, folderPresent = true) {
  return DerivedCheckoutRowSchema.parse({ kind: "unmanaged-checkout", subject: null, markerGeneration: null, parentCheckoutPath: null,
    origin: null, identity: null, context: null, lifecycleLocation: null, diagnostics: [],
    checkout: { path, branch, folderPresent, primary: false, detached: false, head: "a".repeat(40) } });
}
it("finds owned in-flight work at its linked, present markerless checkout", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("demo", { state: "Active", owner: "andrew", branch: null }, { kind: "active" },
    { branches: [{ repository: "project", ref: "feat/demo", linkedAs: "adopted", excluded: [] }] });
  expect(await findMarkerlessWorkUnitCheckouts({ store: h.store, identity: "andrew", projectId: async () => "project",
    roster: [unclaimed("/repo/demo", "feat/demo"), unclaimed("/repo/missing", "feat/demo", false)] }))
    .toEqual([{ workUnit: "demo", checkoutPath: "/repo/demo" }]);
});

it("passes over another owner's work, branchless work and existing markers", async () => {
  const h = createLifecycleHarness();
  for (const [slug, owner, branch] of [["other", "another", "feat/other"], ["branchless", "andrew", null], ["on-base", "andrew", "main"]] as const) {
    await h.seedMeta(slug, { state: "Active", owner, branch }, { kind: "active" }, owner === "another"
      ? { branches: [{ repository: "project", ref: "feat/other", linkedAs: "adopted", excluded: [] }] } : undefined);
  }
  await h.seedMeta("marked", { owner: "andrew" }, { kind: "active" },
    { branches: [{ repository: "project", ref: "feat/marked", linkedAs: "adopted", excluded: [] }] });
  const claimed = { ...unclaimed("/repo/marked", "feat/marked"), markerGeneration: `sha256:${"b".repeat(64)}` };
  expect(await findMarkerlessWorkUnitCheckouts({ store: h.store, identity: "andrew", projectId: async () => "project",
    roster: [unclaimed("/repo/other", "feat/other"), unclaimed("/repo/base", "main"), claimed] })).toEqual([]);
});

it("reads the project identity from its store when no port is injected", async () => {
  const h = createLifecycleHarness();
  const project = await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "demo-project" })), "{}");
  if (!("uid" in project.reference.owner) || project.reference.owner.uid === undefined) throw new Error("Expected project UID");
  await h.seedMeta("demo", { owner: "andrew" }, { kind: "active" },
    { branches: [{ repository: project.reference.owner.uid, ref: "feat/demo", linkedAs: "adopted", excluded: [] }] });
  expect(await findMarkerlessWorkUnitCheckouts({ store: h.store, identity: "andrew", roster: [unclaimed("/repo/demo", "feat/demo")] }))
    .toEqual([{ workUnit: "demo", checkoutPath: "/repo/demo" }]);
});
