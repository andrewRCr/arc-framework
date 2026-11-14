/** Post-import branch comparisons retain every observed side without blocking late changes. */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { invokeWindow } from "../helpers/cutover-window/run.js";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";

function compare(h: Awaited<ReturnType<typeof windowFixture>>, ...args: string[]) {
  return invokeWindow(h.root, "compare", args);
}

it("marks both recorded branch sides even when neither moved", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const tip = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  const result = await compare(h, "--branch", "feat/alpha");
  expect(result, result.report).toMatchObject({ exit: 0, result: { status: "reported", findings: [], data: { ranges: [] } } });
  for (const side of ["local", "origin"]) expect((await h.git("git", ["rev-parse", `refs/arc-window/compared/${side}/feat/alpha`])).stdout.trim()).toBe(tip);
}, 60_000);

it("reports moved and gone ranges, replacing each side's earlier mark on repeat", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const baseline = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  await h.git("git", ["checkout", "feat/alpha"]);
  await h.git("git", ["commit", "--allow-empty", "-m", "Late branch change"]);
  const moved = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  const result = await compare(h, "--branch", "feat/alpha");
  expect(result, result.report).toMatchObject({ exit: 0, result: { data: { ranges: [{ side: "local", kind: "moved", from: baseline, tip: moved }] } } });
  await h.git("git", ["branch", "-D", "feat/alpha"]);
  const gone = await compare(h, "--branch", "feat/alpha");
  expect(gone, gone.report).toMatchObject({ exit: 0, result: { data: { ranges: [{ side: "local", kind: "gone", from: baseline, tip: baseline }] } } });
  expect((await h.git("git", ["rev-parse", "refs/arc-window/gone/local/feat/alpha"])).stdout.trim()).toBe(baseline);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/compared/local/feat/alpha"])).stdout).toBe("");
  await h.git("git", ["branch", "feat/alpha", moved]);
  expect(await compare(h, "--branch", "feat/alpha")).toMatchObject({ exit: 0 });
  expect((await h.git("git", ["rev-parse", "refs/arc-window/compared/local/feat/alpha"])).stdout.trim()).toBe(moved);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/gone/local/feat/alpha"])).stdout).toBe("");
}, 60_000);

it("fetches and holds a moved host tip that has never existed locally", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const baseline = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  const tree = (await h.remote("git", ["rev-parse", `${baseline}^{tree}`])).stdout.trim();
  const tip = (await h.remote("git", ["-c", "user.name=Owner", "-c", "user.email=owner@example.test", "commit-tree", tree, "-p", baseline, "-m", "Late host-only change"])).stdout.trim();
  await h.remote("git", ["update-ref", "refs/heads/feat/alpha", tip, baseline]);
  await expect(h.git("git", ["cat-file", "-e", tip])).rejects.toThrow();
  const result = await compare(h, "--branch", "feat/alpha");
  expect(result, result.report).toMatchObject({ exit: 0, result: { data: { ranges: [{ side: "origin", kind: "moved", from: baseline, tip }] } } });
  expect((await h.git("git", ["rev-parse", "refs/arc-window/compared/origin/feat/alpha"])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window-scratch/"])).stdout).toBe("");
}, 60_000);

it("marks unrecorded state-bearing branches from their recorded-main merge base", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const base = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  await h.git("git", ["branch", "feat/late/name", "feat/alpha"]);
  await h.git("git", ["push", "origin", "feat/late/name"]);
  const tip = (await h.git("git", ["rev-parse", "feat/late/name"])).stdout.trim();
  const result = await compare(h, "--branch", "feat/late/name");
  expect(result, result.report).toMatchObject({ exit: 0, result: { data: { ranges: [
    { side: "local", kind: "unrecorded", from: base, tip }, { side: "origin", kind: "unrecorded", from: base, tip },
  ] } } });
}, 60_000);

it("leaves a branch the record holds but did not count live without marks", async () => {
  const h = await windowFixture();
  await h.git("git", ["branch", "chore/recorded", "main"]);
  await h.git("git", ["push", "--set-upstream", "origin", "chore/recorded"]);
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const result = await compare(h, "--branch", "chore/recorded");
  expect(result, result.report).toMatchObject({ exit: 0, result: { findings: [], data: { ranges: [] } } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/compared/", "refs/arc-window/gone/"])).stdout).toBe("");
}, 60_000);

it("refuses an unrecorded branch with no history shared with main until main is merged into it", async () => {
  const h = await windowFixture(), branch = "feat/orphan";
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const base = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  const side = join(h.root, ".arc-fixture/orphan"), path = ".arc/active/notes-orphan.md";
  await h.git("git", ["worktree", "add", "--detach", side]);
  await h.git("git", ["checkout", "--orphan", branch], { cwd: side });
  await h.git("git", ["rm", "-rfq", "."], { cwd: side });
  await mkdir(join(side, ".arc/active"), { recursive: true });
  await writeFile(join(side, path), "# Notes: Orphan\n");
  await h.git("git", ["add", path], { cwd: side }); await h.git("git", ["commit", "-m", "Start an unrelated history"], { cwd: side });
  await h.git("git", ["push", "--set-upstream", "origin", branch], { cwd: side });
  const refused = await compare(h, "--branch", branch);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: [{ subject: branch,
    condition: expect.stringContaining(`shares no history with main's recorded tip ${base}`),
    remedy: expect.stringContaining("git merge --allow-unrelated-histories main") }] } });
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", `refs/arc-window/compared/local/${branch}`])).stdout).toBe("");
  await h.git("git", ["merge", "--allow-unrelated-histories", "--no-edit", "main"], { cwd: side });
  await h.git("git", ["push", "origin", branch], { cwd: side });
  await h.git("git", ["worktree", "remove", side]);
  const tip = (await h.git("git", ["rev-parse", branch])).stdout.trim();
  const repaired = await compare(h, "--branch", branch);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { data: { ranges: [
    { side: "local", kind: "unrecorded", from: base, tip }, { side: "origin", kind: "unrecorded", from: base, tip },
  ] } } });
}, 60_000);

it("reports a changed checkout personal digest without stopping or writing marks", async () => {
  const h = await windowFixture();
  expect(await checkFixture(h)).toMatchObject({ exit: 0 });
  const before = (await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout;
  const equal = await compare(h, "--checkout", h.root);
  expect(equal, equal.report).toMatchObject({ exit: 0, result: { data: { changed: false } } });
  await appendFile(join(h.root, ".arc/user/andrew/WORKING-MEMORY.md"), "\nLate personal edit.\n");
  const result = await compare(h, "--checkout", h.root);
  expect(result, result.report).toMatchObject({ exit: 0, result: { status: "reported", data: { changed: true } } });
  expect(result.report).toContain("personal digest changed");
  expect((await h.git("git", ["for-each-ref", "--format=%(refname) %(objectname)"])).stdout).toBe(before);
}, 60_000);
