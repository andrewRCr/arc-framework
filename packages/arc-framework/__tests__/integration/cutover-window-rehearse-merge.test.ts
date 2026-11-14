/** The rehearsal's own Git preparation: merging main into a parked unit's branch, and dropping tracked-state stashes. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { rehearsalMirrorRepository } from "../helpers/cutover-window/rehearse-mirror.js";
import { mergeRehearsalMain, returnRehearsalPaths } from "../../src/scripts/cutover-window/rehearse-merge.js";
import { dropRehearsalStashes } from "../../src/scripts/cutover-window/rehearse-prepare.js";

const pointer = ".arc/backlog/planned/meta-parked.md", active = ".arc/active/meta-parked.md";
const lines = Array.from({ length: 12 }, (_, index) => `Line ${index + 1} of the planned unit.`);

const rehearsalRepository = () => rehearsalMirrorRepository("arc-window-rehearse-merge-");

it("keeps a parked branch's meta and pointer absence when main's park merges in cleanly", async () => {
  const r = await rehearsalRepository();
  await r.write(pointer, `${lines.join("\n")}\n`);
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Plan the unit");
  await r.git("checkout", "--quiet", "-b", "feat/parked");
  await mkdir(join(r.repo, dirname(active)), { recursive: true });
  await r.git("mv", pointer, active);
  const graduated = lines.map((line, index) => index === 1 ? "Line 2, graduated on the branch." : line);
  await r.write(active, `${graduated.join("\n")}\n`);
  await r.git("commit", "--quiet", "-am", "Graduate the unit");
  await r.git("checkout", "--quiet", "main");
  await r.write(pointer, `${lines.map((line, index) => index === 10 ? "Line 11, rewritten by the park." : line).join("\n")}\n`);
  await r.write("main-only.txt", "Main's other change.\n");
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Park the unit");
  await r.git("push", "--quiet", "origin", "main", "feat/parked");
  await r.git("fetch", "--quiet", "origin");
  await r.sync.open();
  await mergeRehearsalMain(r.context, "feat/parked", [{ slug: "parked", path: pointer, branch: "feat/parked", available: true }]);
  const at = (path: string) => r.exec("git", ["--git-dir", r.mirror, "show", `refs/heads/feat/parked:${path}`]);
  expect((await at(active)).stdout.trimEnd()).toBe(graduated.join("\n"));
  await expect(at(pointer)).rejects.toThrow();
  expect((await at("main-only.txt")).stdout.trimEnd()).toBe("Main's other change.");
  const parents = (await r.exec("git", ["--git-dir", r.mirror, "rev-list", "--parents", "-n", "1", "refs/heads/feat/parked"])).stdout.trim();
  expect(parents.split(" ")).toHaveLength(3);
}, 60_000);

it("keeps a parked branch's meta when main's park conflicts with it", async () => {
  const r = await rehearsalRepository();
  await r.write(pointer, `${lines.join("\n")}\n`);
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Plan the unit");
  await r.git("checkout", "--quiet", "-b", "feat/parked");
  await mkdir(join(r.repo, dirname(active)), { recursive: true });
  await r.git("mv", pointer, active);
  const graduated = lines.map((line, index) => index === 4 ? "Line 5, graduated on the branch." : line);
  await r.write(active, `${graduated.join("\n")}\n`);
  await r.git("commit", "--quiet", "-am", "Graduate the unit");
  await r.git("checkout", "--quiet", "main");
  await r.write(pointer, `${lines.map((line, index) => index === 4 ? "Line 5, rewritten by the park." : line).join("\n")}\n`);
  await r.git("commit", "--quiet", "-am", "Park the unit");
  await r.git("push", "--quiet", "origin", "main", "feat/parked");
  await r.sync.open();
  await mergeRehearsalMain(r.context, "feat/parked", [{ slug: "parked", path: pointer, branch: "feat/parked", available: true }]);
  const at = (path: string) => r.exec("git", ["--git-dir", r.mirror, "show", `refs/heads/feat/parked:${path}`]);
  expect((await at(active)).stdout.trimEnd()).toBe(graduated.join("\n"));
  await expect(at(pointer)).rejects.toThrow();
}, 60_000);

it("returns a path on an unheld branch whose mirror tip already holds it, then moves the behind local copy to that tip", async () => {
  const r = await rehearsalRepository(), notes = ".arc/active/notes-alpha.md";
  await r.write(notes, "# Notes: Alpha\n");
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Start");
  await r.git("checkout", "--quiet", "-b", "feat/alpha");
  await r.write(notes, "# Notes: Alpha\n\nA shared change on the branch.\n");
  await r.git("commit", "--quiet", "-am", "Change shared state");
  const behind = (await r.git("rev-parse", "HEAD")).stdout.trim();
  await r.write(notes, "# Notes: Alpha\n");
  await r.git("commit", "--quiet", "-am", "Return shared state");
  const tip = (await r.git("rev-parse", "HEAD")).stdout.trim();
  await r.git("push", "--quiet", "origin", "main", "feat/alpha");
  await r.git("checkout", "--quiet", "main");
  await r.git("branch", "--force", "feat/alpha", behind);
  await r.git("fetch", "--quiet", "origin");
  await r.sync.open();
  await returnRehearsalPaths(r.context, "feat/alpha", [notes]);
  expect((await r.exec("git", ["--git-dir", r.mirror, "rev-parse", "refs/heads/feat/alpha"])).stdout.trim()).toBe(tip);
  await r.sync.sync();
  expect((await r.git("rev-parse", "refs/heads/feat/alpha")).stdout.trim()).toBe(tip);
}, 60_000);

it("drops only the stash entries that change tracked state, last position first", async () => {
  const r = await rehearsalRepository();
  await r.write(".arc/active/notes-alpha.md", "# Notes: Alpha\n");
  await r.write("code.txt", "code\n");
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Start");
  const stash = async (path: string, content: string, message: string) => {
    await writeFile(join(r.repo, path), content);
    await r.git("stash", "push", "--quiet", "-m", message);
  };
  await stash(".arc/active/notes-alpha.md", "# Notes: Alpha\n\nFirst state edit.\n", "first state edit");
  await stash("code.txt", "changed code\n", "code edit");
  await stash(".arc/active/notes-alpha.md", "# Notes: Alpha\n\nSecond state edit.\n", "second state edit");
  expect(await dropRehearsalStashes(r.context)).toBe("Dropped 2 stash entries.");
  expect((await r.git("stash", "list", "--format=%gs")).stdout.trim()).toBe("On main: code edit");
  expect(await readFile(join(r.repo, ".arc/active/notes-alpha.md"), "utf8")).toBe("# Notes: Alpha\n");
}, 60_000);

it("stops before dropping any stash when an entry cannot be inspected, and drops after the entry is repaired", async () => {
  const r = await rehearsalRepository();
  await r.write(".arc/active/notes-alpha.md", "# Notes: Alpha\n");
  await r.git("add", "."); await r.git("commit", "--quiet", "-m", "Start");
  await writeFile(join(r.repo, ".arc/active/notes-alpha.md"), "# Notes: Alpha\n\nA state edit.\n");
  await r.git("stash", "push", "--quiet", "-m", "state edit");
  await r.git("update-ref", "--create-reflog", "-m", "On main: not a stash", "refs/stash", "HEAD");
  await expect(dropRehearsalStashes(r.context)).rejects.toThrow(/Cannot inspect stash snapshots:\nstash@\{0\}: .*malformed parent layout/u);
  expect((await r.git("stash", "list", "--format=%gs")).stdout.trim().split("\n")).toHaveLength(2);
  await r.git("reflog", "delete", "--updateref", "--rewrite", "refs/stash@{0}");
  expect(await dropRehearsalStashes(r.context)).toBe("Dropped 1 stash entry.");
  expect((await r.git("stash", "list")).stdout.trim()).toBe("");
}, 60_000);
