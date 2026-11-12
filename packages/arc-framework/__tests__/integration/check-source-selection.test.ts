/** Selected source basis and HEAD evidence through the real Git boundary. */
import { afterEach, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepoCore, removeGitBackedDirs } from "../helpers/temp-repo.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { resolveCheckRequest } from "../../src/lib/checks/resolve-request.js";
import { requireSourceCoordinates } from "../../src/lib/checks/runner/source-selection.js";

const git = createExecaGitExec();
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

it("distinguishes a verified unborn HEAD while retaining first-worktree content", async () => {
  const cwd = await createTempRepoCore({ prefix: "arc-source-unborn-" });
  repositories.push(cwd);
  await writeFile(join(cwd, "first.txt"), "first\n");
  const result = await resolveCheckRequest(git, cwd, { form: { kind: "run", ids: ["check"] } });
  expect(result).toMatchObject({ status: "resolved", request: { source: { kind: "worktree", head: { status: "unborn" } } } });
  if (result.status !== "resolved") throw new Error("Expected selected source");
  expect((await git("git", ["show", `${result.request.tree}:first.txt`], { cwd })).stdout).toBe("first");
  expect(requireSourceCoordinates(result.request)).toEqual({ tree: result.request.tree, merged: [] });
});

async function committedFixture(): Promise<string> {
  const cwd = await createTempRepoCore({ prefix: "arc-source-selected-" });
  repositories.push(cwd);
  await writeFile(join(cwd, "source.txt"), "base\n");
  await git("git", ["add", "-A"], { cwd });
  await git("git", ["commit", "-m", "base"], { cwd });
  return cwd;
}

it("retains distinct worktree, index and pushed-commit code despite later live changes", async () => {
  const cwd = await committedFixture();
  const tip = (await git("git", ["rev-parse", "HEAD"], { cwd })).stdout;
  await writeFile(join(cwd, "source.txt"), "pushed\n");
  await git("git", ["add", "-A"], { cwd });
  await git("git", ["commit", "-m", "later"], { cwd });
  const callerHead = (await git("git", ["rev-parse", "HEAD"], { cwd })).stdout;
  await writeFile(join(cwd, "source.txt"), "index\n");
  await git("git", ["add", "-A"], { cwd });
  await writeFile(join(cwd, "source.txt"), "worktree\n");
  const requests = [
    { form: { kind: "run" as const, ids: ["check"] } },
    { form: { kind: "pre-commit" as const } },
    { form: { kind: "pre-push" as const, ref: "refs/heads/topic", tip, old: tip } },
  ];
  const selected = [];
  for (const request of requests) {
    const result = await resolveCheckRequest(git, cwd, request);
    if (result.status !== "resolved") throw new Error(result.message);
    selected.push({ basis: result.request.source.kind, coordinates: requireSourceCoordinates(result.request),
      bytes: (await git("git", ["show", `${result.request.tree}:source.txt`], { cwd })).stdout });
  }
  expect(selected.map(({ basis, bytes, coordinates }) => ({ basis, bytes, head: coordinates.head }))).toEqual([
    { basis: "worktree", bytes: "worktree", head: callerHead },
    { basis: "index", bytes: "index", head: callerHead },
    { basis: "commit", bytes: "base", head: tip },
  ]);
  expect(selected[2]?.coordinates.base).toBe(tip);
  expect(await readFile(join(cwd, "source.txt"), "utf8")).toBe("worktree\n");
});

it.each(["symbolic", "detached"])("refuses an unresolved %s HEAD for routing and succeeds after repair", async kind => {
  const cwd = await committedFixture();
  const commit = (await git("git", ["rev-parse", "HEAD"], { cwd })).stdout;
  const path = kind === "symbolic"
    ? join(cwd, (await git("git", ["symbolic-ref", "HEAD"], { cwd })).stdout.replace(/^refs\//u, ".git/refs/"))
    : join(cwd, ".git", "HEAD");
  const original = await readFile(path);
  await writeFile(path, `${"f".repeat(commit.length)}\n`);
  const broken = await resolveCheckRequest(git, cwd, { form: { kind: "run", ids: ["check"] } });
  expect(broken).toMatchObject({ status: "resolved", request: { source: { head: { status: "unavailable" } } } });
  if (broken.status !== "resolved") throw new Error(broken.message);
  expect(() => requireSourceCoordinates(broken.request)).toThrow(/repair.*retry.*local/iu);
  await writeFile(path, original);
  const repaired = await resolveCheckRequest(git, cwd, { form: { kind: "run", ids: ["check"] } });
  if (repaired.status !== "resolved") throw new Error(repaired.message);
  expect(requireSourceCoordinates(repaired.request).head).toBe(commit);
});
