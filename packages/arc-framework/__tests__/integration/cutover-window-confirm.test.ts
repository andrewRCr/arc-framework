/** Confirmations bind the Owner's range decision to exact held tips, never later branch observations. */
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";
import { invokeWindow } from "../helpers/cutover-window/run.js";

it.each(["moved", "gone", "unrecorded"] as const)("confirms a %s range at its exact local mark", async kind => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  let branch = "feat/alpha", tip = (await h.git("git", ["rev-parse", branch])).stdout.trim();
  if (kind === "gone") await h.git("git", ["branch", "-D", branch]);
  else if (kind === "unrecorded") {
    branch = "feat/late";
    await h.git("git", ["branch", branch, tip]);
  } else {
    await h.git("git", ["checkout", branch]);
    await h.git("git", ["commit", "--allow-empty", "-m", "Late change"]);
    tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
    await h.git("git", ["checkout", "main"]);
  }
  expect(await invokeWindow(h.root, "compare", ["--branch", branch])).toMatchObject({ exit: 0 });
  const result = await invokeWindow(h.root, "confirm", [branch, "--local-tip", tip]);
  expect(result, result.report).toMatchObject({ exit: 0 });
  expect((await h.git("git", ["rev-parse", `refs/arc-window/confirmed/local/${branch}`])).stdout.trim()).toBe(tip);
}, 60_000);

it("refuses an unknown branch and a stable branch with no range", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  for (const branch of ["feat/missing", "feat/alpha"]) {
    if (branch === "feat/alpha") expect(await invokeWindow(h.root, "compare", ["--branch", branch])).toMatchObject({ exit: 0 });
    const result = await invokeWindow(h.root, "confirm", [branch, "--local-tip", (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim()]);
    expect(result, result.report).toMatchObject({ exit: 1, result: { status: "refused" } });
    expect(result.report).toContain("no range");
  }
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/confirmed/"])).stdout).toBe("");
}, 60_000);

it("refuses stale or incomplete side tips atomically and confirms after the tips are repaired", async () => {
  const h = await windowFixture(), branch = "feat/late";
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const tip = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  const other = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  await h.git("git", ["branch", branch, tip]); await h.git("git", ["push", "origin", branch]);
  expect(await invokeWindow(h.root, "compare", ["--branch", branch])).toMatchObject({ exit: 0 });
  for (const args of [[branch, "--local-tip", tip], [branch, "--local-tip", tip, "--origin-tip", other]]) {
    const refused = await invokeWindow(h.root, "confirm", args);
    expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused" } });
    expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/confirmed/"])).stdout).toBe("");
  }
  expect(await invokeWindow(h.root, "confirm", [branch, "--local-tip", tip, "--origin-tip", tip])).toMatchObject({ exit: 0 });
  await h.git("git", ["checkout", branch]); await h.git("git", ["commit", "--allow-empty", "-m", "Another late change"]);
  const moved = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  expect(await invokeWindow(h.root, "compare", ["--branch", branch])).toMatchObject({ exit: 0 });
  expect((await h.git("git", ["rev-parse", `refs/arc-window/confirmed/local/${branch}`])).stdout.trim()).toBe(tip);
  expect(await invokeWindow(h.root, "confirm", [branch, "--local-tip", tip, "--origin-tip", tip])).toMatchObject({ exit: 1 });
  expect(await invokeWindow(h.root, "confirm", [branch, "--local-tip", moved, "--origin-tip", tip])).toMatchObject({ exit: 0 });
}, 60_000);
