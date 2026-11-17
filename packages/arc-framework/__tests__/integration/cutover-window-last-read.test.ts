/** The last pre-merge read admits the recorded flip plus its published deletion commit. */
import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { lastReadWindow, type WindowLastReadOptions } from "../../src/scripts/cutover-window/last-read.js";
import { createWindowHost } from "../../src/scripts/cutover-window/native-host.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import type { WindowHostPort } from "../../src/scripts/cutover-window/host.js";
import { invokeWindow } from "../helpers/cutover-window/run.js";
import { lastReadFixture, deleteWindowFile } from "../helpers/cutover-window/last-read.js";

function lastRead(h: Awaited<ReturnType<typeof lastReadFixture>>, options: WindowLastReadOptions = {}, supplied = true) {
  return invokeWindow(h.root, "last-read", ["--flip-branch", h.flip.branch, "--flip-pr", String(h.flip.pullRequest),
    ...(supplied ? ["--pull-requests", h.listingPath] : [])], { "last-read": request => lastReadWindow(request, options) });
}

it("passes a published deletion commit on the recorded branch and checkout without changing refs", async () => {
  const h = await lastReadFixture();
  await deleteWindowFile(h);
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const result = await lastRead(h);
  expect(result, result.report).toMatchObject({ exit: 0, result: { status: "passed", findings: [] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 60_000);

it.each([{ branch: "feat/other" }, { pullRequest: 8 }])("refuses a flip identity other than the hold's (%j) and passes once corrected", async named => {
  const h = await lastReadFixture();
  await deleteWindowFile(h);
  const refused = await lastRead({ ...h, flip: { ...h.flip, ...named } });
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: "flip identity", remedy: "Name the branch and request recorded in the hold, then retry last-read." })] } });
  const repaired = await lastRead(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it.each([{ headBranch: "feat/other" }, { baseBranch: "release" }])("refuses a request whose flip names %j and passes once it names the recorded flip into main", async target => {
  const h = await lastReadFixture();
  await deleteWindowFile(h);
  await writeFile(h.listingPath, JSON.stringify({ ...h.pullRequests, flip: { ...h.pullRequests.flip, ...target } }));
  const refused = await lastRead(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: [expect.objectContaining({
    subject: "flip pull request", condition: expect.stringContaining("not the recorded flip into main"),
    remedy: "Repair the request to name the recorded flip into main, then retry last-read." })] } });
  await writeFile(h.listingPath, JSON.stringify(h.pullRequests));
  const repaired = await lastRead(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("reports unreadable host facts beside the shared comparisons, and passes once both are repaired", async () => {
  const h = await lastReadFixture();
  await deleteWindowFile(h, false);
  await writeFile(h.listingPath, "{}");
  const refused = await lastRead(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "pull-request listing" }),
    expect.objectContaining({ subject: `host:${h.flip.branch}`, condition: expect.stringContaining(h.flip.head) }),
  ]) } });
  await writeFile(h.listingPath, JSON.stringify(h.pullRequests));
  await h.git("git", ["push", "origin", h.flip.branch]);
  const repaired = await lastRead(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses a host still at the recorded head and passes after publication", async () => {
  const h = await lastReadFixture();
  const next = await deleteWindowFile(h, false);
  const refused = await lastRead(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: `host:${h.flip.branch}`, condition: expect.stringContaining(h.flip.head) }),
  ]) } });
  expect(refused.report).toContain(next);
  await h.git("git", ["push", "origin", h.flip.branch]);
  const repaired = await lastRead(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0 });
}, 60_000);

it("refuses a flip checkout that disagrees with its branch and passes after reattachment", async () => {
  const h = await lastReadFixture();
  if (!h.checkout) throw new Error("The flip checkout is absent");
  const next = await deleteWindowFile(h);
  await h.git("git", ["checkout", "--detach", h.flip.head], { cwd: h.checkout });
  const refused = await lastRead(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: h.checkout, condition: expect.stringContaining("checkout") }),
  ]) } });
  expect(refused.report).toContain(next); expect(refused.report).toContain(h.flip.head);
  await h.git("git", ["checkout", h.flip.branch], { cwd: h.checkout });
  const repaired = await lastRead(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0 });
}, 60_000);

it.each(["merge", "second", "modification", "addition", "outside", "empty"] as const)(
  "refuses a %s commit and passes after a valid deletion replaces it", async mode => {
    const h = await lastReadFixture();
    if (!h.checkout) throw new Error("The flip checkout is absent");
    const git = (...args: string[]) => h.git("git", args, { cwd: h.checkout ?? h.root });
    if (mode === "merge") {
      const tree = (await git("rev-parse", "HEAD^{tree}")).stdout.trim();
      const merge = (await git("commit-tree", tree, "-p", h.flip.head, "-p", "main", "-m", "Merge-shaped flip")).stdout.trim();
      await git("update-ref", `refs/heads/${h.flip.branch}`, merge, h.flip.head);
    } else {
      if (mode === "second") await deleteWindowFile(h);
      else if (mode === "modification") {
        await appendFile(join(h.checkout, ".arc/active/tasks-alpha.md"), "\nA modified task.\n");
        await git("add", ".arc/active/tasks-alpha.md");
      } else if (mode === "addition") {
        await writeFile(join(h.checkout, ".arc/active/extra-new.md"), "# Unexpected addition\n");
        await git("add", ".arc/active/extra-new.md");
      } else if (mode === "outside") await git("rm", "packages/arc-framework/src/scripts/cutover-window/check.ts");
      await git("commit", "--allow-empty", "-m", "Invalid flip change");
    }
    const bad = (await git("rev-parse", "HEAD")).stdout.trim();
    await git("push", "origin", h.flip.branch);
    const refused = await lastRead(h);
    expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
      expect.objectContaining({ subject: bad, condition: expect.stringContaining(mode === "merge" || mode === "second" ? "parent" : "delet") }),
    ]) } });
    await git("reset", "--hard", h.flip.head);
    await h.remote("git", ["update-ref", `refs/heads/${h.flip.branch}`, h.flip.head, bad]);
    await h.git("git", ["fetch", "origin", h.flip.branch]);
    await deleteWindowFile(h);
    const repaired = await lastRead(h);
    expect(repaired, repaired.report).toMatchObject({ exit: 0 });
  }, 60_000,
);

it.each(["no-checkout", "no-local"] as const)("validates only recorded coordinates with %s", async mode => {
  const h = await lastReadFixture(mode);
  await deleteWindowFile(h);
  const result = await lastRead(h);
  expect(result, result.report).toMatchObject({ exit: 0, result: { status: "passed", findings: [] } });
}, 60_000);

it("refuses armed auto-merge and passes after it is disabled", async () => {
  const h = await lastReadFixture();
  await deleteWindowFile(h);
  await writeFile(h.listingPath, JSON.stringify({ ...h.pullRequests, flip: { ...h.pullRequests.flip, autoMergeArmed: true } }));
  const refused = await lastRead(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "flip pull request", condition: expect.stringContaining("Auto-merge") }),
  ]) } });
  await writeFile(h.listingPath, JSON.stringify(h.pullRequests));
  const repaired = await lastRead(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0 });
}, 60_000);

it("retains the host main comparison while exempting the flip", async () => {
  const h = await lastReadFixture();
  await deleteWindowFile(h);
  const before = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  const tree = (await h.git("git", ["rev-parse", "main^{tree}"])).stdout.trim();
  const next = (await h.git("git", ["commit-tree", tree, "-p", before, "-m", "Host main moves"])).stdout.trim();
  await h.remote("git", ["fetch", h.root, `${next}:refs/heads/main`]);
  const refused = await lastRead(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "host:main", condition: expect.stringContaining(next) }),
  ]) } });
  await h.remote("git", ["update-ref", "refs/heads/main", before, next]);
  expect(await lastRead(h)).toMatchObject({ exit: 0 });
}, 60_000);

async function hostedLastRead() {
  const h = await lastReadFixture();
  await deleteWindowFile(h);
  await h.git("git", ["remote", "set-url", "origin", "https://github.test/owner/repo.git"]);
  const state = { readable: false };
  const row = { number: h.flip.pullRequest, headRefName: h.flip.branch, baseRefName: "main" };
  const exec: GitExec = async (command, args, options) => {
    if (command === "gh" && args[0] === "pr" && args[1] === "list") {
      if (!state.readable) throw new Error("Host listing unavailable");
      return { stdout: JSON.stringify([row]), stderr: "" };
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "view")
      return { stdout: JSON.stringify({ ...row, autoMergeRequest: null }), stderr: "" };
    if (command === "git" && args[0] === "ls-remote" && args[1] === "origin")
      return h.git(command, [args[0], h.origin, ...args.slice(2)], options);
    return h.git(command, args, options);
  };
  return { h, state, host: createWindowHost({ repo: h.root, exec }) };
}

it("refuses supplied facts on a hosted repository before any host read and passes with host facts", async () => {
  const { h, host, state } = await hostedLastRead();
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected host read"); };
  const noHost: WindowHostPort = { refs: unexpected, pullRequests: unexpected, mergeSettings: unexpected, discoverRepository: unexpected };
  const refused = await lastRead(h, { host: noHost });
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: [
    expect.objectContaining({ subject: "host facts", condition: expect.stringContaining("Supplied host facts") }),
  ] } });
  expect(refused.result?.findings).toHaveLength(1);
  state.readable = true;
  expect(await lastRead(h, { host }, false)).toMatchObject({ exit: 0 });
}, 60_000);

it("refuses an unreadable host listing and passes after the host becomes readable", async () => {
  const { h, host, state } = await hostedLastRead();
  const refused = await lastRead(h, { host }, false);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: [
    expect.objectContaining({ condition: expect.stringContaining("Host listing unavailable") }),
  ] } });
  state.readable = true;
  expect(await lastRead(h, { host }, false)).toMatchObject({ exit: 0 });
}, 60_000);
