/** Session bindings read operational membership and personal queues without a code remote. */
import { expect, it } from "vitest";
import { createStoreSessionProbes } from "../../../../src/handlers/status/store-session.js";
import { createLifecycleHarness } from "../../../helpers/store/lifecycle-harness.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { setErrandQueue } from "../../../../src/lib/inbox/queue.js";
import { readUserInboxFromStore } from "../../../../src/handlers/status/session-context.js";

function fixture() {
  const h = createLifecycleHarness(); h.store.environment.identity = "alice";
  const { exec } = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const probes = createStoreSessionProbes({ store: h.store, cwd: "/unprojected", exec, identity: "alice",
    readFrame: async () => null, readSettings: async () => ({}), projectId: async () => "project",
    findHoldingCheckout: async () => null, readUserInbox: id => readUserInboxFromStore(h.store, id) });
  return { ...h, probes };
}
it("offers released branchless work without code-remote evidence", async () => {
  const h = fixture();
  await h.seedMeta("planning", { state: "Planning", currentWorkflow: "draft-design", owner: "alice" });
  const result = await h.probes.materializableWorkUnits();
  expect(result.candidates).toEqual([expect.objectContaining({ name: "planning", actions: [{ text: "arc materialize planning", argv: ["arc", "materialize", "planning"] }] })]);
  expect(result.remoteEvidence).toBe("not-applicable");
});
it("counts queued personal captures separately and includes the survivor slot", async () => {
  const h = fixture();
  await h.seed(recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: "alice" })),
    "## Errand\n\n### **Queued capture**\n- _Id:_ `abcdef12`\n- _Created:_ `2026-10-16`\n\nStored body.\n");
  const queue = await setErrandQueue({ schemaVersion: 1, members: [{ inbox: "personal", id: "abcdef12" }] }, { store: h.store, identity: "alice", now: () => new Date("2026-10-16") });
  expect(queue.state).toBe("set");
  const result = await h.probes.inboxState("alice");
  expect(result).toMatchObject({ executeBoundCount: 1, routableCount: 0, survivors: [] });
});
