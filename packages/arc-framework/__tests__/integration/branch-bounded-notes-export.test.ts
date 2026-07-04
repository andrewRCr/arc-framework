/**
 * Integration tests for branch-bounded paired notes export.
 *
 * The local user-notes ref is shared by sibling worktrees, so a paired push
 * must export only notes whose annotated commits are reachable from the branch
 * that just landed. These tests drive real git refs because the behavior
 * depends on notes tree contents and branch reachability.
 */

import { describe, it, expect, afterEach } from "vitest";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  addBareRemote,
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
  makeUserIO,
} from "../helpers/integration.js";
import { runPairedPush, runUserSave } from "../../src/commands/user.js";
import type {
  PairedPushNotesPusher,
  PairedPushNotesPusherResult,
} from "../../src/commands/user.js";
import {
  cleanupBranchBoundedNotesExport,
  type BranchBoundedNotesExportTarget,
  planBranchBoundedNotesExport,
  pushBranchBoundedNotesExport,
} from "../../src/lib/user-sync/branch-bounded-notes-export.js";

const IDENTITY = "test-user";
const NOTES_REF = `refs/notes/arc/user/${IDENTITY}`;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function remoteNoteCommits(remote: string): Promise<string[]> {
  try {
    const stdout = await git(remote, ["notes", `--ref=${NOTES_REF}`, "list"]);
    return stdout
      .split("\n")
      .map((line) => line.trim().split(/\s+/u)[1])
      .filter((commit): commit is string => commit !== undefined)
      .sort();
  } catch {
    return [];
  }
}

async function noteContent(cwd: string, commit: string): Promise<string> {
  return git(cwd, ["notes", `--ref=${NOTES_REF}`, "show", commit]);
}

describe("branch-bounded paired notes export", () => {
  let repo: string | undefined;
  let remote: string | undefined;

  afterEach(async () => {
    if (repo) await cleanupTempDir(repo);
    if (remote) await cleanupTempDir(remote);
    repo = undefined;
    remote = undefined;
  });

  it("exports the landed branch note without publishing a sibling branch note", async () => {
    repo = await createTempRepo("arc-branch-notes-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-a"]);
    const commitA = await makeCommit(repo, "work A");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note A", commitA]);

    await git(repo, ["checkout", "main"]);
    await git(repo, ["checkout", "-b", "work-b"]);
    const commitB = await makeCommit(repo, "work B");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note B", commitB]);

    await git(repo, ["checkout", "work-a"]);
    await git(repo, ["push", "-u", "origin", "work-a"]);

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "work-a",
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;

    try {
      expect(plan.target.annotatedCommits).toEqual([commitA]);
      expect(plan.target.omittedCommits).toEqual([commitB]);

      const outcome = await pushBranchBoundedNotesExport({
        exec: makeGitExec(repo),
        identity: IDENTITY,
        target: plan.target,
      });
      expect(outcome).toEqual({ kind: "pushed" });

      expect(await remoteNoteCommits(remote)).toEqual([commitA]);
      expect(await git(repo, ["ls-remote", "origin", "refs/heads/work-b"])).toBe("");
    } finally {
      await cleanupBranchBoundedNotesExport({
        exec: makeGitExec(repo),
        target: plan.target,
      });
    }
  });

  it("paired push publishes A's note without exporting B's unpushed branch note", async () => {
    repo = await createTempRepo("arc-paired-branch-notes-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-a"]);
    const commitA = await makeCommit(repo, "work A");

    await git(repo, ["checkout", "main"]);
    await git(repo, ["checkout", "-b", "work-b"]);
    const commitB = await makeCommit(repo, "work B");
    const ioB = makeUserIO(repo);
    await mkdir(join(repo, ".arc", "user", IDENTITY), { recursive: true });
    await writeFile(
      join(repo, ".arc", "user", IDENTITY, "SESSION-NOTES.md"),
      "# B notes\n",
      "utf-8",
    );
    await runUserSave({ cwd: repo, io: ioB, identity: IDENTITY });

    await git(repo, ["checkout", "work-a"]);
    await writeFile(
      join(repo, ".arc", "user", IDENTITY, "SESSION-NOTES.md"),
      "# A notes\n",
      "utf-8",
    );
    const ioA = makeUserIO(repo);
    const attemptedTargets: BranchBoundedNotesExportTarget[] = [];
    const pushNotes: PairedPushNotesPusher = async (context): Promise<PairedPushNotesPusherResult> => {
      attemptedTargets.push(context.notesExportTarget);
      const outcome = await pushBranchBoundedNotesExport({
        exec: context.io.exec,
        identity: context.identity,
        target: context.notesExportTarget,
      });
      switch (outcome.kind) {
        case "pushed":
          return { status: "success" };
        case "noop":
          return { status: "noop" };
        case "no-remote":
          return { status: "no-remote" };
        case "failed":
          return { status: "failed", error: outcome.error };
      }
    };

    const result = await runPairedPush({
      cwd: repo,
      io: ioA,
      identity: IDENTITY,
      access,
      branch: "work-a",
      setUpstream: true,
      pushNotes,
    });

    expect(result.exitCode).toBe(0);
    expect(result.worktree.status).toBe("success");
    expect(result.notes.status).toBe("success");

    expect(attemptedTargets[0]?.annotatedCommits).toEqual([commitA]);
    expect(attemptedTargets[0]?.omittedCommits).toEqual([commitB]);
    expect(await remoteNoteCommits(remote)).toEqual([commitA]);
    expect(await git(repo, ["ls-remote", "origin", "refs/heads/work-b"])).toBe("");
  });

  it("refuses a same-commit remote note conflict and leaves local notes unpushed", async () => {
    repo = await createTempRepo("arc-branch-notes-conflict-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-a"]);
    const commitA = await makeCommit(repo, "work A");
    await git(repo, ["push", "-u", "origin", "work-a"]);

    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "remote note", commitA]);
    await git(repo, ["push", "origin", NOTES_REF]);

    await git(repo, ["update-ref", "-d", NOTES_REF]);
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "local note", commitA]);
    const localTipBefore = await git(repo, ["rev-parse", NOTES_REF]);
    const remoteTipBefore = await git(remote, ["rev-parse", NOTES_REF]);

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "work-a",
    });

    expect(plan.kind).toBe("refused");
    if (plan.kind === "refused") {
      expect(plan.message).toContain(commitA.slice(0, 8));
    }
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localTipBefore);
    expect(await git(remote, ["rev-parse", NOTES_REF])).toBe(remoteTipBefore);
    expect(await noteContent(repo, commitA)).toBe("local note");
    expect(await noteContent(remote, commitA)).toBe("remote note");
  });
});
