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
const mockHasLocalNotes: Mock<(...args: unknown[]) => Promise<boolean>> = vi.fn();
const mockBuildSaveSummary: Mock<(result: unknown) => string> = vi.fn(() => "save summary");
const mockBuildLoadSummary: Mock<(result: unknown) => string> = vi.fn(() => "load summary");

vi.mock("../../src/commands/user.js", () => ({
  inspectUserSyncState: (opts: unknown) => mockInspectUserSyncState(opts),
  runUserSave: (opts: unknown) => mockRunUserSave(opts),
  runUserPull: (opts: unknown) => mockRunUserPull(opts),
  hasLocalNotes: (...args: unknown[]) => mockHasLocalNotes(...args),
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
  pushWithInteractiveRecovery: (io: unknown, identity: unknown, cwd: unknown) =>
    mockPushWithRecovery(io, identity, cwd),
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
const { UserSaveError } = await import("../../src/commands/user.js");

function setSyncState(
  refState: "same" | "local-ahead" | "remote-ahead" | "diverged" | "remote-unavailable",
  diskState: "same" | "different",
) {
  mockInspectUserSyncState.mockResolvedValue({ refState, diskState });
}

function setPolicy(policy: "always" | "prompt" | "manual") {
  mockResolvePolicy.mockResolvedValue({ policy, source: "default" });
}

/**
 * Re-establish construction-time defaults after `vi.resetAllMocks()`.
 * See DEV-RULES.PROJECT § Mock hygiene.
 */
function resetMockDefaults() {
  mockIsCancel.mockReturnValue(false);
  mockIsNonInteractive.mockReturnValue(false);
  mockSpinner.mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() }));
  mockBuildSaveSummary.mockReturnValue("save summary");
  mockBuildLoadSummary.mockReturnValue("load summary");
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
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockHasLocalNotes.mockResolvedValue(false);
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

  it("confirms overwrite on pull direction when local notes exist", async () => {
    setSyncState("remote-ahead", "same");
    mockHasLocalNotes.mockResolvedValue(true);
    mockConfirm.mockResolvedValue(true);
    mockRunUserPull.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleSync();

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("overwritten") }),
    );
    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
  });

  it("cancels pull cleanly when user declines overwrite confirm", async () => {
    setSyncState("remote-ahead", "same");
    mockHasLocalNotes.mockResolvedValue(true);
    mockConfirm.mockResolvedValue(false);

    await handleSync();

    expect(mockLog.info).toHaveBeenCalledWith("Pull cancelled.");
    expect(mockRunUserPull).not.toHaveBeenCalled();
  });

  it("bypasses overwrite confirm when --yes is passed", async () => {
    setSyncState("remote-ahead", "same");
    mockHasLocalNotes.mockResolvedValue(true);
    mockRunUserPull.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleSync({ yes: true });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
  });

  it("bypasses overwrite confirm in non-TTY environments", async () => {
    setSyncState("remote-ahead", "same");
    mockHasLocalNotes.mockResolvedValue(true);
    mockIsNonInteractive.mockReturnValue(true);
    mockRunUserPull.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleSync();

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
  });

  it("skips overwrite confirm after conflict pull resolution (already acknowledged)", async () => {
    setSyncState("diverged", "same");
    mockHasLocalNotes.mockResolvedValue(true);
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

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
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

    expect(mockLog.warn).toHaveBeenCalledWith(
      "Local and remote notes conflict (both moved since common ancestor).",
    );
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

  it("threads --max-walk through to runUserPull", async () => {
    setSyncState("remote-ahead", "same");
    mockRunUserPull.mockResolvedValue({
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleSync({ maxWalk: 300 });

    expect(mockRunUserPull).toHaveBeenCalledWith(
      expect.objectContaining({ maxAncestorWalk: 300 }),
    );
  });

  it("emits walk-exhausted diagnostic when pull direction hits cap without match", async () => {
    setSyncState("remote-ahead", "same");
    mockRunUserPull.mockImplementation((options: { onWalkExhausted?: (walked: number, maxWalk: number) => void }) => {
      options.onWalkExhausted?.(1000, 1000);
      return Promise.resolve(null);
    });

    await handleSync();

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("walked 1000 ancestors without finding a note"),
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("handleSync push policy", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
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

  it("renders failed-nontty-conflict banner when push recovery surfaces that discriminant", async () => {
    setSyncState("local-ahead", "same");
    setPolicy("always");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockPushWithRecovery.mockResolvedValue({ kind: "failed-nontty-conflict" });

    await handleSync();

    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("conflict"));
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("non-interactive"));
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("save preserved"));
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handleSync non-TTY conflict degradation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockIsNonInteractive.mockReturnValue(true);
    process.exitCode = undefined;
  });

  it("degrades to save-only with loud warning when refs have diverged", async () => {
    setSyncState("diverged", "same");
    mockRunUserSave.mockResolvedValue({ warnings: [] });

    await handleSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(mockRunUserPull).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("conflict"));
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("degrading to save-only"));
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("save preserved"));
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(mockOutro).toHaveBeenCalledWith("Done.");
    expect(process.exitCode).toBeUndefined();
  });

  it("degrades to save-only when remote is ahead and disk differs", async () => {
    setSyncState("remote-ahead", "different");
    mockRunUserSave.mockResolvedValue({ warnings: [] });

    await handleSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockRunUserPull).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("save preserved"));
    expect(process.exitCode).toBeUndefined();
  });

  it("sets exitCode when save fails during non-TTY conflict degradation", async () => {
    setSyncState("diverged", "same");
    mockRunUserSave.mockRejectedValue(new UserSaveError("No eligible files found in user directory to save."));

    await handleSync();

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("No eligible files"));
    expect(process.exitCode).toBe(1);
  });
});
