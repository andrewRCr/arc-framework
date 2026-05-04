/**
 * Unit tests for the top-level `arc sync` orchestrator handler.
 *
 * Covers the 6-cell `push_interlock × notes_push × worktree-state` matrix
 * dispatch: paired-push, worktree-only, notes-only with notes-vs-worktree
 * gating, save-only, the prompt cell, the diverged-worktree coherence gate,
 * and `--dry-run`.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

import type { WorktreeSyncState } from "../../src/lib/git/worktree-sync.js";

const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockNote = vi.fn();
const mockConfirm = vi.fn();
const mockIsCancel = vi.fn(() => false) as Mock<(value: unknown) => boolean>;
const mockSpinner = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));

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

const mockResolveSyncPushPolicy = vi.fn();
vi.mock("../../src/lib/sync-policy.js", () => ({
  resolveSyncPushPolicy: (opts: unknown) => mockResolveSyncPushPolicy(opts),
}));

const mockReadConfigSettings = vi.fn();
vi.mock("../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: (cwd: unknown) => mockReadConfigSettings(cwd),
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
  isHandledError: () => false,
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
  requireArcProjectRoot: () => process.cwd(),
}));

const mockGitExec = vi.fn();
vi.mock("../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({ exec: mockGitExec, readFile: vi.fn() }),
}));

const { handleSync } = await import("../../src/handlers/sync.js");

// --- Test helpers ---

function setConfig(pushInterlock: "manual" | "on-sync") {
  mockReadConfigSettings.mockResolvedValue({
    settings: {
      "session.push_interlock": pushInterlock,
      "session.remote_sync": "enabled",
    },
  });
}

function setWorktree(state: WorktreeSyncState, ahead = 0, behind = 0) {
  mockRunWorktreeSyncStatus.mockResolvedValue({ state, ahead, behind });
}

function setNotesPolicy(policy: "always" | "prompt" | "manual") {
  mockResolveSyncPushPolicy.mockResolvedValue({ policy, source: "default" });
}

/** Default exec stub: branch resolves to 'main'; pushes succeed. */
function resetMockDefaults() {
  mockIsCancel.mockReturnValue(false);
  mockIsNonInteractive.mockReturnValue(false);
  mockSpinner.mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() }));
  mockBuildSaveSummary.mockReturnValue("save summary");
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

describe("handleSync orchestrator matrix dispatch", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("both interlocks on-sync + clean worktree → runPairedPush invoked; both legs reported", async () => {
    setConfig("on-sync");
    setNotesPolicy("always");
    setWorktree("clean");
    mockRunPairedPush.mockResolvedValue({
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

  it("push_interlock: manual + notes_push: on-sync + worktree local-ahead → notes-blocked; save fires; push blocked with guidance", async () => {
    setConfig("manual");
    setNotesPolicy("always");
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

  it("diverged worktree + push_interlock: on-sync → both legs skip; Reconcile required surfaced", async () => {
    setConfig("on-sync");
    setNotesPolicy("always");
    setWorktree("diverged", 1, 2);

    await handleSync();

    expect(mockRunPairedPush).not.toHaveBeenCalled();
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(pushedBranchInvocations()).toEqual([]);
    const surfaced = [
      ...mockLog.warn.mock.calls.map((c) => String(c[0] ?? "")),
      ...mockLog.error.mock.calls.map((c) => String(c[0] ?? "")),
    ];
    expect(surfaced.some((line) => line.includes("Reconcile required"))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it("--dry-run → no pushes fire; matrix decision printed", async () => {
    setConfig("on-sync");
    setNotesPolicy("always");
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
});
