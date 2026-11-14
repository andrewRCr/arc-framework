/** The rehearsal's sync: a reset on the mirror and in the copy, and a branch held apart from the mirror until released. */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { rehearsalMirrorRepository } from "../helpers/cutover-window/rehearse-mirror.js";

/** A mirror whose main has two commits, checked out in the primary, and a side branch no checkout holds at the first. */
async function syncedRepository(rebuild?: (checkout: string) => Promise<void>) {
  const r = await rehearsalMirrorRepository("arc-window-rehearse-sync-", rebuild);
  const tip = async (run: Promise<{ stdout: string }>) => (await run).stdout.trim();
  await r.write("base.txt", "base\n");
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Base");
  const base = await tip(r.git("rev-parse", "HEAD"));
  await r.write("base.txt", "moved\n");
  await r.git("commit", "--quiet", "-am", "Move");
  const moved = await tip(r.git("rev-parse", "HEAD"));
  await r.git("branch", "feat/side", base);
  await r.git("push", "--quiet", "origin", "main", "feat/side");
  await r.git("fetch", "--quiet", "origin");
  await r.sync.open();
  const mirrorTip = (branch: string) => tip(r.exec("git", ["--git-dir", r.mirror, "rev-parse", `refs/heads/${branch}`]));
  const localTip = (branch: string) => tip(r.git("rev-parse", `refs/heads/${branch}`));
  const commitInScratch = async (branch: string, message: string) => {
    await r.sync.checkout(branch);
    await r.sync.scratch(["commit", "--quiet", "--allow-empty", "-m", message]);
    return await tip(r.sync.scratch(["rev-parse", "HEAD"]));
  };
  return { ...r, base, moved, tip, mirrorTip, localTip, commitInScratch };
}

it("resets a checkout's branch and an unheld branch on the mirror and in the copy, releasing a held branch", async () => {
  const r = await syncedRepository();
  await r.sync.reset("main", r.base);
  expect([await r.mirrorTip("main"), await r.localTip("main"), await r.tip(r.git("rev-parse", "HEAD"))]).toEqual([r.base, r.base, r.base]);
  expect(await readFile(join(r.repo, "base.txt"), "utf8")).toBe("base\n");
  expect(await r.tip(r.git("status", "--porcelain"))).toBe("");
  expect(await r.tip(r.git("for-each-ref", "refs/rehearsal/"))).toBe("");
  r.sync.holdApart("feat/side");
  await r.sync.reset("feat/side", r.moved);
  expect([await r.mirrorTip("feat/side"), await r.localTip("feat/side"), await r.tip(r.git("rev-parse", "HEAD"))])
    .toEqual([r.moved, r.moved, r.base]);
  const next = await r.commitInScratch("feat/side", "Move the side after the reset");
  await r.sync.publish("feat/side", "HEAD");
  await r.sync.sync();
  expect(await r.localTip("feat/side")).toBe(next);
}, 60_000);

it("holds a branch planted in the copy apart from the mirror until it is restored", async () => {
  const r = await syncedRepository();
  const planted = await r.sync.plantInCopy(r.repo, "feat/side", "Move the local side");
  expect(planted.previous).toBe(r.base);
  expect([await r.localTip("feat/side"), await r.tip(r.git("rev-parse", `${planted.tip}^`))]).toEqual([planted.tip, r.base]);
  expect(await r.tip(r.git("rev-parse", `${planted.tip}^{tree}`))).toBe(await r.tip(r.git("rev-parse", `${r.base}^{tree}`)));
  const mirrored = await r.commitInScratch("feat/side", "Move the mirror's side");
  await r.sync.publish("feat/side", "HEAD");
  await r.sync.sync();
  expect([await r.mirrorTip("feat/side"), await r.localTip("feat/side")]).toEqual([mirrored, planted.tip]);
  r.sync.release("feat/side");
  await expect(r.sync.sync()).rejects.toThrow("The copy's feat/side holds commits the mirror's tip lacks.");
  await r.sync.restoreInCopy(r.repo, "feat/side", planted.previous);
  expect(await r.localTip("feat/side")).toBe(r.base);
  await r.sync.sync();
  expect(await r.localTip("feat/side")).toBe(mirrored);
}, 60_000);

it("moves the mirror alone while a checkout's branch is held apart, and carries it once released", async () => {
  const r = await syncedRepository();
  await r.commitInScratch("main", "Move the mirror's main");
  await r.sync.publishMirrorOnly("main", "HEAD");
  await r.sync.scratch(["commit", "--quiet", "--allow-empty", "-m", "Move the mirror's main again"]);
  const ahead = await r.tip(r.sync.scratch(["rev-parse", "HEAD"]));
  await r.sync.publish("main", "HEAD");
  await r.sync.sync();
  expect([await r.mirrorTip("main"), await r.localTip("main"), await r.tip(r.git("rev-parse", "HEAD"))]).toEqual([ahead, r.moved, r.moved]);
  r.sync.release("main");
  await r.sync.sync();
  expect([await r.localTip("main"), await r.tip(r.git("rev-parse", "HEAD"))]).toEqual([ahead, ahead]);
}, 60_000);

// Windows reports a path through a regular file as absent rather than unreadable.
it.skipIf(process.platform === "win32")("stops a sync on a build it cannot read instead of rebuilding it, and completes once the path is repaired", async () => {
  const rebuild = vi.fn(async () => undefined);
  const r = await syncedRepository(rebuild);
  const dist = join(r.repo, "packages", "arc-framework", "dist");
  await mkdir(join(dist, ".."), { recursive: true });
  await writeFile(dist, "not a build directory\n");
  await expect(r.sync.sync()).rejects.toThrow("Built CLI freshness could not be established");
  expect(rebuild).not.toHaveBeenCalled();
  await rm(dist);
  await r.sync.sync();
  expect(rebuild).not.toHaveBeenCalled();
}, 60_000);
