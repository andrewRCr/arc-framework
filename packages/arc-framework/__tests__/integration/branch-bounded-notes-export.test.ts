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
import { serializeNotesCompactionManifest } from "../../src/lib/user-sync/index.js";

const IDENTITY = "test-user";
const NOTES_REF = `refs/notes/arc/user/${IDENTITY}`;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/**
 * Add a user note directly in the bare remote. `addBareRemote` configures no
 * committer identity, so supply one inline — CI has no global git identity to
 * fall back on (a bare `git notes add` there fails "committer identity unknown").
 */
async function addRemoteNote(remote: string, commit: string, message: string): Promise<void> {
  await git(remote, [
    "-c", "user.email=test@test.com",
    "-c", "user.name=Test User",
    "notes", `--ref=${NOTES_REF}`, "add", "-m", message, commit,
  ]);
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

  it("reuses the local notes ref when every local note is branch-safe", async () => {
    repo = await createTempRepo("arc-branch-notes-local-safe-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-a"]);
    const commitA = await makeCommit(repo, "work A");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note A", commitA]);
    await git(repo, ["push", "-u", "origin", "work-a"]);
    const localTip = await git(repo, ["rev-parse", NOTES_REF]);

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "work-a",
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;

    expect(plan.target).toMatchObject({
      ref: NOTES_REF,
      destinationRef: NOTES_REF,
      tip: localTip,
      annotatedCommits: [commitA],
      omittedCommits: [],
    });

    await cleanupBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      target: plan.target,
    });
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localTip);
  });

  it("cleans up the fetched temp ref when compaction adoption leaves no local notes", async () => {
    const localTip = "1".repeat(40);
    const remoteTip = "2".repeat(40);
    const blob = "3".repeat(40);
    const commit = "4".repeat(40);
    const manifest = serializeNotesCompactionManifest({
      version: 1,
      generation: 1,
      preCompactionTip: null,
      pruned: [{ blob, commit }],
    });
    const calls: string[][] = [];
    let tempRef: string | undefined;
    let adoptRef: string | undefined;
    let localRefMissingAfterAdopt = false;

    const exec = async (_cmd: string, args: string[]) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        const ref = args[2];
        if (ref === NOTES_REF) {
          if (localRefMissingAfterAdopt) throw new Error("missing local ref after adopt");
          return { stdout: `${localTip}\n`, stderr: "" };
        }
        if (ref === tempRef || ref === adoptRef) return { stdout: `${remoteTip}\n`, stderr: "" };
      }
      if (args[0] === "ls-remote" && args[1] === "origin" && args[2] === NOTES_REF) {
        return { stdout: `${remoteTip}\t${NOTES_REF}\n`, stderr: "" };
      }
      if (args[0] === "update-ref" && args[1] === "-d") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "fetch" && args[1] === "--refmap=" && args[2] === "origin") {
        const refspec = args[3] ?? "";
        tempRef = refspec.split(":")[1];
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "show" && args[1] === `${tempRef}:.arc-user-notes-compaction-manifest.json`) {
        return { stdout: manifest, stderr: "" };
      }
      if (args[0] === "show" && args[1] === `${NOTES_REF}:.arc-user-notes-compaction-manifest.json`) {
        throw new Error("no local manifest");
      }
      if (args[0] === "notes" && args[2] === "list") {
        if (args[1] === `--ref=${NOTES_REF}`) return { stdout: `${blob} ${commit}\n`, stderr: "" };
        if (args[1] === `--ref=${tempRef}` || args[1] === `--ref=${adoptRef}`) {
          return { stdout: "", stderr: "" };
        }
      }
      if (args[0] === "update-ref" && args[1]?.startsWith(`${NOTES_REF}__compact_adopt_`)) {
        adoptRef = args[1];
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "update-ref" && args[1] === NOTES_REF && args[2] === remoteTip && args[3] === localTip) {
        localRefMissingAfterAdopt = true;
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };

    const plan = await planBranchBoundedNotesExport({
      exec,
      execInput: async () => {
        throw new Error("execInput should not be called");
      },
      identity: IDENTITY,
      branch: "main",
    });

    expect(plan).toEqual({ kind: "skipped", reason: "no-local-notes" });
    expect(tempRef).toBeDefined();
    expect(calls.filter((args) => args[0] === "update-ref" && args[1] === "-d" && args[2] === tempRef))
      .toHaveLength(2);
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
      expect(plan.target.ref).not.toBe(NOTES_REF);
      expect(plan.target.annotatedCommits).toEqual([commitA]);
      expect(plan.target.omittedCommits).toEqual([commitB]);
      const localBeforePush = await git(repo, ["rev-parse", NOTES_REF]);

      const outcome = await pushBranchBoundedNotesExport({
        exec: makeGitExec(repo),
        identity: IDENTITY,
        target: plan.target,
      });
      expect(outcome).toEqual({ kind: "pushed" });

      expect(await remoteNoteCommits(remote)).toEqual([commitA]);
      expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localBeforePush);
      expect(await noteContent(repo, commitB)).toBe("note B");
      expect(await git(repo, ["ls-remote", "origin", "refs/heads/work-b"])).toBe("");
    } finally {
      await cleanupBranchBoundedNotesExport({
        exec: makeGitExec(repo),
        target: plan.target,
      });
    }
  });

  it("adopts a branch-bounded pushed tip that still contains every local note pair", async () => {
    repo = await createTempRepo("arc-branch-notes-superset-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-b"]);
    const commitB = await makeCommit(repo, "work B");
    await git(repo, ["push", "-u", "origin", "work-b"]);
    await addRemoteNote(remote, commitB, "note B");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "old local note B", commitB]);
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-f", "-m", "note B", commitB]);

    await git(repo, ["checkout", "main"]);
    await git(repo, ["checkout", "-b", "work-a"]);
    const commitA = await makeCommit(repo, "work A");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note A", commitA]);
    await git(repo, ["push", "-u", "origin", "work-a"]);

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "work-a",
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    expect(plan.target.ref).not.toBe(NOTES_REF);
    expect(plan.target.annotatedCommits).toEqual([commitA]);
    expect(plan.target.omittedCommits).toEqual([commitB]);
    expect(await git(repo, ["rev-parse", NOTES_REF])).not.toBe(plan.target.tip);

    const outcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      target: plan.target,
    });
    expect(outcome).toEqual({ kind: "pushed" });

    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(plan.target.tip);
    expect(await remoteNoteCommits(remote)).toEqual([commitA, commitB].sort());
    expect(await noteContent(repo, commitA)).toBe("note A");
    expect(await noteContent(repo, commitB)).toBe("note B");

    await cleanupBranchBoundedNotesExport({ exec: makeGitExec(repo), target: plan.target });
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
      join(repo, ".arc", "user", IDENTITY, "WORKING-MEMORY.md"),
      "# B notes\n",
      "utf-8",
    );
    await runUserSave({ cwd: repo, io: ioB, identity: IDENTITY });

    await git(repo, ["checkout", "work-a"]);
    await writeFile(
      join(repo, ".arc", "user", IDENTITY, "WORKING-MEMORY.md"),
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

  it("fast-forwards the local notes ref to the pushed tip after a full-history rewrite push", async () => {
    repo = await createTempRepo("arc-branch-notes-local-ff-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);
    const commitA = await makeCommit(repo, "work A");
    const commitB = await makeCommit(repo, "work B");

    // Local notes only commitA; publish the branch and that notes state.
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note A", commitA]);
    await git(repo, ["push", "-u", "origin", "main"]);
    await git(repo, ["push", "origin", NOTES_REF]);

    // Diverge origin's notes history from local's without a same-commit
    // conflict: origin independently notes commitB (which local hasn't noted),
    // so origin's tip is no longer an ancestor of local's. That forces the
    // rewrite path with nothing omitted — the shape that strands the local ref.
    await addRemoteNote(remote, commitB, "note B");
    const localBefore = await git(repo, ["rev-parse", NOTES_REF]);
    const remoteBefore = await git(remote, ["rev-parse", NOTES_REF]);
    expect(localBefore).not.toBe(remoteBefore);

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "main",
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    // Rewrite path (temp ref), nothing omitted → the reconcile applies.
    expect(plan.target.ref).not.toBe(NOTES_REF);
    expect(plan.target.omittedCommits).toEqual([]);
    expect(plan.target.priorLocalTip).toBe(localBefore);

    const outcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      target: plan.target,
    });
    expect(outcome).toEqual({ kind: "noop" });

    // The fix: the local canonical ref adopts the pushed tip, so it no longer
    // diverges (and picks up origin's commitB note) even when the export is an
    // identical-blob no-op.
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(plan.target.tip);
    expect(await git(remote, ["rev-parse", NOTES_REF])).toBe(plan.target.tip);
    expect(await noteContent(repo, commitA)).toBe("note A");
    expect(await noteContent(repo, commitB)).toBe("note B");

    await cleanupBranchBoundedNotesExport({ exec: makeGitExec(repo), target: plan.target });
    // Temp ref gone, but the canonical ref still resolves the adopted tip.
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(plan.target.tip);
  });

  it("skips byte-identical remote blobs so a fully-identical export is a no-op", async () => {
    repo = await createTempRepo("arc-branch-notes-identical-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);
    const commitA = await makeCommit(repo, "work A");

    await git(repo, ["push", "-u", "origin", "main"]);
    await addRemoteNote(remote, commitA, "note A");
    const remoteTipBefore = await git(remote, ["rev-parse", NOTES_REF]);
    const remoteCountBefore = await git(remote, ["rev-list", "--count", NOTES_REF]);

    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "old local note A", commitA]);
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-f", "-m", "note A", commitA]);
    const localBefore = await git(repo, ["rev-parse", NOTES_REF]);
    expect(localBefore).not.toBe(remoteTipBefore);

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "main",
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    expect(plan.target.ref).not.toBe(NOTES_REF);
    expect(plan.target.tip).toBe(remoteTipBefore);

    const outcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      target: plan.target,
    });
    expect(outcome).toEqual({ kind: "noop" });

    expect(await git(remote, ["rev-list", "--count", NOTES_REF])).toBe(remoteCountBefore);
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(remoteTipBefore);
    expect(await noteContent(repo, commitA)).toBe("note A");

    await cleanupBranchBoundedNotesExport({ exec: makeGitExec(repo), target: plan.target });
  });

  it("pushes the planned tip instead of a later local ref advance", async () => {
    repo = await createTempRepo("arc-branch-notes-pinned-tip-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);
    const commitA = await makeCommit(repo, "work A");

    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note A", commitA]);
    await git(repo, ["push", "-u", "origin", "main"]);

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "main",
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    expect(plan.target.ref).toBe(NOTES_REF);

    const commitB = await makeCommit(repo, "work B");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note B", commitB]);
    const localAdvanced = await git(repo, ["rev-parse", NOTES_REF]);
    expect(localAdvanced).not.toBe(plan.target.tip);

    const outcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      target: plan.target,
    });
    expect(outcome).toEqual({ kind: "pushed" });

    expect(await remoteNoteCommits(remote)).toEqual([commitA]);
    await expect(git(remote, ["notes", `--ref=${NOTES_REF}`, "show", commitB])).rejects.toThrow();
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localAdvanced);
    expect(await noteContent(repo, commitB)).toBe("note B");
  });

  it("does not clobber a note added locally between plan and push (compare-and-swap)", async () => {
    repo = await createTempRepo("arc-branch-notes-cas-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);
    const commitA = await makeCommit(repo, "work A");
    const commitB = await makeCommit(repo, "work B");

    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note A", commitA]);
    await git(repo, ["push", "-u", "origin", "main"]);
    await git(repo, ["push", "origin", NOTES_REF]);

    // Force the rewrite path (see the fast-forward test for the setup rationale).
    await addRemoteNote(remote, commitB, "note B");

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "main",
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    expect(plan.target.ref).not.toBe(NOTES_REF);

    // Simulate a concurrent `arc user save` landing a new note after the plan
    // captured priorLocalTip but before the push reconcile runs.
    const commitC = await makeCommit(repo, "work C");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note C", commitC]);
    const localAdvanced = await git(repo, ["rev-parse", NOTES_REF]);
    expect(localAdvanced).not.toBe(plan.target.priorLocalTip);

    const outcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      target: plan.target,
    });
    expect(outcome).toEqual({ kind: "noop" });

    // CAS mismatch: the local ref moved off priorLocalTip, so the reconcile is
    // skipped and the concurrently-added note survives locally.
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localAdvanced);
    expect(await noteContent(repo, commitC)).toBe("note C");

    await cleanupBranchBoundedNotesExport({ exec: makeGitExec(repo), target: plan.target });
  });
});
