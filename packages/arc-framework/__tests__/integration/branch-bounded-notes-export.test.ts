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
  makeGitExecInput,
  makeUserIO,
} from "../helpers/integration.js";
import { runPairedPush, runUserSave } from "../../src/commands/user.js";
import type { GitExec } from "../../src/lib/git/index.js";
import type {
  PairedPushNotesPusher,
  PairedPushNotesPusherResult,
} from "../../src/commands/user.js";
import {
  buildBranchBoundedNotesUnionCommit,
  cleanupBranchBoundedNotesExport,
  type BranchBoundedNotesExportTarget,
  planBranchBoundedNotesExport,
  pushBranchBoundedNotesExport,
} from "../../src/lib/user-sync/branch-bounded-notes-export.js";
import { listNoteTreeEntries } from "../../src/lib/user-sync/notes-ref.js";
import {
  NOTES_COMPACTION_MANIFEST_PATH,
  serializeNotesCompactionManifest,
  type NotesCompactionManifest,
} from "../../src/lib/user-sync/compaction-manifest.js";

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

const oid = (seed: string): string => seed.padEnd(40, "0");

async function makeNotesTreeCommit(
  cwd: string,
  entries: { commit: string; content: string }[],
  manifest?: NotesCompactionManifest,
): Promise<{ blobs: Map<string, string>; manifestBlob: string | null; tip: string }> {
  const execInput = makeGitExecInput(cwd);
  const blobs = new Map<string, string>();
  for (const entry of entries) {
    blobs.set(entry.commit, (await execInput(["hash-object", "-w", "--stdin"], entry.content)).trim());
  }
  const manifestBlob = manifest === undefined
    ? null
    : (await execInput(["hash-object", "-w", "--stdin"], serializeNotesCompactionManifest(manifest))).trim();
  const treeEntries = new Map(blobs);
  if (manifestBlob !== null) treeEntries.set(NOTES_COMPACTION_MANIFEST_PATH, manifestBlob);
  const treeInput = [...treeEntries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, blob]) => `100644 blob ${blob}\t${path}`)
    .join("\n") + "\n";
  const tree = (await execInput(["mktree"], treeInput)).trim();
  const tip = await git(cwd, ["commit-tree", tree, "-m", "test notes tree"]);
  return { blobs, manifestBlob, tip };
}

describe("branch-bounded notes union commit", () => {
  it("unions both trees with local blobs winning contested commits", async () => {
    const repo = await createTempRepo("arc-branch-notes-union-");
    try {
      const localOnly = oid("a1");
      const pushedOnly = oid("b2");
      const contested = oid("c3");
      const local = await makeNotesTreeCommit(repo, [
        { commit: localOnly, content: "local only" },
        { commit: contested, content: "local wins" },
      ]);
      const pushed = await makeNotesTreeCommit(repo, [
        { commit: pushedOnly, content: "pushed only" },
        { commit: contested, content: "pushed loses" },
      ]);

      const result = await buildBranchBoundedNotesUnionCommit({
        exec: makeGitExec(repo),
        execInput: makeGitExecInput(repo),
        priorLocalTip: local.tip,
        pushedTip: pushed.tip,
      });

      expect(await git(repo, ["show", "-s", "--format=%P", result.tip]))
        .toBe(`${local.tip} ${pushed.tip}`);
      expect(new Map(
        (await listNoteTreeEntries(makeGitExec(repo), result.tip))
          .map((entry) => [entry.commit, entry.blob]),
      )).toEqual(new Map([
        [localOnly, local.blobs.get(localOnly)],
        [pushedOnly, pushed.blobs.get(pushedOnly)],
        [contested, local.blobs.get(contested)],
      ]));
    } finally {
      await cleanupTempDir(repo);
    }
  });

  it("carries the newer manifest and excludes its pruned pairs", async () => {
    const repo = await createTempRepo("arc-branch-notes-union-manifest-");
    try {
      const kept = oid("a1");
      const pruned = oid("b2");
      const local = await makeNotesTreeCommit(repo, [
        { commit: kept, content: "kept" },
        { commit: pruned, content: "pruned" },
      ], {
        version: 1,
        generation: 1,
        preCompactionTip: null,
        pruned: [],
      });
      const prunedBlob = local.blobs.get(pruned);
      expect(prunedBlob).toBeDefined();
      const pushed = await makeNotesTreeCommit(repo, [], {
        version: 1,
        generation: 2,
        preCompactionTip: local.tip,
        pruned: [{ blob: prunedBlob ?? "", commit: pruned }],
      });

      const result = await buildBranchBoundedNotesUnionCommit({
        exec: makeGitExec(repo),
        execInput: makeGitExecInput(repo),
        priorLocalTip: local.tip,
        pushedTip: pushed.tip,
      });

      expect(await listNoteTreeEntries(makeGitExec(repo), result.tip))
        .toEqual([{ blob: local.blobs.get(kept), commit: kept }]);
      expect(await git(repo, ["rev-parse", `${result.tip}:${NOTES_COMPACTION_MANIFEST_PATH}`]))
        .toBe(pushed.manifestBlob);
    } finally {
      await cleanupTempDir(repo);
    }
  });

  it("builds the same tree for the same input tips", async () => {
    const repo = await createTempRepo("arc-branch-notes-union-deterministic-");
    try {
      const local = await makeNotesTreeCommit(repo, [{ commit: oid("a1"), content: "local" }]);
      const pushed = await makeNotesTreeCommit(repo, [{ commit: oid("b2"), content: "pushed" }]);
      const input = {
        exec: makeGitExec(repo),
        execInput: makeGitExecInput(repo),
        priorLocalTip: local.tip,
        pushedTip: pushed.tip,
      };

      const first = await buildBranchBoundedNotesUnionCommit(input);
      const second = await buildBranchBoundedNotesUnionCommit(input);

      expect(second.tree).toBe(first.tree);
    } finally {
      await cleanupTempDir(repo);
    }
  });
});

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
      if (args[0] === "show" && args[1] === `${tempRef}:${NOTES_COMPACTION_MANIFEST_PATH}`) {
        return { stdout: manifest, stderr: "" };
      }
      if (args[0] === "show" && args[1] === `${NOTES_REF}:${NOTES_COMPACTION_MANIFEST_PATH}`) {
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

  it("joins mixed-uncontested local and pushed note trees after export", async () => {
    repo = await createTempRepo("arc-branch-notes-mixed-join-");
    const base = await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-a"]);
    const commitA = await makeCommit(repo, "work A");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note A", commitA]);

    await git(repo, ["checkout", "main"]);
    await git(repo, ["checkout", "-b", "work-b"]);
    const commitB = await makeCommit(repo, "work B");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note B", commitB]);

    await addRemoteNote(remote, base, "remote base note");
    await git(repo, ["checkout", "work-a"]);
    await git(repo, ["push", "-u", "origin", "work-a"]);

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "work-a",
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    expect(plan.target).toMatchObject({
      localIncludesRemote: false,
      supersedesLocal: false,
    });

    const outcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
      target: plan.target,
    });
    expect(outcome).toEqual({ kind: "pushed" });

    const localAfter = await git(repo, ["rev-parse", NOTES_REF]);
    await git(repo, ["merge-base", "--is-ancestor", plan.target.tip, localAfter]);
    expect(await noteContent(repo, base)).toBe("remote base note");
    expect(await noteContent(repo, commitA)).toBe("note A");
    expect(await noteContent(repo, commitB)).toBe("note B");

    const countAfterJoin = await git(repo, ["rev-list", "--count", NOTES_REF]);
    const repeatPlan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "work-a",
    });
    expect(repeatPlan.kind).toBe("planned");
    if (repeatPlan.kind !== "planned") return;
    const repeatOutcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
      target: repeatPlan.target,
    });
    expect(repeatOutcome).toEqual({ kind: "noop" });
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localAfter);
    expect(await git(repo, ["rev-list", "--count", NOTES_REF])).toBe(countAfterJoin);
  });

  it("joins contested omitted notes with local winning when local contains remote ancestry", async () => {
    repo = await createTempRepo("arc-branch-notes-contested-ancestor-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-b"]);
    const commitB = await makeCommit(repo, "work B");
    await git(repo, ["push", "-u", "origin", "work-b"]);
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "old note B", commitB]);
    await git(repo, ["push", "origin", NOTES_REF]);
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-f", "-m", "local note B", commitB]);

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
    expect(plan.target).toMatchObject({
      localIncludesRemote: true,
      omittedCommits: [commitB],
      supersedesLocal: false,
    });

    const outcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
      target: plan.target,
    });
    expect(outcome).toEqual({ kind: "pushed" });

    const localAfter = await git(repo, ["rev-parse", NOTES_REF]);
    await git(repo, ["merge-base", "--is-ancestor", plan.target.tip, localAfter]);
    expect(await noteContent(repo, commitA)).toBe("note A");
    expect(await noteContent(repo, commitB)).toBe("local note B");
  });

  it("refuses a contested join without ancestry and leaves the refs diverged", async () => {
    repo = await createTempRepo("arc-branch-notes-contested-refusal-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-b"]);
    const commitB = await makeCommit(repo, "work B");
    await git(repo, ["push", "-u", "origin", "work-b"]);
    await addRemoteNote(remote, commitB, "remote note B");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "local note B", commitB]);

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
    expect(plan.target).toMatchObject({
      localIncludesRemote: false,
      omittedCommits: [commitB],
      supersedesLocal: false,
    });

    const outcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
      target: plan.target,
    });
    expect(outcome).toEqual({ kind: "pushed" });

    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(plan.target.priorLocalTip);
    expect(await git(remote, ["rev-parse", NOTES_REF])).toBe(plan.target.tip);
    expect(await noteContent(repo, commitB)).toBe("local note B");
    expect(await noteContent(remote, commitB)).toBe("remote note B");
  });

  it("contains a join CAS failure after a concurrent local notes advance", async () => {
    repo = await createTempRepo("arc-branch-notes-join-cas-");
    const base = await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-a"]);
    const commitA = await makeCommit(repo, "work A");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note A", commitA]);

    await git(repo, ["checkout", "main"]);
    await git(repo, ["checkout", "-b", "work-b"]);
    const commitB = await makeCommit(repo, "work B");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note B", commitB]);
    await addRemoteNote(remote, base, "remote base note");

    await git(repo, ["checkout", "work-a"]);
    await git(repo, ["push", "-u", "origin", "work-a"]);
    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
      branch: "work-a",
    });
    expect(plan.kind).toBe("planned");
    if (plan.kind !== "planned") return;
    expect(plan.target.supersedesLocal).toBe(false);

    const commitC = await makeCommit(repo, "work C");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", "note C", commitC]);
    const localAdvanced = await git(repo, ["rev-parse", NOTES_REF]);

    const outcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
      target: plan.target,
    });
    expect(outcome).toEqual({ kind: "pushed" });
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localAdvanced);
    expect(await noteContent(repo, commitC)).toBe("note C");
  });

  it("does not restore pairs pruned by a newer local compaction manifest", async () => {
    repo = await createTempRepo("arc-branch-notes-join-compaction-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    const prunedCommit = oid("a1");
    const remoteOnly = oid("b2");
    const keptLocal = oid("c3");
    const pushed = await makeNotesTreeCommit(repo, [
      { commit: prunedCommit, content: "old pruned note" },
      { commit: remoteOnly, content: "remote only" },
    ], {
      version: 1,
      generation: 1,
      preCompactionTip: null,
      pruned: [],
    });
    const prunedBlob = pushed.blobs.get(prunedCommit);
    expect(prunedBlob).toBeDefined();
    const local = await makeNotesTreeCommit(repo, [
      { commit: keptLocal, content: "kept local" },
    ], {
      version: 1,
      generation: 2,
      preCompactionTip: pushed.tip,
      pruned: [{ blob: prunedBlob ?? "", commit: prunedCommit }],
    });
    const tempRef = `${NOTES_REF}__branch_export_compaction`;
    await git(repo, ["update-ref", NOTES_REF, local.tip]);
    await git(repo, ["update-ref", tempRef, pushed.tip]);
    await git(repo, ["push", "origin", `${pushed.tip}:${NOTES_REF}`]);

    const outcome = await pushBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      execInput: makeGitExecInput(repo),
      identity: IDENTITY,
      target: {
        ref: tempRef,
        destinationRef: NOTES_REF,
        tip: pushed.tip,
        priorLocalTip: local.tip,
        annotatedCommits: [remoteOnly],
        omittedCommits: [keptLocal],
        supersedesLocal: false,
        localIncludesRemote: false,
      },
    });
    expect(outcome).toEqual({ kind: "noop" });

    const localAfter = await git(repo, ["rev-parse", NOTES_REF]);
    await git(repo, ["merge-base", "--is-ancestor", pushed.tip, localAfter]);
    expect((await listNoteTreeEntries(makeGitExec(repo), localAfter)).map((entry) => entry.commit).sort())
      .toEqual([keptLocal, remoteOnly].sort());
    expect(await git(repo, ["rev-parse", `${localAfter}:${NOTES_COMPACTION_MANIFEST_PATH}`]))
      .toBe(local.manifestBlob);
  });

  it("contains listing and manifest-read failures without changing the pushed outcome", async () => {
    repo = await createTempRepo("arc-branch-notes-join-read-failure-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);
    const local = await makeNotesTreeCommit(repo, [{ commit: oid("a1"), content: "local" }]);
    const pushed = await makeNotesTreeCommit(repo, [{ commit: oid("b2"), content: "pushed" }]);
    const tempRef = `${NOTES_REF}__branch_export_read_failure`;
    await git(repo, ["update-ref", NOTES_REF, local.tip]);
    await git(repo, ["update-ref", tempRef, pushed.tip]);
    await git(repo, ["push", "origin", `${pushed.tip}:${NOTES_REF}`]);
    const target: BranchBoundedNotesExportTarget = {
      ref: tempRef,
      destinationRef: NOTES_REF,
      tip: pushed.tip,
      priorLocalTip: local.tip,
      annotatedCommits: [oid("b2")],
      omittedCommits: [oid("a1")],
      supersedesLocal: false,
      localIncludesRemote: false,
    };

    for (const failure of ["listing", "manifest"] as const) {
      const baseExec = makeGitExec(repo);
      const exec: GitExec = async (cmd, args, options) => {
        if (failure === "listing" && args[0] === "ls-tree" && args[2] === local.tip) {
          throw new Error("listing failed");
        }
        if (
          failure === "manifest"
          && args[0] === "show"
          && args[1] === `${local.tip}:${NOTES_COMPACTION_MANIFEST_PATH}`
        ) {
          return { stdout: "{invalid manifest", stderr: "" };
        }
        return baseExec(cmd, args, options);
      };
      const outcome = await pushBranchBoundedNotesExport({
        exec,
        execInput: makeGitExecInput(repo),
        identity: IDENTITY,
        target,
      });
      expect(outcome).toEqual({ kind: "noop" });
      expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(local.tip);
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
