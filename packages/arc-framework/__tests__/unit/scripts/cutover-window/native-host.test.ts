/** Native host reads are complete, bound to origin, and fail closed. */
import { describe, expect, it } from "vitest";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import { createWindowHost } from "../../../../src/scripts/cutover-window/native-host.js";
import type { GitExecScriptEntry, GitFailureEvidence } from "../../../helpers/git-exec-fake.js";

const origin: GitExecScriptEntry = { match: ["remote", "get-url", "origin"],
  responses: [{ stdout: "git@github.com:owner/repo.git" }] };
const refusal = { findings: [expect.objectContaining({ subject: expect.any(String), condition: expect.any(String),
  remedy: expect.stringContaining("retry") })] };
function host(entries: GitExecScriptEntry[]) {
  return createWindowHost({ exec: scriptGitExec([origin, ...entries]).exec, repo: "/target", listingLimit: 3 });
}

describe("native window host", () => {
  it("reports a failed ref read with a retry route, then succeeds after repair", async () => {
    const port = host([{ match: ["ls-remote", "origin", "refs/heads/*"], responses: [
      { failure: { exitCode: 128, stderr: "fatal: could not read from remote repository" } },
      { stdout: `${"a".repeat(40)}\trefs/heads/main\n` },
    ] }]);
    await expect(port.refs(["refs/heads/*"])).rejects.toMatchObject(refusal);
    expect(await port.refs(["refs/heads/*"])).toEqual({ "refs/heads/main": "a".repeat(40) });
  });
});

it("keeps full branch and store prefixes, and only direct identity refs", async () => {
  const oid = "b".repeat(40);
  const line = (ref: string) => `${oid}\t${ref}\n`;
  const branch = "refs/heads/foo/refs/arc/user/z/errands";
  const identity = "refs/arc/user/andrew/errands";
  const nested = "refs/arc/user/andrew/nested/errands";
  const port = host([
    { match: ["ls-remote", "origin", "refs/heads/*"], responses: [{ stdout:
      line("refs/heads/main") + line(branch) + line("refs/other/refs/heads/ghost") }] },
    { match: ["ls-remote", "origin", "refs/arc/*"], responses: [{ stdout:
      line("refs/arc/project/registry") + line(identity) + line(nested) + line(branch) }] },
    { match: ["ls-remote", "origin", "refs/arc/user/*/errands"], responses: [{ stdout:
      line(identity) + line(nested) + line(branch) }] },
    { match: ["ls-remote", "origin", "refs/heads/main"], responses: [{ stdout:
      line("refs/heads/main") + line("refs/heads/other/refs/heads/main") }] },
  ]);
  expect(await Promise.all([port.refs(["refs/heads/*"]), port.refs(["refs/arc/*"]),
    port.refs(["refs/arc/user/*/errands"]), port.refs(["refs/heads/main"])]))
    .toEqual([{ "refs/heads/main": oid, [branch]: oid },
      { "refs/arc/project/registry": oid, [identity]: oid, [nested]: oid },
      { [identity]: oid }, { "refs/heads/main": oid }]);
});

const pr = { number: 7, headRefName: "feat/flip", baseRefName: "main" };
const listArgs = ["pr", "list", "--repo", "github.com/owner/repo", "--state", "open", "--limit", "3",
  "--json", "number,headRefName,baseRefName"];
const viewArgs = ["pr", "view", "7", "--repo", "github.com/owner/repo", "--json", "number,headRefName,baseRefName,autoMergeRequest"];

it("refuses a failed or possibly truncated request listing, then reads complete facts after repair", async () => {
  const port = host([
    { command: "gh", match: listArgs, responses: [
      { failure: { exitCode: 4, stderr: "To get started with GitHub CLI, please run: gh auth login" } },
      { stdout: JSON.stringify([pr, { ...pr, number: 8 }, { ...pr, number: 9 }]) },
      { stdout: JSON.stringify([pr]) },
    ] },
    { command: "gh", match: viewArgs, responses: [{ stdout: JSON.stringify({ ...pr, autoMergeRequest: null }) }] },
  ]);
  await expect(port.pullRequests(7)).rejects.toMatchObject(refusal);
  await expect(port.pullRequests(7)).rejects.toMatchObject({ findings: [expect.objectContaining({
    condition: expect.stringContaining("possibly truncated"), remedy: expect.stringContaining("retry"),
  })] });
  expect(await port.pullRequests(7)).toEqual({
    open: [{ number: 7, headBranch: "feat/flip", baseBranch: "main" }],
    flip: { number: 7, headBranch: "feat/flip", baseBranch: "main", autoMergeArmed: false },
  });
});

it.each([undefined, { enabledAt: "2026-11-12T10:00:00Z" }])("reports or refuses flip auto-merge evidence %j", async autoMergeRequest => {
  const port = host([
    { command: "gh", match: listArgs, responses: [{ stdout: JSON.stringify([pr]) }] },
    { command: "gh", match: viewArgs, responses: [{ stdout: JSON.stringify({ ...pr, autoMergeRequest }) }] },
  ]);
  if (autoMergeRequest === undefined) await expect(port.pullRequests(7)).rejects.toMatchObject(refusal);
  else expect((await port.pullRequests(7)).flip.autoMergeArmed).toBe(true);
});

it.each([
  { allow_squash_merge: false }, { allow_rebase_merge: false }, {},
  { allow_squash_merge: "false", allow_rebase_merge: false },
])("refuses unknown merge settings %j and reads them after repair", async settings => {
  const port = host([{ command: "gh", match: ["api", "--hostname", "github.com", "repos/owner/repo"], responses: [
    { stdout: JSON.stringify(settings) }, { stdout: '{"allow_squash_merge":false,"allow_rebase_merge":false}' },
  ] }]);
  await expect(port.mergeSettings()).rejects.toMatchObject(refusal);
  expect(await port.mergeSettings()).toEqual({ allowSquash: false, allowRebase: false });
});

it("reports enabled merge methods without treating them as absent", async () => {
  const port = host([{ command: "gh", match: ["api", "--hostname", "github.com", "repos/owner/repo"],
    responses: [{ stdout: '{"allow_squash_merge":true,"allow_rebase_merge":true}' }] }]);
  expect(await port.mergeSettings()).toEqual({ allowSquash: true, allowRebase: true });
});

const discoveryArgs = ["repo", "view", "--json", "nameWithOwner"];
const noKnownHost = "none of the git remotes configured for this repository point to a known GitHub host.\n";
it("discovers a repository or the one explicit no-known-host answer", async () => {
  const port = host([{ command: "gh", match: discoveryArgs, responses: [
    { stdout: '{"nameWithOwner":"owner/repo"}' }, { failure: { exitCode: 1, stderr: noKnownHost } },
  ] }]);
  expect(await port.discoverRepository()).toBe("owner/repo");
  expect(await port.discoverRepository()).toBeNull();
});

it.each<GitFailureEvidence>([
  { exitCode: 4, stderr: "To get started with GitHub CLI, please run: gh auth login" },
  { exitCode: 1, stderr: "fatal: not a git repository (or any of the parent directories): .git" },
  { exitCode: 4, stderr: noKnownHost },
  { timedOut: true, stderr: noKnownHost },
])("refuses discovery failure %j and discovers after repair", async failure => {
  const port = host([{ command: "gh", match: discoveryArgs, responses: [
    { failure }, { stdout: '{"nameWithOwner":"owner/repo"}' },
  ] }]);
  await expect(port.discoverRepository()).rejects.toMatchObject(refusal);
  expect(await port.discoverRepository()).toBe("owner/repo");
});
