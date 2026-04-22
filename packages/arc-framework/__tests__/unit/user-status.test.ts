/**
 * Unit tests for user status result shaping.
 *
 * Verifies headline selection and actionable detail lines independent of git I/O.
 */

import { describe, it, expect } from "vitest";

import {
  buildUserSessionInitStatusSummary,
  buildUserStatusResult,
  buildUserStatusSummary,
  runUserSessionInitStatus,
} from "../../src/commands/user.js";

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

  it("reports disk-ahead state offline and surfaces backup and freshness detail", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: null,
      remoteChecked: false,
      savedCommit: "abc1234",
      savedFromAncestor: true,
      backupFiles: [".pre-load-backup.json"],
      remoteIdentities: [],
    });

    expect(result.headline).toBe("disk ahead");
    expect(result.summary).toBe("andrew: disk ahead (offline)");
    expect(result.detailLines).toContain("Remote check skipped (`--offline`).");
    expect(result.detailLines).toContain("Saved snapshot is from abc1234, not current HEAD.");
    expect(result.detailLines).toContain("Pre-load backup present: .pre-load-backup.json");
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
