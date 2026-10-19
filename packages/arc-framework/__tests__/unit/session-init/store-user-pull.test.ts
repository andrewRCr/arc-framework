/** Off-branch pull orientation preserves remedies without any notes fields. */
import { expect, it } from "vitest";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { createStoreSyncPort } from "../../../src/lib/store/operational-sync.js";
import { probeStoreUserPull } from "../../../src/lib/session-init/store-user-pull.js";
import { SessionInitUserValueSchema } from "../../../src/commands/user/session-init-schema.js";

it("carries a bound designation and typed remedy through the user slot schema", async () => {
  const store = createLifecycleHarness().store;
  const result = await probeStoreUserPull({ store, remoteSyncEnabled: true, sync: createStoreSyncPort({ pull: async () => ({
    status: "designation-needed", remote: "upstream", choices: ["state", "code"],
    remedy: { text: "arc store remote upstream state", argv: ["arc", "store", "remote", "upstream", "state"] },
  }) }) });
  expect(result).toEqual({ status: "designation-needed", remote: "upstream", choices: ["state", "code"],
    summary: "Remote upstream needs a store designation. arc store remote upstream state",
    remedy: { text: "arc store remote upstream state", argv: ["arc", "store", "remote", "upstream", "state"] },
    actions: [{ text: "arc store remote upstream state", argv: ["arc", "store", "remote", "upstream", "state"] }] });
  expect(SessionInitUserValueSchema.parse(result)).toEqual(result);
  expect(SessionInitUserValueSchema.safeParse({ ...result, loadNeeded: true }).success).toBe(false);
});

it("leaves the slot empty without a binding", async () => {
  const store = createLifecycleHarness().store;
  expect(SessionInitUserValueSchema.parse(await probeStoreUserPull({ store, remoteSyncEnabled: true }))).toBeNull();
});

it("never pulls when remote sync is disabled", async () => {
  const store = createLifecycleHarness().store;
  const sync = createStoreSyncPort({ pull: async () => { throw new Error("Disabled sync fetched"); } });
  expect(await probeStoreUserPull({ store, remoteSyncEnabled: false, sync })).toBeNull();
});

it("keeps the in-repo arm dormant even with a bound backend pull", async () => {
  const store = createStore(createDefaultStorePorts({ checkoutRoot: "/project", exec: async () => { throw new Error("Read Git before the flip"); } }));
  expect(await probeStoreUserPull({ store, remoteSyncEnabled: true,
    sync: createStoreSyncPort({ pull: async () => { throw new Error("Pulled before the flip"); } }) })).toBeNull();
});
