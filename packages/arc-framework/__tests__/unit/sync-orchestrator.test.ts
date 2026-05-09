/**
 * Unit tests for the top-level `arc sync` orchestrator handler.
 *
 * Covers the 6-cell `push_interlock × notes_push × worktree-state` matrix
 * dispatch: paired-push, worktree-only, notes-only with notes-vs-worktree
 * gating, save-only, the prompt cell, the diverged-worktree coherence gate,
 * and `--dry-run`.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, vi, beforeAll, beforeEach, type Mock } from "vitest";

import { UserFacingError } from "../../src/lib/errors.js";
import type { WorktreeSyncState } from "../../src/lib/git/worktree-sync.js";
import type { AuditEntry } from "../../src/lib/release/types.js";

const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockNote = vi.fn();
const mockConfirm = vi.fn();
const mockIsCancel = vi.fn(() => false) as Mock<(value: unknown) => boolean>;
const mockSpinner = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));
const mockAccess = vi.fn();

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>(
    "node:fs/promises",
  );
  return {
    ...actual,
    access: (...args: unknown[]) => mockAccess(...args),
  };
});

vi.mock("@clack/prompts", () => ({
  intro: (...args: unknown[]) => mockIntro(...args),
  outro: (...args: unknown[]) => mockOutro(...args),
  log: mockLog,
  note: (...args: unknown[]) => mockNote(...args),
  confirm: (...args: unknown[]) => mockConfirm(...args),
  isCancel: (value: unknown) => mockIsCancel(value),
  spinner: () => mockSpinner(),
}));

const mockRunPairedPush = vi.fn();
const mockRunUserSave = vi.fn();
const mockBuildSaveSummary: Mock<(result: unknown) => string> = vi.fn(() => "save summary");

vi.mock("../../src/commands/user.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/commands/user.js")>(
    "../../src/commands/user.js",
  );
  return {
    ...actual,
    runPairedPush: (opts: unknown) => mockRunPairedPush(opts),
    runUserSave: (opts: unknown) => mockRunUserSave(opts),
    buildSaveSummary: (result: unknown) => mockBuildSaveSummary(result),
  };
});

const mockResolveAllSettings = vi.fn();
vi.mock("../../src/lib/config/resolved-settings.js", () => ({
  resolveAllSettings: (opts: unknown) => mockResolveAllSettings(opts),
}));

const mockRunWorktreeSyncStatus = vi.fn();
vi.mock("../../src/lib/git/worktree-sync.js", () => ({
  runWorktreeSyncStatus: (opts: unknown) => mockRunWorktreeSyncStatus(opts),
}));

const mockPushWithRecovery = vi.fn();
vi.mock("../../src/handlers/push-recovery.js", () => ({
  pushWithInteractiveRecovery: (...args: unknown[]) => mockPushWithRecovery(...args),
}));

const mockResolveUserIdentity = vi.fn();
const mockIsNonInteractive = vi.fn(() => false);
vi.mock("../../src/handlers/shared.js", () => ({
  resolveUserIdentity: (...args: unknown[]) => mockResolveUserIdentity(...args),
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
  ARC_PROJECT_ROOT_ERROR:
    "Not inside an ARC project (no .arc/ directory found walking up from cwd).",
}));

const mockResolveArcRoot = vi.fn<() => string | null>(() => "/repo");
vi.mock("../../src/lib/paths.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/paths.js")>(
    "../../src/lib/paths.js",
  );
  return {
    ...actual,
    resolveArcRoot: () => mockResolveArcRoot(),
  };
});

const mockGitExec = vi.fn();
vi.mock("../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({ exec: mockGitExec, readFile: vi.fn() }),
}));

const mockAppendAuditEntry = vi.fn();
vi.mock("../../src/lib/release/audit-log.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/lib/release/audit-log.js")>(
    "../../src/lib/release/audit-log.js",
  );
  return {
    ...actual,
    appendAuditEntry: (opts: unknown) => mockAppendAuditEntry(opts),
  };
});

const mockResolveActiveWu = vi.fn();
vi.mock("../../src/lib/release/wu-resolution.js", () => ({
  resolveActiveWu: (opts: unknown) => mockResolveActiveWu(opts),
}));

const { handleSync } = await import("../../src/handlers/sync.js");

// --- Test helpers ---

interface ResolvedSettingsState {
  pushInterlock: "manual" | "on-sync";
  syncInterlock: "manual" | "on-handoff";
  notesPush: "on-sync" | "prompt" | "manual";
  pushSource: "git-config" | "yaml" | "default";
  syncSource: "git-config" | "yaml" | "default";
  notesSource: "git-config" | "yaml" | "default";
}

const resolvedState: ResolvedSettingsState = {
  pushInterlock: "manual",
  syncInterlock: "on-handoff",
  notesPush: "on-sync",
  pushSource: "default",
  syncSource: "default",
  notesSource: "default",
};

function syncResolvedSettingsMock(): void {
  mockResolveAllSettings.mockResolvedValue({
    settings: {
      "session.push_interlock": resolvedState.pushInterlock,
      "session.sync_interlock": resolvedState.syncInterlock,
      "user.notes_push": resolvedState.notesPush,
      "session.remote_sync": "enabled",
    },
    resolved: {
      commitInterlock: { value: "manual", source: "default" },
      pushInterlock: { value: resolvedState.pushInterlock, source: resolvedState.pushSource },
      syncInterlock: { value: resolvedState.syncInterlock, source: resolvedState.syncSource },
      notesPush: { value: resolvedState.notesPush, source: resolvedState.notesSource },
    },
    defaultsApplied: [],
    warnings: [],
  });
}

function setConfig(
  pushInterlock: "manual" | "on-sync",
  syncInterlock: "manual" | "on-handoff" = "on-handoff",
) {
  resolvedState.pushInterlock = pushInterlock;
  resolvedState.syncInterlock = syncInterlock;
  syncResolvedSettingsMock();
}

function setWorktree(state: WorktreeSyncState, ahead = 0, behind = 0, branch: string | null = "main") {
  mockRunWorktreeSyncStatus.mockResolvedValue({ state, ahead, behind, branch });
}

function setNotesPolicy(policy: "on-sync" | "prompt" | "manual") {
  resolvedState.notesPush = policy;
  syncResolvedSettingsMock();
}

function resetResolvedState(): void {
  resolvedState.pushInterlock = "manual";
  resolvedState.syncInterlock = "on-handoff";
  resolvedState.notesPush = "on-sync";
  resolvedState.pushSource = "default";
  resolvedState.syncSource = "default";
  resolvedState.notesSource = "default";
  syncResolvedSettingsMock();
}

/** Default exec stub: branch resolves to 'main'; pushes succeed. */
function resetMockDefaults() {
  mockAccess.mockRejectedValue(new Error("path absent"));
  mockIsCancel.mockReturnValue(false);
  mockIsNonInteractive.mockReturnValue(false);
  mockResolveArcRoot.mockReturnValue("/repo");
  mockSpinner.mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() }));
  mockBuildSaveSummary.mockReturnValue("save summary");
  mockAppendAuditEntry.mockResolvedValue({ ok: true });
  mockResolveActiveWu.mockResolvedValue({
    status: "resolved",
    path: ".arc/active/technical/status-test.md",
    category: "technical",
    name: "test",
  });
  mockGitExec.mockImplementation(async (_cmd: unknown, args: unknown) => {
    if (Array.isArray(args)) {
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref" && args[2] === "HEAD") {
        return { stdout: "main", stderr: "" };
      }
      if (args[0] === "push") {
        return { stdout: "", stderr: "" };
      }
    }
    return { stdout: "", stderr: "" };
  });
}

function pushedBranchInvocations(): string[][] {
  const calls = mockGitExec.mock.calls;
  return calls
    .map((call) => call[1] as unknown)
    .filter((args): args is string[] => Array.isArray(args) && args[0] === "push");
}

async function captureSyncJson(
  opts: { dryRun?: boolean; yes?: boolean } = {},
): Promise<Record<string, unknown>> {
  const stdoutWrite = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  let written: string | undefined;

  try {
    await handleSync({ json: true, ...opts });
    written = stdoutWrite.mock.calls.map((call) => String(call[0])).join("");
  } finally {
    stdoutWrite.mockRestore();
  }

  return JSON.parse(written ?? "") as Record<string, unknown>;
}

describe("handleSync orchestrator matrix dispatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    resetResolvedState();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("both interlocks on-sync + clean worktree → runPairedPush invoked; both legs reported", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("clean");
    mockRunPairedPush.mockResolvedValue({
      save: {
        status: "success",
        result: { identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] },
      },
      worktree: { status: "success" },
      notes: { status: "success" },
      conditions: [],
      exitCode: 0,
    });

    await handleSync();

    expect(mockRunPairedPush).toHaveBeenCalledTimes(1);
    expect(mockRunPairedPush).toHaveBeenCalledWith(expect.objectContaining({
      identity: "andrew",
      branch: "main",
      worktreeSyncState: "clean",
    }));
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("paired-cell save failure reports JSON failure without a separate orchestrator save", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("clean");
    mockRunPairedPush.mockResolvedValue({
      save: {
        status: "failed",
        error: new Error("save verification failed"),
      },
      worktree: { status: "skipped", reason: "save-failed" },
      notes: { status: "skipped", reason: "save-failed" },
      conditions: [],
      exitCode: 1,
    });
    const outcome = await captureSyncJson();

    expect(mockRunPairedPush).toHaveBeenCalledTimes(1);
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(pushedBranchInvocations()).toEqual([]);
    expect(outcome).toEqual({
      cell: "paired-push",
      interlockState: {
        pushInterlock: { value: "on-sync", source: "default" },
        notesPush: { value: "on-sync", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" },
      },
      worktree: { action: "skip", result: "skipped", detail: "save-failed" },
      notes: { action: "save", result: "failed", detail: "save verification failed" },
      exitCode: 1,
      recommendedSummaryLine: null,
    });
    expect(process.exitCode).toBe(1);
  });

  it("blocked notes cell reports save separately from blocked push in JSON", async () => {
    setConfig("manual");
    setNotesPolicy("on-sync");
    setWorktree("local-ahead", 2);
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    const outcome = await captureSyncJson();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      cell: "notes-blocked",
      interlockState: {
        pushInterlock: { value: "manual", source: "default" },
        notesPush: { value: "on-sync", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" },
      },
      worktree: { action: "skip", result: "skipped", detail: "not-configured" },
      save: { action: "save", result: "success" },
      notes: {
        action: "push",
        result: "blocked",
        detail: "notes-blocked-by-worktree:local-ahead",
      },
      exitCode: 1,
      recommendedSummaryLine: null,
    });
  });

  it("push_interlock: manual + notes_push: on-sync + worktree local-ahead → notes-blocked; save fires; push blocked with guidance", async () => {
    setConfig("manual");
    setNotesPolicy("on-sync");
    setWorktree("local-ahead", 2);
    mockRunUserSave.mockResolvedValue({ identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] });

    await handleSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(pushedBranchInvocations()).toEqual([]);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("push the worktree first"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("push_interlock: on-sync + notes_push: manual + clean worktree → worktree push fires; notes save only", async () => {
    setConfig("on-sync");
    setNotesPolicy("manual");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({ identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] });

    await handleSync();

    expect(pushedBranchInvocations()).toEqual([["push", "origin", "main"]]);
    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("both manual → save only; no pushes; unpushed state surfaced in output", async () => {
    setConfig("manual");
    setNotesPolicy("manual");
    setWorktree("local-ahead", 3);
    mockRunUserSave.mockResolvedValue({ identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] });

    await handleSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(pushedBranchInvocations()).toEqual([]);
    const surfaced = [
      ...mockLog.info.mock.calls.map((c) => String(c[0] ?? "")),
      ...mockLog.warn.mock.calls.map((c) => String(c[0] ?? "")),
    ];
    expect(surfaced.some((line) => line.includes("3 unpushed commit"))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it("notes_push: prompt → save + interactive confirm before notes push", async () => {
    setConfig("manual");
    setNotesPolicy("prompt");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({ identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] });
    mockConfirm.mockResolvedValue(true);
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    await handleSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("Push user notes") }),
    );
    expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("diverged worktree + push_interlock: on-sync → save fires before both push legs block", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("diverged", 1, 2);
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    const outcome = await captureSyncJson();

    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(pushedBranchInvocations()).toEqual([]);
    expect(outcome).toEqual({
      cell: "blocked-diverged",
      interlockState: {
        pushInterlock: { value: "on-sync", source: "default" },
        notesPush: { value: "on-sync", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" },
      },
      worktree: { action: "skip", result: "blocked", detail: "diverged" },
      save: { action: "save", result: "success" },
      notes: {
        action: "push",
        result: "blocked",
        detail: "notes-blocked-by-worktree:diverged",
      },
      exitCode: 1,
      reconcile: { ahead: 1, behind: 2, branch: "main" },
      recommendedSummaryLine:
        "**Reconcile required:** `main` diverged from `origin/main` (1 ahead, 2 behind). "
        + "Manual rebase or merge needed before pushing.",
    });
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["remote-ahead", 0, 3, "main"],
    ["no-upstream", 0, 0, "main"],
    ["remote-unavailable", 0, 0, "main"],
    ["detached-head", 0, 0, null],
  ] satisfies Array<[WorktreeSyncState, number, number, string | null]>)(
    "%s blocked cell saves locally before refusing notes push",
    async (state, ahead, behind, branch) => {
      setConfig("on-sync");
      setNotesPolicy("on-sync");
      setWorktree(state, ahead, behind, branch);
      mockRunUserSave.mockResolvedValue({
        identity: "andrew",
        commit: "abc1234",
        fileCount: 1,
        warnings: [],
      });
      if (branch === null) {
        mockGitExec.mockImplementation(async (_cmd: unknown, args: unknown) => {
          if (Array.isArray(args) && args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
            return { stdout: "HEAD", stderr: "" };
          }
          return { stdout: "", stderr: "" };
        });
      }

      const outcome = await captureSyncJson();

      expect(mockRunUserSave).toHaveBeenCalledTimes(1);
      expect(mockRunPairedPush).not.toHaveBeenCalled();
      expect(mockPushWithRecovery).not.toHaveBeenCalled();
      expect(pushedBranchInvocations()).toEqual([]);
      expect(outcome).toMatchObject({
        worktree: { action: "skip", result: "blocked", detail: state },
        save: { action: "save", result: "success" },
        notes: {
          action: "push",
          result: "blocked",
          detail: `notes-blocked-by-worktree:${state}`,
        },
        exitCode: 1,
      });
    },
  );

  it("rebase-in-progress skips save with guidance before refusing sync", async () => {
    setConfig("manual");
    setNotesPolicy("on-sync");
    setWorktree("clean");
    mockAccess.mockImplementation(async (path: unknown) => {
      if (path === "/repo/.git/rebase-merge") return;
      throw new Error("path absent");
    });
    mockGitExec.mockImplementation(async (_cmd: unknown, args: unknown) => {
      if (Array.isArray(args)) {
        if (args[0] === "rev-parse" && args[1] === "--git-path" && args[2] === "rebase-merge") {
          return { stdout: "/repo/.git/rebase-merge", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--git-path" && args[2] === "rebase-apply") {
          return { stdout: "/repo/.git/rebase-apply", stderr: "" };
        }
        if (args[0] === "rev-parse" && args[1] === "--abbrev-ref" && args[2] === "HEAD") {
          return { stdout: "main", stderr: "" };
        }
      }
      return { stdout: "", stderr: "" };
    });

    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    let outcome: Record<string, unknown>;
    let stderrText: string;
    try {
      outcome = await captureSyncJson();
      stderrText = stderrWrite.mock.calls.map((c) => String(c[0])).join("");
    } finally {
      stderrWrite.mockRestore();
    }

    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      cell: "notes-only",
      interlockState: {
        pushInterlock: { value: "manual", source: "default" },
        notesPush: { value: "on-sync", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" },
      },
      worktree: { action: "skip", result: "skipped", detail: "not-configured" },
      save: { action: "save", result: "skipped", detail: "rebase-in-progress" },
      notes: { action: "push", result: "blocked", detail: "rebase-in-progress" },
      exitCode: 1,
      recommendedSummaryLine: null,
    });
    // Under --json, diagnostics route to stderr (not to Clack) so stdout stays pure.
    expect(stderrText).toContain("Save skipped: rebase in progress");
    expect(mockLog.warn).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("diverged worktree + push_interlock: manual + notes_push: on-sync → save fires; notes push blocked with diverged guidance", async () => {
    setConfig("manual");
    setNotesPolicy("on-sync");
    setWorktree("diverged", 1, 2);
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    await handleSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(pushedBranchInvocations()).toEqual([]);
    const warnings = mockLog.warn.mock.calls.map((c) => String(c[0] ?? ""));
    expect(warnings.some((line) => /diverged/i.test(line) && /rebase|merge/i.test(line))).toBe(true);
    expect(warnings.some((line) => line.includes("push the worktree first"))).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it("remote-ahead worktree + push_interlock: manual + notes_push: on-sync → save fires; notes push blocked with remote-ahead guidance", async () => {
    setConfig("manual");
    setNotesPolicy("on-sync");
    setWorktree("remote-ahead", 0, 3);
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    await handleSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(pushedBranchInvocations()).toEqual([]);
    const warnings = mockLog.warn.mock.calls.map((c) => String(c[0] ?? ""));
    expect(warnings.some((line) => /remote-ahead/i.test(line) && /pull|fast-forward/i.test(line))).toBe(true);
    expect(warnings.some((line) => line.includes("push the worktree first"))).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it("clean worktree + push_interlock: manual + notes_push: on-sync → notes-only cell fires save and push", async () => {
    setConfig("manual");
    setNotesPolicy("on-sync");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    await handleSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(pushedBranchInvocations()).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it("interlockState envelope reports configured sync_interlock verbatim", async () => {
    setConfig("on-sync", "manual");
    setNotesPolicy("on-sync");
    setWorktree("clean");
    mockRunPairedPush.mockResolvedValue({
      save: {
        status: "success",
        result: { identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] },
      },
      worktree: { status: "success" },
      notes: { status: "success" },
      conditions: [],
      exitCode: 0,
    });

    const outcome = await captureSyncJson();

    expect(outcome.interlockState).toEqual({
      pushInterlock: { value: "on-sync", source: "default" },
      notesPush: { value: "on-sync", source: "default" },
      syncInterlock: { value: "manual", source: "default" },
    });
  });

  it("interlockState reports the resolved notesPush after non-interactive degradation", async () => {
    setConfig("manual");
    setNotesPolicy("prompt");
    setWorktree("clean");
    mockIsNonInteractive.mockReturnValue(true);
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    const outcome = await captureSyncJson();

    expect(outcome.interlockState).toEqual({
      pushInterlock: { value: "manual", source: "default" },
      notesPush: { value: "manual", source: "default" },
      syncInterlock: { value: "on-handoff", source: "default" },
    });
  });

  it("--dry-run → no pushes fire; matrix decision printed", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("local-ahead", 2);

    await handleSync({ dryRun: true });

    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(pushedBranchInvocations()).toEqual([]);
    const surfaced = mockLog.info.mock.calls.map((c) => String(c[0] ?? ""));
    expect(surfaced.some((line) => line.includes("paired-push"))).toBe(true);
    expect(surfaced.some((line) => line.toLowerCase().includes("dry-run"))).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it("--dry-run --json paired-push → envelope shape parity with runtime; no legs fire", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("clean");

    const outcome = await captureSyncJson({ dryRun: true });

    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(pushedBranchInvocations()).toEqual([]);
    expect(outcome).toEqual({
      cell: "paired-push",
      interlockState: {
        pushInterlock: { value: "on-sync", source: "default" },
        notesPush: { value: "on-sync", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" },
      },
      worktree: { action: "push", result: "skipped", detail: "dry-run" },
      notes: { action: "save+push", result: "skipped", detail: "dry-run" },
      exitCode: 0,
      recommendedSummaryLine: null,
      mode: "dry-run",
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("--dry-run --json blocked-diverged → reconcile populated; save record present; no legs fire", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("diverged", 1, 2);

    const outcome = await captureSyncJson({ dryRun: true });

    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      cell: "blocked-diverged",
      interlockState: {
        pushInterlock: { value: "on-sync", source: "default" },
        notesPush: { value: "on-sync", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" },
      },
      worktree: { action: "skip", result: "skipped", detail: "dry-run" },
      save: { action: "save", result: "skipped", detail: "dry-run" },
      notes: { action: "push", result: "skipped", detail: "dry-run" },
      exitCode: 0,
      reconcile: { ahead: 1, behind: 2, branch: "main" },
      recommendedSummaryLine:
        "**Reconcile required:** `main` diverged from `origin/main` (1 ahead, 2 behind). "
        + "Manual rebase or merge needed before pushing.",
      mode: "dry-run",
    });
  });

  it("--dry-run --json save-only → minimal envelope; no save record; no pushes", async () => {
    setConfig("manual");
    setNotesPolicy("manual");
    setWorktree("clean");

    const outcome = await captureSyncJson({ dryRun: true });

    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      cell: "save-only",
      interlockState: {
        pushInterlock: { value: "manual", source: "default" },
        notesPush: { value: "manual", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" },
      },
      worktree: { action: "skip", result: "skipped", detail: "dry-run" },
      notes: { action: "save", result: "skipped", detail: "dry-run" },
      exitCode: 0,
      recommendedSummaryLine: null,
      mode: "dry-run",
    });
  });

  it("--dry-run --json notes-blocked → save record present; notes leg shows would-be push action", async () => {
    setConfig("manual");
    setNotesPolicy("on-sync");
    setWorktree("local-ahead", 2);

    const outcome = await captureSyncJson({ dryRun: true });

    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      cell: "notes-blocked",
      interlockState: {
        pushInterlock: { value: "manual", source: "default" },
        notesPush: { value: "on-sync", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" },
      },
      worktree: { action: "skip", result: "skipped", detail: "dry-run" },
      save: { action: "save", result: "skipped", detail: "dry-run" },
      notes: { action: "push", result: "skipped", detail: "dry-run" },
      exitCode: 0,
      recommendedSummaryLine: null,
      mode: "dry-run",
    });
  });
});

describe("--json stdout-purity contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    resetResolvedState();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("emits exactly one JSON object on stdout — no Clack call leaks through", async () => {
    setConfig("manual");
    setNotesPolicy("manual");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    let writes: string[];
    try {
      await handleSync({ json: true });
      writes = stdoutWrite.mock.calls.map((c) => String(c[0]));
    } finally {
      stdoutWrite.mockRestore();
    }

    expect(writes).toHaveLength(1);
    expect(() => JSON.parse(writes[0] ?? "")).not.toThrow();

    expect(mockIntro).not.toHaveBeenCalled();
    expect(mockOutro).not.toHaveBeenCalled();
    expect(mockLog.info).not.toHaveBeenCalled();
    expect(mockLog.warn).not.toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(mockNote).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockSpinner).not.toHaveBeenCalled();
  });

  it("--json + notes_push: prompt → degrades to manual; never invokes confirm", async () => {
    setConfig("manual");
    setNotesPolicy("prompt");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    const stderrWrite = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    let outcome: Record<string, unknown>;
    let stderrText: string;
    try {
      outcome = await captureSyncJson();
      stderrText = stderrWrite.mock.calls.map((c) => String(c[0])).join("");
    } finally {
      stderrWrite.mockRestore();
    }

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(outcome.cell).toBe("save-only");
    expect(outcome.interlockState).toMatchObject({ notesPush: { value: "manual" } });
    expect(stderrText).toMatch(/JSON output mode.+degrading "prompt"/);
  });

  it("non-JSON path keeps Clack output as-is (regression guard for routing flag)", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("clean");
    mockRunPairedPush.mockResolvedValue({
      save: {
        status: "success",
        result: { identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] },
      },
      worktree: { status: "success" },
      notes: { status: "success" },
      conditions: [],
      exitCode: 0,
    });

    await handleSync();

    expect(mockIntro).toHaveBeenCalledWith("arc sync");
    expect(mockOutro).toHaveBeenCalledWith("Done.");
  });
});

describe("--yes wiring", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    resetResolvedState();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("--yes degrades notes_push: prompt → on-sync; never invokes confirm", async () => {
    setConfig("manual");
    setNotesPolicy("prompt");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    const outcome = await captureSyncJson({ yes: true });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ yes: true }),
    );
    expect(outcome.cell).toBe("notes-only");
    expect(outcome.interlockState).toMatchObject({ notesPush: { value: "on-sync" } });
  });

  it("--yes wins over JSON-mode prompt-degradation gate (on-sync > manual)", async () => {
    setConfig("manual");
    setNotesPolicy("prompt");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    const outcome = await captureSyncJson({ yes: true });

    expect(outcome.interlockState).toMatchObject({ notesPush: { value: "on-sync" } });
    expect(outcome.cell).toBe("notes-only");
  });

  it("--yes propagates yes: true into runPairedPush's notes adapter", async () => {
    setConfig("on-sync");
    setNotesPolicy("prompt");
    setWorktree("clean");

    let capturedNotesContext: unknown;
    mockRunPairedPush.mockImplementation(async (opts: unknown) => {
      const o = opts as {
        pushNotes: (ctx: { io: unknown; identity: string; cwd: string;
          access: unknown; worktreeBranch: string }) => Promise<unknown>;
      };
      capturedNotesContext = await o.pushNotes({
        io: {},
        identity: "andrew",
        cwd: "/repo",
        access: () => Promise.resolve(),
        worktreeBranch: "main",
      });
      return {
        save: { status: "success", result: { identity: "andrew", commit: "x", fileCount: 1, warnings: [] } },
        worktree: { status: "success" },
        notes: { status: "success" },
        conditions: [],
        exitCode: 0,
      };
    });
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    await handleSync({ yes: true });

    expect(mockPushWithRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ yes: true }),
    );
    expect(capturedNotesContext).toEqual({ status: "success" });
  });

  it("--dry-run --json --yes → preview reflects degraded policy (notes-only, save+push)", async () => {
    setConfig("manual");
    setNotesPolicy("prompt");
    setWorktree("clean");

    const outcome = await captureSyncJson({ dryRun: true, yes: true });

    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      mode: "dry-run",
      cell: "notes-only",
      interlockState: { notesPush: { value: "on-sync" } },
      notes: { action: "push", result: "skipped", detail: "dry-run" },
    });
  });
});

describe("error-path envelope coverage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    resetResolvedState();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  function buildIdentityMissingError(): UserFacingError {
    return new UserFacingError({
      code: "IDENTITY_MISSING",
      whatHappened: "No identity configured.",
      why: "User commands require arc.identity to be set in git config.",
      whatToDo: "Run 'arc init' first.",
    });
  }

  it("identity-absent + --json → emits parseable envelope on stdout; sets exit code", async () => {
    mockResolveUserIdentity.mockRejectedValueOnce(buildIdentityMissingError());

    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    let writes: string[];
    try {
      await handleSync({ json: true });
      writes = stdoutWrite.mock.calls.map((c) => String(c[0]));
    } finally {
      stdoutWrite.mockRestore();
    }

    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0] ?? "")).toEqual({
      cell: "none",
      reason: "identity-absent",
    });
    expect(process.exitCode).toBe(1);
    expect(mockResolveAllSettings).not.toHaveBeenCalled();
    expect(mockRunWorktreeSyncStatus).not.toHaveBeenCalled();
  });

  it("identity-absent + non-JSON → routes diagnostic via clack log; no envelope on stdout", async () => {
    mockResolveUserIdentity.mockRejectedValueOnce(buildIdentityMissingError());

    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await handleSync();
    } finally {
      stdoutWrite.mockRestore();
    }

    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("IDENTITY_MISSING"),
    );
    expect(process.exitCode).toBe(1);
    expect(mockResolveAllSettings).not.toHaveBeenCalled();
  });

  it("no-arc-project + --json → emits parseable envelope on stdout; sets exit code", async () => {
    mockResolveArcRoot.mockReturnValueOnce(null);

    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    let writes: string[];
    try {
      await handleSync({ json: true });
      writes = stdoutWrite.mock.calls.map((c) => String(c[0]));
    } finally {
      stdoutWrite.mockRestore();
    }

    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0] ?? "")).toEqual({
      cell: "none",
      reason: "no-arc-project",
    });
    expect(process.exitCode).toBe(1);
    expect(mockResolveAllSettings).not.toHaveBeenCalled();
    expect(mockRunWorktreeSyncStatus).not.toHaveBeenCalled();
  });

  it("no-arc-project + non-JSON → routes diagnostic via clack log; no envelope on stdout", async () => {
    mockResolveArcRoot.mockReturnValueOnce(null);

    const stdoutWrite = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    try {
      await handleSync();
    } finally {
      stdoutWrite.mockRestore();
    }

    expect(stdoutWrite).not.toHaveBeenCalled();
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("Not inside an ARC project"),
    );
    expect(process.exitCode).toBe(1);
    expect(mockResolveAllSettings).not.toHaveBeenCalled();
  });
});

describe("audit-log integration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    resetResolvedState();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("save-only cell writes one proceeded audit entry with kind sync", async () => {
    setConfig("manual");
    setNotesPolicy("manual");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    await handleSync();

    expect(mockAppendAuditEntry).toHaveBeenCalledTimes(1);
    const call = mockAppendAuditEntry.mock.calls[0]?.[0] as {
      cwd: string;
      identity: string;
      entry: Record<string, unknown>;
    };
    expect(call.cwd).toBe("/repo");
    expect(call.identity).toBe("andrew");
    expect(call.entry).toMatchObject({
      schemaVersion: 1,
      command: "sync",
      args: [],
      wu: { category: "technical", name: "test" },
      interlockState: {
        command: "sync",
        pushInterlock: { value: "manual", source: "default" },
        notesPush: { value: "manual", source: "default" },
        syncInterlock: { value: "on-handoff", source: "default" },
      },
      decision: "proceeded",
      refusalCode: null,
      outcome: {
        kind: "sync",
        cell: "save-only",
        worktree: "skip:skipped:not-configured",
        notes: "save:success",
        exitCode: 0,
      },
    });
    expect(typeof call.entry.timestamp).toBe("string");
    expect(process.exitCode).toBeUndefined();
  });

  it.each([
    ["diverged", 1, 2, "main"],
    ["remote-ahead", 0, 3, "main"],
    ["no-upstream", 0, 0, "main"],
    ["detached-head", 0, 0, null],
    ["no-remote", 0, 0, "main"],
    ["remote-unavailable", 0, 0, "main"],
  ] satisfies Array<[WorktreeSyncState, number, number, string | null]>)(
    "blocked-%s cell writes refused entry with refusalCode 14",
    async (state, ahead, behind, branch) => {
      setConfig("on-sync");
      setNotesPolicy("on-sync");
      setWorktree(state, ahead, behind, branch);
      mockRunUserSave.mockResolvedValue({
        identity: "andrew",
        commit: "abc1234",
        fileCount: 1,
        warnings: [],
      });
      if (branch === null) {
        mockGitExec.mockImplementation(async (_cmd: unknown, args: unknown) => {
          if (Array.isArray(args) && args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
            return { stdout: "HEAD", stderr: "" };
          }
          return { stdout: "", stderr: "" };
        });
      }

      await handleSync();

      expect(mockAppendAuditEntry).toHaveBeenCalledTimes(1);
      const call = mockAppendAuditEntry.mock.calls[0]?.[0] as {
        entry: Record<string, unknown>;
      };
      expect(call.entry).toMatchObject({
        command: "sync",
        decision: "refused",
        refusalCode: 14,
        outcome: {
          kind: "sync",
          cell: `blocked-${state}`,
          worktree: `skip:blocked:${state}`,
          notes: `push:blocked:notes-blocked-by-worktree:${state}`,
          exitCode: 1,
        },
      });
    },
  );

  it("notes-blocked cell writes proceeded entry; multi-colon detail token preserved on notes leg", async () => {
    // push_interlock: manual + notes_push: on-sync + worktree local-ahead → notes-blocked.
    // Worktree leg fires (skip-not-configured), so the cell is decision: "proceeded"
    // even though process exit code is 1. Notes-leg detail carries the worktree-state
    // suffix as a colon-extended token: `notes-blocked-by-worktree:local-ahead`.
    setConfig("manual");
    setNotesPolicy("on-sync");
    setWorktree("local-ahead", 2);
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    await handleSync();

    expect(mockAppendAuditEntry).toHaveBeenCalledTimes(1);
    const call = mockAppendAuditEntry.mock.calls[0]?.[0] as {
      entry: Record<string, unknown>;
    };
    expect(call.entry).toMatchObject({
      command: "sync",
      decision: "proceeded",
      refusalCode: null,
      outcome: {
        kind: "sync",
        cell: "notes-blocked",
        worktree: "skip:skipped:not-configured",
        notes: "push:blocked:notes-blocked-by-worktree:local-ahead",
        exitCode: 1,
      },
    });
    expect(process.exitCode).toBe(1);
  });

  // --- Skip-path coverage: identity-absent / no-arc-project / dry-run ---
  // Only the execute path emits an audit entry. The audit-log file lives at
  // `.arc/user/{identity}/.internal/.audit-log.jsonl`, so identity-absent and
  // no-arc-project have nowhere to write. Dry-run is an explicit skip — no
  // execution happened.

  it("identity-absent path skips the audit write", async () => {
    mockResolveUserIdentity.mockRejectedValueOnce(
      new UserFacingError({
        code: "IDENTITY_MISSING",
        whatHappened: "No identity configured.",
        why: "User commands require arc.identity to be set in git config.",
        whatToDo: "Run 'arc init' first.",
      }),
    );

    await handleSync();

    expect(mockAppendAuditEntry).not.toHaveBeenCalled();
    expect(mockResolveActiveWu).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("no-arc-project path skips the audit write", async () => {
    mockResolveArcRoot.mockReturnValueOnce(null);

    await handleSync();

    expect(mockAppendAuditEntry).not.toHaveBeenCalled();
    expect(mockResolveActiveWu).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("dry-run path skips the audit write", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("clean");

    await handleSync({ dryRun: true });

    expect(mockAppendAuditEntry).not.toHaveBeenCalled();
    expect(mockResolveActiveWu).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  // --- Sidecar invariant ---
  // The audit writer's I/O-failure path returns `{ ok: false, error }` rather
  // than throwing. The orchestrator must ignore that signal — an unwritable
  // audit log cannot change `process.exitCode` or otherwise propagate up and
  // mask the wrapped sync's outcome.

  it("audit-write I/O failure does not change exitCode (success cell)", async () => {
    setConfig("manual");
    setNotesPolicy("manual");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });
    mockAppendAuditEntry.mockResolvedValueOnce({
      ok: false,
      error: new Error("EACCES: permission denied"),
    });

    await handleSync();

    expect(mockAppendAuditEntry).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  it("audit-write I/O failure does not change exitCode (refused cell)", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("diverged", 1, 2);
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });
    mockAppendAuditEntry.mockResolvedValueOnce({
      ok: false,
      error: new Error("ENOSPC: no space left on device"),
    });

    await handleSync();

    expect(mockAppendAuditEntry).toHaveBeenCalledTimes(1);
    // Sync's refused-cell exit code (1) survives the audit-write failure.
    expect(process.exitCode).toBe(1);
  });
});

describe("audit-log integration > schema round-trip", () => {
  // Captures the entry the orchestrator builds via the mocked writer, then
  // feeds it to the *real* `appendAuditEntry` against a tmpdir — exercising
  // the real validator and the JSONL serialization. Round-trip via
  // `JSON.parse` confirms the entry is canonical (re-parsing yields an
  // equal object). Schema violations would throw inside `appendAuditEntry`
  // and surface here as a programmer-error (precondition failure).

  let realAppendAuditEntry: typeof import(
    "../../src/lib/release/audit-log.js"
  ).appendAuditEntry;

  beforeAll(async () => {
    const actual = await vi.importActual<typeof import(
      "../../src/lib/release/audit-log.js"
    )>("../../src/lib/release/audit-log.js");
    realAppendAuditEntry = actual.appendAuditEntry;
  });

  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    resetResolvedState();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  async function captureEntry(): Promise<AuditEntry> {
    await handleSync();
    expect(mockAppendAuditEntry).toHaveBeenCalledTimes(1);
    return mockAppendAuditEntry.mock.calls[0]?.[0].entry as AuditEntry;
  }

  async function roundTrip(entry: AuditEntry): Promise<AuditEntry> {
    const tmp = await mkdtemp(join(tmpdir(), "arc-sync-audit-"));
    try {
      const result = await realAppendAuditEntry({ cwd: tmp, identity: "andrew", entry });
      expect(result).toEqual({ ok: true });
      const path = join(tmp, ".arc", "user", "andrew", ".internal", ".audit-log.jsonl");
      const content = await readFile(path, "utf-8");
      const lines = content.split("\n").filter((line) => line.length > 0);
      expect(lines).toHaveLength(1);
      return JSON.parse(lines[0] ?? "") as AuditEntry;
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  it("save-only entry validates and round-trips", async () => {
    setConfig("manual");
    setNotesPolicy("manual");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    const built = await captureEntry();
    const parsed = await roundTrip(built);
    expect(parsed).toEqual(built);
  });

  it("blocked-diverged refused entry validates and round-trips", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("diverged", 1, 2);
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    const built = await captureEntry();
    const parsed = await roundTrip(built);
    expect(parsed).toEqual(built);
  });

  it("notes-blocked mixed-decision entry validates and round-trips", async () => {
    setConfig("manual");
    setNotesPolicy("on-sync");
    setWorktree("local-ahead", 2);
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    const built = await captureEntry();
    const parsed = await roundTrip(built);
    expect(parsed).toEqual(built);
  });
});

describe("audit-log integration > success cells", () => {
  // Coverage for the remaining proceeded-cell shapes. Save-only and
  // notes-blocked live above. The `(worktree=push, notes=save+notes-blocked)`
  // combination is structurally unreachable under `decideMatrix` — `decideNotes`
  // only emits `save+notes-blocked` when the worktree won't push — and is
  // intentionally absent from `cellNameFor`.

  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    resetResolvedState();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  function captureEntry(): Record<string, unknown> {
    expect(mockAppendAuditEntry).toHaveBeenCalledTimes(1);
    return mockAppendAuditEntry.mock.calls[0]?.[0]?.entry as Record<string, unknown>;
  }

  it("paired-push success entry: worktree=push:success, notes=save+push:success", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("clean");
    mockRunPairedPush.mockResolvedValue({
      save: {
        status: "success",
        result: { identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] },
      },
      worktree: { status: "success" },
      notes: { status: "success" },
      conditions: [],
      exitCode: 0,
    });

    await handleSync();

    expect(captureEntry()).toMatchObject({
      command: "sync",
      decision: "proceeded",
      refusalCode: null,
      outcome: {
        kind: "sync",
        cell: "paired-push",
        worktree: "push:success",
        notes: "save+push:success",
        exitCode: 0,
      },
    });
  });

  it("paired-push recovery variant carries recovered:<via> in the notes-leg detail", async () => {
    setConfig("on-sync");
    setNotesPolicy("on-sync");
    setWorktree("clean");
    mockRunPairedPush.mockResolvedValue({
      save: {
        status: "success",
        result: { identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] },
      },
      worktree: { status: "success" },
      notes: { status: "ok-recovered", via: "auto-rebase" },
      conditions: [],
      exitCode: 0,
    });

    await handleSync();

    expect(captureEntry()).toMatchObject({
      outcome: {
        cell: "paired-push",
        worktree: "push:success",
        notes: "save+push:success:recovered:auto-rebase",
        exitCode: 0,
      },
    });
  });

  it("worktree-only success entry: worktree=push:success, notes=save:success", async () => {
    setConfig("on-sync");
    setNotesPolicy("manual");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });

    await handleSync();

    expect(captureEntry()).toMatchObject({
      command: "sync",
      decision: "proceeded",
      refusalCode: null,
      interlockState: {
        command: "sync",
        pushInterlock: { value: "on-sync", source: "default" },
        notesPush: { value: "manual", source: "default" },
      },
      outcome: {
        kind: "sync",
        cell: "worktree-only",
        worktree: "push:success",
        notes: "save:success",
        exitCode: 0,
      },
    });
  });

  it("notes-only success entry: worktree=skip:skipped:not-configured, notes=push:success", async () => {
    setConfig("manual");
    setNotesPolicy("on-sync");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    await handleSync();

    expect(captureEntry()).toMatchObject({
      decision: "proceeded",
      outcome: {
        cell: "notes-only",
        worktree: "skip:skipped:not-configured",
        notes: "push:success",
        exitCode: 0,
      },
    });
  });

  it("notes-prompt success entry (user accepts): worktree=skip:skipped:not-configured, notes=push:success", async () => {
    setConfig("manual");
    setNotesPolicy("prompt");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });
    mockConfirm.mockResolvedValue(true);
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    await handleSync();

    expect(captureEntry()).toMatchObject({
      decision: "proceeded",
      interlockState: {
        notesPush: { value: "prompt", source: "default" },
      },
      outcome: {
        cell: "notes-prompt",
        worktree: "skip:skipped:not-configured",
        notes: "push:success",
        exitCode: 0,
      },
    });
  });

  it("worktree+notes-prompt success entry (user accepts): worktree=push:success, notes=push:success", async () => {
    setConfig("on-sync");
    setNotesPolicy("prompt");
    setWorktree("clean");
    mockRunUserSave.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      warnings: [],
    });
    mockConfirm.mockResolvedValue(true);
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    await handleSync();

    expect(captureEntry()).toMatchObject({
      decision: "proceeded",
      interlockState: {
        pushInterlock: { value: "on-sync", source: "default" },
        notesPush: { value: "prompt", source: "default" },
      },
      outcome: {
        cell: "worktree+notes-prompt",
        worktree: "push:success",
        notes: "push:success",
        exitCode: 0,
      },
    });
  });
});
