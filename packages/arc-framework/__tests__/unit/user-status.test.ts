/**
 * Unit tests for user status result shaping.
 *
 * Verifies headline selection and actionable detail lines independent of git I/O.
 */

import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildLoadSummary,
  buildUserSessionInitStatusSummary,
  buildUserStatusResult,
  computeUserSyncSpine,
  buildUserStatusSummary,
  computeUnsavedDirection,
  hasUnpushedLocalDrift,
  hasUnpushedLocalDriftForScope,
  missingFilesAreIntentionalRetirement,
  resolveCleanArmNotesVerdict,
  unsavedDirectionForScope,
  hashSyncManifest,
  inspectUserSyncRefsDetailed,
  inspectUserSyncState,
  runUserSessionInitStatus,
  runUserStatus,
} from "../../src/commands/user.js";
import type { UserIOContext } from "../../src/commands/user.js";
import type { SyncManifest } from "../../src/lib/git/index.js";
import type { WorktreeSyncStatusResult } from "../../src/lib/git/worktree-sync.js";
import {
  NO_COMPARABLE_SOURCE_COMMIT,
  projectManifest,
} from "../../src/lib/user-sync/index.js";

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
    expect(buildUserStatusSummary(result)).toContain(
      "andrew: local notes match working files and remote notes",
    );
  });

  it("surfaces the compaction advisory when notes history crosses the threshold", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      backupFiles: [],
      remoteIdentities: [],
      compactionAdvisory: {
        historyCommitCount: 2001,
        threshold: 2000,
        shouldSuggest: true,
      },
    });

    expect(result.compactionAdvisory?.shouldSuggest).toBe(true);
    expect(result.detailLines).toContain(
      "User notes history has 2001 commit(s) (threshold 2000); run `arc user compact` when ready.",
    );
  });

  it("omits the compaction advisory when notes history stays below the threshold", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      backupFiles: [],
      remoteIdentities: [],
      compactionAdvisory: {
        historyCommitCount: 1999,
        threshold: 2000,
        shouldSuggest: false,
      },
    });

    expect(result.compactionAdvisory?.shouldSuggest).toBe(false);
    expect(result.detailLines.some((line) => line.includes("arc user compact"))).toBe(false);
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
    expect(result.summary).toBe("andrew: working files differ from local notes (offline)");
    expect(result.detailLines).toContain(
      "Remote notes check skipped (`--offline`); local notes were not compared with remote notes.",
    );
    expect(result.detailLines).toContain("Latest local git note is not current with the working files.");
    expect(result.detailLines).toContain("Working files reflect an older local git note.");
    expect(result.detailLines).toContain("Remote notes: match local notes.");
    expect(result.detailLines).toContain("Latest local user note is from abc1234, 3 commit(s) back from HEAD.");
    expect(result.detailLines).toContain("Pre-load backup present: .pre-load-backup.json");
  });

  it("renders the current-HEAD line when the local user note is at HEAD", () => {
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
    expect(result.detailLines).toContain("Latest local user note is current with HEAD.");
  });

  it("names the current branch when the local user note is off its history", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedReachableFromHead: false,
      currentBranch: "fix/state-ref-write-safety",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.detailLines).toContain(
      "Latest local user note is from abc1234, not in branch `fix/state-ref-write-safety`'s history — " +
      "expected when the work was continued or integrated on another branch or machine.",
    );
    expect(result.detailLines).not.toContain("Latest local user note is current with HEAD.");
  });

  it("scopes the missing-note line to the identity when no WU is resolved", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: null,
      savedFromAncestor: false,
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.detailLines).toContain("No local user note exists yet for this identity.");
  });

  it("reports a WU-scoped missing note with a disk seed as seeded-but-unsaved", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: null,
      savedFromAncestor: false,
      backupFiles: [],
      remoteIdentities: [],
      wuScoped: true,
      seedPresent: true,
    });

    expect(result.detailLines).toContain(
      "SESSION-NOTES seeded on disk for this work unit; not yet saved to the notes ref (saves at first handoff).",
    );
    expect(result.detailLines).not.toContain("No local user note exists yet for this identity.");
  });

  it("reports a WU-scoped missing note with no disk seed as an unexpected gap", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: null,
      savedFromAncestor: false,
      backupFiles: [],
      remoteIdentities: [],
      wuScoped: true,
      seedPresent: false,
    });

    expect(result.detailLines).toContain(
      "No SESSION-NOTES for this work unit — none on disk and none in the notes ref. " +
      "A seed was expected at spawn/start; the workspace may not have been opened, or the seed was removed.",
    );
    expect(result.detailLines).not.toContain("No local user note exists yet for this identity.");
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
    expect(result.detailLines).toContain("Remote notes: ahead of local notes.");
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

describe("buildUserStatusResult userSyncCause routing", () => {
  function divergedInput() {
    return {
      identity: "andrew",
      diskState: "same" as const,
      refState: "diverged" as const,
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      backupFiles: [],
      remoteIdentities: [],
    };
  }

  function remoteAheadInput() {
    return {
      ...divergedInput(),
      refState: "remote-ahead" as const,
    };
  }

  function localAheadInput() {
    return {
      ...divergedInput(),
      refState: "local-ahead" as const,
    };
  }

  it("threads userSyncCause onto UserStatusResult for every taxonomy value", () => {
    const causes = [
      "unfetched-local",
      "concurrent-local-writer",
      "cross-machine",
      "offline",
      "unknown",
    ] as const;

    for (const cause of causes) {
      const result = buildUserStatusResult({
        ...divergedInput(),
        userSyncCause: { cause, confidence: cause === "offline" ? "offline" : "high" },
      });
      expect(result.userSyncCause).toBe(cause);
    }
  });

  it("renders the existing pull-direction copy for unfetched-local via the cause-aware path", () => {
    const result = buildUserStatusResult({
      ...remoteAheadInput(),
      userSyncCause: { cause: "unfetched-local", confidence: "high" },
    });

    const causeLines = result.detailLines.filter((line) => line.startsWith("Cause:"));
    expect(causeLines).toHaveLength(1);
    expect(causeLines[0]).toContain("arc user pull");
  });

  it("renders concurrent-local-writer copy distinct from cross-machine and free of machine-locality assertions", () => {
    const concurrent = buildUserStatusResult({
      ...localAheadInput(),
      userSyncCause: { cause: "concurrent-local-writer", confidence: "high" },
    });
    const crossMachine = buildUserStatusResult({
      ...divergedInput(),
      userSyncCause: { cause: "cross-machine", confidence: "high" },
    });

    const concurrentLine = concurrent.detailLines.find((line) => line.startsWith("Cause:"));
    const crossMachineLine = crossMachine.detailLines.find((line) => line.startsWith("Cause:"));

    expect(concurrentLine).toBeDefined();
    expect(crossMachineLine).toBeDefined();
    expect(concurrentLine).not.toBe(crossMachineLine);
    expect(concurrentLine).not.toMatch(/another machine|this machine|other machine/i);
  });

  it("hedges cross-machine copy when confidence is low (sync state stale or missing)", () => {
    const high = buildUserStatusResult({
      ...divergedInput(),
      userSyncCause: { cause: "cross-machine", confidence: "high" },
    });
    const low = buildUserStatusResult({
      ...divergedInput(),
      userSyncCause: { cause: "cross-machine", confidence: "low" },
    });

    const highLine = high.detailLines.find((line) => line.startsWith("Cause:"));
    const lowLine = low.detailLines.find((line) => line.startsWith("Cause:"));

    expect(highLine).toBeDefined();
    expect(lowLine).toBeDefined();
    expect(lowLine).not.toBe(highLine);
    expect(lowLine).toMatch(/stale|hedged|low confidence/i);
  });

  it("appends the cause line additively — existing detailLines retain their wording and position", () => {
    const without = buildUserStatusResult(divergedInput());
    const withCause = buildUserStatusResult({
      ...divergedInput(),
      userSyncCause: { cause: "cross-machine", confidence: "high" },
    });

    expect(withCause.detailLines.length).toBe(without.detailLines.length + 1);
    for (let i = 0; i < without.detailLines.length; i++) {
      expect(withCause.detailLines[i]).toBe(without.detailLines[i]);
    }
    expect(withCause.detailLines[withCause.detailLines.length - 1]).toMatch(/^Cause:/);
  });

  it("non-verbose mode: action-oriented headline reflects the cause when present", () => {
    const result = buildUserStatusResult({
      ...remoteAheadInput(),
      verbose: false,
      userSyncCause: { cause: "unfetched-local", confidence: "high" },
    });

    expect(result.summary).toBe("andrew: Remote notes ahead — pull to sync.");
  });

  it("non-verbose mode: action-oriented headline falls back to existing taxonomy when cause is unknown", () => {
    const withUnknown = buildUserStatusResult({
      ...divergedInput(),
      verbose: false,
      userSyncCause: { cause: "unknown", confidence: "low" },
    });
    const withoutCause = buildUserStatusResult({
      ...divergedInput(),
      verbose: false,
    });

    expect(withUnknown.summary).toBe(withoutCause.summary);
  });

  it("does not append a cause detail line when cause is unknown — existing taxonomy carries the message", () => {
    const result = buildUserStatusResult({
      ...divergedInput(),
      userSyncCause: { cause: "unknown", confidence: "low" },
    });

    expect(result.detailLines.some((line) => line.startsWith("Cause:"))).toBe(false);
  });
});

describe("buildUserStatusResult --offline degradation rendering", () => {
  const SKIP_NOTE = "Remote notes check skipped (`--offline`); local notes were not compared with remote notes.";
  const DEGRADED_LINE = "offline — local state only; cross-machine signals unavailable";

  it("verbose: surfaces both the existing skip-note AND the new degraded-classification line under --offline", () => {
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
    });

    const skipIndex = result.detailLines.indexOf(SKIP_NOTE);
    const degradedIndex = result.detailLines.indexOf(DEGRADED_LINE);

    expect(skipIndex).toBeGreaterThanOrEqual(0);
    expect(degradedIndex).toBeGreaterThanOrEqual(0);
    expect(degradedIndex).toBe(skipIndex + 1);
  });

  it("verbose: omits the degraded-classification line when remote was checked (online mode)", () => {
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

    expect(result.detailLines).not.toContain(DEGRADED_LINE);
    expect(result.detailLines).not.toContain(SKIP_NOTE);
  });

  it("default mode: omits both the skip-note and the degraded-classification line (verbose-only pairing)", () => {
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
      verbose: false,
    });

    expect(result.detailLines).not.toContain(SKIP_NOTE);
    expect(result.detailLines).not.toContain(DEGRADED_LINE);
  });
});

describe("buildUserStatusResult first-use orientation hint", () => {
  const HINT = "New here? Run `arc user --help` to learn about user notes.";

  function baseFirstUseInput() {
    return {
      identity: "andrew",
      diskState: "same" as const,
      refState: "same" as const,
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "9 hours ago",
      backupFiles: [],
      remoteIdentities: [],
    };
  }

  it("renders the orientation hint as detailLines[0] when local notes ref is absent", () => {
    const result = buildUserStatusResult({
      ...baseFirstUseInput(),
      userNotesRefExists: false,
    });

    expect(result.detailLines[0]).toBe(HINT);
  });

  it("omits the orientation hint when local notes ref exists", () => {
    const result = buildUserStatusResult({
      ...baseFirstUseInput(),
      userNotesRefExists: true,
    });

    expect(result.detailLines).not.toContain(HINT);
  });

  it("omits the orientation hint when ref-existence is unknown (default behavior)", () => {
    const result = buildUserStatusResult({
      ...baseFirstUseInput(),
    });

    expect(result.detailLines).not.toContain(HINT);
  });

  it("renders the hint at detailLines[0] in default mode too", () => {
    const result = buildUserStatusResult({
      ...baseFirstUseInput(),
      verbose: false,
      userNotesRefExists: false,
    });

    expect(result.detailLines[0]).toBe(HINT);
  });
});

describe("buildUserStatusResult default mode (verbose: false)", () => {
  it("renders single-line headline with no detail block when fully clean", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "same",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "9 hours ago",
      backupFiles: [],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.summary).toBe("andrew: Up to date.");
    expect(result.detailLines).toEqual([]);
  });

  it("emits headline + context line + load hint for disk-behind state", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      diskStatus: "stale",
      refState: "same",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "9 hours ago",
      unsavedDirection: "behind",
      backupFiles: [],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.summary).toBe("andrew: Local note ahead of working files.");
    expect(result.detailLines).toEqual([
      "Note current with HEAD (9b1c241), saved 9 hours ago.",
      "Next step: run `arc user load`",
    ]);
  });

  it("emits headline + context line + save hint for disk-edits state", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "9 hours ago",
      unsavedDirection: "edits",
      backupFiles: [],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.summary).toBe("andrew: Working files have unsaved changes.");
    expect(result.detailLines).toEqual([
      "Note current with HEAD (9b1c241), saved 9 hours ago.",
      "Next step: run `arc user save`",
    ]);
  });

  it("emits ambiguity-named headline + manual reconciliation hint for mixed state", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      diskStatus: "mixed",
      refState: "same",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "9 hours ago",
      unsavedDirection: "mixed",
      backupFiles: [],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.summary).toBe("andrew: Working files and saved note both diverged.");
    expect(result.detailLines).toEqual([
      "Note current with HEAD (9b1c241), saved 9 hours ago.",
      "Next step: inspect local working files, then run `arc user load` or `arc user save`",
    ]);
  });

  it("emits diverged-notes headline for refs conflict", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "diverged",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "9 hours ago",
      unsavedDirection: "mixed",
      backupFiles: [],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.summary).toBe("andrew: Local and remote notes diverged.");
    expect(result.detailLines).toContain(
      "Next step: run `arc user fetch` for non-destructive inspection",
    );
  });

  it("emits remote-ahead headline pointing to pull", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "remote-ahead",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "9 hours ago",
      backupFiles: [],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.summary).toBe("andrew: Remote notes ahead of local.");
    expect(result.detailLines).toContain("Next step: run `arc user pull`");
  });

  it("renders backup count only — no enumeration — in default mode", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "9 hours ago",
      unsavedDirection: "modified",
      backupFiles: [".pre-load-1.json", ".pre-load-2.json", ".pre-load-3.json"],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.detailLines).toContain("Pre-load backup present (3 files).");
    expect(result.detailLines.some((line) => line.includes(".pre-load-1.json"))).toBe(false);
  });

  it("preserves verbose three-tier detail (including backup file enumeration) when verbose: true", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "9 hours ago",
      unsavedDirection: "modified",
      backupFiles: [".pre-load-1.json", ".pre-load-2.json"],
      remoteIdentities: [],
      verbose: true,
    });

    expect(result.detailLines).toContain("Latest local git note is not current with the working files.");
    expect(result.detailLines).toContain("Working files reflect an older local git note.");
    expect(result.detailLines).toContain("Remote notes: match local notes.");
    expect(result.detailLines).toContain("Saved 9 hours ago.");
    expect(result.detailLines).toContain(
      "Pre-load backup present: .pre-load-1.json, .pre-load-2.json",
    );
  });

  it("preserves identical UserStatusResult shape regardless of verbose flag", () => {
    const baseInput = {
      identity: "andrew",
      diskState: "same" as const,
      refState: "same" as const,
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: "9 hours ago",
      backupFiles: [],
      remoteIdentities: [],
    };

    const verboseResult = buildUserStatusResult({ ...baseInput, verbose: true });
    const terseResult = buildUserStatusResult({ ...baseInput, verbose: false });

    expect(Object.keys(verboseResult).sort()).toEqual(Object.keys(terseResult).sort());
  });

  it("renders behind-HEAD note position in the context line", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: true,
      ancestorDistance: 3,
      savedAtRelative: "9 hours ago",
      unsavedDirection: "edits",
      backupFiles: [],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.detailLines).toContain(
      "Note from 9b1c241, 3 commit(s) back from HEAD, saved 9 hours ago.",
    );
  });

  it("renders outside-ancestry note position in the context line", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedReachableFromHead: false,
      savedAtRelative: "9 hours ago",
      unsavedDirection: "edits",
      backupFiles: [],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.detailLines).toContain(
      "Note from 9b1c241, outside HEAD ancestry, saved 9 hours ago.",
    );
  });

  it("drops the saved-ago suffix when savedAtRelative is absent", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "same",
      remoteChecked: true,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      unsavedDirection: "edits",
      backupFiles: [],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.detailLines).toContain("Note current with HEAD (9b1c241).");
  });

  it("appends `(offline)` to the summary when --offline is set", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: null,
      remoteChecked: false,
      savedCommit: "9b1c241",
      savedFromAncestor: false,
      ancestorDistance: 0,
      backupFiles: [],
      remoteIdentities: [],
      verbose: false,
    });

    expect(result.summary).toBe("andrew: Up to date. (offline)");
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

  it("returns null when disk and note are identical (no difference)", () => {
    const disk = manifest({ "SESSION-NOTES.md": "aaa", "scratch.md": "bbb" });
    const note = manifest({ "SESSION-NOTES.md": "aaa", "scratch.md": "bbb" });

    expect(computeUnsavedDirection(disk, note)).toBeNull();
  });
});

describe("hasUnpushedLocalDrift", () => {
  it("reads pure-behind as benign (no local-only content)", () => {
    expect(hasUnpushedLocalDrift("behind")).toBe(false);
  });

  it("reads pure-missing as benign (no local-only content)", () => {
    expect(hasUnpushedLocalDrift("missing")).toBe(false);
  });

  it("reads local-only edits as drift", () => {
    expect(hasUnpushedLocalDrift("edits")).toBe(true);
  });

  it("reads local-only modifications as drift", () => {
    expect(hasUnpushedLocalDrift("modified")).toBe(true);
  });

  it("reads mixed (local edits alongside retirement) as drift", () => {
    expect(hasUnpushedLocalDrift("mixed")).toBe(true);
  });

  it("reads a null direction (no comparison basis) as benign", () => {
    expect(hasUnpushedLocalDrift(null)).toBe(false);
  });
});

describe("hasUnpushedLocalDriftForScope", () => {
  // One basis: wu-a carries a local-only modification, wu-b is clean.
  const disk = manifest({
    "wu-a/SESSION-NOTES.md": "local-edit",
    "wu-b/SESSION-NOTES.md": "saved",
  });
  const note = manifest({
    "wu-a/SESSION-NOTES.md": "saved",
    "wu-b/SESSION-NOTES.md": "saved",
  });

  it("whole-tree scope reflects drift anywhere in the tree", () => {
    expect(hasUnpushedLocalDriftForScope(disk, note, { kind: "tree" })).toBe(true);
  });

  it("per-subdir scope isolates the drifting subdir", () => {
    expect(hasUnpushedLocalDriftForScope(disk, note, { kind: "subdir", name: "wu-a" })).toBe(true);
  });

  it("per-subdir scope clears a clean subdir over the same basis", () => {
    expect(hasUnpushedLocalDriftForScope(disk, note, { kind: "subdir", name: "wu-b" })).toBe(false);
  });

  it("returns false for a subdir with no files on either side (empty basis)", () => {
    expect(unsavedDirectionForScope(disk, note, { kind: "subdir", name: "wu-z" })).toBeNull();
    expect(hasUnpushedLocalDriftForScope(disk, note, { kind: "subdir", name: "wu-z" })).toBe(false);
  });
});

describe("resolveCleanArmNotesVerdict", () => {
  const activeWuName = "stale-state-detect-and-pull";
  const activeSessionNotes = `${activeWuName}/SESSION-NOTES.md`;

  it("auto-loads on a pure-behind disk (note advanced, disk safe to overwrite)", () => {
    const verdict = resolveCleanArmNotesVerdict({
      direction: "behind",
      missingFiles: [],
      activeWuName,
    });

    expect(verdict.loadNeeded).toBe(true);
    expect(verdict.driftSurface).toBeUndefined();
  });

  it("auto-loads when the only missing file is the active WU's SESSION-NOTES (pure-missing, safe)", () => {
    const verdict = resolveCleanArmNotesVerdict({
      direction: "missing",
      missingFiles: [activeSessionNotes],
      activeWuName,
    });

    expect(verdict.loadNeeded).toBe(true);
    expect(verdict.driftSurface).toBeUndefined();
  });

  it("surfaces (not auto-loads) general missing files beyond the active WU's SESSION-NOTES", () => {
    const verdict = resolveCleanArmNotesVerdict({
      direction: "missing",
      missingFiles: [activeSessionNotes, "other-wu/SESSION-NOTES.md"],
      activeWuName,
    });

    expect(verdict.loadNeeded).toBe(false);
    expect(verdict.driftSurface).toEqual({ direction: "missing" });
  });

  it("surfaces a missing active-WU SESSION-NOTES when no active WU is resolved (cannot prove safe)", () => {
    const verdict = resolveCleanArmNotesVerdict({
      direction: "missing",
      missingFiles: [activeSessionNotes],
      activeWuName: null,
    });

    expect(verdict.loadNeeded).toBe(false);
    expect(verdict.driftSurface).toEqual({ direction: "missing" });
  });

  it("surfaces (not auto-loads) mixed drift — may carry real local edits", () => {
    const verdict = resolveCleanArmNotesVerdict({
      direction: "mixed",
      missingFiles: [activeSessionNotes],
      activeWuName,
    });

    expect(verdict.loadNeeded).toBe(false);
    expect(verdict.driftSurface).toEqual({ direction: "mixed" });
  });

  it.each(["edits", "modified"] as const)(
    "neither loads nor surfaces local-only %s (unsaved work, not stale arrival)",
    (direction) => {
      const verdict = resolveCleanArmNotesVerdict({
        direction,
        missingFiles: [],
        activeWuName,
      });

      expect(verdict.loadNeeded).toBe(false);
      expect(verdict.driftSurface).toBeUndefined();
    },
  );

  it("neither loads nor surfaces a null direction (no divergence)", () => {
    const verdict = resolveCleanArmNotesVerdict({
      direction: null,
      missingFiles: [],
      activeWuName,
    });

    expect(verdict.loadNeeded).toBe(false);
    expect(verdict.driftSurface).toBeUndefined();
  });
});

describe("missingFilesAreIntentionalRetirement", () => {
  it("reads files absent because their WU shipped (every missing WU in the shipped set) as retirement", () => {
    expect(
      missingFilesAreIntentionalRetirement({
        missingFiles: ["shipped-wu/SESSION-NOTES.md", "shipped-wu/scratch.md"],
        shippedWuNames: new Set(["shipped-wu", "other-shipped-wu"]),
      }),
    ).toBe(true);
  });

  it("reads a file whose WU has not shipped as real drift", () => {
    expect(
      missingFilesAreIntentionalRetirement({
        missingFiles: ["arrived-wu/SESSION-NOTES.md"],
        shippedWuNames: new Set(["shipped-wu"]),
      }),
    ).toBe(false);
  });

  it("treats a mix of shipped and not-shipped missing files as drift (not all retirement)", () => {
    expect(
      missingFilesAreIntentionalRetirement({
        missingFiles: ["shipped-wu/SESSION-NOTES.md", "arrived-wu/SESSION-NOTES.md"],
        shippedWuNames: new Set(["shipped-wu"]),
      }),
    ).toBe(false);
  });

  it("treats a missing top-level (non-per-WU) file as drift, never retirement", () => {
    expect(
      missingFilesAreIntentionalRetirement({
        missingFiles: ["STATUS.USER.md"],
        shippedWuNames: new Set(["shipped-wu"]),
      }),
    ).toBe(false);
  });

  it("recognizes a note-only ghost of a WU shipped before this machine's last sync", () => {
    // The file was never materialized here (so a last-sync-file-list heuristic
    // would miss it), but its WU is in the shipped set — authoritative retirement.
    expect(
      missingFilesAreIntentionalRetirement({
        missingFiles: ["pre-sync-shipped-wu/SESSION-NOTES.md"],
        shippedWuNames: new Set(["pre-sync-shipped-wu"]),
      }),
    ).toBe(true);
  });

  it("reads an empty missing set as non-retirement (nothing to classify)", () => {
    expect(
      missingFilesAreIntentionalRetirement({ missingFiles: [], shippedWuNames: new Set(["shipped-wu"]) }),
    ).toBe(false);
  });
});

describe("resolveCleanArmNotesVerdict — missing-direction handling", () => {
  it("surfaces a genuine missing arrival as drift", () => {
    const verdict = resolveCleanArmNotesVerdict({
      direction: "missing",
      missingFiles: ["arrived-wu/SESSION-NOTES.md"],
      activeWuName: "live-wu",
    });

    expect(verdict.loadNeeded).toBe(false);
    expect(verdict.driftSurface).toEqual({ direction: "missing" });
  });

  it("auto-loads the safe sub-case — only the active WU's SESSION-NOTES missing", () => {
    const verdict = resolveCleanArmNotesVerdict({
      direction: "missing",
      missingFiles: ["live-wu/SESSION-NOTES.md"],
      activeWuName: "live-wu",
    });

    expect(verdict.loadNeeded).toBe(true);
    expect(verdict.driftSurface).toBeUndefined();
  });

  it("surfaces mixed drift (local-only siblings)", () => {
    const verdict = resolveCleanArmNotesVerdict({
      direction: "mixed",
      missingFiles: ["some-wu/SESSION-NOTES.md"],
      activeWuName: "live-wu",
    });

    expect(verdict.loadNeeded).toBe(false);
    expect(verdict.driftSurface).toEqual({ direction: "mixed" });
  });
});

describe("inspectUserSyncState disk-vs-note direction inference", () => {
  interface DirectionScenario {
    sourceCommit: string;
    noteCommit: string;
    diskFiles: Record<string, string>;
    noteFiles: Record<string, string>;
    /** Hash recorded in `.sync-state.json` for the materialized snapshot. */
    materializedManifestHash: string;
    sourceOperation?: "save" | "load";
    /** Result for `git merge-base --is-ancestor <sourceCommit> <noteCommit>`. */
    sourceIsAncestorOfNote: boolean;
    annotatedNoteCommits?: string[];
    noteFilesByCommit?: Record<string, Record<string, string>>;
    reachableCommits?: string[];
    maximalCommits?: string[];
    gitCommonDir?: string;
  }

  function buildIO(scenario: DirectionScenario): UserIOContext {
    const localNotesRefHash = "c".repeat(40);
    const noteHistoryCommit = "d".repeat(40);
    const userDir = "/repo/.arc/user/andrew";
    const internalDir = `${userDir}/.internal`;
    const localNotesRef = "refs/notes/arc/user/andrew";
    const noteCommitPath = `${scenario.noteCommit.slice(0, 2)}/${scenario.noteCommit.slice(2)}`;
    const annotatedNoteCommits = scenario.annotatedNoteCommits ?? [scenario.noteCommit];
    const noteFilesFor = (commit: string): Record<string, string> =>
      scenario.noteFilesByCommit?.[commit] ?? scenario.noteFiles;
    const noteJSONFor = (commit: string): string => JSON.stringify({ version: 2, files: noteFilesFor(commit) });
    const syncStateContent = JSON.stringify({
      version: 2,
      materializedManifestHash: scenario.materializedManifestHash,
      sourceCommit: scenario.sourceCommit,
      sourceOperation: scenario.sourceOperation ?? "save",
    });

    return {
      exec: async (cmd, args) => {
        if (cmd !== "git") throw new Error(`unexpected cmd: ${cmd}`);
        if (args[0] === "rev-parse" && args[1] === "HEAD" && args.length === 2) {
          return { stdout: `${scenario.noteCommit}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: `${scenario.gitCommonDir ?? "/repo/.git"}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === localNotesRef) {
          return { stdout: `${localNotesRefHash}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          const stdout = annotatedNoteCommits
            .map((commit) => `${"0".repeat(40)} ${commit}`)
            .join("\n");
          return { stdout: `${stdout}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "show" && typeof args[3] === "string") {
          return { stdout: noteJSONFor(args[3]), stderr: "" };
        }
        if (args[0] === "log" && args.includes(localNotesRef)) {
          return { stdout: `${noteHistoryCommit}\n`, stderr: "" };
        }
        if (args[0] === "diff-tree" && args.includes(noteHistoryCommit)) {
          return { stdout: `${noteCommitPath}\n`, stderr: "" };
        }
        if (args[0] === "show" && args[1] === `${noteHistoryCommit}:${noteCommitPath}`) {
          return { stdout: noteJSONFor(scenario.noteCommit), stderr: "" };
        }
        if (args[0] === "rev-list" && args[1] === "HEAD") {
          const reachableCommits = scenario.reachableCommits ?? [scenario.noteCommit, scenario.sourceCommit];
          return { stdout: `${reachableCommits.join("\n")}\n`, stderr: "" };
        }
        if (
          args[0] === "merge-base"
          && args[1] === "--independent"
        ) {
          return { stdout: `${(scenario.maximalCommits ?? [scenario.noteCommit]).join("\n")}\n`, stderr: "" };
        }
        if (
          args[0] === "merge-base"
          && args[1] === "--is-ancestor"
          && args[2] === scenario.noteCommit
          && args[3] === "HEAD"
        ) {
          return { stdout: "", stderr: "" };
        }
        if (
          args[0] === "rev-list"
          && args[1] === "--count"
          && args[2] === `${scenario.noteCommit}..HEAD`
        ) {
          return { stdout: "0\n", stderr: "" };
        }
        if (
          args[0] === "merge-base"
          && args[1] === "--is-ancestor"
          && args[2] === scenario.sourceCommit
          && args[3] === scenario.noteCommit
        ) {
          if (scenario.sourceIsAncestorOfNote) return { stdout: "", stderr: "" };
          throw new Error("not an ancestor");
        }
        if (args[0] === "ls-remote" && args[1] === "origin" && args[2] === localNotesRef) {
          return { stdout: `${localNotesRefHash}\trefs/notes/arc/user/andrew\n`, stderr: "" };
        }
        throw new Error(`unexpected git call: ${args.join(" ")}`);
      },
      readDir: async (dir) => {
        if (dir === userDir) {
          return Object.entries(scenario.diskFiles).map(([name, content]) => ({
            name,
            size: content.length,
          }));
        }
        return [];
      },
      readFile: async (path) => {
        for (const [name, content] of Object.entries(scenario.diskFiles)) {
          if (path === `${userDir}/${name}`) return content;
        }
        if (path === `${internalDir}/.sync-state.json`) return syncStateContent;
        throw new Error(`ENOENT: ${path}`);
      },
      writeFile: async () => {},
      mkdir: async () => undefined,
      writeNote: async () => {},
      readNote: async () => null,
    };
  }

  function actionFor(state: Awaited<ReturnType<typeof inspectUserSyncState>>, savedCommit: string) {
    return buildUserStatusResult({
      identity: "andrew",
      diskState: state.diskState,
      diskStatus: state.diskStatus,
      refState: state.refState,
      remoteChecked: true,
      savedCommit: savedCommit.slice(0, 7),
      savedFromAncestor: false,
      ancestorDistance: 0,
      unsavedDirection: state.unsavedDirection,
      backupFiles: [],
      remoteIdentities: [],
    }).actionHint;
  }

  it("reads a fresh save as current when an older reachable note is also present", async () => {
    const olderCommit = "a".repeat(40);
    const savedCommit = "c".repeat(40);
    const savedFiles = { "WORKING-MEMORY.md": "saved-current" };
    const savedManifest: SyncManifest = { version: 2, files: savedFiles };
    const io = buildIO({
      sourceCommit: savedCommit,
      noteCommit: savedCommit,
      annotatedNoteCommits: [olderCommit, savedCommit],
      noteFilesByCommit: {
        [olderCommit]: { "WORKING-MEMORY.md": "older-note" },
        [savedCommit]: savedFiles,
      },
      reachableCommits: [savedCommit, olderCommit],
      maximalCommits: [savedCommit],
      diskFiles: savedFiles,
      noteFiles: savedFiles,
      materializedManifestHash: hashSyncManifest(savedManifest),
      sourceIsAncestorOfNote: true,
    });

    const state = await inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" });

    expect(state.diskState).toBe("same");
    expect(state.diskStatus).toBe("current");
    expect(state.unsavedDirection).toBeNull();
    expect(actionFor(state, savedCommit)).toBeNull();
  });

  it("flags disk as 'behind' and routes to `arc user load` when note advanced past sourceCommit while disk matches materialized", async () => {
    const diskFiles = { "WORKING-MEMORY.md": "disk-content" };
    const diskManifest: SyncManifest = { version: 2, files: diskFiles };
    const noteCommit = "b".repeat(40);
    const io = buildIO({
      sourceCommit: "a".repeat(40),
      noteCommit,
      diskFiles,
      noteFiles: { "WORKING-MEMORY.md": "newer-from-other-machine" },
      materializedManifestHash: hashSyncManifest(diskManifest),
      sourceIsAncestorOfNote: true,
    });

    const state = await inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" });

    expect(state.unsavedDirection).toBe("behind");
    expect(state.diskStatus).toBe("stale");
    expect(actionFor(state, noteCommit)).toBe("run `arc user load`");
  });

  it("reflects unsaved edits and routes to `arc user save` when note is at sourceCommit and disk diverged from materialized", async () => {
    const noteFiles = { "WORKING-MEMORY.md": "saved" };
    const noteManifest: SyncManifest = { version: 2, files: noteFiles };
    const sharedCommit = "a".repeat(40);
    const io = buildIO({
      sourceCommit: sharedCommit,
      noteCommit: sharedCommit,
      diskFiles: { "WORKING-MEMORY.md": "edited" },
      noteFiles,
      materializedManifestHash: hashSyncManifest(noteManifest),
      sourceIsAncestorOfNote: true,
    });

    const state = await inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" });

    expect(state.unsavedDirection).toBe("modified");
    expect(state.diskStatus).toBe("local unsaved");
    expect(actionFor(state, sharedCommit)).toBe("run `arc user save`");
  });

  it("reports mixed direction with manual-reconciliation framing when both note and disk advanced from the materialized baseline", async () => {
    const baselineManifest: SyncManifest = {
      version: 2,
      files: { "WORKING-MEMORY.md": "baseline" },
    };
    const noteCommit = "b".repeat(40);
    const io = buildIO({
      sourceCommit: "a".repeat(40),
      noteCommit,
      diskFiles: { "WORKING-MEMORY.md": "local-edits" },
      noteFiles: { "WORKING-MEMORY.md": "remote-edits" },
      materializedManifestHash: hashSyncManifest(baselineManifest),
      sourceIsAncestorOfNote: true,
    });

    const state = await inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" });

    expect(state.unsavedDirection).toBe("mixed");
    expect(state.diskStatus).toBe("mixed");
    expect(actionFor(state, noteCommit)).toBe(
      "inspect local working files, then run `arc user load` or `arc user save`",
    );
  });

  it("reports mixed direction with manual-reconciliation framing when note is unreachable from sourceCommit", async () => {
    const baselineManifest: SyncManifest = {
      version: 2,
      files: { "WORKING-MEMORY.md": "baseline" },
    };
    const noteCommit = "b".repeat(40);
    const io = buildIO({
      sourceCommit: "a".repeat(40),
      noteCommit,
      diskFiles: { "WORKING-MEMORY.md": "baseline" },
      noteFiles: { "WORKING-MEMORY.md": "orphan-history" },
      materializedManifestHash: hashSyncManifest(baselineManifest),
      sourceIsAncestorOfNote: false,
    });

    const state = await inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" });

    expect(state.unsavedDirection).toBe("mixed");
    expect(state.diskStatus).toBe("mixed");
    expect(actionFor(state, noteCommit)).toBe(
      "inspect local working files, then run `arc user load` or `arc user save`",
    );
  });

  it("treats the no-comparable load basis as stale instead of mixed", async () => {
    const loadedFiles = { "WORKING-MEMORY.md": "loaded-cross-wu" };
    const loadedManifest: SyncManifest = { version: 2, files: loadedFiles };
    const noteCommit = "b".repeat(40);
    const io = buildIO({
      sourceCommit: NO_COMPARABLE_SOURCE_COMMIT,
      sourceOperation: "load",
      noteCommit,
      diskFiles: loadedFiles,
      noteFiles: { "WORKING-MEMORY.md": "older-note" },
      materializedManifestHash: hashSyncManifest(loadedManifest),
      sourceIsAncestorOfNote: false,
      reachableCommits: [noteCommit],
    });

    const state = await inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" });

    expect(state.unsavedDirection).toBe("modified");
    expect(state.diskStatus).toBe("stale");
    expect(actionFor(state, noteCommit)).toBe("run `arc user load`");
  });

  it("keeps legacy save-sourced materialized hashes local-unsaved when no baseline stamp exists", async () => {
    const baselineFiles = { "WORKING-MEMORY.md": "baseline" };
    const baselineManifest: SyncManifest = { version: 2, files: baselineFiles };
    const sharedCommit = "a".repeat(40);
    const io = buildIO({
      sourceCommit: sharedCommit,
      sourceOperation: "save",
      noteCommit: sharedCommit,
      diskFiles: baselineFiles,
      noteFiles: { "WORKING-MEMORY.md": "saved-note" },
      materializedManifestHash: hashSyncManifest(baselineManifest),
      sourceIsAncestorOfNote: true,
    });

    const state = await inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" });

    expect(state.diskStatus).toBe("local unsaved");
    expect(state.unsavedDirection).toBe("modified");
    expect(actionFor(state, sharedCommit)).toBe("run `arc user save`");
  });

  it("uses the repo-shared materialized baseline stamp to identify stale disk", async () => {
    const commonDir = await mkdtemp(join(tmpdir(), "arc-status-baseline-"));
    try {
      const baselineFiles = { "WORKING-MEMORY.md": "baseline" };
      const baselineManifest: SyncManifest = { version: 2, files: baselineFiles };
      const baselineHash = hashSyncManifest(baselineManifest);
      const stampDir = join(commonDir, "arc", "user", "andrew", ".internal");
      await mkdir(stampDir, { recursive: true });
      await writeFile(
        join(stampDir, "materialized-baseline.json"),
        `${JSON.stringify({
          version: 1,
          manifestHash: baselineHash,
          notesRefTip: null,
          files: [],
          entries: [],
        }, null, 2)}\n`,
        "utf-8",
      );

      const sharedCommit = "a".repeat(40);
      const io = buildIO({
        sourceCommit: sharedCommit,
        sourceOperation: "save",
        noteCommit: sharedCommit,
        diskFiles: baselineFiles,
        noteFiles: { "WORKING-MEMORY.md": "saved-note" },
        materializedManifestHash: "legacy-save-hash",
        sourceIsAncestorOfNote: true,
        gitCommonDir: commonDir,
      });

      const state = await inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" });

      expect(state.diskStatus).toBe("stale");
      expect(state.unsavedDirection).toBe("modified");
      expect(actionFor(state, sharedCommit)).toBe("run `arc user load`");
    } finally {
      await rm(commonDir, { recursive: true, force: true });
    }
  });

  it("fails closed when the repo-shared materialized baseline stamp is malformed", async () => {
    const commonDir = await mkdtemp(join(tmpdir(), "arc-status-baseline-bad-"));
    try {
      const stampDir = join(commonDir, "arc", "user", "andrew", ".internal");
      await mkdir(stampDir, { recursive: true });
      await writeFile(join(stampDir, "materialized-baseline.json"), "{bad json\n", "utf-8");

      const sharedCommit = "a".repeat(40);
      const baselineFiles = { "WORKING-MEMORY.md": "baseline" };
      const baselineManifest: SyncManifest = { version: 2, files: baselineFiles };
      const io = buildIO({
        sourceCommit: sharedCommit,
        sourceOperation: "save",
        noteCommit: sharedCommit,
        diskFiles: baselineFiles,
        noteFiles: { "WORKING-MEMORY.md": "saved-note" },
        materializedManifestHash: hashSyncManifest(baselineManifest),
        sourceIsAncestorOfNote: true,
        gitCommonDir: commonDir,
      });

      await expect(inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" }))
        .rejects.toThrow("Invalid materialized-baseline stamp");
    } finally {
      await rm(commonDir, { recursive: true, force: true });
    }
  });

  const wmEntry = (header: string, body: string): string =>
    `**${header}:**\n_Remove when: x._\n\n${body}`;
  const wmFile = (...entries: string[]): string =>
    `# Working Memory\n\n## Memories\n\n${entries.join("\n\n")}\n\n---\n`;
  const wmTombstone = "## Removed: **Gone:**\n\n- _Section:_ Memories\n- _Removed:_ 2026-05-25T12:00:00.000Z";

  it("reads current when the note carries a tombstone the disk lacks (no false local unsaved)", async () => {
    const clean = wmFile(wmEntry("Kept", "Kept body."));
    const noteFiles = { "WORKING-MEMORY.md": `${clean}\n${wmTombstone}\n` };
    const sharedCommit = "a".repeat(40);
    const io = buildIO({
      sourceCommit: sharedCommit,
      noteCommit: sharedCommit,
      diskFiles: { "WORKING-MEMORY.md": clean },
      noteFiles,
      materializedManifestHash: hashSyncManifest(projectManifest({ version: 2, files: noteFiles })),
      sourceIsAncestorOfNote: true,
    });

    const state = await inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" });

    expect(state.diskStatus).toBe("current");
    expect(state.unsavedDirection).toBeNull();
  });

  it("still flags a genuine cross-WU entry edit as local unsaved under projection", async () => {
    const noteFiles = { "WORKING-MEMORY.md": `${wmFile(wmEntry("Kept", "Kept body."))}\n${wmTombstone}\n` };
    const diskFiles = { "WORKING-MEMORY.md": wmFile(wmEntry("Kept", "Kept body."), wmEntry("Added", "Added body.")) };
    const sharedCommit = "a".repeat(40);
    const io = buildIO({
      sourceCommit: sharedCommit,
      noteCommit: sharedCommit,
      diskFiles,
      noteFiles,
      materializedManifestHash: hashSyncManifest(projectManifest({ version: 2, files: noteFiles })),
      sourceIsAncestorOfNote: true,
    });

    const state = await inspectUserSyncState({ cwd: "/repo", io, identity: "andrew" });

    expect(state.diskStatus).toBe("local unsaved");
    expect(state.unsavedDirection).toBe("modified");
  });

});

describe("user sync spine", () => {
  it("maps every ref/topology input onto exactly one session-init spine state", () => {
    const cases = [
      { remoteSyncEnabled: false, refState: null, expected: "disabled" },
      { remoteSyncEnabled: true, refState: "same", expected: "clean" },
      { remoteSyncEnabled: true, refState: "local-ahead", expected: "clean" },
      { remoteSyncEnabled: true, refState: "remote-ahead", expected: "remote-ahead" },
      { remoteSyncEnabled: true, refState: "diverged", expected: "conflict" },
      { remoteSyncEnabled: true, refState: "remote-unavailable", expected: "remote-unavailable" },
    ] as const;

    const states = new Set(cases.map((entry) => computeUserSyncSpine(entry).state));

    expect(states).toEqual(new Set(["disabled", "clean", "remote-ahead", "conflict", "remote-unavailable"]));
    for (const entry of cases) {
      expect(computeUserSyncSpine(entry).state).toBe(entry.expected);
    }
  });

  it("collapses diverged remote-subset content to clean while preserving raw detail", () => {
    const spine = computeUserSyncSpine({
      remoteSyncEnabled: true,
      refState: "diverged",
      contentRelation: "remote-subset",
    });

    expect(spine).toMatchObject({
      state: "clean",
      refState: "diverged",
      contentRelation: "remote-subset",
      shouldPromptToPull: false,
    });
  });

  it("keeps every other diverged content relation on the conflict spine without pull prompts", () => {
    const relations = ["local-subset", "equal", "mixed-uncontested", "conflicting"] as const;

    for (const contentRelation of relations) {
      expect(computeUserSyncSpine({
        remoteSyncEnabled: true,
        refState: "diverged",
        contentRelation,
      })).toMatchObject({
        state: "conflict",
        refState: "diverged",
        contentRelation,
        shouldPromptToPull: false,
      });
    }
  });

  it("keeps remote-ahead recovery pull-directed even when working files have local edits", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "different",
      refState: "remote-ahead",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      unsavedDirection: "edits",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.spineState).toBe("remote-ahead");
    expect(result.actionHint).toBe("run `arc user pull`");
    expect(result.actionHint).not.toContain("save");
    expect(result.actionHint).not.toContain("push");
  });

  it("layers full-mode detail axes without changing the shared spine state", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "remote-ahead",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedReachableFromHead: false,
      currentBranch: "fix/state-ref-write-safety",
      savedAtRelative: "11 hours ago",
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.spineState).toBe("remote-ahead");
    expect(result.detailLines).toContain("Saved 11 hours ago.");
    expect(result.detailLines).toContain(
      "Latest local user note is from abc1234, not in branch `fix/state-ref-write-safety`'s history — " +
      "expected when the work was continued or integrated on another branch or machine.",
    );
  });

  it("returns the same spine state for full-mode and session-init probes on the same refs", async () => {
    const io = {
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          throw new Error("local note ref missing");
        }
        if (args[0] === "ls-remote") {
          return { stdout: "remote456\trefs/notes/arc/user/andrew\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: "head123\n", stderr: "" };
        }
        if (args[0] === "log") {
          return { stdout: "", stderr: "" };
        }
        throw new Error(`unexpected command: git ${args.join(" ")}`);
      },
      readDir: async () => [],
      readFile: async () => "",
      writeFile: async () => {},
      mkdir: async () => undefined,
      writeNote: async () => {},
      readNote: async () => null,
    };

    const full = await runUserStatus({ cwd: "/repo", io, identity: "andrew" });
    const sessionInit = await runUserSessionInitStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(full.spineState).toBe(sessionInit.state);
    expect(full.actionHint).toBe("run `arc user pull`");
    expect(sessionInit.actionHint).toContain("arc user pull");
  });
});

describe("partial-push coherence condition", () => {
  it("layers partial-push coherence on local-ahead topology without adding a spine state", () => {
    const spine = computeUserSyncSpine({
      remoteSyncEnabled: true,
      refState: "local-ahead",
      coherenceState: "partial-push",
    });

    expect(spine.state).toBe("clean");
    expect(spine.refState).toBe("local-ahead");
    expect(spine.remoteStatus).toBe("local ahead");
    expect(spine.coherenceState).toBe("partial-push");
  });

  it("keeps the session-init spine state five-state while preserving partial-push detail", () => {
    const spine = computeUserSyncSpine({
      remoteSyncEnabled: true,
      refState: "local-ahead",
      coherenceState: "partial-push",
    });
    const sessionInitStates = new Set([
      "disabled",
      "clean",
      "remote-ahead",
      "conflict",
      "remote-unavailable",
    ]);

    expect(sessionInitStates.has(spine.state)).toBe(true);
    expect(spine.state).toBe("clean");
    expect(spine.coherenceState).toBe("partial-push");
  });

  it("surfaces partial-push recovery explicitly in full-mode status", () => {
    const result = buildUserStatusResult({
      identity: "andrew",
      diskState: "same",
      refState: "local-ahead",
      coherenceState: "partial-push",
      remoteChecked: true,
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      backupFiles: [],
      remoteIdentities: [],
    });

    expect(result.spineState).toBe("clean");
    expect(result.refState).toBe("local-ahead");
    expect(result.coherenceState).toBe("partial-push");
    expect(result.detailLines).toContain(
      "Partial push recovery: remote notes are still behind local notes after a prior publish attempt.",
    );
    expect(result.actionHint).toBe("run `arc user push` to retry the notes push");
  });
});

describe("runUserSessionInitStatus", () => {
  const staleNoteCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const headCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const noteHistoryCommit = "cccccccccccccccccccccccccccccccccccccccc";
  const notesRef = "refs/notes/arc/user/andrew";

  function notePathFor(commit: string): string {
    return `${commit.slice(0, 2)}/${commit.slice(2)}`;
  }

  const io = {
    exec: async () => ({ stdout: "", stderr: "" }),
    readDir: async () => [],
    readFile: async () => "",
    writeFile: async () => {},
    mkdir: async () => undefined,
    writeNote: async () => {},
    readNote: async () => null,
  };

  function relationProbeIO(contentRelation: "remote-subset" | "local-subset" | "equal" | "mixed-uncontested" | "conflicting") {
    const localHash = "1".repeat(40);
    const remoteHash = "2".repeat(40);
    const sharedCommit = "3".repeat(40);
    const localCommit = "4".repeat(40);
    const remoteCommit = "5".repeat(40);
    const shared = { blob: "6".repeat(40), commit: sharedCommit };
    const localOnly = { blob: "7".repeat(40), commit: localCommit };
    const remoteOnly = { blob: "8".repeat(40), commit: remoteCommit };
    const contestedLocal = { blob: "9".repeat(40), commit: sharedCommit };
    const contestedRemote = { blob: "a".repeat(40), commit: sharedCommit };
    const entries = {
      "remote-subset": { local: [shared, localOnly], remote: [shared] },
      "local-subset": { local: [shared], remote: [shared, remoteOnly] },
      equal: { local: [shared], remote: [shared] },
      "mixed-uncontested": { local: [localOnly], remote: [remoteOnly] },
      conflicting: { local: [contestedLocal], remote: [contestedRemote] },
    }[contentRelation];
    return {
      ...io,
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === notesRef) {
          return { stdout: `${localHash}\n`, stderr: "" };
        }
        if (
          args[0] === "rev-parse"
          && args[1] === "--verify"
          && args[2]?.startsWith("refs/arc-sync-temp/")
        ) {
          return { stdout: `${remoteHash}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: `${headCommit}\n`, stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: `${remoteHash}\t${notesRef}\n`, stderr: "" };
        }
        if (args[0] === "fetch") return { stdout: "", stderr: "" };
        if (args[0] === "merge-base") throw new Error("not an ancestor");
        if (args[0] === "ls-tree") {
          const selected = args[2] === localHash ? entries.local : entries.remote;
          return {
            stdout: selected.map((entry) => `100644 blob ${entry.blob}\t${entry.commit}`).join("\n"),
            stderr: "",
          };
        }
        if (args[0] === "show" && args[1]?.includes(".arc-user-notes-compaction-manifest.json")) {
          throw new Error("manifest absent");
        }
        if (args[0] === "update-ref" && args[1] === "-d") return { stdout: "", stderr: "" };
        if (args[0] === "notes" || args[0] === "log" || args[0] === "diff-tree" || args[0] === "rev-list") {
          return { stdout: "", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
    };
  }

  it("returns disabled when session.remote_sync is off", async () => {
    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: false,
    });

    expect(result.state).toBe("disabled");
    expect(result.refState).toBeUndefined();
    expect(result.shouldPromptToPull).toBe(false);
    expect(result.loadNeeded).toBeUndefined();
    expect(buildUserSessionInitStatusSummary(result)).toContain("session-init remote sync disabled");
  });

  it("renders diverged remote-subset content as clean informational state", async () => {
    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: relationProbeIO("remote-subset"),
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result).toMatchObject({
      state: "clean",
      refState: "diverged",
      contentRelation: "remote-subset",
      shouldPromptToPull: false,
    });
    expect(result.summary).toContain("local notes contain remote notes");
  });

  it("renders zero-contested divergence as next-push residue without a pull prompt", async () => {
    for (const contentRelation of ["local-subset", "equal", "mixed-uncontested"] as const) {
      const result = await runUserSessionInitStatus({
        cwd: "/repo",
        io: relationProbeIO(contentRelation),
        identity: "andrew",
        remoteSyncEnabled: true,
      });

      expect(result).toMatchObject({ state: "conflict", contentRelation, shouldPromptToPull: false });
      expect(result.actionHint).toContain("next paired push");
      expect(result.detailLines.join(" ")).not.toContain("run `arc user pull`");
    }
  });

  it("renders contested divergence as an inspect-only genuine conflict", async () => {
    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: relationProbeIO("conflicting"),
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result).toMatchObject({
      state: "conflict",
      contentRelation: "conflicting",
      shouldPromptToPull: false,
    });
    expect(result.actionHint).toContain("arc user status");
    expect(result.detailLines).toContain(
      "Pull cannot resolve diverged notes refs; inspect with `arc user status`.",
    );
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
    expect(result.refState).toBe("same");
    expect(calls).toEqual(expect.arrayContaining([
      { cmd: "git", args: ["rev-parse", "--verify", "refs/notes/arc/user/andrew"] },
      { cmd: "git", args: ["ls-remote", "origin", "refs/notes/arc/user/andrew"] },
    ]));
    expect(calls.some(({ args }) => args[0] === "fetch")).toBe(false);
  });

  it("preserves refState=local-ahead on the clean spine state for orientation surfacing", async () => {
    const probeIO = {
      ...io,
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          return { stdout: "local123\n", stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: "", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
    };

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: probeIO,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("clean");
    expect(result.refState).toBe("local-ahead");
    expect(result.shouldPromptToPull).toBe(false);
  });

  it("projects an empty local note result as missing freshness", async () => {
    const sameRefHash = "dddddddddddddddddddddddddddddddddddddddd";
    const currentHead = "b".repeat(40);
    const probeIO = {
      ...io,
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          return { stdout: `${sameRefHash}\n`, stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: `${sameRefHash}\t${notesRef}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: `${currentHead}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          return { stdout: "", stderr: "" };
        }
        throw new Error(`unexpected command: git ${args.join(" ")}`);
      },
    };

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: probeIO,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.localNoteFreshness).toEqual({
      state: "missing",
      commit: null,
      commitShort: null,
      ancestorDistance: 0,
      wuScoped: false,
    });
    expect(result.detailLines).toContain("No local user note exists for this identity.");
  });

  it("projects a WU-scoped empty note with a disk seed present as seeded-but-unsaved", async () => {
    const sameRefHash = "dddddddddddddddddddddddddddddddddddddddd";
    const currentHead = "b".repeat(40);
    const seedPath = "/repo/.arc/user/andrew/probe-x/SESSION-NOTES.md";
    const probeIO = {
      ...io,
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          return { stdout: `${sameRefHash}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
          return { stdout: "feat/probe-x\n", stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: `${sameRefHash}\t${notesRef}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: `${currentHead}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          return { stdout: "", stderr: "" };
        }
        throw new Error(`unexpected command: git ${args.join(" ")}`);
      },
      readFile: async (path: string) => (path === seedPath ? "seed" : ""),
    };

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: probeIO,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.localNoteFreshness).toEqual({
      state: "missing",
      commit: null,
      commitShort: null,
      ancestorDistance: 0,
      wuScoped: true,
      seedPresent: true,
    });
    expect(result.detailLines).toContain(
      "SESSION-NOTES seeded on disk for this work unit; not yet saved to the notes ref (saves at first handoff).",
    );
    expect(result.detailLines).not.toContain("No local user note exists for this identity.");
  });

  it("projects a WU-scoped empty note with no disk seed as an unexpected gap", async () => {
    const sameRefHash = "dddddddddddddddddddddddddddddddddddddddd";
    const currentHead = "b".repeat(40);
    const seedPath = "/repo/.arc/user/andrew/probe-x/SESSION-NOTES.md";
    const probeIO = {
      ...io,
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          return { stdout: `${sameRefHash}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
          return { stdout: "feat/probe-x\n", stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: `${sameRefHash}\t${notesRef}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: `${currentHead}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          return { stdout: "", stderr: "" };
        }
        throw new Error(`unexpected command: git ${args.join(" ")}`);
      },
      readFile: async (path: string) => {
        if (path === seedPath) throw new Error("ENOENT");
        return "";
      },
    };

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: probeIO,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.localNoteFreshness).toEqual({
      state: "missing",
      commit: null,
      commitShort: null,
      ancestorDistance: 0,
      wuScoped: true,
      seedPresent: false,
    });
    expect(result.detailLines).toContain(
      "No SESSION-NOTES for this work unit — none on disk and none in the notes ref. " +
      "A seed was expected at spawn/start; the workspace may not have been opened, or the seed was removed.",
    );
    expect(result.detailLines).not.toContain("No local user note exists for this identity.");
  });

  it("projects a reachable note at HEAD as current-head freshness", async () => {
    const sameRefHash = "dddddddddddddddddddddddddddddddddddddddd";
    const currentHead = "b".repeat(40);
    const userDir = "/repo/.arc/user/andrew";
    const noteFiles = { "SESSION-NOTES.md": "saved" };
    const noteJSON = JSON.stringify(manifest(noteFiles));
    const probeIO = {
      ...io,
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          return { stdout: `${sameRefHash}\n`, stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: `${sameRefHash}\t${notesRef}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: `${currentHead}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--short" && args[2] === currentHead) {
          return { stdout: `${currentHead.slice(0, 7)}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          return { stdout: `${"0".repeat(40)} ${currentHead}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "show" && args[3] === currentHead) {
          return { stdout: noteJSON, stderr: "" };
        }
        if (args[0] === "rev-list" && args[1] === "HEAD") {
          return { stdout: `${currentHead}\n`, stderr: "" };
        }
        if (args[0] === "rev-list" && args[1] === "--count") {
          return { stdout: "0\n", stderr: "" };
        }
        throw new Error(`unexpected command: git ${args.join(" ")}`);
      },
      readDir: async (dir: string) => {
        if (dir !== userDir) return [];
        return [{ name: "SESSION-NOTES.md", size: noteFiles["SESSION-NOTES.md"].length }];
      },
      readFile: async (path: string) => {
        if (path === `${userDir}/SESSION-NOTES.md`) return noteFiles["SESSION-NOTES.md"];
        const err = new Error(`ENOENT: ${path}`) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      },
    };

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: probeIO,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.localNoteFreshness).toEqual({
      state: "current-head",
      commit: currentHead,
      commitShort: currentHead.slice(0, 7),
      ancestorDistance: 0,
      reachableFromHead: true,
    });
    expect(result.detailLines).toContain("Latest local user note is current with HEAD.");
  });

  it("surfaces stale local-note freshness when matching refs are behind HEAD", async () => {
    const sameRefHash = "dddddddddddddddddddddddddddddddddddddddd";
    const probeIO = {
      ...io,
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          return { stdout: `${sameRefHash}\n`, stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: `${sameRefHash}\t${notesRef}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: `${headCommit}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          return { stdout: `${"0".repeat(40)} ${staleNoteCommit}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "show" && args[3] === staleNoteCommit) {
          return { stdout: JSON.stringify({ version: 2, files: {} }), stderr: "" };
        }
        if (args[0] === "log") {
          return { stdout: `${noteHistoryCommit}\n`, stderr: "" };
        }
        if (args[0] === "diff-tree") {
          return { stdout: `${notePathFor(staleNoteCommit)}\n`, stderr: "" };
        }
        if (args[0] === "show") {
          return { stdout: JSON.stringify({ version: 2, files: {} }), stderr: "" };
        }
        if (args[0] === "merge-base" && args[1] === "--independent") {
          return { stdout: `${staleNoteCommit}\n`, stderr: "" };
        }
        if (args[0] === "merge-base") {
          return { stdout: "", stderr: "" };
        }
        if (args[0] === "rev-list" && args[1] === "HEAD") {
          return { stdout: `${headCommit}\n${staleNoteCommit}\n`, stderr: "" };
        }
        if (args[0] === "rev-list" && args[1] === "--count") {
          return { stdout: "2\n", stderr: "" };
        }
        throw new Error(`unexpected command: git ${args.join(" ")}`);
      },
    };

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: probeIO,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("clean");
    expect(result.shouldPromptToPull).toBe(false);
    expect(result.localNoteFreshness).toEqual({
      state: "ancestor",
      commit: staleNoteCommit,
      commitShort: staleNoteCommit.slice(0, 7),
      ancestorDistance: 2,
      reachableFromHead: true,
    });
    expect(result.detailLines).toContain(
      "Latest local user note is from aaaaaaa, 2 commit(s) behind HEAD.",
    );
    expect(result.detailLines).toContain(
      "Next step: run `arc user save` or `arc sync` before relying on handoff.",
    );
    expect(result.actionHint).toBe("run `arc user save` or `arc sync` before relying on handoff");
  });

  it("projects an off-ancestry save pointer as outside-head-ancestry, not current", async () => {
    const sameRefHash = "dddddddddddddddddddddddddddddddddddddddd";
    const offBranchCommit = "a".repeat(40);
    const currentHead = "b".repeat(40);
    const userDir = "/repo/.arc/user/andrew";
    const internalDir = `${userDir}/.internal`;
    // Branch fallback resolves the current WU to `current`; the saved note carries
    // that WU's own SESSION-NOTES so it resolves as the nearest note.
    const noteFiles = { "current/SESSION-NOTES.md": "saved" };
    const noteJSON = JSON.stringify(manifest(noteFiles));
    const syncStateContent = JSON.stringify({
      version: 2,
      materializedManifestHash: hashSyncManifest(manifest(noteFiles)),
      sourceCommit: offBranchCommit,
      sourceOperation: "save",
    });
    const probeIO = {
      ...io,
      exec: async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify") {
          return { stdout: `${sameRefHash}\n`, stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: `${sameRefHash}\t${notesRef}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: `${currentHead}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
          return { stdout: "feature/current\n", stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          return { stdout: `${"0".repeat(40)} ${offBranchCommit}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "show" && args[3] === offBranchCommit) {
          return { stdout: noteJSON, stderr: "" };
        }
        if (args[0] === "rev-list" && args[1] === "HEAD") {
          return { stdout: `${currentHead}\n`, stderr: "" };
        }
        throw new Error(`unexpected command: git ${args.join(" ")}`);
      },
      readDir: async (dir: string) => {
        if (dir !== userDir) return [];
        return [{ name: "current/SESSION-NOTES.md", size: noteFiles["current/SESSION-NOTES.md"].length }];
      },
      readFile: async (path: string) => {
        if (path === `${userDir}/current/SESSION-NOTES.md`) return noteFiles["current/SESSION-NOTES.md"];
        if (path === `${internalDir}/.sync-state.json`) return syncStateContent;
        throw new Error(`ENOENT: ${path}`);
      },
    };

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io: probeIO,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.localNoteFreshness).toMatchObject({
      state: "outside-head-ancestry",
      commit: offBranchCommit,
      commitShort: offBranchCommit.slice(0, 7),
      reachableFromHead: false,
      currentBranch: "feature/current",
    });
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
    expect(result.summary).toBe("andrew: session-init local-to-remote notes comparison unavailable here");
    expect(result.detailLines).toContain(
      "Remote notes are reachable, but this environment blocks the local-to-remote notes ancestry comparison.",
    );
    expect(result.detailLines).toContain(
      "Next step: continue with local tracked state, or retry session-init where git fetch/write access is allowed.",
    );
    expect(result.shouldPromptToPull).toBe(false);
  });
});

describe("runUserSessionInitStatus loadNeeded probe", () => {
  const userDir = "/repo/.arc/user/andrew";
  const internalDir = `${userDir}/.internal`;
  const localNotesRef = "refs/notes/arc/user/andrew";
  const localNotesRefHash = "c".repeat(40);
  const remoteAheadHash = "f".repeat(40);
  const noteHistoryCommit = "d".repeat(40);
  const sourceCommit = "a".repeat(40);
  const noteCommit = "b".repeat(40);
  const noteCommitPath = `${noteCommit.slice(0, 2)}/${noteCommit.slice(2)}`;

  type RefStateOverride =
    | "same"
    | "local-ahead"
    | "remote-ahead"
    | "diverged"
    | "remote-unavailable";

  interface ProbeOptions {
    refState: RefStateOverride;
    /** When `true`, disk content matches note content (state === "same" → loadNeeded: false). */
    diskMatchesNote?: boolean;
    /** When `true`, the disk has no user files — the note's files are all missing on disk. */
    diskEmpty?: boolean;
    /** Override the note-side manifest files (default: a single top-level `WORKING-MEMORY.md`). */
    noteFiles?: Record<string, string>;
    /** Current branch returned for WU-name fallback resolution. */
    currentBranch?: string;
    /** WU slugs the shipped-set oracle (`git ls-tree origin/<base> -- completed/`) reports as shipped. */
    shippedWus?: string[];
  }

  function buildIO(options: ProbeOptions): UserIOContext {
    const diskFiles: Record<string, string> = options.diskEmpty
      ? {}
      : options.diskMatchesNote
        ? { "WORKING-MEMORY.md": "shared-content" }
        : { "WORKING-MEMORY.md": "disk-content" };
    const noteFiles = options.noteFiles
      ?? (options.diskMatchesNote
        ? { "WORKING-MEMORY.md": "shared-content" }
        : { "WORKING-MEMORY.md": "newer-from-other-machine" });
    const noteJSON = JSON.stringify({ version: 2, files: noteFiles });
    const materializedManifest: SyncManifest = { version: 2, files: diskFiles };
    const materializedManifestHash = hashSyncManifest(materializedManifest);
    const syncStateContent = JSON.stringify({
      version: 2,
      materializedManifestHash,
      sourceCommit,
      sourceOperation: "save",
    });
    const shippedTreeOutput = (options.shippedWus ?? [])
      .map((slug, index) => `.arc/completed/2026-q2/${String(index + 1).padStart(2, "0")}_${slug}/meta-${slug}.md`)
      .join("\n");

    return {
      exec: async (cmd, args) => {
        if (cmd !== "git") throw new Error(`unexpected cmd: ${cmd}`);
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === localNotesRef) {
          return { stdout: `${localNotesRefHash}\n`, stderr: "" };
        }
        if (args[0] === "ls-remote" && args[1] === "origin" && args[2] === localNotesRef) {
          if (options.refState === "remote-unavailable") {
            throw new Error("remote unavailable");
          }
          if (options.refState === "local-ahead") {
            return { stdout: "", stderr: "" };
          }
          if (options.refState === "remote-ahead" || options.refState === "diverged") {
            return { stdout: `${remoteAheadHash}\trefs/notes/arc/user/andrew\n`, stderr: "" };
          }
          return { stdout: `${localNotesRefHash}\trefs/notes/arc/user/andrew\n`, stderr: "" };
        }
        if (args[0] === "fetch") {
          return { stdout: "", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify" && args[2]?.startsWith("refs/arc-sync-temp/")) {
          return { stdout: `${remoteAheadHash}\n`, stderr: "" };
        }
        if (args[0] === "update-ref" && args[1] === "-d") {
          return { stdout: "", stderr: "" };
        }
        if (
          args[0] === "merge-base"
          && args[1] === "--is-ancestor"
          && args[2] === localNotesRefHash
          && args[3] === remoteAheadHash
        ) {
          if (options.refState === "remote-ahead") return { stdout: "", stderr: "" };
          throw new Error("not an ancestor");
        }
        if (
          args[0] === "merge-base"
          && args[1] === "--is-ancestor"
          && args[2] === remoteAheadHash
          && args[3] === localNotesRefHash
        ) {
          throw new Error("not an ancestor");
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD" && args.length === 2) {
          return { stdout: `${noteCommit}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref" && args[2] === "HEAD") {
          return { stdout: `${options.currentBranch ?? "main"}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          return { stdout: `${"0".repeat(40)} ${noteCommit}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "show" && args[3] === noteCommit) {
          return { stdout: noteJSON, stderr: "" };
        }
        if (args[0] === "log" && args.includes(localNotesRef)) {
          return { stdout: `${noteHistoryCommit}\n`, stderr: "" };
        }
        if (args[0] === "diff-tree" && args.includes(noteHistoryCommit)) {
          return { stdout: `${noteCommitPath}\n`, stderr: "" };
        }
        if (args[0] === "show" && args[1] === `${noteHistoryCommit}:${noteCommitPath}`) {
          return { stdout: noteJSON, stderr: "" };
        }
        if (args[0] === "rev-list" && args[1] === "HEAD") {
          return { stdout: `${noteCommit}\n${sourceCommit}\n`, stderr: "" };
        }
        if (
          args[0] === "merge-base"
          && args[1] === "--independent"
          && args[2] === noteCommit
        ) {
          return { stdout: `${noteCommit}\n`, stderr: "" };
        }
        if (
          args[0] === "merge-base"
          && args[1] === "--is-ancestor"
          && args[2] === noteCommit
          && args[3] === "HEAD"
        ) {
          return { stdout: "", stderr: "" };
        }
        if (
          args[0] === "rev-list"
          && args[1] === "--count"
          && args[2] === `${noteCommit}..HEAD`
        ) {
          return { stdout: "0\n", stderr: "" };
        }
        if (
          args[0] === "merge-base"
          && args[1] === "--is-ancestor"
          && args[2] === sourceCommit
          && args[3] === noteCommit
        ) {
          return { stdout: "", stderr: "" };
        }
        if (args[0] === "ls-tree" && args.includes("origin/main")) {
          return { stdout: shippedTreeOutput, stderr: "" };
        }
        throw new Error(`unexpected git call: ${args.join(" ")}`);
      },
      readDir: async (dir) => {
        if (dir === userDir) {
          return Object.entries(diskFiles).map(([name, content]) => ({
            name,
            size: content.length,
          }));
        }
        return [];
      },
      readFile: async (path) => {
        for (const [name, content] of Object.entries(diskFiles)) {
          if (path === `${userDir}/${name}`) return content;
        }
        if (path === `${internalDir}/.sync-state.json`) return syncStateContent;
        throw new Error(`ENOENT: ${path}`);
      },
      writeFile: async () => {},
      mkdir: async () => undefined,
      writeNote: async () => {},
      readNote: async () => null,
    };
  }

  it("surfaces loadNeeded: true when refs match and disk lags behind a descendant note", async () => {
    const io = buildIO({ refState: "same" });

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("clean");
    expect(result.loadNeeded).toBe(true);
  });

  it("surfaces loadNeeded: false when refs match and disk hash matches note hash", async () => {
    const io = buildIO({ refState: "same", diskMatchesNote: true });

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("clean");
    expect(result.loadNeeded).toBe(false);
  });

  it("omits loadNeeded when refState is local-ahead (clean spine but not 'same')", async () => {
    const io = buildIO({ refState: "local-ahead" });

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.state).toBe("clean");
    expect(result.loadNeeded).toBeUndefined();
  });

  it.each(["remote-ahead", "diverged", "remote-unavailable"] as const)(
    "omits loadNeeded on non-clean spine state derived from refState %s",
    async (refState) => {
      const io = buildIO({ refState });

      const result = await runUserSessionInitStatus({
        cwd: "/repo",
        io,
        identity: "andrew",
        remoteSyncEnabled: true,
      });

      expect(result.state).not.toBe("clean");
      expect(result.loadNeeded).toBeUndefined();
    },
  );

  it("suppresses notes-drift for a note-only ghost of a shipped WU (benign retirement)", async () => {
    const io = buildIO({
      refState: "same",
      diskEmpty: true,
      noteFiles: { "shipped-wu/SESSION-NOTES.md": "ghost" },
      shippedWus: ["shipped-wu"],
      currentBranch: "feat/shipped-wu",
    });

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    // The shipped WU's per-WU file lingers in the note but is gone from disk —
    // the divergence collapses to no divergence, so nothing surfaces.
    expect(result.state).toBe("clean");
    expect(result.notesDrift).toBeUndefined();
  });

  it("surfaces notes-drift for a missing file whose WU has not shipped", async () => {
    const io = buildIO({
      refState: "same",
      diskEmpty: true,
      noteFiles: { "live-wu/SESSION-NOTES.md": "arrival" },
      shippedWus: [],
      currentBranch: "feat/live-wu",
    });

    const result = await runUserSessionInitStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.notesDrift?.direction).toBe("missing");
    expect(result.notesDrift?.missingFiles).toEqual(["live-wu/SESSION-NOTES.md"]);
  });
});

describe("buildUserSessionInitStatusSummary", () => {
  it("renders a promptable remote-ahead session-init summary", () => {
    const summary = buildUserSessionInitStatusSummary({
      identity: "andrew",
      state: "remote-ahead",
      summary: "andrew: session-init remote notes ahead of local notes",
      detailLines: [
        "Remote notes are newer than local notes.",
        "Next step: ask whether to run `arc user pull` before continuing session-init.",
      ],
      actionHint: "run `arc user pull` before continuing session-init",
      shouldPromptToPull: true,
    });

    expect(summary).toContain("andrew: session-init remote notes ahead of local notes");
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
      messages: [],
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
    const result = withWorktree({ state: "clean", ahead: 0, behind: 0, branch: "main" });

    expect(result.detailLines.some((line) => line.startsWith("Worktree"))).toBe(false);
  });

  it("appends a behind-by-N qualifier when worktree is remote-ahead", () => {
    const result = withWorktree({ state: "remote-ahead", ahead: 0, behind: 3, branch: "main" });

    expect(result.detailLines).toContain("Local worktree HEAD is behind its origin upstream by 3 commit(s).");
  });

  it("appends a divergence qualifier with both counts when worktree is diverged", () => {
    const result = withWorktree({ state: "diverged", ahead: 2, behind: 5, branch: "main" });

    expect(result.detailLines).toContain(
      "Local worktree HEAD and its origin upstream have diverged (2 local ahead, 5 remote ahead).",
    );
  });

  it("keeps the qualifier when notes already report remote-ahead", () => {
    const result = withWorktree(
      { state: "remote-ahead", ahead: 0, behind: 1, branch: "main" },
      { refState: "remote-ahead" },
    );

    expect(result.headline).toBe("remote note ahead");
    expect(result.detailLines).toContain("Local worktree HEAD is behind its origin upstream by 1 commit(s).");
  });

  it("keeps the qualifier when notes are in conflict", () => {
    const result = withWorktree(
      { state: "remote-ahead", ahead: 0, behind: 4, branch: "main" },
      { refState: "diverged", diskState: "different", unsavedDirection: "mixed" },
    );

    expect(result.headline).toBe("notes conflict");
    expect(result.detailLines).toContain("Local worktree HEAD is behind its origin upstream by 4 commit(s).");
  });

  it("emits a timeout-specific qualifier when the worktree probe times out", () => {
    const result = withWorktree({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch: "main",
      failureReason: "timeout",
    });

    expect(result.detailLines).toContain(
      "Worktree local-to-origin comparison timed out; retry or use `--offline` to report local worktree refs only.",
    );
  });

  it("emits an auth/network qualifier when the worktree probe fails without timing out", () => {
    const result = withWorktree({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch: "main",
      failureReason: "error",
    });

    expect(result.detailLines).toContain(
      "Worktree local-to-origin comparison failed; investigate auth/network access before trusting remote worktree state.",
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
      "Worktree remote comparison skipped (`--offline`); reported state reflects local worktree refs only.",
    );
    expect(result.detailLines.some((line) => line.startsWith("Local worktree HEAD is behind"))).toBe(false);
    expect(result.detailLines.some((line) => line.startsWith("Local worktree HEAD and"))).toBe(false);
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
    const result = withWorktree({ state: "local-ahead", ahead: 2, behind: 0, branch: "main" });

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

  it("runs the worktree fetch without suppressing note-history status reads", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = makeIO(fakeNoNotesExec(calls));

    await runUserStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    const worktreeFetchIndex = calls.findIndex((c) =>
      c.args[0] === "fetch" && c.args[1] === "origin" && c.args[2] === "main",
    );
    const firstNotesListIndex = calls.findIndex((c) => c.args[0] === "notes");

    expect(worktreeFetchIndex).toBeGreaterThanOrEqual(0);
    expect(firstNotesListIndex).toBeGreaterThanOrEqual(0);
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

  it("threads local notes ref absence into detailLines as the first-use hint", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = makeIO(fakeNoNotesExec(calls));

    const result = await runUserStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: true,
    });

    expect(result.detailLines[0]).toBe(
      "New here? Run `arc user --help` to learn about user notes.",
    );
  });

  it("probes local notes ref existence even in offline mode", async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const io = makeIO(fakeNoNotesExec(calls));

    await runUserStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      offline: true,
      remoteSyncEnabled: true,
    });

    expect(calls.some((c) =>
      c.args[0] === "rev-parse" && c.args[1] === "--verify"
      && c.args[2] === "refs/notes/arc/user/andrew",
    )).toBe(true);
  });
});

describe("runUserStatus saved-note projection", () => {
  const userDir = "/repo/.arc/user/andrew";
  const internalDir = `${userDir}/.internal`;
  const localNotesRef = "refs/notes/arc/user/andrew";
  const localNotesRefHash = "c".repeat(40);

  interface ProjectionScenario {
    head: string;
    noteCommit: string;
    reachableCommits: string[];
    ancestorDistance: number;
  }

  function buildIO(scenario: ProjectionScenario): UserIOContext {
    // Branch fallback resolves the current WU to `status-projection`; the saved
    // note carries that WU's own SESSION-NOTES so it resolves as the nearest note.
    const noteFiles = { "status-projection/SESSION-NOTES.md": "saved" };
    const noteManifest = manifest(noteFiles);
    const noteJSON = JSON.stringify(noteManifest);
    const syncStateContent = JSON.stringify({
      version: 4,
      materializedManifestHash: hashSyncManifest(projectManifest(noteManifest)),
      sourceCommit: scenario.noteCommit,
      sourceOperation: "save",
    });

    return {
      exec: async (cmd, args) => {
        if (cmd !== "git") throw new Error(`unexpected cmd: ${cmd}`);
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          return { stdout: "/repo/.git\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "HEAD" && args.length === 2) {
          return { stdout: `${scenario.head}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === localNotesRef) {
          return { stdout: `${localNotesRefHash}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--short" && typeof args[2] === "string") {
          return { stdout: `${args[2].slice(0, 7)}\n`, stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref" && args[2] === "HEAD") {
          return { stdout: "feature/status-projection\n", stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          return { stdout: `${"0".repeat(40)} ${scenario.noteCommit}\n`, stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "show" && args[3] === scenario.noteCommit) {
          return { stdout: noteJSON, stderr: "" };
        }
        if (args[0] === "rev-list" && args[1] === "HEAD") {
          return { stdout: `${scenario.reachableCommits.join("\n")}\n`, stderr: "" };
        }
        if (
          args[0] === "rev-list"
          && args[1] === "--count"
          && args[2] === `${scenario.noteCommit}..HEAD`
        ) {
          return { stdout: `${scenario.ancestorDistance}\n`, stderr: "" };
        }
        if (args[0] === "show" && args[1] === "-s" && args[2] === "--format=%at") {
          return { stdout: "1700000000\n", stderr: "" };
        }
        if (args[0] === "merge-base" && args[1] === "--is-ancestor" && args[3] === "HEAD") {
          if (scenario.reachableCommits.includes(args[2] ?? "")) return { stdout: "", stderr: "" };
          throw new Error("not an ancestor");
        }
        throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
      },
      readDir: async (dir) => {
        if (dir === userDir) {
          return Object.entries(noteFiles).map(([name, content]) => ({ name, size: content.length }));
        }
        if (dir === internalDir) return [];
        return [];
      },
      readFile: async (path) => {
        for (const [name, content] of Object.entries(noteFiles)) {
          if (path === `${userDir}/${name}`) return content;
        }
        if (path === `${internalDir}/.sync-state.json`) return syncStateContent;
        throw new Error(`ENOENT: ${path}`);
      },
      writeFile: async () => {},
      mkdir: async () => undefined,
      writeNote: async () => {},
      readNote: async () => null,
    };
  }

  it("projects a reachable note at HEAD as current", async () => {
    const head = "a".repeat(40);
    const result = await runUserStatus({
      cwd: "/repo",
      io: buildIO({
        head,
        noteCommit: head,
        reachableCommits: [head],
        ancestorDistance: 0,
      }),
      identity: "andrew",
      offline: true,
    });

    expect(result.savedCommit).toBe(head.slice(0, 7));
    expect(result.savedFromAncestor).toBe(false);
    expect(result.ancestorDistance).toBe(0);
    expect(result.savedReachableFromHead).toBe(true);
    expect(result.detailLines).toContain("Latest local user note is current with HEAD.");
  });

  it("projects a reachable ancestor note with its distance from HEAD", async () => {
    const head = "b".repeat(40);
    const noteCommit = "a".repeat(40);
    const result = await runUserStatus({
      cwd: "/repo",
      io: buildIO({
        head,
        noteCommit,
        reachableCommits: [head, noteCommit],
        ancestorDistance: 4,
      }),
      identity: "andrew",
      offline: true,
    });

    expect(result.savedCommit).toBe(noteCommit.slice(0, 7));
    expect(result.savedFromAncestor).toBe(true);
    expect(result.ancestorDistance).toBe(4);
    expect(result.savedReachableFromHead).toBe(true);
    expect(result.detailLines).toContain(
      "Latest local user note is from aaaaaaa, 4 commit(s) back from HEAD.",
    );
  });

  it("projects an off-ancestry saved pointer without reporting it current", async () => {
    const head = "b".repeat(40);
    const noteCommit = "a".repeat(40);
    const result = await runUserStatus({
      cwd: "/repo",
      io: buildIO({
        head,
        noteCommit,
        reachableCommits: [head],
        ancestorDistance: 0,
      }),
      identity: "andrew",
      offline: true,
    });

    expect(result.savedCommit).toBe(noteCommit.slice(0, 7));
    expect(result.savedFromAncestor).toBe(false);
    expect(result.ancestorDistance).toBe(0);
    expect(result.savedReachableFromHead).toBe(false);
    expect(result.detailLines).toContain(
      "Latest local user note is from aaaaaaa, not in branch `feature/status-projection`'s history — " +
      "expected when the work was continued or integrated on another branch or machine.",
    );
    expect(result.detailLines).not.toContain("Latest local user note is current with HEAD.");
  });
});

describe("runUserStatus bounded notes-ref fetch", () => {
  const localHash = "a".repeat(40);
  const remoteHash = "b".repeat(40);
  const notesRef = "refs/notes/arc/user/andrew";

  interface ExecCall {
    cmd: string;
    args: string[];
    options?: { signal?: AbortSignal };
  }

  type FetchBehavior = "ok" | "abort-error" | "generic-error";

  function makeIO(execImpl: (cmd: string, args: string[], options?: { signal?: AbortSignal }) =>
    Promise<{ stdout: string; stderr: string }>) {
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

  // Drives the must-fetch path: a present-but-different local notes ref
  // means classifyPreFetch returns must-fetch, so the bounded fetch fires.
  function fakeMustFetchExec(record: ExecCall[], fetchBehavior: FetchBehavior) {
    return async (cmd: string, args: string[], options?: { signal?: AbortSignal }) => {
      record.push({ cmd, args, options });
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref" && args[2] === "HEAD") {
        return { stdout: "main\n", stderr: "" };
      }
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref" && args[2] === "@{upstream}") {
        return { stdout: "origin/main\n", stderr: "" };
      }
      if (args[0] === "rev-list" && args.includes("--count")) {
        return { stdout: "0\t0\n", stderr: "" };
      }
      if (args[0] === "rev-parse" && args.length === 2 && args[1] === "HEAD") {
        return { stdout: "abc1234\n", stderr: "" };
      }
      if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === notesRef) {
        return { stdout: `${localHash}\n`, stderr: "" };
      }
      if (args[0] === "ls-remote") {
        return { stdout: `${remoteHash}\t${notesRef}\n`, stderr: "" };
      }
      if (
        args[0] === "fetch"
        && args[1] === "--refmap="
        && args[2] === "origin"
        && typeof args[3] === "string"
        && args[3].startsWith(`+${notesRef}:`)
      ) {
        if (fetchBehavior === "abort-error") {
          const err = new Error("aborted");
          err.name = "AbortError";
          throw err;
        }
        if (fetchBehavior === "generic-error") {
          throw new Error("network down");
        }
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "fetch") {
        // Worktree-probe fetch — ignore for this suite.
        return { stdout: "", stderr: "" };
      }
      // Temp-ref read after a successful fetch — return the remote hash so
      // ancestor classification has data to work with.
      if (args[0] === "rev-parse" && args[1] === "--verify"
        && typeof args[2] === "string" && args[2].startsWith("refs/arc-sync-temp/")) {
        return { stdout: `${remoteHash}\n`, stderr: "" };
      }
      if (args[0] === "merge-base") {
        // Treat hashes as unrelated → diverged; not asserted by these tests
        // but keeps the post-fetch classification path quiet.
        throw new Error("not an ancestor");
      }
      if (args[0] === "update-ref" && args[1] === "-d") {
        return { stdout: "", stderr: "" };
      }
      if (args[0] === "notes") {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected git call: ${cmd} ${args.join(" ")}`);
    };
  }

  function findNotesRefFetch(calls: ExecCall[]): ExecCall | undefined {
    return calls.find((c) =>
      c.args[0] === "fetch"
      && c.args[1] === "--refmap="
      && c.args[2] === "origin"
      && typeof c.args[3] === "string"
      && c.args[3].startsWith(`+${notesRef}:`),
    );
  }

  function fakeRelationExec(options: {
    localEntries: { blob: string; commit: string }[];
    remoteEntries: { blob: string; commit: string }[];
    localManifest?: string;
    remoteManifest?: string;
    listingFails?: boolean;
  }) {
    return async (cmd: string, args: string[]) => {
      if (cmd !== "git") throw new Error(`unexpected cmd: ${cmd}`);
      if (args[0] === "rev-parse" && args[1] === "--verify" && args[2] === notesRef) {
        return { stdout: `${localHash}\n`, stderr: "" };
      }
      if (args[0] === "ls-remote") {
        return { stdout: `${remoteHash}\t${notesRef}\n`, stderr: "" };
      }
      if (args[0] === "fetch") return { stdout: "", stderr: "" };
      if (
        args[0] === "rev-parse"
        && args[1] === "--verify"
        && args[2]?.startsWith("refs/arc-sync-temp/")
      ) {
        return { stdout: `${remoteHash}\n`, stderr: "" };
      }
      if (args[0] === "merge-base") throw new Error("not an ancestor");
      if (args[0] === "ls-tree") {
        if (options.listingFails) throw new Error("listing failed");
        const entries = args[2] === localHash ? options.localEntries : options.remoteEntries;
        return {
          stdout: entries.map((entry) => `100644 blob ${entry.blob}\t${entry.commit}`).join("\n"),
          stderr: "",
        };
      }
      if (args[0] === "show") {
        const manifest = args[1]?.startsWith(`${localHash}:`)
          ? options.localManifest
          : options.remoteManifest;
        if (manifest === undefined) throw new Error("manifest absent");
        return { stdout: manifest, stderr: "" };
      }
      if (args[0] === "update-ref" && args[1] === "-d") {
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };
  }

  it("computes a content relation from the fetched temp ref tree", async () => {
    const shared = { blob: "1".repeat(40), commit: "c".repeat(40) };
    const localOnly = { blob: "2".repeat(40), commit: "d".repeat(40) };
    const calls: string[][] = [];
    const exec = fakeRelationExec({ localEntries: [shared, localOnly], remoteEntries: [shared] });
    const io = makeIO(async (cmd, args) => {
      calls.push(args);
      return exec(cmd, args);
    });

    const inspection = await inspectUserSyncRefsDetailed(io, "andrew", 1000);

    expect(inspection).toMatchObject({ state: "diverged", contentRelation: "remote-subset" });
    expect(calls.some((args) =>
      args[0] === "ls-tree" && args[2]?.startsWith("refs/arc-sync-temp/"),
    )).toBe(true);
  });

  it("applies fetched compaction manifests before classifying entries", async () => {
    const shared = { blob: "1".repeat(40), commit: "c".repeat(40) };
    const pruned = { blob: "2".repeat(40), commit: "d".repeat(40) };
    const remoteManifest = JSON.stringify({
      version: 1,
      generation: 1,
      preCompactionTip: null,
      pruned: [pruned],
    });
    const io = makeIO(fakeRelationExec({
      localEntries: [shared],
      remoteEntries: [shared, pruned],
      remoteManifest,
    }));

    const inspection = await inspectUserSyncRefsDetailed(io, "andrew", 1000);

    expect(inspection).toMatchObject({ state: "diverged", contentRelation: "equal" });
  });

  it("omits content relation when entry listing fails", async () => {
    const io = makeIO(fakeRelationExec({
      localEntries: [],
      remoteEntries: [],
      listingFails: true,
    }));

    const inspection = await inspectUserSyncRefsDetailed(io, "andrew", 1000);

    expect(inspection.state).toBe("diverged");
    expect("contentRelation" in inspection).toBe(false);
  });

  it("does not attach a content relation to a non-diverged fast result", async () => {
    const io = makeIO(async (_cmd, args) => {
      if (args[0] === "rev-parse") return { stdout: `${localHash}\n`, stderr: "" };
      if (args[0] === "ls-remote") return { stdout: `${localHash}\t${notesRef}\n`, stderr: "" };
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    });

    const inspection = await inspectUserSyncRefsDetailed(io, "andrew", 1000);

    expect(inspection.state).toBe("same");
    expect("contentRelation" in inspection).toBe(false);
  });

  it("invokes the notes-ref fetch with an AbortSignal in full-mode `arc status`", async () => {
    const calls: ExecCall[] = [];
    const io = makeIO(fakeMustFetchExec(calls, "ok"));

    await runUserStatus({ cwd: "/repo", io, identity: "andrew", remoteSyncEnabled: true });

    const notesFetch = findNotesRefFetch(calls);
    expect(notesFetch).toBeDefined();
    expect(notesFetch?.options?.signal).toBeInstanceOf(AbortSignal);
  });

  it("classifies AbortError as remote-unavailable / failureReason: timeout", async () => {
    const calls: ExecCall[] = [];
    const io = makeIO(fakeMustFetchExec(calls, "abort-error"));

    const inspection = await inspectUserSyncRefsDetailed(io, "andrew", 1000);

    expect(inspection.state).toBe("remote-unavailable");
    expect(inspection.failureReason).toBe("timeout");
  });

  it("classifies non-Abort fetch errors as remote-unavailable / failureReason: error", async () => {
    const calls: ExecCall[] = [];
    const io = makeIO(fakeMustFetchExec(calls, "generic-error"));

    const inspection = await inspectUserSyncRefsDetailed(io, "andrew", 1000);

    expect(inspection.state).toBe("remote-unavailable");
    expect(inspection.failureReason).toBe("error");
  });

  it("uses distinct temp refs for concurrent notes-ref probes", async () => {
    const calls: ExecCall[] = [];
    const io = makeIO(fakeMustFetchExec(calls, "ok"));

    await Promise.all([
      inspectUserSyncRefsDetailed(io, "andrew", 1000),
      inspectUserSyncRefsDetailed(io, "andrew", 1000),
    ]);

    const fetchedRefs = calls
      .filter((call) => call.args[0] === "fetch" && typeof call.args[3] === "string")
      .map((call) => (call.args[3] ?? "").split(":")[1])
      .filter((ref): ref is string => ref !== undefined && ref.startsWith("refs/arc-sync-temp/"));
    const deletedRefs = calls
      .filter((call) => call.args[0] === "update-ref" && call.args[1] === "-d")
      .map((call) => call.args[2])
      .filter((ref): ref is string => ref !== undefined && ref.startsWith("refs/arc-sync-temp/"));

    expect(fetchedRefs).toHaveLength(2);
    expect(new Set(fetchedRefs).size).toBe(2);
    expect(deletedRefs.sort()).toEqual([...fetchedRefs].sort());
  });

  it("does not invoke the notes-ref fetch when --offline is set", async () => {
    const calls: ExecCall[] = [];
    const io = makeIO(fakeMustFetchExec(calls, "ok"));

    await runUserStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      offline: true,
      remoteSyncEnabled: true,
    });

    expect(findNotesRefFetch(calls)).toBeUndefined();
  });
});

describe("runUserStatus userSyncCause orchestration", () => {
  function silentIO(execImpl: (cmd: string, args: string[]) =>
    Promise<{ stdout: string; stderr: string }>) {
    return {
      exec: execImpl,
      readDir: async () => [],
      readFile: async () => {
        const err = new Error("ENOENT") as NodeJS.ErrnoException;
        err.code = "ENOENT";
        throw err;
      },
      writeFile: async () => {},
      mkdir: async () => undefined,
      writeNote: async () => {},
      readNote: async () => null,
    };
  }

  it("threads offline cause onto UserStatusResult under --offline", async () => {
    const io = silentIO(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        return { stdout: "deadbeef\n", stderr: "" };
      }
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        throw new Error("ref not found");
      }
      if (args[0] === "log") return { stdout: "", stderr: "" };
      if (args[0] === "merge-base") throw new Error("not an ancestor");
      if (args[0] === "show") return { stdout: "", stderr: "" };
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    });

    const result = await runUserStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      offline: true,
      remoteSyncEnabled: false,
    });

    expect(result.userSyncCause).toBe("offline");
    expect(result.userSyncCauseConfidence).toBe("offline");
    expect(result.detailLines).toContain(
      "Cause: cross-machine signals unavailable in offline mode.",
    );
  });

  it("omits userSyncCause when ref state is clean (same) without offline", async () => {
    const localHash = "a".repeat(40);

    const io = silentIO(async (_cmd: string, args: string[]) => {
      if (args[0] === "rev-parse" && args[1] === "HEAD") {
        return { stdout: "deadbeef\n", stderr: "" };
      }
      if (args[0] === "rev-parse" && args[1] === "--verify"
        && args[2] === "refs/notes/arc/user/andrew") {
        return { stdout: `${localHash}\n`, stderr: "" };
      }
      if (args[0] === "ls-remote") {
        return { stdout: `${localHash}\trefs/notes/arc/user/andrew\n`, stderr: "" };
      }
      if (args[0] === "log") return { stdout: "", stderr: "" };
      if (args[0] === "merge-base") throw new Error("not an ancestor");
      if (args[0] === "show") return { stdout: "", stderr: "" };
      if (args[0] === "fetch") return { stdout: "", stderr: "" };
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    });

    const result = await runUserStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
      remoteSyncEnabled: false,
    });

    expect(result.userSyncCause).toBeUndefined();
    expect(result.detailLines.some((line) => line.startsWith("Cause:"))).toBe(false);
  });

  it("does not probe HEAD reachability for the no-comparable load basis", async () => {
    const localHash = "a".repeat(40);
    let sentinelHeadProbe = false;

    const io = {
      ...silentIO(async (_cmd: string, args: string[]) => {
        if (args[0] === "rev-parse" && args[1] === "HEAD") {
          return { stdout: "deadbeef\n", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--verify"
          && args[2] === "refs/notes/arc/user/andrew") {
          return { stdout: `${localHash}\n`, stderr: "" };
        }
        if (args[0] === "ls-remote") {
          return { stdout: "", stderr: "" };
        }
        if (args[0] === "notes" && args[2] === "list") {
          return { stdout: "", stderr: "" };
        }
        if (args[0] === "log") return { stdout: "", stderr: "" };
        if (
          args[0] === "merge-base"
          && args[1] === "--is-ancestor"
          && args[2] === NO_COMPARABLE_SOURCE_COMMIT
          && args[3] === "HEAD"
        ) {
          sentinelHeadProbe = true;
          throw new Error("sentinel is not a git commit");
        }
        throw new Error(`unexpected git call: ${args.join(" ")}`);
      }),
      readFile: async (path: string) => {
        if (path === "/repo/.arc/user/andrew/.internal/.sync-state.json") {
          return JSON.stringify({
            version: 4,
            materializedManifestHash: "hash",
            sourceCommit: NO_COMPARABLE_SOURCE_COMMIT,
            sourceOperation: "load",
          });
        }
        throw new Error(`ENOENT: ${path}`);
      },
    };

    const result = await runUserStatus({
      cwd: "/repo",
      io,
      identity: "andrew",
    });

    expect(result.refState).toBe("local-ahead");
    expect(sentinelHeadProbe).toBe(false);
  });
});
