/** Check snapshot cleanup and index isolation at the injectable Git boundary. */
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { stagedIndexTree, stagedWorktreeTree } from "../../../../src/lib/checks/tree.js";
import { scriptGitExec } from "../../../helpers/git-exec-fake.js";

it("removes the temporary index after Git fails while preserving the real index", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-check-index-cleanup-"));
  const index = join(cwd, "index");
  await writeFile(index, "original index bytes");
  let temporaryIndex: string | undefined;
  const { exec } = scriptGitExec([
    { match: ["rev-parse", "--git-path", "index"], responses: [{ stdout: index }] },
    { match: ["add", "-A"], responses: [async ({ options }) => {
      temporaryIndex = options?.indexFile;
      expect(await readFile(temporaryIndex!, "utf8")).toBe("original index bytes");
      return { failure: { exitCode: 1, stderr: "staging failed" } };
    }] },
  ]);
  try {
    await expect(stagedWorktreeTree(exec, cwd)).rejects.toThrow();
    expect(await readFile(index, "utf8")).toBe("original index bytes");
    expect(temporaryIndex).toBeDefined();
    await expect(access(dirname(temporaryIndex!))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it.each([false, true])("writes a staged tree through a private copy of the index, inherited=%s", async inherited => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-check-staged-tree-"));
  const index = join(cwd, inherited ? "hook-index" : "index");
  await writeFile(index, "original index bytes");
  let privateIndex: string | undefined;
  const { exec } = scriptGitExec([
    { match: ["rev-parse", "--git-path", "index"], responses: [{ stdout: index }] },
    { match: ["write-tree"], responses: [async ({ options }) => {
      privateIndex = options?.indexFile;
      expect(await readFile(privateIndex!, "utf8")).toBe("original index bytes");
      await writeFile(privateIndex!, "index rewritten by Git");
      return { stdout: "c".repeat(40) };
    }] },
  ]);
  try {
    expect(await stagedIndexTree(exec, cwd, inherited ? index : undefined)).toBe("c".repeat(40));
    expect(privateIndex).not.toBe(index);
    expect(await readFile(index, "utf8")).toBe("original index bytes");
    await expect(access(dirname(privateIndex!))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

it("writes an absent index's staged tree from an empty private index", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-check-staged-tree-"));
  const emptied: (string | undefined)[] = [];
  const { exec, calls } = scriptGitExec([
    { match: ["rev-parse", "--git-path", "index"], responses: [{ stdout: join(cwd, "absent") }] },
    { match: ["read-tree", "--empty"], responses: [({ options }) => { emptied.push(options?.indexFile); return { stdout: "" }; }] },
    { match: ["write-tree"], responses: [{ stdout: "e".repeat(40) }] },
  ]);
  try {
    expect(await stagedIndexTree(exec, cwd)).toBe("e".repeat(40));
    expect(emptied).toEqual([calls.at(-1)?.options?.indexFile]);
    await expect(access(join(cwd, "absent"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
