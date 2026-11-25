/** Shared stash entries cannot hide tracked state from the importing checkout. */
import { appendFile, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { checkFixture } from "../helpers/cutover-window/check.js";

it("names an older working-tree stash and permits the newer stash outside tracked state", async () => {
  const h = await windowFixture();
  const path = ".arc/active/notes-alpha.md";
  await appendFile(join(h.root, path), "\nStashed working-tree source.\n");
  await h.git("git", ["stash", "push", "-m", "Tracked source waiting"]);
  await writeFile(join(h.root, "outside.txt"), "Unrelated scratch content.\n");
  await h.git("git", ["stash", "push", "--include-untracked", "-m", "Unrelated scratch"]);
  const tip = (await h.git("git", ["rev-parse", "refs/stash"])).stdout.trim();
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining("stash@{1}"), remedy: expect.stringContaining("drop") }),
  ]) } });
  expect(refused.report).toContain("Tracked source waiting");
  expect(refused.report).toContain(path);
  expect(refused.report).not.toContain("Unrelated scratch");
  expect((await h.git("git", ["rev-parse", "refs/stash"])).stdout.trim()).toBe(tip);
  expect((await h.git("git", ["for-each-ref", "--format=%(refname)", "refs/arc-window/"])).stdout.trim()).toBe("");
  await h.git("git", ["stash", "drop", "stash@{1}"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses a stash's index-only edit even when its working-tree snapshot equals the base", async () => {
  const h = await windowFixture();
  const path = ".arc/active/notes-alpha.md";
  const file = join(h.root, path), before = await readFile(file, "utf8");
  const staged = `${before}\nIndex-only source.\n`;
  await writeFile(file, staged);
  await h.git("git", ["add", path]);
  await writeFile(file, before);
  await h.git("git", ["stash", "push", "-m", "Index snapshot waiting"]);
  expect((await h.git("git", ["show", `refs/stash:${path}`], { preserveOutput: true })).stdout).toBe(before);
  expect((await h.git("git", ["show", `refs/stash^2:${path}`], { preserveOutput: true })).stdout).toBe(staged);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining("stash@{0}"), condition: expect.stringContaining("index") }),
  ]) } });
  expect(refused.report).toContain("Index snapshot waiting");
  expect(refused.report).toContain(path);
  await h.git("git", ["stash", "drop", "stash@{0}"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses tracked state held only in a stash's untracked snapshot", async () => {
  const h = await windowFixture();
  const path = ".arc/active/untracked-alpha.md", content = "# Unsaved companion\n\nHeld only in the stash.\n";
  await writeFile(join(h.root, path), content);
  await h.git("git", ["stash", "push", "--include-untracked", "-m", "Untracked source waiting"]);
  const trees = (await h.git("git", ["rev-parse", "refs/stash^{tree}", "refs/stash^1^{tree}", "refs/stash^2^{tree}"])).stdout.trim().split(/\r?\n/u);
  expect(new Set(trees).size).toBe(1);
  expect((await h.git("git", ["show", `refs/stash^3:${path}`], { preserveOutput: true })).stdout).toBe(content);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: expect.stringContaining("stash@{0}"), condition: expect.stringContaining("untracked") }),
  ]) } });
  expect(refused.report).toContain("Untracked source waiting");
  expect(refused.report).toContain(path);
  await h.git("git", ["stash", "drop", "stash@{0}"]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);

it("refuses a stash ref whose reflog no longer enumerates its entry and passes after explicit removal", async () => {
  const h = await windowFixture();
  await appendFile(join(h.root, ".arc/active/notes-alpha.md"), "\nSource behind an unreadable stash listing.\n");
  await h.git("git", ["stash", "push", "-m", "Unenumerated source"]);
  const tip = (await h.git("git", ["rev-parse", "refs/stash"])).stdout.trim();
  await h.git("git", ["reflog", "expire", "--expire=all", "refs/stash"]);
  expect((await h.git("git", ["reflog", "show", "--format=%H", "refs/stash"])).stdout.trim()).toBe("");
  expect((await h.git("git", ["rev-parse", "refs/stash"])).stdout.trim()).toBe(tip);
  const refused = await checkFixture(h);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: expect.arrayContaining([
    expect.objectContaining({ subject: "refs/stash", condition: expect.stringContaining("reflog"), remedy: expect.stringContaining(`git update-ref -d refs/stash ${tip}`) }),
  ]) } });
  expect((await h.git("git", ["rev-parse", "refs/stash"])).stdout.trim()).toBe(tip);
  await h.git("git", ["update-ref", "-d", "refs/stash", tip]);
  const repaired = await checkFixture(h);
  expect(repaired, repaired.report).toMatchObject({ exit: 0, result: { status: "passed" } });
}, 30_000);
