import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { createInRepoTerminalTransitionRecordWriter } from "../../src/lib/work-unit/terminal-transition-record-writer.js";
import type { TransitionRecord } from "../../src/lib/work-unit/transition-record.js";
import {
  resolveTransitionRecordPath,
  resolveTransitionRecordRelativePath,
  writeTransitionRecord,
} from "../../src/lib/work-unit/transition-record-store.js";

const roots: string[] = [];
const record: TransitionRecord = {
  schemaVersion: 1,
  origin: "retired-origin",
  kind: "abandon",
  successors: [],
  edges: [],
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repository() {
  const root = await mkdtemp(join(tmpdir(), "arc-terminal-transition-writer-"));
  roots.push(root);
  const rawExec = createExecaGitExec();
  const exec = async (command: string, args: string[], options?: { cwd?: string }) =>
    rawExec(command, args, { ...options, cwd: root });
  await exec("git", ["init", "-b", "main"]);
  await exec("git", ["config", "user.name", "ARC Test"]);
  await exec("git", ["config", "user.email", "arc@example.test"]);
  await writeFile(join(root, "seed.txt"), "seed\n");
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", "seed"]);
  return { root, exec };
}

function writer(repo: Awaited<ReturnType<typeof repository>>) {
  return createInRepoTerminalTransitionRecordWriter({
    cwd: repo.root,
    exec: repo.exec,
    createRecord: (candidate) => writeTransitionRecord(repo.root, candidate),
    removeRecord: (origin) => rm(resolveTransitionRecordPath(repo.root, origin), { force: true }),
  });
}

describe("terminal transition record writer over Git", () => {
  it("refuses a committed record that is deleted only from the worktree", async () => {
    const repo = await repository();
    await writeTransitionRecord(repo.root, record);
    await repo.exec("git", ["add", "."]);
    await repo.exec("git", ["commit", "-m", "record transition"]);
    const path = resolveTransitionRecordRelativePath(record.origin);
    await rm(resolveTransitionRecordPath(repo.root, record.origin));

    await expect(writer(repo).record(record)).resolves.toEqual({ status: "origin-occupied" });

    expect(await repo.exec("git", ["status", "--porcelain=v1", "--", path]))
      .toMatchObject({ stdout: expect.stringContaining(` D ${path}`) });
  });

  it("preserves a staged record entry that is absent from the worktree", async () => {
    const repo = await repository();
    const path = resolveTransitionRecordRelativePath(record.origin);
    const absolute = resolveTransitionRecordPath(repo.root, record.origin);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, "prior staged content\n");
    await repo.exec("git", ["add", "--", path]);
    const before = (await repo.exec("git", ["show", `:${path}`])).stdout;
    await rm(absolute);

    await expect(writer(repo).record(record)).resolves.toEqual({ status: "origin-occupied" });

    expect((await repo.exec("git", ["show", `:${path}`])).stdout).toBe(before);
    await expect(readFile(absolute)).rejects.toThrow();
  });
});
