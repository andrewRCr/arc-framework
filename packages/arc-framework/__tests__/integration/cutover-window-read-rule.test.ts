/** Native tree and merge-base reads distinguish inherited records from changes the import would lose. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { windowFixture } from "../helpers/cutover-window/fixture.js";
import { runWindow } from "../../src/scripts/cutover-window/main.js";
import { createWindowImportContext } from "../../src/scripts/cutover-window/import-context.js";
import { createWindowReadMap } from "../../src/scripts/cutover-window/read-map.js";
import { createWindowReadRule } from "../../src/scripts/cutover-window/read-rule.js";
import { parkedWindowFixture } from "../helpers/cutover-window/parked.js";
import type { GitExec } from "../../src/lib/git/exec.js";

async function inspectRule(h: Awaited<ReturnType<typeof windowFixture>>, path: string, revision: string, branchTip = false, exec?: GitExec) {
  const stdout: string[] = [], stderr: string[] = [];
  const exit = await runWindow(["check", "--repo", h.root, "--json"], { check: async ({ repo }) => {
    const context = await createWindowImportContext(repo), main = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
    const map = await createWindowReadMap(context, main), rule = createWindowReadRule({ ...context, exec: exec ?? context.exec }, map);
    return { operation: "check", status: "reported", findings: map.findings, data: await rule.inspect(path, revision, branchTip) };
  } }, { stdout: value => { stdout.push(value); }, stderr: value => { stderr.push(value); } });
  return { exit, result: JSON.parse(stdout.join("")) as unknown, report: stderr.join("") };
}

it("admits read-copy content and inherited main content, refusing a later main edit", async () => {
  const h = await windowFixture(), path = ".arc/active/notes-alpha.md";
  const source = (await h.git("git", ["rev-parse", "feat/alpha"])).stdout.trim();
  expect(await inspectRule(h, path, source, true)).toMatchObject({ exit: 0, result: { data: { passes: true, readRevision: source } } });
  const main = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  expect(await inspectRule(h, path, main)).toMatchObject({ exit: 0, result: { data: { passes: true } } });
  await writeFile(join(h.root, path), "# Notes: Alpha\n\nA main edit the import does not read.\n");
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Change the non-read main copy"]);
  const changed = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const checked = await inspectRule(h, path, changed);
  expect(checked, checked.report).toMatchObject({ exit: 0, result: { data: { passes: false, readRevision: source } } });
}, 60_000);

it("refuses unavailable ancestry evidence and compares again after the read is repaired", async () => {
  const h = await windowFixture(), path = ".arc/active/notes-alpha.md";
  const main = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  const unavailable: GitExec = (command, args, options) => args.includes("merge-base")
    ? Promise.reject(new Error("Ancestry read interrupted")) : h.git(command, args, options);
  const refused = await inspectRule(h, path, main, false, unavailable);
  expect(refused, refused.report).toMatchObject({ exit: 1, result: { status: "refused", findings: [
    expect.objectContaining({ condition: expect.stringContaining("Ancestry read interrupted") }),
  ] } });
  expect(await inspectRule(h, path, main)).toMatchObject({ exit: 0, result: { data: { passes: true } } });
}, 60_000);

it("admits an absent parked pointer inherited from its preserved branch", async () => {
  const h = await parkedWindowFixture();
  const checked = await inspectRule(h, h.pointer, h.tip, true);
  expect(checked, checked.report).toMatchObject({ exit: 0, result: { data: {
    pointerBranch: h.branch, readRevision: h.main, passes: true,
  } } });
}, 60_000);

it("rejects a pointer deleted by a branch cut from main after the park", async () => {
  const h = await parkedWindowFixture();
  await h.git("git", ["checkout", "-b", "feat/after-park"]);
  await h.git("git", ["rm", h.pointer]); await h.git("git", ["commit", "-m", "Delete the parked pointer"]);
  const tip = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  await h.git("git", ["checkout", "main"]);
  const checked = await inspectRule(h, h.pointer, tip, true);
  expect(checked, checked.report).toMatchObject({ exit: 0, result: { data: { passes: false, pointerBranch: h.branch } } });
}, 60_000);

it("accepts inherited content through either of several best merge bases", async () => {
  const h = await windowFixture(), path = ".arc/active/notes-alpha.md";
  const left = (await h.git("git", ["rev-parse", "main"])).stdout.trim();
  await h.git("git", ["checkout", "feat/alpha"]);
  await writeFile(join(h.root, path), "# Notes: Alpha\n\nOther-side source content.\n");
  await h.git("git", ["add", ".arc"]); await h.git("git", ["commit", "-m", "Advance the other merge base"]);
  const right = (await h.git("git", ["rev-parse", "HEAD"])).stdout.trim();
  const leftTree = (await h.git("git", ["rev-parse", `${left}^{tree}`])).stdout.trim();
  const rightTree = (await h.git("git", ["rev-parse", `${right}^{tree}`])).stdout.trim();
  const revision = (await h.ports.execInput(["commit-tree", leftTree, "-p", left, "-p", right], "Join from the left\n")).trim();
  const read = (await h.ports.execInput(["commit-tree", rightTree, "-p", right, "-p", left], "Join from the right\n")).trim();
  await h.git("git", ["update-ref", "refs/heads/feat/alpha", read, right]);
  await h.git("git", ["push", "origin", "feat/alpha"]);
  await h.git("git", ["checkout", "main"]);
  await h.git("git", ["update-ref", "refs/heads/main", revision, left]);
  const bases = (await h.git("git", ["merge-base", "--all", revision, read])).stdout.trim().split("\n");
  expect(new Set(bases)).toEqual(new Set([left, right]));
  const checked = await inspectRule(h, path, revision);
  expect(checked, checked.report).toMatchObject({ exit: 0, result: { data: {
    passes: true, readRevision: read, bases: expect.arrayContaining([left, right]),
  } } });
}, 60_000);
