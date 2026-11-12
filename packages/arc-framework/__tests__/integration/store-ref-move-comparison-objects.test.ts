/** Move ancestry decisions use comparison objects acquired from the physical separate store. */
import { join } from "node:path";
import { expect, it } from "vitest";
import type { RefStorePorts } from "../../src/lib/store/ports.js";
import { switchFixture, personal } from "../helpers/store/remote-move.js";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { missingSourceFixture } from "../helpers/store/leave-source.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";

async function unrelatedSeen(side: { root: string; exec: RefStorePorts["exec"]; git: (args: string[]) => Promise<{ stdout: string }> }, label: string) {
  const gitDir = join(side.root, ".git", "arc", "store");
  const ref = "refs/arc/tmp/seen/backing/user/andrew/personal";
  const { tip } = await plantRef(side.root, ref, [{ path: "unrelated.txt", content: `Unrelated seen-only ${label}.\n` }], { gitDir, parents: [] });
  await side.git(["cat-file", "-e", `${tip}^{commit}`]);
  await expect(side.exec("git", ["cat-file", "-e", `${tip}^{commit}`], { cwd: side.root })).rejects.toMatchObject({ exitCode: 128 });
  const current = (await side.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout.trim();
  expect(current).not.toBe(tip);
  await expect(side.git(["merge-base", "--is-ancestor", tip, current])).rejects.toMatchObject({ exitCode: 1 });
}

it("acquires a separate-store seen-only comparison for an initial move and its retry", async () => {
  const h = await switchFixture("backing", "backing");
  await unrelatedSeen(h.a, "initial move");
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.copied") throw new Error("Paused after comparison-backed move copy");
  } })).rejects.toThrow("Paused after comparison-backed move copy");
  expect(await invokeStoreMigrate([], h.ports)).toMatchObject({ status: "ok" });
  expect(success(await h.store.read({ reference: personal })).content).toBe("Shared state.\n");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
});

it("acquires a separate-store seen-only comparison for follow copy and its retry", async () => {
  const h = await lateFollowFixture(true, "backing"), side = h.follower;
  await unrelatedSeen(side, "follow copy");
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: side.root, ports: { ...side.ports, migrateStep: async step => {
    if (step === "follow.copied") throw new Error("Paused after comparison-backed follow copy");
  } } })).rejects.toThrow("Paused after comparison-backed follow copy");
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: side.root, ports: side.ports })).result).toMatchObject({ status: "ok" });
  expect(success(await side.store.read({ reference: side.unpublished })).content).toBe("Unpublished follower data.\n");
  expect(success(await side.store.push()).states).toEqual([]);
  expect((await side.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
}, 60_000);

it("acquires a separate-store seen-only comparison for source departure and its retry", async () => {
  const h = await missingSourceFixture("backing-to-backing"), side = h.follower;
  await unrelatedSeen(side, "source departure");
  await expect(invokeStoreMigrate(["--leave-source", "--to", h.to], { ...side.ports, migrateStep: async step => {
    if (step === "leave.copied") throw new Error("Paused after comparison-backed departure copy");
  } })).rejects.toThrow("Paused after comparison-backed departure copy");
  expect(await invokeStoreMigrate(["--leave-source", "--to", h.to], side.ports)).toMatchObject({ status: "ok" });
  expect(success(await side.store.read({ reference: h.unpublished })).content).toBe("Local departure data.\n");
  expect(success(await side.store.push()).states).toEqual([]);
  expect((await side.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
}, 60_000);
