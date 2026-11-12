/** Missing commit reads need independent unborn evidence, including completed process results. */
import { expect, it } from "vitest";
import { readCheckHead } from "../../../../src/lib/checks/head.js";
import { scriptGitExec, type GitFailureEvidence, type GitExecScriptEntry } from "../../../helpers/git-exec-fake.js";

const branch = "refs/heads/main";
const missingHead: GitExecScriptEntry = { match: ["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"],
  responses: [{ failure: { exitCode: 128 } }] };
const symbolic: GitExecScriptEntry = { match: ["symbolic-ref", "--quiet", "HEAD"], responses: [{ stdout: branch, stderr: "" }] };
const validBranch: GitExecScriptEntry = { match: ["check-ref-format", branch], responses: [{ stdout: "", stderr: "" }] };
const absentBranch: GitExecScriptEntry = { match: ["show-ref", "--verify", "--quiet", branch], responses: [{ failure: { exitCode: 1 } }] };

it.each([
  { name: "unreadable branch", entries: [missingHead, symbolic, validBranch,
    { ...absentBranch, responses: [{ failure: { exitCode: 128 } }] }] },
  { name: "existing branch with an unavailable commit", entries: [missingHead, symbolic, validBranch,
    { ...absentBranch, responses: [{ stdout: "", stderr: "" }] }] },
  { name: "detached invalid HEAD", entries: [missingHead,
    { ...symbolic, responses: [{ failure: { exitCode: 1 } }] }] },
  { name: "non-branch symbolic HEAD", entries: [missingHead,
    { ...symbolic, responses: [{ stdout: "refs/tags/missing", stderr: "" }] }] },
  { name: "invalid branch name", entries: [missingHead, symbolic,
    { ...validBranch, responses: [{ failure: { exitCode: 1 } }] }] },
  ...([{ isCanceled: true }, { timedOut: true }, { signal: "SIGTERM" }] satisfies GitFailureEvidence[]).map(failure => ({
    name: JSON.stringify(failure), entries: [{ ...missingHead, responses: [{ failure }] }, symbolic, validBranch, absentBranch],
  })),
] satisfies { name: string; entries: GitExecScriptEntry[] }[])("keeps $name unavailable rather than unborn", async ({ entries }) => {
  expect(await readCheckHead(scriptGitExec(entries).exec, "/repo")).toEqual({ status: "unavailable" });
});
