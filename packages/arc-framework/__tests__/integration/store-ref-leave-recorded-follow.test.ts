/** A follower may end failed cleanup without taking ownership of the mover's forwarding record. */
import { chmod, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { lateFollowFixture } from "../helpers/store/follow.js";
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
  for (let attempt = 0; attempt < 2; attempt++) expect(await invokeStoreMigrate([], follower.ports)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
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
