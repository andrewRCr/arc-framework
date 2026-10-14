/** Uncapped first-parent range parsing, recoverable read failures, and the checked files merges brought in. */
import { expect, it } from "vitest";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import { readCheckMergedParents, readMergedInPaths, readRangeMergedInPaths } from "../../../../src/lib/checks/merged.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
const base = "a".repeat(40);
const tip = "b".repeat(40);
const args = ["rev-list", "--first-parent", "--merges", "--parents", `${base}..${tip}`];
function reader(output: string) {
  return scriptGitExec([{ match: args, responses: [{ stdout: output }] }]).exec;
}
it("retains every non-first parent across a range longer than fifty merges", async () => {
  const lines: string[] = [];
  const expected: string[] = [];
  for (let index = 1; index <= 101; index++) {
    const parent = index.toString(16).padStart(40, "0");
    const octopus = (index + 200).toString(16).padStart(40, "0");
    const commit = (index + 1000).toString(16).padStart(40, "0");
    const firstParent = index === 101 ? base : (index + 1001).toString(16).padStart(40, "0");
    lines.push(`${commit} ${firstParent} ${parent} ${octopus}`);
    expected.push(parent, octopus);
  }
  expect(await readCheckMergedParents(reader(lines.join("\n")), "/repository", base, tip)).toEqual(expected);
});
it("returns no merged-in parents for an empty commit range", async () => {
  expect(await readCheckMergedParents(reader(""), "/repository", base, tip)).toEqual([]);
});
it("refuses malformed parent identities with a retry remedy", async () => {
  await expect(readCheckMergedParents(reader(`${tip} ${base} malformed`), "/repository", base, tip)).rejects.toThrow(/retry/u);
});
it("names a retry after a failed Git read and succeeds when the read is repaired", async () => {
  const { exec } = scriptGitExec([{ match: args, responses: [{ failure: { exitCode: 128 } }, { stdout: "" }] }]);
  await expect(readCheckMergedParents(exec, "/repository", base, tip)).rejects.toThrow(/retry/u);
  expect(await readCheckMergedParents(exec, "/repository", base, tip)).toEqual([]);
});

/** A Git fake answering each tree comparison with the files that differ from its starting point, timing overlap. */
function comparisons(differs: Record<string, string[]>) {
  const started: string[] = [];
  let running = 0;
  let peak = 0;
  const exec: GitExec = async (_command, args) => {
    const start = args[5] ?? "";
    started.push(start);
    peak = Math.max(peak, ++running);
    await new Promise(resolve => setTimeout(resolve, 1));
    running--;
    const blobs = `${"1".repeat(40)} ${"2".repeat(40)}`;
    return { stdout: (differs[start] ?? []).map(path => `:100644 100644 ${blobs} M\0${path}\0`).join("") };
  };
  return { exec, started, peak: () => peak };
}
const tree = "c".repeat(40);
const parents = ["d".repeat(40), "e".repeat(40), "f".repeat(40)];
it("compares one merged-in parent at a time and names files changed since the base that match one", async () => {
  const git = comparisons({ [base]: ["src/own.ts", "src/merged.ts"], [parents[0] ?? ""]: ["src/own.ts", "src/merged.ts"],
    [parents[1] ?? ""]: ["src/own.ts"], [parents[2] ?? ""]: ["src/own.ts"] });
  const mergedIn = await readMergedInPaths(git.exec, "/repository",
    { base, tree, merged: parents, inputs: ["src/**"], paths: ["src/old.ts", "src/own.ts", "src/merged.ts"] });
  expect(mergedIn).toEqual(["src/merged.ts"]);
  expect(git.started).toEqual([base, ...parents]);
  expect(git.peak()).toBe(1);
});
it("stops comparing once a parent settles every changed file", async () => {
  const git = comparisons({ [base]: ["src/merged.ts"] });
  const mergedIn = await readMergedInPaths(git.exec, "/repository",
    { base, tree, merged: parents, inputs: ["src/**"], paths: ["src/merged.ts"] });
  expect(mergedIn).toEqual(["src/merged.ts"]);
  expect(git.started).toEqual([base, parents[0]]);
});

it("leaves a range's merged-in files out of its file check", async () => {
  const git = comparisons({ [base]: ["src/own.ts", "src/merged.ts"], [parents[0] ?? ""]: ["src/own.ts"] });
  expect(await readRangeMergedInPaths(git.exec, "/repository", { scope: { kind: "range" }, base, tree,
    merged: [parents[0] ?? ""], inputs: ["src/**"], paths: ["src/own.ts", "src/merged.ts"] })).toEqual(["src/merged.ts"]);
});

it("leaves every file in for a staged request, which keeps its own merge selection", async () => {
  const exec: GitExec = async () => { throw new Error("a staged request compares no trees"); };
  expect(await readRangeMergedInPaths(exec, "/repository", { scope: { kind: "staged" }, base, tree,
    merged: [parents[0] ?? ""], inputs: ["src/**"], paths: ["src/merged.ts"] })).toEqual([]);
});

it("leaves every file in when Git cannot compare the trees", async () => {
  const { exec } = scriptGitExec([{ match: { prefix: [] }, responses: [{ failure: { exitCode: 128, stderr: "bad object" } }] }]);
  expect(await readRangeMergedInPaths(exec, "/repository", { scope: { kind: "range" }, base, tree,
    merged: [parents[0] ?? ""], inputs: ["src/**"], paths: ["src/own.ts", "src/merged.ts"] })).toEqual([]);
});
