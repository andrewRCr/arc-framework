import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createExecaGitExec,
  createExecaRawGitExec,
} from "../../src/lib/git/process-executor.js";
import { isGitTransitionOriginOccupied } from
  "../../src/lib/work-unit/git-transition-record-enumeration.js";
import { createInRepoTerminalTransitionRecordWriter } from "../../src/lib/work-unit/terminal-transition-record-writer.js";
import {
  serializeTransitionRecord,
  type TransitionRecord,
} from "../../src/lib/work-unit/transition-record.js";
import {
  resolveTransitionRecordPath,
  resolveTransitionRecordRelativePath,
  TRANSITION_RECORD_NAMESPACE,
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
    isOriginOccupied: (origin) => isGitTransitionOriginOccupied(createExecaRawGitExec(repo.root), origin),
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

  it("refuses committed history whose content claims the origin under another filename", async () => {
    const repo = await repository();
    const aliasPath = `${TRANSITION_RECORD_NAMESPACE}/historical-alias.json`;
    await mkdir(dirname(join(repo.root, aliasPath)), { recursive: true });
    await writeFile(join(repo.root, aliasPath), serializeTransitionRecord(record));
    await repo.exec("git", ["add", "--", aliasPath]);
    await repo.exec("git", ["commit", "-m", "record aliased transition"]);

    await expect(writer(repo).record(record)).resolves.toEqual({ status: "origin-occupied" });

    await expect(readFile(resolveTransitionRecordPath(repo.root, record.origin))).rejects.toThrow();
  });

  it("refuses staged history whose content claims the origin under another filename", async () => {
    const repo = await repository();
    const aliasPath = `${TRANSITION_RECORD_NAMESPACE}/staged-alias.json`;
    await mkdir(dirname(join(repo.root, aliasPath)), { recursive: true });
    await writeFile(join(repo.root, aliasPath), serializeTransitionRecord(record));
    await repo.exec("git", ["add", "--", aliasPath]);

    await expect(writer(repo).record(record)).resolves.toEqual({ status: "origin-occupied" });

    await expect(readFile(resolveTransitionRecordPath(repo.root, record.origin))).rejects.toThrow();
  });

  it("allows a mismatched filename whose content claims a different origin", async () => {
    const repo = await repository();
    const aliasPath = `${TRANSITION_RECORD_NAMESPACE}/historical-alias.json`;
    const otherRecord: TransitionRecord = { ...record, origin: "other-origin" };
    await mkdir(dirname(join(repo.root, aliasPath)), { recursive: true });
    await writeFile(join(repo.root, aliasPath), serializeTransitionRecord(otherRecord));
    await repo.exec("git", ["add", "--", aliasPath]);
    await repo.exec("git", ["commit", "-m", "record mismatched transition filename"]);

    await expect(writer(repo).record(record)).resolves.toEqual({ status: "recorded" });

    await expect(readFile(resolveTransitionRecordPath(repo.root, record.origin), "utf8"))
      .resolves.toBe(serializeTransitionRecord(record));
  });
});
