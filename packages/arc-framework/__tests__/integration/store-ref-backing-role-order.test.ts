import { expect, it } from "vitest";
import { switchFixture } from "../helpers/store/remote-move.js";
import { followFixture } from "../helpers/store/follow.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

const stop = async (step: string): Promise<void> => { if (step === "backing.repointed") throw new Error("Interrupted after the backing URL changed"); };
const record = "refs/arc/tmp/migrate/move";

it("parks a repointed recorded remote switch off until its answered push role is written", async () => {
  const h = await switchFixture("backing", "backing");
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: stop })).rejects.toThrow("Interrupted after the backing URL changed");
  expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(h.destinationDirectory);
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout).toBe("off");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", record])).stdout).toBe(record);
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout).toBe("push");
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", record])).stdout).toBe("");
});

it("does not publish a follower's private state after interruption before its answered read role", async () => {
  const h = await followFixture(undefined, "backing"), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "read", "--json"], { cwd: follower.root,
    ports: { ...follower.ports, migrateStep: stop } })).rejects.toThrow("Interrupted after the backing URL changed");
  expect((await follower.git(["remote", "get-url", "backing"])).stdout).toBe(h.destinationDirectory);
  expect.soft((await follower.git(["config", "remote.backing.arc-state"])).stdout).toBe("off");
  const listing = async () => (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const before = await listing();
  success(await follower.store.push());
  expect(await listing()).toBe(before);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", record])).stdout).toBe(record);
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
  expect((await follower.git(["config", "remote.backing.arc-state"])).stdout).toBe("read");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
});

it("parks a public backing repoint off and can finish the answered role at the already written URL", async () => {
  const h = await refSyncFixture("separate"), destination = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "kept.md" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Kept across interruption.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  success(await h.a.store.push());
  const ports = { ...h.a.ports, backingRepository: async () => destination.origin };
  await expect(invokeStoreRemote(["backing", "read", "--json"], { cwd: h.a.root, ports: { ...ports, migrateStep: stop } }))
    .rejects.toThrow("Interrupted after the backing URL changed");
  expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(destination.origin);
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout).toBe("off");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", record])).stdout).toBe("");
  expect((await invokeStoreRemote(["backing", "read", "--json"], { cwd: h.a.root, ports })).result.status).toBe("ok");
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout).toBe("read");
  expect(success(await h.a.store.read({ reference })).content).toBe("Kept across interruption.\n");
});
