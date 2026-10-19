/** Store membership offers released work without remote discovery and isolates lookup failures. */
import { createStore, createDefaultStorePorts } from "../../../src/lib/store/index.js";
import { expect, it } from "vitest";
import { findMaterializableWorkUnits, MaterializableWorkUnitsResultSchema } from "../../../src/lib/session-init/materializable-work-units.js";
import type { StoreInFlightWorkUnit } from "../../../src/lib/git/in-flight-store.js";
import { MetaPauseSchema } from "../../../src/lib/active/meta-schema.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaPause } from "../../../src/lib/store/kinds/meta/writers.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
const entry = (name: string, branch?: string): StoreInFlightWorkUnit => ({ kind: "work-unit", name, state: "Active", owner: "andrew", remoteOnly: false, dependsOn: [], ...(branch === undefined ? {} : { branch }) });

it("offers released and branchless work with no remote, leaving held and paused work out", async () => {
  const h = createLifecycleHarness();
  const entries = [entry("released", "feat/released"), entry("branchless"), entry("held"), entry("paused")];
  for (const item of entries) {
    const meta = await h.seedMeta(item.name, { owner: "andrew" });
    if (item.name === "paused") lifecycleSuccess(await h.store.write({ ...recordPut(meta, { content: writeMetaPause(meta.content,
      MetaPauseSchema.parse({ pausedBy: "andrew", since: "2026-10-01T00:00:00Z", reason: "Wait" })) }),
      provenance: { verb: "pause", lifecycleAction: "pause" } }));
  }
  const result = await findMaterializableWorkUnits({ entries, store: h.store, identity: "andrew", findHoldingCheckout: async slug => slug === "held" ? "/held" : null });
  expect(result.candidates.map(item => item.name)).toEqual(["branchless", "released"]);
  expect(result.candidates[0]).not.toHaveProperty("branch");
  expect(MaterializableWorkUnitsResultSchema.parse(result)).toEqual(result);
});
it("gives markerless pairs their exact --here action and leaves a missing folder on the ordinary form", async () => {
  const h = createLifecycleHarness();
  for (const slug of ["present", "missing"]) await h.seedMeta(slug, { owner: "andrew" });
  const result = await findMaterializableWorkUnits({ entries: [entry("present", "feat/present"), entry("missing", "feat/missing")],
    store: h.store, identity: "andrew", findHoldingCheckout: async () => null,
    markerlessCheckouts: [{ workUnit: "present", checkoutPath: "/present" }] });
  expect(result.candidates.find(item => item.name === "present")?.actions).toEqual([
    { text: expect.any(String), argv: ["arc", "materialize", "present", "--here"], checkout: "/present" },
  ]);
  expect(result.candidates.find(item => item.name === "missing")?.actions).toEqual([
    { text: expect.any(String), argv: ["arc", "materialize", "missing"] },
  ]);
});
it("reports one rejected holder lookup and still offers the others", async () => {
  const h = createLifecycleHarness();
  for (const slug of ["broken", "released"]) await h.seedMeta(slug, { owner: "andrew" });
  const result = await findMaterializableWorkUnits({ entries: [entry("broken"), entry("released")], store: h.store, identity: "andrew",
    findHoldingCheckout: async slug => { if (slug === "broken") throw new Error("Marker unreadable; inspect /broken"); return null; } });
  expect(result.candidates.map(item => item.name)).toEqual(["released"]);
  expect(result.warnings).toEqual([expect.stringContaining("Marker unreadable; inspect /broken")]);
});

it("keeps the bound store overload asynchronous before the flip while preserving the legacy set", async () => {
  const store = createStore(createDefaultStorePorts({ checkoutRoot: "/unused" }));
  const result = findMaterializableWorkUnits({ store, entries: [{ ...entry("legacy", "feat/legacy"), remoteOnly: true }],
    identity: "andrew", findHoldingCheckout: async () => { throw new Error("Legacy offers read no marker port"); } });
  expect(result).toBeInstanceOf(Promise);
  expect((await result).candidates).toMatchObject([{ name: "legacy", branch: "feat/legacy" }]);
});
