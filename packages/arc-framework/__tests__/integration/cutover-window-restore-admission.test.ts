/** Restore admission preserves complete authority and refuses unsafe restoration before changing state. */
import type { WindowHostPort } from "../../src/scripts/cutover-window/host.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { admitRestoreFixture } from "../helpers/cutover-window/restore.js";
import { discardUnfinishedWindowHold } from "../../src/scripts/cutover-window/hold.js";

it("refuses an incomplete hold without mutation, then admits a fresh complete hold after its cleanup remedy", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await h.git("git", ["update-ref", "-d", "refs/arc-window/complete"]);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await admitRestoreFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    condition: expect.stringContaining("incomplete"), remedy: expect.stringContaining("Remove"),
  })] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  await discardUnfinishedWindowHold({ repo: h.root, exec: h.git, execInput: h.ports.execInput });
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  expect(await admitRestoreFixture(h)).toMatchObject({ exit: 0, result: { status: "reported" } });
}, 30_000);

it("refuses a host merge absent locally and preserves both hold and fetched main", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const publisher = join(h.root, ".arc-fixture/publisher");
  await h.git("git", ["clone", "--no-local", h.origin, publisher]);
  const publish = (...args: string[]) => h.git("git", args, { cwd: publisher });
  await publish("config", "user.name", "Window Publisher");
  await publish("config", "user.email", "publisher@example.test");
  await publish("merge", "--no-ff", `origin/${h.flip.branch}`, "-m", "Merge the flip");
  const merged = (await publish("rev-parse", "HEAD")).stdout.trim();
  await publish("push", "origin", "main");
  await expect(h.git("git", ["cat-file", "-e", `${merged}^{commit}`])).rejects.toThrow();
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await admitRestoreFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: "merged flip", remedy: expect.stringContaining("Fix forward"),
  })] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 30_000);

it.each(["squash", "rebase", "unreadable"] as const)("refuses %s host evidence and admits restoration after repair", async fault => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const main = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  await h.git("git", ["remote", "set-url", "origin", "https://host.invalid/owner/repo.git"]);
  let blocked = true;
  const host: WindowHostPort = {
    pullRequests: () => Promise.resolve(h.pullRequests),
    refs: () => blocked && fault === "unreadable" ? Promise.reject(new Error("Host is unreadable")) : Promise.resolve({ "refs/heads/main": main }),
    mergeSettings: () => Promise.resolve({ allowSquash: blocked && fault === "squash", allowRebase: blocked && fault === "rebase" }),
    discoverRepository: () => Promise.resolve("owner/repo"),
  };
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await admitRestoreFixture(h, { host }, false)).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: "merged flip", remedy: expect.stringContaining("retry"),
  })] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  blocked = false;
  expect(await admitRestoreFixture(h, { host }, false)).toMatchObject({ exit: 0, result: { status: "reported" } });
}, 30_000);

it("refuses armed auto-merge before restoring and admits it after the request is disarmed", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await writeFile(h.listingPath, JSON.stringify({ ...h.pullRequests, flip: { ...h.pullRequests.flip, autoMergeArmed: true } }));
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await admitRestoreFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: "flip pull request", remedy: expect.stringContaining("Disarm"),
  })] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  await writeFile(h.listingPath, JSON.stringify(h.pullRequests));
  expect(await admitRestoreFixture(h)).toMatchObject({ exit: 0, result: { status: "reported" } });
}, 30_000);

it("refuses a retargeted request and its armed auto-merge together, and admits once the request is repaired", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await writeFile(h.listingPath, JSON.stringify({ ...h.pullRequests,
    flip: { ...h.pullRequests.flip, headBranch: "feat/other", autoMergeArmed: true } }));
  expect(await admitRestoreFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: [
    expect.objectContaining({ subject: "flip pull request", condition: expect.stringContaining("feat/other") }),
    expect.objectContaining({ subject: "flip pull request", remedy: expect.stringContaining("Disarm") }),
  ] } });
  await writeFile(h.listingPath, JSON.stringify(h.pullRequests));
  expect(await admitRestoreFixture(h)).toMatchObject({ exit: 0, result: { status: "reported" } });
}, 30_000);

it("refuses supplied facts on a hosted remote before reading the file or invoking the host", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await h.git("git", ["remote", "set-url", "origin", "https://host.invalid/owner/repo.git"]);
  const host: WindowHostPort = {
    refs: async () => { throw new Error("Unexpected host read"); },
    pullRequests: async () => { throw new Error("Unexpected host read"); },
    mergeSettings: async () => { throw new Error("Unexpected host read"); },
    discoverRepository: async () => { throw new Error("Unexpected host read"); },
  };
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await admitRestoreFixture({ ...h, listingPath: join(h.root, ".arc-fixture/missing.json") }, { host }))
    .toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({ subject: "host facts" })] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  await h.git("git", ["remote", "set-url", "origin", h.origin]);
  expect(await admitRestoreFixture(h)).toMatchObject({ exit: 0, result: { status: "reported" } });
}, 30_000);

it.each(["branch", "pullRequest"] as const)("refuses a named %s that differs from the complete hold", async field => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const flip = field === "branch" ? { ...h.flip, branch: "feat/another-flip" } : { ...h.flip, pullRequest: 8 };
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  expect(await admitRestoreFixture({ ...h, flip })).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: "flip identity", remedy: expect.stringContaining("retry"),
  })] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
  expect(await admitRestoreFixture(h)).toMatchObject({ exit: 0, result: { status: "reported" } });
}, 30_000);

it.each([{ headBranch: "feat/other", baseBranch: "main" }, { headBranch: "feat/window-flip", baseBranch: "other" }])(
  "refuses request facts that no longer identify the recorded flip into main: %j", async target => {
    const h = await windowFixture();
    expect(await checkFixture(h)).toMatchObject({ exit: 0 });
    const request = { number: h.flip.pullRequest, ...target };
    await writeFile(h.listingPath, JSON.stringify({ open: [request], flip: { ...request, autoMergeArmed: false } }));
    const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
    expect(await admitRestoreFixture(h)).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
      subject: "flip pull request", remedy: expect.stringContaining("Repair"),
    })] } });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
    await writeFile(h.listingPath, JSON.stringify(h.pullRequests));
    expect(await admitRestoreFixture(h)).toMatchObject({ exit: 0, result: { status: "reported" } });
  }, 30_000,
);
