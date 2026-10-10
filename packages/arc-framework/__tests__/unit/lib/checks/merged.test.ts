/** Uncapped first-parent range parsing and recoverable repository read failures. */
import { expect, it } from "vitest";
import { readCheckMergedParents } from "../../../../src/lib/checks/merged.js";
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
