import { expect, it } from "vitest";
import { rename } from "node:fs/promises";
import type { GitExec } from "../../src/lib/git/exec.js";
import { GitProcessError } from "../../src/lib/git/process-error.js";
import { switchFixture, personal } from "../helpers/store/remote-move.js";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

function capacityBoundary(exec: GitExec, target: string, beforeRefusal?: () => Promise<void>) {
  let blocked = true;
  const wrapped: GitExec = async (command, args, options) => {
    if (blocked && args.includes("push") && args.includes(target)) {
      await beforeRefusal?.();
      throw new GitProcessError({ kind: "command-line-capacity", command, args, commandLine: { units: 40_000, limit: 32_767 } });
    }
    return exec(command, args, options);
  };
  return { exec: wrapped, repair: () => { blocked = false; } };
}
const capacity = { status: "refused", refusal: { code: "store", refusal: {
  code: "command-line-capacity", class: "recoverable", condition: expect.stringMatching(/not start/iu),
} } };

it.each((["code", "backing"] as const).flatMap(source => (["copy", "cleanup"] as const).map(phase => ({ source, phase }))))(
  "preserves a $phase nonstart and its exact retry from $source", async ({ source, phase }) => {
  const h = await switchFixture(source, source === "code" ? "backing" : "code");
  if (phase === "cleanup") await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Pause after landed copy");
  } })).rejects.toThrow("Pause after landed copy");
  const sourceBefore = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const destination = () => h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"]);
  const destinationBefore = (await destination()).stdout;
  let atRefusal = "", retainedReport = "";
  const boundary = capacityBoundary(h.ports.exec, phase === "copy" ? h.destinationDirectory : h.origin, async () => {
    atRefusal = (await destination()).stdout;
    if (phase === "cleanup") retainedReport = (await h.a.exec("git", ["cat-file", "blob", "refs/arc/tmp/migrate/copied/report"])).stdout;
  });
  const argv = phase === "copy" ? ["--to", h.to] : [];
  const refused = await invokeStoreMigrate(argv, { ...h.ports, exec: boundary.exec });
  expect(refused).toMatchObject(capacity);
  if (refused.status !== "refused" || refused.refusal.code !== "store") throw new Error("Expected local capacity refusal");
  expect(refused.refusal.refusal.remedy.argv).toEqual(["arc", "store", "migrate", ...argv]);
  expect(refused.refusal.refusal.remedy.text).toMatch(/capacity|command line/iu);
  expect((await destination()).stdout).toBe(atRefusal);
  if (phase === "copy") expect(atRefusal).toBe(destinationBefore);
  else expect((await h.a.exec("git", ["cat-file", "blob", "refs/arc/tmp/migrate/copied/report"])).stdout).toBe(retainedReport);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(sourceBefore);
  expect(success(await h.store.read({ reference: phase === "copy" ? h.pending : personal })).content).toBe(phase === "copy" ? "Pending local state.\n" : "Shared state.\n");
  boundary.repair();
  const retried = await invokeStoreMigrate(argv, { ...h.ports, exec: boundary.exec });
  expect(retried.status, JSON.stringify(retried)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  success(await h.store.pull());
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
}, 90_000);

it.each(["code", "backing"] as const)("retains a follow cleanup capacity refusal from %s", async source => {
  const h = await lateFollowFixture(true, source), follower = h.follower;
  const boundary = capacityBoundary(follower.ports.exec, h.origin), ports = { ...follower.ports, exec: boundary.exec };
  const refused = (await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports })).result;
  expect(refused).toMatchObject(capacity);
  if (refused.status !== "refused" || refused.refusal.code !== "store") throw new Error("Expected local capacity refusal");
  expect(refused.refusal.refusal.remedy.argv).toEqual(["arc", "store", "migrate"]);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout.trim()).toBe("refs/arc/tmp/migrate/move");
  boundary.repair();
  const retried = await invokeStoreMigrate([], ports);
  expect(retried.status, JSON.stringify(retried)).toBe("ok");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
}, 90_000);

it.each(["code", "backing"] as const)("retains the source-withdrawal capacity remedy from %s", async source => {
  const h = await switchFixture(source, "backing");
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Pause after switch");
  } })).rejects.toThrow("Pause after switch");
  await rename(h.destinationDirectory, h.destinationDirectory + ".offline");
  try {
    const boundary = capacityBoundary(h.ports.exec, h.origin), ports = { ...h.ports, exec: boundary.exec };
    const refused = await invokeStoreMigrate(["--leave-source"], ports);
    expect(refused).toMatchObject(capacity);
    if (refused.status !== "refused" || refused.refusal.code !== "store") throw new Error("Expected local capacity refusal");
    expect(refused.refusal.refusal.remedy.argv).toEqual(["arc", "store", "migrate", "--leave-source"]);
    expect(refused.refusal.refusal.remedy.text).toMatch(/capacity|command line/iu);
    boundary.repair();
    const retried = await invokeStoreMigrate(["--leave-source"], ports);
    expect(retried.status, JSON.stringify(retried)).toBe("ok");
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  } finally { await rename(h.destinationDirectory + ".offline", h.destinationDirectory); }
}, 90_000);
