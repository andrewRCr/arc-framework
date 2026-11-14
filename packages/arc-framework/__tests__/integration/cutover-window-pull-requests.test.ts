/** Open host work cannot advance a branch during a quiescent window. */
import { writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import type { GitExec } from "../../src/lib/git/exec.js";
import type { WindowPullRequests } from "../../src/scripts/cutover-window/host.js";
import { createWindowHost } from "../../src/scripts/cutover-window/native-host.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { checkWindow } from "../../src/scripts/cutover-window/check.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";

it("refuses another open request into main and passes once it is closed", async () => {
  const h = await windowFixture();
  const other = { number: 8, headBranch: "feat/unrelated", baseBranch: "main" };
  await writeFile(h.listingPath, JSON.stringify({ ...h.pullRequests, open: [...h.pullRequests.open, other] }));
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "pull request #8", remedy: expect.stringContaining("close") }),
  ]) } });
  await writeFile(h.listingPath, JSON.stringify(h.pullRequests));
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses an open request into a live branch and passes once it is closed", async () => {
  const h = await windowFixture();
  const intoLive = { number: 9, headBranch: "feat/alpha-side", baseBranch: "feat/alpha" };
  await writeFile(h.listingPath, JSON.stringify({ ...h.pullRequests, open: [...h.pullRequests.open, intoLive] }));
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "pull request #9", condition: expect.stringContaining("into feat/alpha"),
      remedy: expect.stringContaining("close") }),
  ]) } });
  await writeFile(h.listingPath, JSON.stringify(h.pullRequests));
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses the flip's armed auto-merge and passes once it is disarmed", async () => {
  const h = await windowFixture();
  await writeFile(h.listingPath, JSON.stringify({ ...h.pullRequests, flip: { ...h.pullRequests.flip, autoMergeArmed: true } }));
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: "pull request #7", condition: expect.stringContaining("auto-merge"),
      remedy: expect.stringContaining("--disable-auto") }),
  ]) } });
  await writeFile(h.listingPath, JSON.stringify(h.pullRequests));
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

async function hostedRequestsFixture() {
  const h = await windowFixture(), settings = { allowSquash: true, allowRebase: true }, reads = { listingReadable: true };
  await h.git("git", ["remote", "set-url", "origin", "https://github.test/owner/repo.git"]);
  const row = (request: WindowPullRequests["flip"]) => ({ number: request.number,
    headRefName: request.headBranch, baseRefName: request.baseBranch });
  const exec: GitExec = async (command, args, options) => {
    if (command === "gh") {
      if (args[0] === "pr" && args[1] === "list" && !reads.listingReadable) throw new Error("Host listing unavailable");
      if (args[0] === "api") return { stdout: JSON.stringify({ allow_squash_merge: settings.allowSquash,
        allow_rebase_merge: settings.allowRebase }), stderr: "" };
      if (args[0] === "pr" && args[1] === "list") return { stdout: JSON.stringify(h.pullRequests.open.map(request => row({ ...request, autoMergeArmed: false }))), stderr: "" };
      if (args[0] === "pr" && args[1] === "view") return { stdout: JSON.stringify({ ...row(h.pullRequests.flip), autoMergeRequest: null }), stderr: "" };
      throw new Error(`Unexpected host command ${args.join(" ")}`);
    }
    if (command === "git" && args[0] === "ls-remote" && args[1] === "origin") {
      return h.git(command, [args[0], h.origin, ...args.slice(2)], options);
    }
    return h.git(command, args, options);
  };
  const host = createWindowHost({ exec, repo: h.root });
  const check = async () => {
    const stdout: string[] = [], stderr: string[] = [];
    const exit = await runWindow(["check", "--repo", h.root, "--flip-branch", h.flip.branch,
      "--flip-pr", String(h.flip.pullRequest), "--path", "", "--json"], { check: request => checkWindow(request, { host }) }, {
      stdout: text => { stdout.push(text); }, stderr: text => { stderr.push(text); },
    });
    return { exit, result: JSON.parse(stdout.join("")) as unknown, report: stderr.join("") };
  };
  return { ...h, settings, reads, host, check };
}

it("refuses incompatible merge settings from the host and passes once both are disabled", async () => {
  const h = await hostedRequestsFixture(), refused = await h.check();
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining("squash"), remedy: expect.stringContaining("Disable") }),
    expect.objectContaining({ subject: expect.stringContaining("rebase"), remedy: expect.stringContaining("Disable") }),
  ]) } });
  h.settings.allowSquash = false; h.settings.allowRebase = false;
  const repaired = await h.check();
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses an unreadable host listing and passes after host access is repaired", async () => {
  const h = await hostedRequestsFixture();
  h.settings.allowSquash = false; h.settings.allowRebase = false; h.reads.listingReadable = false;
  const refused = await h.check();
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: [
    expect.objectContaining({ condition: expect.stringContaining("Host listing unavailable"), remedy: expect.stringContaining("retry") }),
  ] } });
  h.reads.listingReadable = true;
  const repaired = await h.check();
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);

it("refuses a supplied listing on a hosted repository and passes with host facts", async () => {
  const h = await hostedRequestsFixture();
  h.settings.allowSquash = false; h.settings.allowRebase = false;
  const refused = await checkFixture(h, { host: h.host });
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: [
    expect.objectContaining({ subject: "host facts", condition: expect.stringContaining("Supplied host facts"),
      remedy: expect.stringContaining("Remove") }),
  ] } });
  const repaired = await h.check();
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 60_000);
