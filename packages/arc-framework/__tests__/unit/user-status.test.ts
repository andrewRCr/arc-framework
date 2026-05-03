/**
 * Unit tests for user status result shaping.
 *
 * Verifies headline selection and actionable detail lines independent of git I/O.
 */

import { describe, it, expect } from "vitest";

import {
  buildLoadSummary,
  buildUserSessionInitStatusSummary,
  buildUserStatusResult,
  buildUserStatusSummary,
  computeUnsavedDirection,
  runUserSessionInitStatus,
  runUserStatus,
} from "../../src/commands/user.js";
import type { SyncManifest } from "../../src/lib/git/index.js";
import type { WorktreeSyncStatusResult } from "../../src/lib/git/worktree-sync.js";

function manifest(files: Record<string, string>): SyncManifest {
  return { version: 2, files };
}

describe("buildUserStatusResult", () => {
  it("reports in-sync state without an action hint", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("git note up to date");
    expect(result.remoteStatus).toBe("in sync");
    expect(result.diskStatus).toBe("current");
    expect(result.actionHint).toBeNull();
    expect(buildUserStatusSummary(result)).toContain("andrew: git note up to date");
  });

  it("reports remote-ahead state with a pull hint", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "remote-ahead",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("remote note ahead");
    expect(result.remoteStatus).toBe("remote ahead");
    expect(result.diskStatus).toBe("current");
    expect(result.actionHint).toContain("arc user pull");
    expect(result.detailLines).toContain("Next step: run `arc user pull`");
  });

  it("reports stale-disk state offline and surfaces backup and freshness detail", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: null,
      remoteChecked: false,
      savedCommit: "abc1234",
      savedFromAncestor: true,
      ancestorDistance: 3,
      unsavedDirection: "modified",
      backupFiles: [".pre-load-backup.json"],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("git note out of date");
    expect(result.summary).toBe("andrew: git note out of date (offline)");
    expect(result.detailLines).toContain("Remote check skipped (`--offline`).");
    expect(result.detailLines).toContain("Latest local git note is not current with the working files.");
    expect(result.detailLines).toContain("Working files reflect an older local git note.");
    expect(result.detailLines).toContain("Remote notes: in sync.");
    expect(result.detailLines).toContain("Latest local git note is from abc1234, 3 commit(s) back.");
    expect(result.detailLines).toContain("Pre-load backup present: .pre-load-backup.json");
  });

  it("renders the current-HEAD line when the local git note is at HEAD", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.detailLines.some((line) => line.includes("commit(s) back"))).toBe(false);
    expect(result.detailLines).toContain("Latest local git note is current with HEAD.");
  });

  it("renders note-history reachability when the local git note is outside HEAD ancestry", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      noteHistoryDistance: 2,
      savedReachableFromHead: false,
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.detailLines).toContain(
      "Latest local git note is from abc1234, outside current HEAD ancestry (2 note update(s) back).",
    );
    expect(result.detailLines).not.toContain("Latest local git note is current with HEAD.");
  });

  it("reports conflicts with a fetch hint", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "diverged",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      unsavedDirection: "mixed",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("notes conflict");
    expect(result.remoteStatus).toBe("conflict");
    expect(result.actionHint).toContain("arc user fetch");
  });

  it("renders save timestamp detail line when savedAtRelative is provided", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "11 hours ago",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.detailLines).toContain("Saved 11 hours ago.");
  });

  it("omits the save timestamp line when savedAtRelative is absent", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.detailLines.some((line) => line.startsWith("Saved ") && line.endsWith(" ago."))).toBe(false);
  });

  it("classifies local-only files as local unsaved", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      unsavedDirection: "edits",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("git note out of date");
    expect(result.diskStatus).toBe("local unsaved");
    expect(result.detailLines).toContain("Latest local git note is not current with the working files.");
    expect(result.detailLines).toContain("Working files have changed since the latest local git note.");
  });

  it("classifies missing files as git-note-out-of-date", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      unsavedDirection: "missing",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("git note out of date");
    expect(result.diskStatus).toBe("stale");
    expect(result.detailLines).toContain("Working files reflect an older local git note.");
  });

  it("classifies modified files as git-note-out-of-date", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      unsavedDirection: "modified",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("git note out of date");
    expect(result.diskStatus).toBe("stale");
    expect(result.detailLines).toContain("Working files reflect an older local git note.");
  });

  it("classifies mixed differences as git-note-out-of-date", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      unsavedDirection: "mixed",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("git note out of date");
    expect(result.diskStatus).toBe("mixed");
    expect(result.detailLines).toContain(
      "Latest local git note is partly reflected in working files, alongside newer local changes.",
    );
    expect(result.detailLines).toContain(
      "Working files differ from the latest local git note in multiple ways.",
    );
  });

  it("always includes explicit remote-notes and working-files lines", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "remote-ahead",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      unsavedDirection: "edits",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.detailLines).toContain("Working files match the latest local git note.");
    expect(result.detailLines).toContain("Remote notes: remote note ahead.");
  });

  it("picks 'arc user save' hint for local-unsaved when disk has local-only files", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      unsavedDirection: "edits",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("git note out of date");
    expect(result.actionHint).toBe("run `arc user save`");
    expect(result.detailLines).toContain("Next step: run `arc user save`");
  });

  it("picks 'arc user load' hint when working files reflect an older local git note", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      unsavedDirection: "modified",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("git note out of date");
    expect(result.actionHint).toBe("run `arc user load`");
    expect(result.detailLines).toContain("Next step: run `arc user load`");
  });

  it("picks 'arc user push' hint when local ref is ahead and disk is current", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "local-ahead",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("local note ahead");
    expect(result.actionHint).toBe("run `arc user push` (or `arc sync`)");
    expect(result.detailLines).toContain("Next step: run `arc user push` (or `arc sync`)");
  });

  it("includes remote identities when requested", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      backupFiles: [],
      remoteIdentities: [
        { identity: "alice", ref: "refs/notes/arc/user/alice", hash: "1111111" },
        { identity: "andrew", ref: "refs/notes/arc/user/andrew", hash: "2222222" },
      ],
    });

    expect(result.detailLines).toContain("Remote identities: alice (1111111), andrew (2222222)");
  });
});

describe("computeUnsavedDirection", () => {
  it("returns 'edits' when disk has files the saved note doesn't", () => {
    const disk = manifest({ "SESSION-NOTES.md": "aaa", "scratch.md": "bbb" });
    const note = manifest({ "SESSION-NOTES.md": "aaa" });

    expect(computeUnsavedDirection(disk, note)).toBe("edits");
  });

  it("returns 'modified' when a file on disk has different content vs. the note", () => {
    const disk = manifest({ "SESSION-NOTES.md": "local-edit" });
    const note = manifest({ "SESSION-NOTES.md": "original" });

    expect(computeUnsavedDirection(disk, note)).toBe("modified");
  });

  it("returns 'missing' when the saved note has files the disk doesn't", () => {
    const disk = manifest({ "SESSION-NOTES.md": "aaa" });
    const note = manifest({ "SESSION-NOTES.md": "aaa", "ATOMIC-INBOX.md": "bbb" });

    expect(computeUnsavedDirection(disk, note)).toBe("missing");
  });

  it("returns 'mixed' when disk has extras and is missing other files from the note", () => {
    const disk = manifest({ "SESSION-NOTES.md": "aaa", "new-file.md": "ccc" });
    const note = manifest({ "SESSION-NOTES.md": "aaa", "ATOMIC-INBOX.md": "bbb" });

    expect(computeUnsavedDirection(disk, note)).toBe("mixed");
  });

  it("returns 'mixed' when disk modifies a saved file and adds a new one", () => {
    const disk = manifest({ "SESSION-NOTES.md": "changed", "new-file.md": "ccc" });
    const note = manifest({ "SESSION-NOTES.md": "aaa" });

    expect(computeUnsavedDirection(disk, note)).toBe("mixed");
  });
});

describe("runUserSessionInitStatus", () => {
  const io = {
    exec: async () => ({ stdout: "", stderr: "" }),
    readDir: async () => [],
    readFile: async () => "",
    writeFile: async () => {},
    mkdir: async () => undefined,
    writeNote: async () => {},
    readNote: async () => null,
  };

  it("returns disabled when session.remote_sync is off", async () => {
    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: false,
    });

    expect(result.state).toBe("disabled");
    expect(result.shouldPromptToPull).toBe(false);
    expect(buildUserSessionInitStatusSummary(result)).toContain("session-init remote sync disabled");
  });

  it("uses the read-only remote probe for matching refs without fetch", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const probeIO = {
      ...io,
      exec: async (cmd: string, args: string[]) => {
        calls.push({ cmd, args });
        if (args[0] === "rev-parse") {
          return { stdout: "abc123\n", stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: "abc123\trefs/notes/arc/user/andrew\n", stderr: "" };
        }
        throw new Error(`unexpected command: ${cmd} ${args.join(" ")}`);
      },
    };

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: probeIO,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("clean");
    expect(calls).toEqual([
      { cmd: "git", args: ["rev-parse", "--verify", "refs/notes/arc/user/andrew"] },
      { cmd: "git", args: ["ls-remote", "origin", "refs/notes/arc/user/andrew"] },
    ]);
  });

  it("treats fetch-blocked ancestry comparison as local continuation, not stale-note divergence", async () => {
    const probeIO = {
      ...io,
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[2] === "refs/notes/arc/user/andrew") {
          return { stdout: "local123", stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: "remote456\trefs/notes/arc/user/andrew\n", stderr: "" };
        }
        if (args[0] === "fetch") {
          throw new Error("fatal: cannot update '.git/FETCH_HEAD': Operation not permitted");
        }
        throw new Error(`unexpected command: ${args.join(" ")}`);
      },
    };

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: probeIO,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("remote-unavailable");
    expect(result.summary).toBe("andrew: session-init remote comparison unavailable here");
    expect(result.detailLines).toContain(
      "Remote notes are reachable, but this environment blocks the fetch-based ancestry comparison.",
    );
    expect(result.detailLines).toContain(
      "Next step: continue with local tracked state, or retry session-init where git fetch/write access is allowed.",
    );
    expect(result.shouldPromptToPull).toBe(false);
  });
});

describe("buildUserSessionInitStatusSummary", () => {
  it("renders a promptable remote-ahead session-init summary", () => {
    const summary = buildUserSessionInitStatusSummary({
      identity: "andrew",
      state: "remote-ahead",
      summary: "andrew: session-init remote notes ahead",
      detailLines: [
        "Remote notes are newer than local notes.",
        "Next step: ask whether to run `arc user pull` before continuing session-init.",
      ],
      actionHint: "run `arc user pull` before continuing session-init",
      shouldPromptToPull: true,
    });

    expect(summary).toContain("andrew: session-init remote notes ahead");
    expect(summary).toContain("Next step: ask whether to run `arc user pull`");
  });
});

describe("buildLoadSummary", () => {
  it("surfaces ancestor distance when a note is loaded from history", () => {
    const summary = buildLoadSummary({
      kind: "loaded",
      identity: "andrew",
      commit: "abc1234",
      fileCount: 2,
      fromAncestor: true,
      ancestorDistance: 25,
      warnings: [],
    });

    expect(summary).toContain("Loaded from 25 commit(s) back.");
  });
});

describe("buildUserStatusResult worktree qualifier", () => {
  function withWorktree(
    worktree: WorktreeSyncStatusResult | undefined,
    overrides: Partial<Parameters<typeof buildUserStatusResult>[0]> = {},
  ) {
    return buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      backupFiles: [],
      remoteIdentities: [],
      worktree,
      ...overrides,
    });
  }

  it("omits the qualifier when worktree probe is clean", () => {
    const result = withWorktree({ state: "clean", ahead: 0, behind: 0 });

    expect(result.detailLines.some((line) => line.startsWith("Worktree"))).toBe(false);
  });

  it("appends a behind-by-N qualifier when worktree is remote-ahead", () => {
    const result = withWorktree({ state: "remote-ahead", ahead: 0, behind: 3 });

    expect(result.detailLines).toContain("Worktree is behind origin by 3 commit(s).");
  });

  it("appends a divergence qualifier with both counts when worktree is diverged", () => {
    const result = withWorktree({ state: "diverged", ahead: 2, behind: 5 });

    expect(result.detailLines).toContain("Worktree has diverged from origin (2 ahead, 5 behind).");
  });

  it("keeps the qualifier when notes already report remote-ahead", () => {
    const result = withWorktree(
      { state: "remote-ahead", ahead: 0, behind: 1 },
      { refState: "remote-ahead" },
    );

    expect(result.headline).toBe("remote note ahead");
    expect(result.detailLines).toContain("Worktree is behind origin by 1 commit(s).");
  });

  it("keeps the qualifier when notes are in conflict", () => {
    const result = withWorktree(
      { state: "remote-ahead", ahead: 0, behind: 4 },
      { refState: "diverged", diskState: "different", unsavedDirection: "mixed" },
    );

    expect(result.headline).toBe("notes conflict");
    expect(result.detailLines).toContain("Worktree is behind origin by 4 commit(s).");
  });

  it("emits a soft 'comparison unavailable' qualifier when the worktree probe failed", () => {
    const result = withWorktree({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      failureReason: "timeout",
    });

    expect(result.detailLines).toContain(
      "Worktree remote comparison unavailable; reported state may not reflect unreachable remote commits.",
    );
  });

  it("substitutes an offline note when --offline is set with remote_sync enabled", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: null,
      remoteChecked: false,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      backupFiles: [],
      remoteIdentities: [],
      remoteSyncEnabled: true,
    });

    expect(result.detailLines).toContain(
      "Worktree remote comparison skipped (`--offline`); reported state reflects local refs only.",
    );
    expect(result.detailLines.some((line) => line.startsWith("Worktree is behind"))).toBe(false);
    expect(result.detailLines.some((line) => line.startsWith("Worktree has diverged"))).toBe(false);
  });

  it("emits no qualifier and no offline note when remote_sync is disabled", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: null,
      remoteChecked: false,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      backupFiles: [],
      remoteIdentities: [],
      remoteSyncEnabled: false,
    });

    expect(result.detailLines.some((line) => line.startsWith("Worktree"))).toBe(false);
  });

  it("omits the qualifier when worktree is local-ahead (no drift to flag)", () => {
    const result = withWorktree({ state: "local-ahead", ahead: 2, behind: 0 });

    expect(result.detailLines.some((line) => line.startsWith("Worktree"))).toBe(false);
  });
});

describe("runUserStatus worktree probe orchestration", () => {
  function makeIO(execImpl: (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>) {
    return {
      exec: execImpl,
      readDir: async () => [],
      readFile: async () => "",
      writeFile: async () => {},
      mkdir: async () => undefined,
      writeNote: async () => {},
      readNote: async () => null,
    };
  }

  // Minimal fake exec covering the calls runUserStatus / inspectDiskVsLocalSnapshot make.
  // No local note, no remote note, clean ref state. Unmatched git calls throw so
  // production growing a new invocation surfaces as a test failure rather than
  // being silently absorbed.
  function fakeNoNotesExec(record: Array<{ cmd: string; args: string[] }>) {
    return async (cmd: string, args: string[]) => {
      record.push({ cmd, args });
      // Worktree probe success path
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref" && args[2] === "HEAD") {
        return { stdout: "main\n", stderr: "" };
      }
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref" && args[2] === "@{upstream}") {
        return { stdout: "origin/main\n", stderr: "" };
      }
      if (args[0] === "fetch") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "rev-list" && args.includes("--count")) {
        return { stdout: "0\t0\n", stderr: "" };
      }
      // findNearestUserNote: HEAD lookup and notes list
      if (args[0] === "rev-parse" && args.length === 2 && args[1] === "HEAD") {
        return { stdout: "abc1234\n", stderr: "" };
      }
      if (args[0] === "notes") {
        // No notes exist for any ref the test wires up.
        return { stdout: "", stderr: "" };
      }
      // Sync-status probes (notes refs)
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        throw new Error("ref not found");
      }
      if (args[0] === "ls-remote") {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
    };
  }

  it("invokes the worktree probe when remote_sync is enabled and not offline", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = makeIO(fakeNoNotesExec(calls));

    await runUserStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(calls.some((c) => c.args[0] === "fetch")).toBe(true);
  });

  it("does not invoke the worktree probe when --offline is set", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = makeIO(fakeNoNotesExec(calls));

    await runUserStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      offline: true,
      remoteSyncEnabled: true,
    });

    expect(calls.some((c) => c.args[0] === "fetch")).toBe(false);
  });

  it("does not invoke the worktree probe when remote_sync is disabled", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = makeIO(fakeNoNotesExec(calls));

    await runUserStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: false,
    });

    expect(calls.some((c) => c.args[0] === "fetch")).toBe(false);
  });
});
