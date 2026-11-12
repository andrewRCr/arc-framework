/** The cutover hold persists its snapshot independently of the tracked checkout. */
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec, makeGitExecInput } from "../helpers/integration.js";
import { writeWindowHold, readWindowHold, type WindowRecord } from "../../src/scripts/cutover-window/hold.js";

async function fixture() {
  const repo = await createTempRepo();
  onTestFinished(() => cleanupTempDir(repo));
  const exec = makeGitExec(repo); const execInput = makeGitExecInput(repo);
  await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  const head = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const record: WindowRecord = { version: 1, flip: { branch: "feat/flip", pullRequest: 7, head },
    worktrees: [{ path: repo, head, branch: "main" }], branches: { local: { main: head }, origin: { main: head } },
    refs: { local: {}, origin: {}, tracking: {} } };
  return { repo, exec, execInput, record, head };
}

it("round-trips the record through an orphan commit and writes its completion marker", async () => {
  const h = await fixture();
  const tip = await writeWindowHold(h, h.record);
  expect(await readWindowHold(h)).toEqual({ tip, record: h.record });
  expect(JSON.parse((await h.exec("git", ["show", `${tip}:window.json`])).stdout)).toEqual(h.record);
  expect((await h.exec("git", ["rev-parse", "refs/arc-window/complete"])).stdout.trim()).toBe(tip);
  expect((await h.exec("git", ["rev-list", "--parents", "-n", "1", tip])).stdout.trim()).toBe(tip);
  expect((await h.exec("git", ["rev-parse", "HEAD"])).stdout.trim()).toBe(h.head);
}, 15_000);


it("keeps local, origin, and tracking tips reachable after their source refs are deleted", async () => {
  const h = await fixture();
  const git = (...args: string[]) => h.exec("git", args);
  const remote = join(h.repo, "origin.git");
  await git("init", "--bare", remote);
  await git("remote", "add", "origin", remote);
  const tree = (await h.execInput(["mktree"], "")).trim();
  const commit = async (message: string) => (await git("commit-tree", tree, "-m", message)).stdout.trim();
  const local = await commit("local retained input");
  const origin = await commit("origin retained input");
  const tracking = await commit("tracking retained input");
  const localRef = "refs/arc/delivery-candidates/example";
  const originRef = "refs/arc/user/andrew/errands";
  const trackingRef = "refs/arc-remotes/origin/user/andrew/errands";
  await git("update-ref", localRef, local);
  await git("update-ref", trackingRef, tracking);
  await git("push", "origin", `${origin}:${originRef}`);
  h.record.refs = { local: { [localRef]: local }, origin: { [originRef]: origin }, tracking: { [trackingRef]: tracking } };
  await writeWindowHold(h, h.record);
  await git("update-ref", "-d", localRef);
  await git("update-ref", "-d", trackingRef);
  await git("--git-dir", remote, "update-ref", "-d", originRef);
  await git("prune", "--expire=now");
  const held = (await git("for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-window/")).stdout;
  expect(held.split("\n").filter(Boolean).sort()).toEqual(expect.arrayContaining([
    `refs/arc-window/local/${localRef} ${local}`,
    `refs/arc-window/origin/${originRef} ${origin}`,
    `refs/arc-window/tracking/${trackingRef} ${tracking}`,
  ]));
  expect(await Promise.all([local, origin, tracking].map(tip => git("cat-file", "-t", tip).then(value => value.stdout.trim()))))
    .toEqual(["commit", "commit", "commit"]);
  expect((await readWindowHold(h)).record).toEqual(h.record);
}, 20_000);

it("refuses a hold without its completion marker, then writes a fresh hold after it is removed", async () => {
  const h = await fixture();
  await writeWindowHold(h, h.record);
  await h.exec("git", ["update-ref", "-d", "refs/arc-window/complete"]);
  await expect(readWindowHold(h)).rejects.toMatchObject({ findings: [expect.objectContaining({
    subject: "cutover hold", condition: expect.stringContaining("incomplete"), remedy: expect.stringContaining("Remove"),
  })] });
  const refs = (await h.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim().split("\n");
  for (const ref of refs) await h.exec("git", ["update-ref", "-d", ref]);
  await writeWindowHold(h, h.record);
  expect((await readWindowHold(h)).record).toEqual(h.record);
}, 15_000);

it("names the check as the remedy when no hold exists", async () => {
  const h = await fixture();
  await expect(readWindowHold(h)).rejects.toMatchObject({ findings: [expect.objectContaining({
    subject: "cutover hold", condition: expect.stringContaining("No cutover hold"), remedy: expect.stringContaining("check"),
  })] });
}, 15_000);

it("preserves a hold with a mismatched completion marker and reads it after repair", async () => {
  const h = await fixture();
  const tip = await writeWindowHold(h, h.record);
  await h.exec("git", ["update-ref", "refs/arc-window/complete", h.head, tip]);
  await expect(readWindowHold(h)).rejects.toMatchObject({ findings: [expect.objectContaining({
    condition: expect.stringContaining("does not match"), remedy: expect.stringContaining("Preserve"),
  })] });
  expect((await h.exec("git", ["rev-parse", "refs/arc-window/record"])).stdout.trim()).toBe(tip);
  await h.exec("git", ["update-ref", "refs/arc-window/complete", tip, h.head]);
  expect((await readWindowHold(h)).record).toEqual(h.record);
}, 15_000);
