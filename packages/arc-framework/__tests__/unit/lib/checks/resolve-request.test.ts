/** Base ambiguity and unavailable automatic coordinates remain non-refusing. */
import { expect, it } from "vitest";
import { resolveCheckRequest, resolveCheckBaseBranch } from "../../../../src/lib/checks/resolve-request.js";
import type { CheckRequest } from "../../../../src/lib/checks/request.js";
import type { CheckSourceSelection } from "../../../../src/lib/checks/resolve-request.js";
import { scriptGitExec, type GitExecScriptEntry } from "../../../helpers/git-exec-fake.js";
const base = "b".repeat(40);
const tree = "c".repeat(40);
const merge = "a".repeat(40);
function ref(ref: string, stdout?: string): GitExecScriptEntry {
  return { match: ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
    responses: [stdout === undefined ? { failure: { exitCode: 128 } } : { stdout, stderr: "" }] };
}
const snapshot: GitExecScriptEntry[] = [
  { match: ["rev-parse", "--git-path", "index"], responses: [{ stdout: "/absent/index", stderr: "" }] },
  { match: ["read-tree", "--empty"], responses: [{ stdout: "", stderr: "" }] },
  { match: ["add", "-A"], responses: [{ stdout: "", stderr: "" }] },
  { match: ["write-tree"], responses: [{ stdout: tree, stderr: "" }] },
];
it.each([
  { name: "ambiguous", response: { stdout: `${merge}\n${base}\n`, stderr: "" } },
  { name: "unrelated", response: { failure: { exitCode: 1 } } },
  { name: "unavailable", response: { failure: { exitCode: 128 } } },
])("resolves an automatic $name base without exporting a base or refusing", async ({ response }) => {
  const { exec } = scriptGitExec([ref("HEAD", merge), ref("main@{upstream}"), ref("refs/heads/main", base),
    { match: ["merge-base", "--all", merge, base], responses: [response] }, ...snapshot]);
  const result = await resolveCheckRequest(exec, "/repository", { form: { kind: "gate", gate: "commit" }, scope: { kind: "range" } });
  expect(result).toEqual({ status: "resolved", request: { scope: { kind: "range" }, tree,
    source: { kind: "worktree", head: { status: "known", commit: merge } } } });
});
it("resolves a missing automatic base without exporting a base or refusing", async () => {
  const { exec } = scriptGitExec([ref("HEAD", merge), ref("@{upstream}"), ref("main@{upstream}"), ref("refs/heads/main"), ...snapshot]);
  expect(await resolveCheckRequest(exec, "/repository", { form: { kind: "segment" } }))
    .toEqual({ status: "resolved", request: { scope: { kind: "range" }, tree,
      source: { kind: "worktree", head: { status: "known", commit: merge } } } });
});
it("prefers the pushed remote's base over the local base, and falls back when absent", async () => {
  const remote = scriptGitExec([ref("refs/remotes/team/trunk", merge), ref("refs/heads/trunk", base)]);
  expect(await resolveCheckBaseBranch(remote.exec, "/repository", "trunk", "team")).toBe(merge);
  const local = scriptGitExec([ref("refs/remotes/team/trunk"), ref("refs/heads/trunk", base)]);
  expect(await resolveCheckBaseBranch(local.exec, "/repository", "trunk", "team")).toBe(base);
});

it.each([
  { name: "worktree", request: { form: { kind: "run", ids: ["check"] } }, source: { kind: "worktree", head: { status: "known", commit: merge } } },
  { name: "index", request: { form: { kind: "pre-commit" }, indexFile: "/absent/selected-index" },
    source: { kind: "index", indexFile: "/absent/selected-index", head: { status: "known", commit: merge } } },
  { name: "commit", request: { form: { kind: "pre-push", ref: "refs/heads/topic", tip: merge, old: base } },
    source: { kind: "commit", commit: merge, head: { status: "known", commit: merge } } },
] satisfies { name: string; request: CheckRequest; source: CheckSourceSelection }[])("retains the selected $name source basis and logical HEAD", async ({ request, source }) => {
  const { exec } = scriptGitExec([ref("HEAD", merge), ref(merge, merge), ref(base, base),
    { match: ["rev-parse", "--verify", `${merge}^{tree}`], responses: [{ stdout: tree, stderr: "" }] },
    { match: { prefix: ["rev-list", "--first-parent", "--merges"] }, responses: [{ stdout: "", stderr: "" }] },
    { match: ["rev-parse", "--path-format=absolute", "--git-path", "MERGE_HEAD"], responses: [{ stdout: "/absent/MERGE_HEAD", stderr: "" }] },
    ...snapshot]);
  const result = await resolveCheckRequest(exec, "/repository", request);
  expect(result).toMatchObject({ status: "resolved", request: { tree, source } });
  if (request.form.kind === "pre-push") expect(result).toMatchObject({ request: { base } });
});
