/** Partial staging uses the intersection of staged and unstaged Git paths. */
import { expect, it } from "vitest";
import { findPartiallyStagedChecks } from "../../../../src/lib/checks/partial-staging.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
const base = "a".repeat(40), tree = "b".repeat(40), worktree = "c".repeat(40);
const raw = (path: string, old = "d", next = "e") => `:100644 100644 ${old.repeat(40)} ${next.repeat(40)} M\0${path}\0`;
it("refuses only the staged paths that also differ in the worktree", async () => {
  const { exec } = scriptGitExec([
    { match: { prefix: ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", base, tree] },
      responses: [{ stdout: raw("src/partial.ts") + raw("src/staged.ts"), stderr: "" }] },
    { match: { prefix: ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", tree, worktree] },
      responses: [{ stdout: raw("src/partial.ts", "e", "f") + raw("src/unstaged.ts"), stderr: "" }] },
  ]);
  await expect(findPartiallyStagedChecks({ git: exec, gitInput: async () => "f".repeat(40) }, "/repository",
    { base, tree, worktree }, [{ id: "content", inputs: ["src/**"] }]))
    .resolves.toEqual([{ id: "content", paths: ["src/partial.ts"] }]);
});

it("permits unstaged inputs outside the staged path set", async () => {
  const { exec } = scriptGitExec([
    { match: { prefix: ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", base, tree] },
      responses: [{ stdout: raw("src/staged.ts"), stderr: "" }] },
    { match: { prefix: ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", tree, worktree] },
      responses: [{ stdout: raw("src/unstaged.ts"), stderr: "" }] },
  ]);
  await expect(findPartiallyStagedChecks({ git: exec, gitInput: async () => "f".repeat(40) }, "/repository",
    { base, tree, worktree }, [{ id: "content", inputs: ["src/**"] }])).resolves.toEqual([]);
});

it("finds partially staged additions before the first commit", async () => {
  const { exec } = scriptGitExec([
    { match: { prefix: ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", "f".repeat(40), tree] },
      responses: [{ stdout: `:000000 100644 ${"0".repeat(40)} ${"d".repeat(40)} A\0src/added.ts\0`, stderr: "" }] },
    { match: { prefix: ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", tree, worktree] },
      responses: [{ stdout: raw("src/added.ts"), stderr: "" }] },
  ]);
  await expect(findPartiallyStagedChecks({ git: exec, gitInput: async () => "f".repeat(40) }, "/repository",
    { tree, worktree }, [{ id: "content", inputs: ["src/**"] }]))
    .resolves.toEqual([{ id: "content", paths: ["src/added.ts"] }]);
});


it("retains historical conflicts equal to the first parent at the staging boundary", async () => {
  const { exec } = scriptGitExec([
    { match: { prefix: ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", base, tree] },
      responses: [{ stdout: "", stderr: "" }] },
    { match: { prefix: ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", tree, worktree] },
      responses: [{ stdout: raw("src/conflicted.ts") + raw("src/outside.ts"), stderr: "" }] },
  ]);
  await expect(findPartiallyStagedChecks({ git: exec, gitInput: async () => "f".repeat(40) }, "/repository",
    { base, tree, worktree, mergePaths: ["src/conflicted.ts"] }, [{ id: "content", inputs: ["src/**"] }]))
    .resolves.toEqual([{ id: "content", paths: ["src/conflicted.ts"] }]);
});
