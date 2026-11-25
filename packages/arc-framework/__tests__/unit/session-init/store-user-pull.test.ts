/** Off-branch pull orientation preserves remedies without any notes fields. */
import { expect, it } from "vitest";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { bindStoreSyncPort, createStoreSyncPort } from "../../../src/lib/store/operational-sync.js";
import { probeStoreUserPull, describeStorePull } from "../../../src/lib/session-init/store-user-pull.js";
import { PullResultSchema } from "../../../src/lib/store/sync.js";
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

it("names identity configuration in the session user slot when no store identity resolves", async () => {
  const result = await probeStoreUserPull({ store: createLifecycleHarness().store, remoteSyncEnabled: true,
    sync: createStoreSyncPort({ pull: async () => ({ status: "no-identity" }) }) });
  expect(SessionInitUserValueSchema.parse(result)).toEqual({ status: "no-identity",
    summary: "No store identity is configured. Run git config arc.identity <name> and retry." });
});

it("describes incomplete synchronization and retains its partial outcomes in the user schema", () => {
  const remedy = { text: "Repair the refused remote." };
  const partial = { states: [], pulls: [{ status: "failed" as const, remote: "origin", role: "state" as const,
    families: ["work-item" as const], notices: [], failure: { code: "refused" as const, class: "terminal" as const,
      condition: "Remote policy refusal.", message: "Remote policy refusal.", remedy } }] };
  const result = describeStorePull({ status: "incomplete", condition: "Remote policy refusal.", remedy, partial });
  expect(result.summary).toContain("Remote policy refusal. Repair the refused remote.");
  expect(result.actions).toContainEqual(remedy);
  expect(SessionInitUserValueSchema.parse(result)).toEqual(result);
});

it("preserves a designation's human remedy when no executable argv is supplied", () => {
  const result = describeStorePull({ status: "designation-needed", remote: "backup", choices: ["push", "read", "off"],
    remedy: { text: "Choose the backup role." } });
  expect(result.summary).toContain("Choose the backup role.");
  expect(result.actions).toEqual([{ text: "Choose the backup role." }]);
  expect(SessionInitUserValueSchema.parse(result)).toEqual(result);
});

it("retains the backend's identity remedy in session orientation", () => {
  const result = describeStorePull({ status: "no-identity", remedy: { text: "Configure the selected identity.", argv: ["git", "config", "arc.identity", "alice"] } });
  expect(result.summary).toContain("Configure the selected identity.");
  expect(result.actions).toEqual([{ text: "Configure the selected identity.", argv: ["git", "config", "arc.identity", "alice"] }]);
});

it("orients a synchronized pull beside an unfinished move and offers the move's repair", () => {
  const remedy = { text: "Finish the move.", argv: ["arc", "store", "migrate"] };
  const result = describeStorePull({ status: "pulled", advisories: [{ condition: "A remote move remains unfinished.", remedy }] });
  expect(result.summary).toBe("Store state pulled. A remote move remains unfinished. Finish the move.");
  expect(result.actions).toEqual([remedy]);
  expect(SessionInitUserValueSchema.parse(result)).toEqual(result);
});

it.each([false, true])("shows the designation question and separate command once in session orientation: readFailure=%s", async readFailure => {
  const store = createLifecycleHarness().store;
  store.pull = async () => ({ status: "ok", result: PullResultSchema.parse({ states: [{ status: "designation-needed", remote: "backup", choices: ["push", "read", "off"],
    remedy: { text: "Choose the backup role.", argv: ["arc", "store", "remote", "backup", "push"] } }],
    pulls: readFailure ? [{ status: "failed", remote: "upstream", role: "read", families: ["work-item"], notices: [],
      failure: { code: "unreachable", class: "recoverable", cause: "network", condition: "Upstream is offline.",
        remedy: { text: "Reconnect the read source." } } }] : [] }) });
  const value = await probeStoreUserPull({ store, remoteSyncEnabled: true, sync: bindStoreSyncPort(store) });
  expect(value?.summary).toContain("Remote backup needs a store designation. Choose the backup role. arc store remote backup push");
  expect(value?.summary.split("arc store remote backup push")).toHaveLength(2);
  if (readFailure) expect(value?.summary).toContain("Read source upstream was not pulled: Upstream is offline. Reconnect the read source.");
  expect(SessionInitUserValueSchema.parse(value)).toEqual(value);
});
