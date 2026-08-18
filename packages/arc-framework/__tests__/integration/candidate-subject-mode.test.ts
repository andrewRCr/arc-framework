import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { collectGitCandidateTarget } from "../../src/lib/work-unit/git-candidate-subject.js";

const roots: string[] = [];
const exec = createExecaGitExec();

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
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

    const regular = await collectGitCandidateTarget({
      cwd: root,
      name: "example",
      baseBranch: "main",
      exec,
    });
    await git(root, "update-index", "--chmod=+x", "script.sh");
    const executable = await collectGitCandidateTarget({
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
});
