import { expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { followFixture, lateFollowFixture } from "../helpers/store/follow.js";
import { createRemoteMover } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

it("names copied and last-read refs before clearing a follow another move ended", async () => {
  const h = await followFixture(), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.recorded") throw new Error("Paused with a copied follow"); },
  } })).rejects.toThrow("Paused with a copied follow");
  const mover = await createRemoteMover(h, h.destinationDirectory, "onward-report"), onward = join(mover.root, "onward.git");
  await mover.exec("git", ["init", "--bare", onward]);
  expect((await invokeStoreMigrate(["--to", onward], mover.ports)).status).toBe("ok");
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const destination = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const ended = await invokeStoreMigrate([], follower.ports);
  expect(ended.status).toBe("ok");
  if (ended.status !== "ok") throw new Error("Expected an ended follow report");
  expect(ended.result.refs).toContainEqual(expect.objectContaining({ ref: "refs/arc/user/andrew/personal" }));
  for (const remote of [h.origin, h.destinationDirectory]) expect(ended.result.notices.some(({ condition }) =>
    condition.includes("refs/arc/project/moved") && condition.includes(remote))).toBe(true);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destination);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  await writeFile(follower.config, `storage.backing_repository: ${JSON.stringify(onward)}\n`);
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: follower.ports })).result.status).toBe("ok");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it("reports known source and destination refs when a withdrawn source control ends cleanup", async () => {
  const h = await lateFollowFixture(), follower = h.follower;
  let changed = false, source = "", destination = "";
  const ended = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => {
      if (step !== "follow.list-source" || changed) return;
      changed = true; await h.remote("git", ["update-ref", "-d", "refs/arc/project/moved"]);
      source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
      destination = (await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
    },
  } })).result;
  expect(changed).toBe(true);
  expect(ended.status).toBe("ok");
  if (ended.status !== "ok" || !ended.result.report) throw new Error("Expected a cleanup-end report");
  expect(ended.result.report.notices).toContainEqual(expect.objectContaining({ condition: expect.stringMatching(/changed|withdrawn/iu) }));
  for (const remote of [h.origin, h.destinationDirectory]) expect(ended.result.report.notices.some(({ condition }) =>
    condition.includes("refs/arc/user/beth/personal") && condition.includes(remote))).toBe(true);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await follower.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(destination);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
  expect(success(await follower.store.push()).states).toEqual([]);
});
