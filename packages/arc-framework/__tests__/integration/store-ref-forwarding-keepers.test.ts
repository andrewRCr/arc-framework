import { expect, it } from "vitest";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

const globalKeeper = "refs/arc/tmp/migrate/deleted-record";
const copyKeeper = "refs/arc/tmp/migrate/copied/deleted-record";

it.each(["follow", "departure"] as const)("starts a %s with no inherited deleted-forwarding keeper", async (kind) => {
  const h = await followFixture(), follower = h.follower;
  const old = (await follower.git(["rev-parse", "refs/arc-remotes/origin/project/moved"])).stdout;
  await follower.exec("git", ["update-ref", globalKeeper, old]);
  const ports = { ...follower.ports, migrateStep: async (step: string) => {
    if (step === (kind === "follow" ? "follow.recorded" : "leave.recorded")) throw new Error("Paused at the new record");
  } };
  const started = kind === "follow" ? invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports })
    : invokeStoreMigrate(["--leave-source", "--to", h.destinationDirectory], ports);
  await expect(started).rejects.toThrow("Paused at the new record");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", globalKeeper, copyKeeper])).stdout).toBe("");
  const result = await invokeStoreMigrate([], follower.ports);
  expect(result.status).toBe("ok");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", globalKeeper, copyKeeper])).stdout).toBe("");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
});

it("reports a removed forwarding record only when this ended follow retained it", async () => {
  const h = await followFixture(), follower = h.follower;
  const old = (await follower.git(["rev-parse", "refs/arc-remotes/origin/project/moved"])).stdout;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.recorded") throw new Error("Paused before the follow switch"); },
  } })).rejects.toThrow("Paused before the follow switch");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", copyKeeper])).stdout).toBe("");
  await follower.exec("git", ["update-ref", globalKeeper, old]);
  const ended = await invokeStoreMigrate(["--leave-source"], follower.ports);
  expect(ended.status).toBe("ok");
  if (ended.status === "ok") expect(ended.result.notices.map(({ condition }) => condition).join("\n")).not.toContain("An earlier copy removed forwarding record");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
});
