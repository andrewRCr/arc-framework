/** Closing keeps the restore hold until the merged window's retained comparisons clear. */
import { join } from "node:path";
import { finishFixtureFlip, removeFixtureTrackedState } from "../helpers/cutover-window/after-merge.js";
import { closeWindow } from "../../src/scripts/cutover-window/close.js";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { invokeWindow } from "../helpers/cutover-window/run.js";

it("refuses before the flip merges and preserves the complete hold", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const held = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-window/"])).stdout;
  const result = await invokeWindow(h.root, "close");
  expect(result, result.report).toMatchObject({ exit: 1, result: { status: "refused", data: { merged: false } } });
  expect(result.report).toContain("not merged");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-window/"])).stdout).toBe(held);
}, 60_000);

it("recognizes a host-only merge and refuses the primary's tracked state until repair", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const baseline = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  const tree = (await h.remote("git", ["rev-parse", `${baseline}^{tree}`])).stdout.trim();
  const merged = (await h.remote("git", ["-c", "user.name=Owner", "-c", "user.email=owner@example.test", "commit-tree", tree,
    "-p", baseline, "-p", h.flip.head, "-m", "Host merge"])).stdout.trim();
  await h.remote("git", ["update-ref", "refs/heads/main", merged, baseline]);
  await expect(h.git("git", ["cat-file", "-e", merged])).rejects.toThrow();
  const refused = await invokeWindow(h.root, "close");
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { data: { merged: true } } });
  expect(refused.result?.findings.some(entry => entry.subject === h.root && entry.condition.includes("tracks"))).toBe(true);
  await h.git("git", ["merge", "--ff-only", merged]);
  await removeFixtureTrackedState(h);
  expect(await invokeWindow(h.root, "compare", ["--branch", "feat/alpha"])).toMatchObject({ exit: 0 });
  expect(await invokeWindow(h.root, "close")).toMatchObject({ exit: 0 });
}, 60_000);

it("closes without a mark on a branch the record holds but did not count live", async () => {
  const h = await windowFixture();
  await h.git("git", ["branch", "chore/recorded", "main"]);
  await h.git("git", ["push", "--set-upstream", "origin", "chore/recorded"]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await finishFixtureFlip(h);
  expect(await invokeWindow(h.root, "compare", ["--branch", "feat/alpha"])).toMatchObject({ exit: 0 });
  const closed = await invokeWindow(h.root, "close");
  expect(closed, closed.report).toMatchObject({ exit: 0 });
}, 60_000);

it("checks every registered checkout tree and continues after a stale checkout is removed", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const oldMain = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  await finishFixtureFlip(h);
  expect(await invokeWindow(h.root, "compare", ["--branch", "feat/alpha"])).toMatchObject({ exit: 0 });
  const checkout = join(h.root, ".arc-fixture/late-checkout");
  await h.git("git", ["worktree", "add", "--detach", checkout, oldMain]);
  const refused = await invokeWindow(h.root, "close");
  expect(refused, refused.report).toMatchObject({ exit: 1 });
  expect(refused.result?.findings.some(entry => entry.subject === checkout && entry.condition.includes("tracks"))).toBe(true);
  await h.git("git", ["worktree", "remove", "--force", checkout]);
  expect(await invokeWindow(h.root, "close")).toMatchObject({ exit: 0 });
}, 60_000);

it("refuses unmarked recorded sides and lists them until compare repairs their marks", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await finishFixtureFlip(h);
  const refused = await invokeWindow(h.root, "close");
  expect(refused, refused.report).toMatchObject({ exit: 1 });
  expect(refused.result?.findings.filter(entry => entry.condition.includes("comparison mark"))).toHaveLength(2);
  expect(await invokeWindow(h.root, "compare", ["--branch", "feat/alpha"])).toMatchObject({ exit: 0 });
  expect(await invokeWindow(h.root, "close")).toMatchObject({ exit: 0 });
}, 60_000);

it("keeps a range with an old confirmation and closes only against confirmed held marks", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await finishFixtureFlip(h);
  const advance = async () => {
    await h.git("git", ["checkout", "feat/alpha"]);
    await h.git("git", ["commit", "--allow-empty", "-m", "Late branch change"]);
    const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["checkout", "main"]); return tip;
  };
  const first = await advance();
  expect(await invokeWindow(h.root, "compare", ["--branch", "feat/alpha"])).toMatchObject({ exit: 0 });
  const unconfirmed = await invokeWindow(h.root, "close");
  expect(unconfirmed, unconfirmed.report).toMatchObject({ exit: 1 });
  expect(unconfirmed.report).toContain("confirmation");
  expect(await invokeWindow(h.root, "confirm", ["feat/alpha", "--local-tip", first])).toMatchObject({ exit: 0 });
  const next = await advance();
  expect(await invokeWindow(h.root, "compare", ["--branch", "feat/alpha"])).toMatchObject({ exit: 0 });
  const stale = await invokeWindow(h.root, "close");
  expect(stale, stale.report).toMatchObject({ exit: 1 });
  expect(stale.report).toContain(first); expect(stale.report).toContain(next);
  expect(await invokeWindow(h.root, "confirm", ["feat/alpha", "--local-tip", next])).toMatchObject({ exit: 0 });
  await advance();
  expect(await invokeWindow(h.root, "close")).toMatchObject({ exit: 0 });
}, 60_000);

it.each(["local", "origin"] as const)("requires a mark for unrecorded %s state and ignores a state-free branch", async side => {
  const h = await windowFixture(), branch = side === "local" ? "constructor" : "feat/unrecorded";
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await finishFixtureFlip(h);
  expect(await invokeWindow(h.root, "compare", ["--branch", "feat/alpha"])).toMatchObject({ exit: 0 });
  await h.git("git", ["branch", "feat/code-only", "main"]);
  let tip = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  if (side === "local") await h.git("git", ["branch", branch, tip]);
  else {
    const tree = (await h.remote("git", ["rev-parse", `${tip}^{tree}`])).stdout.trim();
    tip = (await h.remote("git", ["-c", "user.name=Owner", "-c", "user.email=owner@example.test", "commit-tree", tree,
      "-p", tip, "-m", "Host-only late branch"])).stdout.trim();
    await h.remote("git", ["update-ref", `refs/heads/${branch}`, tip]);
    await expect(h.git("git", ["cat-file", "-e", tip])).rejects.toThrow();
  }
  const refused = await invokeWindow(h.root, "close");
  expect(refused, refused.report).toMatchObject({ exit: 1 });
  expect(refused.result?.findings.some(entry => entry.subject === `${side}/${branch}`)).toBe(true);
  expect(refused.result?.findings.some(entry => entry.subject.includes("code-only"))).toBe(false);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window-scratch/"])).stdout).toBe("");
  expect(await invokeWindow(h.root, "compare", ["--branch", branch])).toMatchObject({ exit: 0 });
  expect(await invokeWindow(h.root, "close")).toMatchObject({ exit: 1 });
  expect(await invokeWindow(h.root, "confirm", [branch, `--${side}-tip`, tip])).toMatchObject({ exit: 0 });
  expect(await invokeWindow(h.root, "close")).toMatchObject({ exit: 0 });
}, 60_000);

it("deletes the completion marker first and resumes incomplete cleanup without testing the window again", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const oldMain = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  await finishFixtureFlip(h);
  expect(await invokeWindow(h.root, "compare", ["--branch", "feat/alpha"])).toMatchObject({ exit: 0 });
  const stopped = await invokeWindow(h.root, "close", [], { close: request => closeWindow(request, {
    afterComplete: async () => {
      const refs = (await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout;
      expect(refs).not.toContain("refs/arc-window/complete");
      expect(refs).toContain("refs/arc-window/record");
      expect(refs).toContain("refs/arc-window/compared/");
      throw new Error("Interrupted after completion-marker deletion");
    },
  }) });
  expect(stopped, stopped.report).toMatchObject({ exit: 1, result: { status: "stopped" } });
  expect(stopped.report).toContain("Interrupted after completion-marker deletion");
  await h.git("git", ["update-ref", "-d", "refs/arc-window/record"]);
  await h.git("git", ["checkout", "--detach", oldMain]);
  await h.git("git", ["config", "remote.origin.url", join(h.root, ".arc-fixture/unreachable.git")]);
  const resumed = await invokeWindow(h.root, "close");
  expect(resumed, resumed.report).toMatchObject({ exit: 0, result: { data: { cleanupOnly: true } } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout).toBe("");
}, 60_000);

it("lists held marks when origin cannot be read and closes after access is restored", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await finishFixtureFlip(h);
  expect(await invokeWindow(h.root, "compare", ["--branch", "feat/alpha"])).toMatchObject({ exit: 0 });
  const tip = (await h.git("git", ["rev-parse", "refs/arc-window/compared/local/feat/alpha"])).stdout.trim();
  const held = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-window/"])).stdout;
  await h.git("git", ["config", "remote.origin.url", join(h.root, ".arc-fixture/unreachable.git")]);
  const refused = await invokeWindow(h.root, "close");
  expect(refused, refused.report).toMatchObject({ exit: 1 });
  expect(refused.report).toContain(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-window/"])).stdout).toBe(held);
  await h.git("git", ["config", "remote.origin.url", h.origin]);
  expect(await invokeWindow(h.root, "close")).toMatchObject({ exit: 0 });
}, 60_000);

it("reports an unreadable host beside an unconfirmed range and closes once both are repaired", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  await finishFixtureFlip(h);
  await h.git("git", ["checkout", "feat/alpha"]);
  await h.git("git", ["commit", "--allow-empty", "-m", "Late branch change"]);
  const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  expect(await invokeWindow(h.root, "compare", ["--branch", "feat/alpha"])).toMatchObject({ exit: 0 });
  await h.git("git", ["config", "remote.origin.url", join(h.root, ".arc-fixture/unreachable.git")]);
  const refused = await invokeWindow(h.root, "close");
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", data: { merged: null },
    findings: expect.arrayContaining([
      expect.objectContaining({ subject: "git ls-remote", condition: expect.stringContaining("unreachable.git") }),
      expect.objectContaining({ subject: "local/feat/alpha", condition: expect.stringContaining("confirmation (missing)") }),
    ]) } });
  await h.git("git", ["config", "remote.origin.url", h.origin]);
  expect(await invokeWindow(h.root, "confirm", ["feat/alpha", "--local-tip", tip])).toMatchObject({ exit: 0 });
  expect(await invokeWindow(h.root, "close")).toMatchObject({ exit: 0 });
}, 60_000);
