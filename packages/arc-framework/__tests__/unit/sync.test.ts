/**
 * Unit tests for the sync handler.
 *
 * Covers the sync direction matrix, conflict prompting, and push policy
 * handling on the push path.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockNote = vi.fn();
const mockConfirm = vi.fn();
const mockSelect = vi.fn();
const mockIsCancel = vi.fn(() => false) as Mock<(value: unknown) => boolean>;
const mockSpinner = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));

vi.mock("@clack/prompts", () => ({
  intro: (...args: unknown[]) => mockIntro(...args),
  outro: (...args: unknown[]) => mockOutro(...args),
  log: mockLog,
  note: (...args: unknown[]) => mockNote(...args),
  confirm: (...args: unknown[]) => mockConfirm(...args),
  select: (...args: unknown[]) => mockSelect(...args),
  isCancel: (value: unknown) => mockIsCancel(value),
  spinner: () => mockSpinner(),
}));

const mockInspectUserSyncState = vi.fn();
const mockRunUserSave = vi.fn();
const mockRunUserPull = vi.fn();
const mockBuildSaveSummary: (result: unknown) => string = vi.fn(() => "save summary");
const mockBuildLoadSummary: (result: unknown) => string = vi.fn(() => "load summary");

vi.mock("../../src/commands/user.js", () => ({
  inspectUserSyncState: (opts: unknown) => mockInspectUserSyncState(opts),
  runUserSave: (opts: unknown) => mockRunUserSave(opts),
  runUserPull: (opts: unknown) => mockRunUserPull(opts),
  buildSaveSummary: (result: unknown) => mockBuildSaveSummary(result),
  buildLoadSummary: (result: unknown) => mockBuildLoadSummary(result),
  UserSaveError: class UserSaveError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "UserSaveError";
    }
  },
}));

const mockResolvePolicy = vi.fn();
vi.mock("../../src/lib/sync-policy.js", () => ({
  resolveSyncPushPolicy: (opts: unknown) => mockResolvePolicy(opts),
}));

const mockPushWithRecovery = vi.fn();
vi.mock("../../src/handlers/push-recovery.js", () => ({
  pushWithInteractiveRecovery: (io: unknown, identity: unknown) => mockPushWithRecovery(io, identity),
}));

const mockResolveUserIdentity = vi.fn();
const mockIsNonInteractive = vi.fn(() => false);
vi.mock("../../src/handlers/shared.js", () => ({
  resolveUserIdentity: (...args: unknown[]) => mockResolveUserIdentity(...args),
  isHandledError: () => false,
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
}));

vi.mock("../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({ exec: vi.fn(), readFile: vi.fn() }),
}));

const { handleSync, decideSyncAction } = await import("../../src/handlers/sync.js");

function setSyncState(
  refState: "same" | "local-ahead" | "remote-ahead" | "diverged" | "remote-unavailable",
  diskState: "same" | "different",
) {
  mockInspectUserSyncState.mockResolvedValue({ refState, diskState });
}

function setPolicy(policy: "always" | "prompt" | "manual") {
  mockResolvePolicy.mockResolvedValue({ policy, source: "default" });
}

describe("decideSyncAction", () => {
  it("maps the sync matrix to push/pull/noop/conflict", () => {
    expect(decideSyncAction({ refState: "same", diskState: "same" })).toBe("noop");
    expect(decideSyncAction({ refState: "same", diskState: "different" })).toBe("push");
    expect(decideSyncAction({ refState: "local-ahead", diskState: "same" })).toBe("push");
    expect(decideSyncAction({ refState: "remote-ahead", diskState: "same" })).toBe("pull");
    expect(decideSyncAction({ refState: "remote-ahead", diskState: "different" })).toBe("conflict");
    expect(decideSyncAction({ refState: "diverged", diskState: "same" })).toBe("conflict");
  });
});

describe("handleSync direction handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockIsCancel.mockReturnValue(false);
    mockIsNonInteractive.mockReturnValue(false);
    process.exitCode = undefined;
  });

  it("reports already-in-sync without saving or pulling", async () => {
    setSyncState("same", "same");

    await handleSync();

    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockRunUserPull).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith("User directory already in sync.");
    expect(mockOutro).toHaveBeenCalledWith("Done.");
  });

  it("chooses push when disk differs from the saved snapshot", async () => {
    setSyncState("same", "different");
    setPolicy("always");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    await handleSync();

    expect(mockLog.info).toHaveBeenCalledWith("→ Pushing local user directory to remote notes.");
    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
    expect(mockRunUserPull).not.toHaveBeenCalled();
  });

  it("chooses pull when remote is ahead and disk matches local state", async () => {
    setSyncState("remote-ahead", "same");
    mockRunUserPull.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleSync();

    expect(mockLog.info).toHaveBeenCalledWith("→ Pulling remote notes into the local user directory.");
    expect(mockRunUserPull).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd(), force: true }),
    );
    expect(mockRunUserSave).not.toHaveBeenCalled();
  });

  it("prompts on conflict and respects pull resolution", async () => {
    setSyncState("diverged", "same");
    mockSelect.mockResolvedValue("pull");
    mockRunUserPull.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleSync();

    expect(mockLog.warn).toHaveBeenCalledWith("Local and remote notes have diverged.");
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
    expect(mockRunUserSave).not.toHaveBeenCalled();
  });

  it("prompts on conflict and respects push resolution", async () => {
    setSyncState("remote-ahead", "different");
    setPolicy("always");
    mockSelect.mockResolvedValue("push");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    await handleSync();

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
  });

  it("cancels the conflict flow cleanly", async () => {
    setSyncState("diverged", "same");
    mockSelect.mockResolvedValue("cancel");

    await handleSync();

    expect(mockLog.info).toHaveBeenCalledWith("Sync cancelled.");
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockRunUserPull).not.toHaveBeenCalled();
  });
});

describe("handleSync push policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockIsCancel.mockReturnValue(false);
    mockIsNonInteractive.mockReturnValue(false);
    setSyncState("local-ahead", "same");
    process.exitCode = undefined;
  });

  it("skips push when policy is manual", async () => {
    setPolicy("manual");
    mockRunUserSave.mockResolvedValue({ warnings: [] });

    await handleSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("policy: manual"));
  });

  it("prompts before push when policy is prompt", async () => {
    setPolicy("prompt");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockConfirm.mockResolvedValue(true);
    mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

    await handleSync();

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
  });

  it("sets exitCode when pull fails", async () => {
    setSyncState("remote-ahead", "same");
    mockRunUserPull.mockRejectedValue(new Error("couldn't find remote ref"));

    await handleSync();

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("couldn't find remote ref"));
    expect(process.exitCode).toBe(1);
  });
});
