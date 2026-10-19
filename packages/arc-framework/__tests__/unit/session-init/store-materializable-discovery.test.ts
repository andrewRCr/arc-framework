/** Store-derived materialization offers remain valid without code-remote evidence. */
import { expect, it } from "vitest";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { deriveStoreInFlight } from "../../../src/lib/git/in-flight-store.js";
import { findMaterializableWorkUnits, MaterializableWorkUnitDiscoveryResultSchema } from "../../../src/lib/session-init/materializable-work-units.js";

it("admits a released branchless Store offer in a session with no remote", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("planning", { state: "Planning", currentWorkflow: "draft-design", owner: "alice" });
  const { exec } = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const oracle = await deriveStoreInFlight({ store: h.store, exec, identity: "alice", teamMode: false, roster: [], projectId: async () => "project" });
  const offer = await findMaterializableWorkUnits({ store: h.store, entries: oracle.entries, identity: "alice", findHoldingCheckout: async () => null });
  const result = MaterializableWorkUnitDiscoveryResultSchema.parse({ ...offer, remoteEvidence: "not-applicable", pendingBranchCount: 0, refreshRemedy: null });
  expect(result.candidates).toEqual([expect.objectContaining({ name: "planning", actions: [{ text: "arc materialize planning", argv: ["arc", "materialize", "planning"] }] })]);
});
