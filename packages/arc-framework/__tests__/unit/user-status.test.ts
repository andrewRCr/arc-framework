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
} from "../../src/commands/user.js";
import type { SyncManifest } from "../../src/lib/git/index.js";

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

    expect(result.headline).toBe("in sync");
    expect(result.actionHint).toBeNull();
    expect(buildUserStatusSummary(result)).toBe("andrew: in sync");
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

    expect(result.headline).toBe("remote ahead");
    expect(result.actionHint).toContain("arc user pull");
    expect(result.detailLines).toContain("Next step: run `arc user pull`");
  });

  it("reports local-unsaved state offline and surfaces backup and freshness detail", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: null,
      remoteChecked: false,
      savedCommit: "abc1234",
      savedFromAncestor: true,
      ancestorDistance: 3,
      backupFiles: [".pre-load-backup.json"],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("local unsaved");
    expect(result.summary).toBe("andrew: local unsaved (offline)");
    expect(result.detailLines).toContain("Remote check skipped (`--offline`).");
    expect(result.detailLines).toContain("Saved snapshot is from abc1234, 3 commit(s) back.");
    expect(result.detailLines).toContain("Pre-load backup present: .pre-load-backup.json");
  });

  it("omits the ancestor-distance line when the saved snapshot is at HEAD", () => {
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
    expect(result.detailLines.some((line) => line.includes("not current HEAD"))).toBe(false);
  });

  it("reports conflicts with a fetch hint", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "diverged",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("conflict");
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

  it("adds 'disk has unsaved edits' hint when local-unsaved direction is 'edits'", () => {
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

    expect(result.headline).toBe("local unsaved");
    expect(result.detailLines).toContain("Disk has unsaved edits not yet in the saved note.");
  });

  it("adds 'disk missing updates' hint when local-unsaved direction is 'missing'", () => {
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

    expect(result.detailLines).toContain("Disk is missing updates from the saved note.");
  });

  it("adds a combined hint when direction is 'mixed'", () => {
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

    expect(result.detailLines).toContain("Disk has unsaved edits and is missing updates from the saved note.");
  });

  it("omits the direction hint when headline is not local-unsaved", () => {
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

    expect(result.detailLines.some((line) => line.startsWith("Disk "))).toBe(false);
  });

  it("picks 'arc user save' hint for local-unsaved when disk differs from saved note", () => {
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

    expect(result.headline).toBe("local unsaved");
    expect(result.actionHint).toBe("run `arc user save`");
    expect(result.detailLines).toContain("Next step: run `arc user save`");
  });

  it("picks 'arc user push' hint for local-unsaved when disk matches but local ref is ahead", () => {
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

    expect(result.headline).toBe("local unsaved");
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

  it("returns 'edits' when a file on disk has modified content vs. the note", () => {
    const disk = manifest({ "SESSION-NOTES.md": "local-edit" });
    const note = manifest({ "SESSION-NOTES.md": "original" });

    expect(computeUnsavedDirection(disk, note)).toBe("edits");
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
          return { stdout: "abc123", stderr: "" };
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
