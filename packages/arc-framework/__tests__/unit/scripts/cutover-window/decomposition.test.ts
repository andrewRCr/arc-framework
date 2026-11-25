/** Candidate ancestry decisions retain local and fetched branch coordinates. */
import { expect, it } from "vitest";
import { readWindowDecompositionBranchFindings } from "../../../../src/scripts/cutover-window/decomposition.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";

const main = "a".repeat(40), tip = "b".repeat(40), branch = "chore/decompose-alpha";

it.each(["local", "origin"] as const)("refuses an uncontained %s candidate and passes once main contains it", async side => {
  const exec = scriptGitExec([{ match: ["--no-replace-objects", "merge-base", "--is-ancestor", tip, main],
    responses: [{ failure: { exitCode: 1 } }, { stdout: "" }] }]).exec;
  const branches: { local: Record<string, string>; origin: Record<string, string> } = {
    local: { main, ...side === "local" ? { [branch]: tip } : {} }, origin: side === "origin" ? { [branch]: tip } : {},
  };
  const io = { repo: "/target", exec };
  expect(await readWindowDecompositionBranchFindings(io, branches)).toEqual([expect.objectContaining({
    subject: `${side === "local" ? "refs/heads/" : "refs/remotes/origin/"}${branch}`,
    condition: expect.stringContaining("not contained"), remedy: expect.stringMatching(/land.*delete/iu),
  })]);
  expect(await readWindowDecompositionBranchFindings(io, branches)).toEqual([]);
});

it.each([{ exitCode: 128, stderr: "unreadable commit" }, { exitCode: 1, timedOut: true, stderr: "ancestry timed out" }])(
  "reports unavailable ancestry with a repair route: %j", async failure => {
    const exec = scriptGitExec([{ match: ["--no-replace-objects", "merge-base", "--is-ancestor", tip, main],
      responses: [{ failure }, { stdout: "" }] }]).exec;
    const io = { repo: "/target", exec }, branches = { local: { main, [branch]: tip }, origin: {} };
    expect(await readWindowDecompositionBranchFindings(io, branches)).toEqual([expect.objectContaining({
      subject: `refs/heads/${branch}`, condition: expect.stringContaining(failure.stderr), remedy: expect.stringContaining("retry"),
    })]);
    expect(await readWindowDecompositionBranchFindings(io, branches)).toEqual([]);
  });
