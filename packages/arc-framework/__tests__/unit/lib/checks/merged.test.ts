/** Uncapped first-parent merge parsing, recoverable read failures, and the checked files base merges brought in. */
import { expect, it } from "vitest";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import { readCheckMerges, readMergedInPaths, readRangeMergedInPaths, type CheckMerge } from "../../../../src/lib/checks/merged.js";
import { makeGitProcessError, scriptGitExec } from "../../../helpers/git-exec-fake.js";
const base = "a".repeat(40);
const tip = "b".repeat(40);
const args = ["rev-list", "--first-parent", "--merges", "--parents", `${base}..${tip}`];
function reader(output: string) {
  return scriptGitExec([{ match: args, responses: [{ stdout: output }] }]).exec;
}
it("retains every merge with its first parent across a range longer than fifty merges", async () => {
  const lines: string[] = [];
  const expected: CheckMerge[] = [];
  for (let index = 1; index <= 101; index++) {
    const parent = index.toString(16).padStart(40, "0");
    const octopus = (index + 200).toString(16).padStart(40, "0");
    const commit = (index + 1000).toString(16).padStart(40, "0");
    const firstParent = index === 101 ? base : (index + 1001).toString(16).padStart(40, "0");
    lines.push(`${commit} ${firstParent} ${parent} ${octopus}`);
    expected.push({ commit, firstParent, merged: [parent, octopus] });
  }
  expect(await readCheckMerges(reader(lines.join("\n")), "/repository", base, tip)).toEqual(expected);
});
it("returns no merges for an empty commit range", async () => {
  expect(await readCheckMerges(reader(""), "/repository", base, tip)).toEqual([]);
});
it("refuses malformed parent identities with a retry remedy", async () => {
  await expect(readCheckMerges(reader(`${tip} ${base} malformed`), "/repository", base, tip)).rejects.toThrow(/retry/u);
  await expect(readCheckMerges(reader(`${tip} ${base}`), "/repository", base, tip)).rejects.toThrow(/retry/u);
});
it("names a retry after a failed Git read and succeeds when the read is repaired", async () => {
  const { exec } = scriptGitExec([{ match: args, responses: [{ failure: { exitCode: 128 } }, { stdout: "" }] }]);
  await expect(readCheckMerges(exec, "/repository", base, tip)).rejects.toThrow(/retry/u);
  expect(await readCheckMerges(exec, "/repository", base, tip)).toEqual([]);
});

const tree = "c".repeat(40);
const remoteBase = "9".repeat(40);
const merge: CheckMerge = { commit: "d".repeat(40), firstParent: "e".repeat(40), merged: ["f".repeat(40)] };
const parent = merge.merged[0] ?? "";
const fromBase = `${base}..${tree}`;
const fromFirstParent = `${merge.firstParent}..${merge.commit}`;
const fromParent = `${parent}..${merge.commit}`;
/**
 * A Git fake answering each tree comparison, keyed by both ends, with the files that differ and the blob each ends
 * at; ancestry answers yes only for the named parents. Records each read in order and times their overlap.
 */
function history(differs: Record<string, Record<string, string>>, onBase: readonly string[] = [parent]) {
  const calls: string[] = [];
  let running = 0;
  let peak = 0;
  const exec: GitExec = async (_command, args) => {
    const ancestry = args[0] === "merge-base";
    const call = ancestry ? `ancestor ${args[2] ?? ""} ${args[3] ?? ""}` : `${args[5] ?? ""}..${args[6] ?? ""}`;
    calls.push(call);
    peak = Math.max(peak, ++running);
    await new Promise(resolve => setTimeout(resolve, 1));
    running--;
    if (ancestry) {
      if (!onBase.includes(args[2] ?? "")) throw makeGitProcessError({ command: "git", args, exitCode: 1 });
      return { stdout: "" };
    }
    return { stdout: Object.entries(differs[call] ?? {})
      .map(([path, blob]) => `:100644 100644 ${"1".repeat(40)} ${blob.repeat(40)} M\0${path}\0`).join("") };
  };
  return { exec, calls, peak: () => peak };
}
const content = { base, tree, merges: [merge], remoteBase, inputs: ["src/**"] };

it("names a file a base merge brought in that the tree still carries, one read at a time", async () => {
  const git = history({
    [fromBase]: { "src/own.ts": "2", "src/merged.ts": "3", "src/later.ts": "4", "src/resolved.ts": "5" },
    [fromFirstParent]: { "src/merged.ts": "3", "src/later.ts": "6", "src/resolved.ts": "5" },
    [fromParent]: { "src/resolved.ts": "7" },
  });
  const mergedIn = await readMergedInPaths(git.exec, "/repository",
    { ...content, paths: ["src/old.ts", "src/own.ts", "src/merged.ts", "src/later.ts", "src/resolved.ts"] });
  expect(mergedIn).toEqual(["src/merged.ts"]);
  expect(git.calls).toEqual([fromBase, fromFirstParent, `ancestor ${parent} ${remoteBase}`, fromParent]);
  expect(git.peak()).toBe(1);
});

it("keeps a file the merge left as its first parent had it, though a merged-in parent matches", async () => {
  const git = history({ [fromBase]: { "src/own.ts": "2" } });
  expect(await readMergedInPaths(git.exec, "/repository", { ...content, paths: ["src/own.ts"] })).toEqual([]);
  expect(git.calls).toEqual([fromBase, fromFirstParent]);
});

it("keeps a file brought in from a merged-in parent the base branch does not carry", async () => {
  const git = history({ [fromBase]: { "src/topic.ts": "3" }, [fromFirstParent]: { "src/topic.ts": "3" } }, []);
  expect(await readMergedInPaths(git.exec, "/repository", { ...content, paths: ["src/topic.ts"] })).toEqual([]);
  expect(git.calls).toEqual([fromBase, fromFirstParent, `ancestor ${parent} ${remoteBase}`]);
});

it("stops comparing once a merge settles every changed file", async () => {
  const older: CheckMerge = { commit: "8".repeat(40), firstParent: "7".repeat(40), merged: ["6".repeat(40)] };
  const git = history({ [fromBase]: { "src/merged.ts": "3" }, [fromFirstParent]: { "src/merged.ts": "3" } });
  expect(await readMergedInPaths(git.exec, "/repository",
    { ...content, merges: [merge, older], paths: ["src/merged.ts"] })).toEqual(["src/merged.ts"]);
  expect(git.calls).toEqual([fromBase, fromFirstParent, `ancestor ${parent} ${remoteBase}`, fromParent]);
});

it("answers nothing when Git cannot say whether a merged-in parent is on the base branch", async () => {
  const { exec } = scriptGitExec([
    { match: { prefix: ["diff"] }, responses: [{ stdout: `:100644 100644 ${"1".repeat(40)} ${"3".repeat(40)} M\0src/merged.ts\0` }] },
    { match: { prefix: ["merge-base"] }, responses: [{ failure: { exitCode: 128, stderr: "bad object" } }] },
  ]);
  expect(await readMergedInPaths(exec, "/repository", { ...content, paths: ["src/merged.ts"] })).toBeUndefined();
});

it("leaves a range's base-merged files out of its file check", async () => {
  const git = history({ [fromBase]: { "src/own.ts": "2", "src/merged.ts": "3" }, [fromFirstParent]: { "src/merged.ts": "3" } });
  expect(await readRangeMergedInPaths(git.exec, "/repository", { ...content, scope: { kind: "range" },
    paths: ["src/own.ts", "src/merged.ts"] })).toEqual(["src/merged.ts"]);
});

it("leaves every file in for a staged request or a base branch with no remote tip, reading nothing", async () => {
  const exec: GitExec = async () => { throw new Error("no comparison is needed"); };
  expect(await readRangeMergedInPaths(exec, "/repository", { ...content, scope: { kind: "staged" },
    paths: ["src/merged.ts"] })).toEqual([]);
  expect(await readRangeMergedInPaths(exec, "/repository", { ...content, scope: { kind: "range" }, remoteBase: undefined,
    paths: ["src/merged.ts"] })).toEqual([]);
});

it("leaves every file in when Git cannot compare the trees", async () => {
  const { exec } = scriptGitExec([{ match: { prefix: [] }, responses: [{ failure: { exitCode: 128, stderr: "bad object" } }] }]);
  expect(await readRangeMergedInPaths(exec, "/repository", { ...content, scope: { kind: "range" },
    paths: ["src/own.ts", "src/merged.ts"] })).toEqual([]);
});
