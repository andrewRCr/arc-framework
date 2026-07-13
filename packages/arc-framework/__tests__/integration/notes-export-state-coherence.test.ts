/** End-to-end regressions for content-aware user-notes divergence. */

import { afterEach, describe, expect, it } from "vitest";

import {
  addBareRemote,
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
  makeNotesTreeCommit,
  makeUserIO,
} from "../helpers/integration.js";
import {
  inspectUserSyncRefsDetailed,
  inspectUserSyncState,
  runUserPull,
  runUserSessionInitStatus,
  runUserStatus,
} from "../../src/commands/user.js";
import { planBranchBoundedNotesExport } from "../../src/lib/user-sync/branch-bounded-notes-export.js";
import { inferSessionInitRecommendations } from "../../src/lib/session-init/recommended-action.js";
import { decideSyncAction } from "../../src/handlers/user-sync.js";

const IDENTITY = "test-user";
const NOTES_REF = `refs/notes/arc/user/${IDENTITY}`;
const EMPTY_USER_MANIFEST = JSON.stringify({ version: 2, files: {} });
const LOCAL_USER_MANIFEST = JSON.stringify({
  version: 2,
  files: { "WORKING-MEMORY.md": "local\n" },
});
const REMOTE_USER_MANIFEST = JSON.stringify({
  version: 2,
  files: { "WORKING-MEMORY.md": "remote\n" },
});

type DivergedContentRelation =
  | "remote-subset"
  | "local-subset"
  | "equal"
  | "mixed-uncontested"
  | "conflicting";

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function addRemoteNote(remote: string, commit: string, content: string): Promise<void> {
  await git(remote, [
    "-c", "user.email=test@test.com",
    "-c", "user.name=Test User",
    "notes", `--ref=${NOTES_REF}`, "add", "-m", content, commit,
  ]);
}

function relationEntries(
  relation: DivergedContentRelation,
  commits: { shared: string; localOnly: string; remoteOnly: string },
): {
  local: { commit: string; content: string }[];
  remote: { commit: string; content: string }[];
} {
  const shared = { commit: commits.shared, content: EMPTY_USER_MANIFEST };
  switch (relation) {
    case "remote-subset":
      return {
        local: [shared, { commit: commits.localOnly, content: EMPTY_USER_MANIFEST }],
        remote: [shared],
      };
    case "local-subset":
      return {
        local: [shared],
        remote: [shared, { commit: commits.remoteOnly, content: EMPTY_USER_MANIFEST }],
      };
    case "equal":
      return { local: [shared], remote: [shared] };
    case "mixed-uncontested":
      return {
        local: [{ commit: commits.localOnly, content: EMPTY_USER_MANIFEST }],
        remote: [{ commit: commits.remoteOnly, content: EMPTY_USER_MANIFEST }],
      };
    case "conflicting":
      return {
        local: [{ commit: commits.shared, content: LOCAL_USER_MANIFEST }],
        remote: [{ commit: commits.shared, content: REMOTE_USER_MANIFEST }],
      };
  }
}

describe("notes export state coherence", () => {
  let repo: string | undefined;
  let remote: string | undefined;

  afterEach(async () => {
    if (repo) await cleanupTempDir(repo);
    if (remote) await cleanupTempDir(remote);
    repo = undefined;
    remote = undefined;
  });

  it("projects branch-bounded remote-subset residue as non-blocking on every surface", async () => {
    repo = await createTempRepo("arc-notes-remote-subset-");
    await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-a"]);
    const commitA = await makeCommit(repo, "work A");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", EMPTY_USER_MANIFEST, commitA]);
    await git(repo, ["push", "-u", "origin", "work-a"]);
    await git(repo, ["push", "origin", NOTES_REF]);
    const commonNotesTip = await git(repo, ["rev-parse", NOTES_REF]);

    await git(repo, ["checkout", "main"]);
    await git(repo, ["checkout", "-b", "work-b"]);
    const commitB = await makeCommit(repo, "work B");
    await git(repo, ["notes", `--ref=${NOTES_REF}`, "add", "-m", EMPTY_USER_MANIFEST, commitB]);
    const localTip = await git(repo, ["rev-parse", NOTES_REF]);

    const commonTree = await git(repo, ["rev-parse", `${commonNotesTip}^{tree}`]);
    const remoteNoopTip = await git(repo, [
      "commit-tree", commonTree, "-p", commonNotesTip, "-m", "remote notes no-op",
    ]);
    await git(repo, ["push", "origin", `${remoteNoopTip}:${NOTES_REF}`]);

    await git(repo, ["checkout", "work-a"]);
    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
    });
    expect(plan).toMatchObject({ kind: "refused", reason: "history-diverged" });
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localTip);

    const io = makeUserIO(repo);
    const inspection = await inspectUserSyncRefsDetailed(io, IDENTITY);
    expect(inspection).toMatchObject({ state: "diverged", contentRelation: "remote-subset" });

    const sessionInit = await runUserSessionInitStatus({
      cwd: repo,
      io,
      identity: IDENTITY,
      remoteSyncEnabled: true,
    });
    expect(sessionInit).toMatchObject({
      state: "clean",
      refState: "diverged",
      contentRelation: "remote-subset",
      shouldPromptToPull: false,
    });
    const recommendation = inferSessionInitRecommendations({
      worktree: { state: "clean", ahead: 0, behind: 0, branch: "work-a" },
      user: sessionInit,
      worktreePullPolicy: "prompt",
      notesPullPolicy: "always",
      dirty: { state: "clean", fileCount: 0 },
      supersession: null,
    });
    expect(recommendation.user).toEqual({ recommendedAction: "surface", recommendedPromptText: "" });

    const status = await runUserStatus({
      cwd: repo,
      io,
      identity: IDENTITY,
      remoteSyncEnabled: true,
    });
    expect(status).toMatchObject({
      spineState: "clean",
      refState: "diverged",
      contentRelation: "remote-subset",
    });
    expect(status.detailLines.join(" ")).toContain("branch-export residue");
    expect(status.actionHint).not.toContain("arc user pull");

    const syncState = await inspectUserSyncState({ cwd: repo, io, identity: IDENTITY });
    expect(["push", "push-load"]).toContain(decideSyncAction(syncState));
  });

  it("projects mixed-uncontested compaction divergence without mutating canonical notes", async () => {
    repo = await createTempRepo("arc-notes-mixed-uncontested-");
    const base = await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    await git(repo, ["checkout", "-b", "work-a"]);
    const commitA = await makeCommit(repo, "work A");
    await git(repo, ["push", "-u", "origin", "work-a"]);
    await git(repo, ["checkout", "main"]);
    await git(repo, ["checkout", "-b", "work-b"]);
    const commitB = await makeCommit(repo, "work B");

    const localTip = (await makeNotesTreeCommit(repo, [
      { commit: commitA, content: EMPTY_USER_MANIFEST },
      { commit: commitB, content: EMPTY_USER_MANIFEST },
    ], { manifest: {
      version: 1,
      generation: 1,
      preCompactionTip: null,
      pruned: [],
    }, message: "local compacted notes" })).tip;
    await git(repo, ["update-ref", NOTES_REF, localTip]);
    await addRemoteNote(remote, base, EMPTY_USER_MANIFEST);
    await git(repo, ["checkout", "work-a"]);

    const io = makeUserIO(repo);
    const before = await inspectUserSyncRefsDetailed(io, IDENTITY);
    expect(before).toMatchObject({ state: "diverged", contentRelation: "mixed-uncontested" });

    const sessionInit = await runUserSessionInitStatus({
      cwd: repo,
      io,
      identity: IDENTITY,
      remoteSyncEnabled: true,
    });
    expect(sessionInit).toMatchObject({
      state: "conflict",
      contentRelation: "mixed-uncontested",
      shouldPromptToPull: false,
    });
    expect(inferSessionInitRecommendations({
      worktree: { state: "clean", ahead: 0, behind: 0, branch: "work-a" },
      user: sessionInit,
      worktreePullPolicy: "prompt",
      notesPullPolicy: "always",
      dirty: { state: "clean", fileCount: 0 },
      supersession: null,
    }).user.recommendedAction).toBe("surface");

    const status = await runUserStatus({
      cwd: repo,
      io,
      identity: IDENTITY,
      remoteSyncEnabled: true,
    });
    expect(status).toMatchObject({
      contentRelation: "mixed-uncontested",
      headline: "notes diverged (reconciling)",
    });
    expect(status.detailLines.join(" ")).not.toContain("arc user pull");
    expect(decideSyncAction(await inspectUserSyncState({ cwd: repo, io, identity: IDENTITY })))
      .toBe("guidance");

    const plan = await planBranchBoundedNotesExport({
      exec: makeGitExec(repo),
      identity: IDENTITY,
    });
    expect(plan).toMatchObject({ kind: "refused", reason: "compaction-lineage" });
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localTip);
  });

  it("classifies a real same-commit conflict without temp-ref mislisting", async () => {
    repo = await createTempRepo("arc-notes-real-conflict-");
    const base = await makeCommit(repo, "base");
    remote = await addBareRemote(repo);

    const localTip = (await makeNotesTreeCommit(repo, [
      { commit: base, content: LOCAL_USER_MANIFEST },
    ], { message: "local contested notes" })).tip;
    const remoteTip = (await makeNotesTreeCommit(repo, [
      { commit: base, content: REMOTE_USER_MANIFEST },
    ], { message: "remote contested notes" })).tip;
    await git(repo, ["update-ref", NOTES_REF, localTip]);
    await git(repo, ["push", "origin", `${remoteTip}:${NOTES_REF}`]);

    const io = makeUserIO(repo);
    await expect(inspectUserSyncRefsDetailed(io, IDENTITY)).resolves.toMatchObject({
      state: "diverged",
      contentRelation: "conflicting",
    });
    expect(await git(repo, ["for-each-ref", "--format=%(refname)", "refs/arc-sync-temp/"]))
      .toBe("");
    await expect(runUserPull({ cwd: repo, io, identity: IDENTITY })).resolves.toMatchObject({
      kind: "refused-diverged",
      localTip,
      remoteTip,
    });
    expect(await git(repo, ["rev-parse", NOTES_REF])).toBe(localTip);
  });

  it.each([
    ["remote-subset", "clean", "git note out of date", ["push", "push-load"]],
    ["local-subset", "conflict", "notes diverged (reconciling)", ["guidance"]],
    ["equal", "conflict", "notes diverged (reconciling)", ["guidance"]],
    ["mixed-uncontested", "conflict", "notes diverged (reconciling)", ["guidance"]],
    ["conflicting", "conflict", "notes conflict", ["conflict"]],
  ] as const)(
    "keeps %s divergence coherent across session-init, status, and sync",
    async (relation, spineState, headline, syncActions) => {
      repo = await createTempRepo(`arc-notes-${relation}-`);
      const shared = await makeCommit(repo, "shared note target");
      remote = await addBareRemote(repo);
      const localOnly = await makeCommit(repo, "local-only note target");
      const remoteOnly = await makeCommit(repo, "remote-only note target");
      await git(repo, ["push", "origin", "main"]);

      const entries = relationEntries(relation, { shared, localOnly, remoteOnly });
      const localTip = (await makeNotesTreeCommit(repo, entries.local, {
        message: `local ${relation} notes`,
      })).tip;
      const remoteTip = (await makeNotesTreeCommit(repo, entries.remote, {
        message: `remote ${relation} notes`,
      })).tip;
      await git(repo, ["update-ref", NOTES_REF, localTip]);
      await git(repo, ["push", "origin", `${remoteTip}:${NOTES_REF}`]);

      const io = makeUserIO(repo);
      const sessionInit = await runUserSessionInitStatus({
        cwd: repo,
        io,
        identity: IDENTITY,
        remoteSyncEnabled: true,
      });
      expect(sessionInit).toMatchObject({
        state: spineState,
        refState: "diverged",
        contentRelation: relation,
        shouldPromptToPull: false,
      });
      expect(inferSessionInitRecommendations({
        worktree: { state: "clean", ahead: 0, behind: 0, branch: "main" },
        user: sessionInit,
        worktreePullPolicy: "prompt",
        notesPullPolicy: "always",
        dirty: { state: "clean", fileCount: 0 },
        supersession: null,
      }).user.recommendedAction).toBe("surface");

      const status = await runUserStatus({
        cwd: repo,
        io,
        identity: IDENTITY,
        remoteSyncEnabled: true,
      });
      expect(status).toMatchObject({
        spineState,
        refState: "diverged",
        contentRelation: relation,
        headline,
      });
      expect(status.actionHint).not.toContain("arc user pull");

      const syncState = await inspectUserSyncState({ cwd: repo, io, identity: IDENTITY });
      expect(syncState).toMatchObject({
        spineState,
        refState: "diverged",
        contentRelation: relation,
      });
      expect(syncActions).toContain(decideSyncAction(syncState));
    },
  );
});
