import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";

const roots: string[] = [];
const exec = createExecaGitExec();

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

/** The collected subject, so a test reading the success arm says what it expects of a refusal by failing. */
async function collectSubject(
  input: Parameters<typeof collectGitCandidateSubject>[0],
): Promise<Extract<Awaited<ReturnType<typeof collectGitCandidateSubject>>, { status: "collected" }>["target"]> {
  const collection = await collectGitCandidateSubject(input);
  if (collection.status !== "collected") {
    throw new Error(`the subject was refused as ${collection.reason}`);
  }
  return collection.target;
}

/** An empty repository on `main`, carrying the identity a commit needs. */
async function initRepository(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "ARC Test");
  await git(root, "config", "user.email", "arc@example.test");
  return root;
}

/** Write one repository-relative path, creating the directories above it. */
async function writeAt(root: string, path: string, content: string): Promise<void> {
  const absolute = join(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

/** The paths the collected subject carries, in path order rather than the digest order it stores them in. */
function subjectPaths(target: Awaited<ReturnType<typeof collectSubject>>): string[] {
  return target.subject.entries.map((entry) => entry.path).sort();
}

describe("Git Candidate subject modes", () => {
  it("changes the reviewable subject when staged executable mode changes over identical bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-candidate-mode-"));
    roots.push(root);
    await git(root, "init", "-b", "main");
    await git(root, "config", "user.name", "ARC Test");
    await git(root, "config", "user.email", "arc@example.test");
    const script = join(root, "script.sh");
    await writeFile(script, "echo base\n", "utf8");
    await git(root, "add", "script.sh");
    await git(root, "commit", "-m", "base");
    await git(root, "switch", "-c", "feat/example");
    await writeFile(script, "echo changed\n", "utf8");
    await git(root, "add", "script.sh");

    const regular = await collectSubject({
      cwd: root,
      name: "example",
      baseBranch: "main",
      exec,
    });
    await git(root, "update-index", "--chmod=+x", "script.sh");
    const executable = await collectSubject({
      cwd: root,
      name: "example",
      baseBranch: "main",
      exec,
    });

    expect(regular.subject.entries).toHaveLength(1);
    expect(executable.subject.entries).toHaveLength(1);
    expect(regular.subject.entries[0]).toMatchObject({ path: "script.sh", mode: "100644" });
    expect(executable.subject.entries[0]).toMatchObject({ path: "script.sh", mode: "100755" });
    expect(executable.subject.entries[0]?.digest).toBe(regular.subject.entries[0]?.digest);
    expect(executable.subject.subjectDigest).not.toBe(regular.subject.subjectDigest);
  });

  it("collects staged and committed gitlink pointer changes without requiring the target objects", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-candidate-gitlink-"));
    roots.push(root);
    await git(root, "init", "-b", "main");
    await git(root, "config", "user.name", "ARC Test");
    await git(root, "config", "user.email", "arc@example.test");
    await writeFile(join(root, "README.md"), "base\n", "utf8");
    await git(root, "add", "README.md");
    await git(root, "commit", "-m", "base");
    await git(root, "switch", "-c", "feat/example");
    const firstOid = "a".repeat(40);
    const secondOid = "b".repeat(40);
    await git(root, "update-index", "--add", "--cacheinfo", `160000,${firstOid},vendor/library`);

    const staged = await collectSubject({
      cwd: root,
      name: "example",
      baseBranch: "main",
      exec,
    });
    expect(staged.subject.entries).toEqual([
      expect.objectContaining({ path: "vendor/library", mode: "160000" }),
    ]);

    await git(root, "commit", "-m", "add submodule pointer");
    await git(root, "update-index", "--cacheinfo", `160000,${secondOid},vendor/library`);
    await git(root, "commit", "-m", "move submodule pointer");
    const revision = await git(root, "rev-parse", "HEAD");
    const committed = await collectSubject({
      cwd: root,
      name: "example",
      baseBranch: "main",
      revision,
      exec,
    });

    expect(committed.subject.entries).toEqual([
      expect.objectContaining({ path: "vendor/library", mode: "160000" }),
    ]);
    expect(committed.subject.entries[0]?.digest).not.toBe(staged.subject.entries[0]?.digest);
  });
});

describe("Git Candidate subject over the branch's own history", () => {
  it("leaves no entry for a path the branch changed and then changed back", async () => {
    const root = await initRepository("arc-candidate-reverted-");
    await writeAt(root, "src/kept.ts", "base\n");
    await writeAt(root, "src/reverted.ts", "base\n");
    await git(root, "add", "-A");
    await git(root, "commit", "-m", "base");
    const base = await git(root, "rev-parse", "HEAD");
    await git(root, "switch", "-c", "feat/example");
    await writeAt(root, "src/kept.ts", "branch\n");
    await writeAt(root, "src/reverted.ts", "branch\n");
    await git(root, "add", "-A");
    await git(root, "commit", "-m", "change both paths");
    await writeAt(root, "src/reverted.ts", "base\n");
    await git(root, "add", "-A");
    await git(root, "commit", "-m", "change one of them back");

    const target = await collectSubject({
      cwd: root,
      name: "example",
      baseBranch: "main",
      baseRevision: base,
      revision: await git(root, "rev-parse", "HEAD"),
      exec,
    });

    // The reverted path is a no-op against the base whatever its own commits did on the way, and an entry
    // for it would digest into the subject permanently — so an attested Candidate could never read current.
    expect(subjectPaths(target)).toEqual(["src/kept.ts"]);
  });

  it("contributes a base-changed path the branch kept its own side of through a base merge", async () => {
    const root = await initRepository("arc-candidate-retained-");
    await writeAt(root, "src/contested.ts", "base\n");
    await writeAt(root, "src/branch-only.ts", "base\n");
    await git(root, "add", "-A");
    await git(root, "commit", "-m", "base");
    await git(root, "switch", "-c", "feat/example");
    await writeAt(root, "src/branch-only.ts", "branch\n");
    await git(root, "add", "-A");
    await git(root, "commit", "-m", "branch work");
    await git(root, "switch", "main");
    await writeAt(root, "src/contested.ts", "advanced\n");
    await git(root, "add", "-A");
    await git(root, "commit", "-m", "advance the base");
    const base = await git(root, "rev-parse", "HEAD");
    await git(root, "switch", "feat/example");
    // The retention lives in the merge's own resolution and nowhere else: no commit of the branch's names
    // this path, so the branch's commits say nothing whatever about what it holds there now.
    await git(root, "merge", "--no-ff", "--no-commit", "main");
    await writeAt(root, "src/contested.ts", "base\n");
    await git(root, "add", "-A");
    await git(root, "commit", "-m", "keep the branch's own side of the contested path");

    const target = await collectSubject({
      cwd: root,
      name: "example",
      baseBranch: "main",
      baseRevision: base,
      revision: await git(root, "rev-parse", "HEAD"),
      exec,
    });

    expect(subjectPaths(target)).toEqual(["src/branch-only.ts", "src/contested.ts"]);
  });
});
