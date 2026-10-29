/** A follower may end failed cleanup without taking ownership of the mover's forwarding record. */
import { chmod, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { followFixture, lateFollowFixture } from "../helpers/store/follow.js";
import { productionStore } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it.each(["deleted", "read-only"])("ends a switched follow whose old receiver is %s", async cause => {
  const h = await lateFollowFixture(), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: {
    ...follower.ports, migrateStep: async step => { if (step === "follow.switched") throw new Error("Pause follow cleanup"); },
  } })).rejects.toThrow("Pause follow cleanup");
  if (cause === "deleted") await rm(h.origin, { recursive: true, force: true });
  else {
    const hook = join(h.origin, "hooks", "pre-receive");
    await writeFile(hook, "#!/bin/sh\nexit 1\n"); await chmod(hook, 0o755);
  }
  for (let attempt = 0; attempt < 2; attempt++) expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished",
    remedy: { text: expect.stringContaining("arc store migrate --leave-source"), argv: ["arc", "store", "migrate"] } } });
  const ended = await invokeStoreMigrate(["--leave-source"], follower.ports);
  expect(ended).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("refs/arc/user/beth/personal") }),
  ]) } });
  expect(success(await follower.store.pull()).states).toEqual([]);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  if (cause === "read-only") expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/user/beth/personal"])).stdout.trim()).toBe("refs/arc/user/beth/personal");
}, 60_000);

it("ends a follow at a deleted destination without withdrawing the mover's control", async () => {
  const h = await lateFollowFixture(), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: {
    ...follower.ports, migrateStep: async step => { if (step === "follow.switched") throw new Error("Pause follow cleanup"); },
  } })).rejects.toThrow("Pause follow cleanup");
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  await rm(h.destinationDirectory, { recursive: true, force: true });
  const ended = await invokeStoreMigrate(["--leave-source"], follower.ports);
  expect(ended).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining(h.destinationDirectory), remedy: expect.anything() }),
  ]) } });
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);

it("ends a follow paused before its switch at a deleted destination unswitched, though a failed layout build left its directory", async () => {
  const h = await followFixture(async fixture => {
    const { ports } = productionStore(fixture.b);
    await expect(invokeStoreRemote(["origin", "off", "--json"], { cwd: fixture.b.root, ports: { ...ports, migrateStep: async step => {
      if (step === "layout.record") throw new Error("Stop before record");
    } } })).rejects.toThrow("Stop before record");
  }), follower = h.follower;
  expect((await follower.ports.fs.lstat(join(follower.root, ".git", "arc", "store-migrate-build"))).isDirectory()).toBe(true);
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: {
    ...follower.ports, migrateStep: async step => { if (step === "follow.switch") throw new Error("Pause before switch"); },
  } })).rejects.toThrow("Pause before switch");
  await rm(h.destinationDirectory, { recursive: true, force: true });
  const ended = await invokeStoreMigrate(["--leave-source"], follower.ports);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  await expect(follower.ports.fs.lstat(join(follower.root, ".git", "arc", "store"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(ended).toMatchObject({ result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining(`stays on its source ${h.origin}`), remedy: { text: expect.stringContaining("withdraw") } }),
  ]) } });
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);

it("finishes a follow interrupted inside its switch before ending it at a departed source", async () => {
  const h = await followFixture(), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: {
    ...follower.ports, migrateStep: async step => { if (step === "layout.designation") throw new Error("Pause inside switch"); },
  } })).rejects.toThrow("Pause inside switch");
  await rm(h.origin, { recursive: true, force: true });
  const ended = await invokeStoreMigrate(["--leave-source"], follower.ports);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect((await follower.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("off");
  expect((await invokeStoreRemote(["--json"], { cwd: follower.root, ports: follower.ports })).result).toMatchObject({ status: "ok", result: {
    layout: "separate", remotes: expect.arrayContaining([expect.objectContaining({ name: "backing", role: "push", url: h.destinationDirectory })]) } });
  expect(success(await follower.store.pull()).states).toEqual([]);
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);
