/** Commit inventory and branch resolution preserve incomplete Git failures. */
import { expect, it } from "vitest";
import { computeDefaultCaptureSet, resolveLinkedCheckoutBranch } from "../../../src/lib/git/default-capture-set.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

it("returns the qualified branch link and its authority for the checkout's canonical HEAD ref", async () => {
  const { exec } = scriptGitExec([{ match: ["symbolic-ref", "--quiet", "HEAD"],
    responses: [{ stdout: "refs/heads/feat/example\n", stderr: "" }] }]);
  const link = { repository: "project", ref: "refs/heads/feat/example", linkedAs: "adopted" as const,
    excluded: [{ repository: "project", sha: "a".repeat(40) }] };
  expect(await resolveLinkedCheckoutBranch({ exec, cwd: "/checkout", repository: "project", branches: [link] }))
    .toEqual({ kind: "linked", link });
});

it.each([false, true])("reports equivalent links as ambiguous regardless of order, reversed=%s", async (reverse) => {
  const { exec } = scriptGitExec([{ match: ["symbolic-ref", "--quiet", "HEAD"], responses: [{ stdout: "refs/heads/feat/example" }] }]);
  const first = { repository: "project", ref: "feat/example", linkedAs: "created" as const, excluded: [] };
  const second = { ...first, ref: "refs/heads/feat/example", excluded: [{ repository: "project", sha: "a".repeat(40) }] };
  const branches = reverse ? [second, first] : [first, second];
  expect(await resolveLinkedCheckoutBranch({ exec, cwd: "/checkout", repository: "project", branches }))
    .toEqual({ kind: "ambiguous", branch: "feat/example" });
  expect(await resolveLinkedCheckoutBranch({ exec, cwd: "/checkout", repository: "project",
    branches: [first, { ...second, repository: "elsewhere" }] })).toEqual({ kind: "linked", link: first });
});

const incompleteFailures = [
  { name: "signal", evidence: { signal: "SIGTERM" } },
  { name: "timeout", evidence: { timedOut: true } },
  { name: "cancellation", evidence: { isCanceled: true } },
  { name: "output limit", evidence: { isMaxBuffer: true } },
];
const probes = ["base ref", "refresh branch", "checkout branch"] as const;

it.each(incompleteFailures.flatMap(failure => probes.map(probe => ({ ...failure, probe }))))(
  "preserves $name during the $probe probe and continues after repair", async ({ evidence, probe }) => {
    const failure = Object.assign(new Error("Git probe did not complete"), { exitCode: 1, ...evidence });
    const failingArgs = probe === "checkout branch" ? ["symbolic-ref", "--quiet", "HEAD"]
      : ["--no-replace-objects", "rev-parse", "--verify", "--quiet",
        probe === "base ref" ? "refs/remotes/origin/main^{commit}" : "refs/remotes/origin/feat/work^{commit}"];
    let broken = true;
    const exec: GitExec = async (_command, args) => {
      if (broken && args.join("\0") === failingArgs.join("\0")) throw failure;
      if (args[0] === "symbolic-ref") return { stdout: "refs/heads/feat/work\n", stderr: "" };
      if (args[0] === "remote" || args[1] === "rev-list") return { stdout: "", stderr: "" };
      if (args[1] === "rev-parse") return { stdout: "a".repeat(40), stderr: "" };
      throw new Error(`Unexpected Git command: ${args.join(" ")}`);
    };
    const link = { repository: "project", ref: "feat/work", linkedAs: "created" as const, excluded: [] };
    const input = { exec, cwd: "/checkout", repository: "project", baseBranch: "main", refresh: false,
      ...(probe === "refresh branch" ? { refreshBranch: "feat/work" } : {}) };
    const run = () => probe === "checkout branch"
      ? resolveLinkedCheckoutBranch({ ...input, branches: [link] }) : computeDefaultCaptureSet(input);
    await expect(run()).rejects.toBe(failure);
    broken = false;
    expect(await run()).toMatchObject(probe === "checkout branch"
      ? { kind: "linked", link } : { status: "available", commits: [] });
  },
);
