/**
 * Unit tests for the `arc user sync` handler.
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
const mockRunUserLoad = vi.fn();
const mockRunUserSave = vi.fn();
const mockRunUserPull = vi.fn();
const mockRecordPartialPushMarker = vi.fn();
const mockHasLocalNotes: Mock<(...args: unknown[]) => Promise<boolean>> = vi.fn();
const mockBuildSaveSummary: Mock<(result: unknown) => string> = vi.fn(() => "save summary");
const mockBuildLoadSummary: Mock<(result: unknown) => string> = vi.fn(() => "load summary");

vi.mock("../../src/commands/user.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/commands/user.js")>(
    "../../src/commands/user.js",
  );
  return {
    ...actual,
    inspectUserSyncState: (opts: unknown) => mockInspectUserSyncState(opts),
    runUserLoad: (opts: unknown) => mockRunUserLoad(opts),
    runUserSave: (opts: unknown) => mockRunUserSave(opts),
    runUserPull: (opts: unknown) => mockRunUserPull(opts),
    recordPartialPushMarker: (cwd: unknown, io: unknown, identity: unknown) =>
      mockRecordPartialPushMarker(cwd, io, identity),
    hasLocalNotes: (...args: unknown[]) => mockHasLocalNotes(...args),
    buildSaveSummary: (result: unknown) => mockBuildSaveSummary(result),
    buildLoadSummary: (result: unknown) => mockBuildLoadSummary(result),
  };
});

const mockResolvePolicy = vi.fn();
vi.mock("../../src/lib/config/resolved-settings.js", () => ({
  resolveNotesPushPolicy: (opts: unknown) => mockResolvePolicy(opts),
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
  pushNotesWithReconcile: (opts: unknown) => mockPushWithRecovery(opts),
}));

const mockResolveUserIdentity = vi.fn();
const mockIsNonInteractive = vi.fn(() => false);
vi.mock("../../src/handlers/shared.js", () => ({
  resolveUserIdentity: (...args: unknown[]) => mockResolveUserIdentity(...args),
  isHandledError: () => false,
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
  requireArcProjectRoot: () => process.cwd(),
  resolveCurrentBranchName: async () => "feature/x",
  isUserFetchOutcome: (result: { kind: string } | null) =>
    result !== null && result.kind !== "loaded",
  reportUserFetchOutcome: (result: { kind: string; error?: Error }) => {
    mockLog.error(result.error?.message ?? result.kind);
    process.exitCode = 1;
  },
}));

vi.mock("../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({ exec: vi.fn(), readFile: vi.fn() }),
}));

const { handleUserSync, decideSyncAction } = await import("../../src/handlers/user-sync.js");
const { UserSaveError } = await import("../../src/commands/user.js");

function setSyncState(
  refState: "same" | "local-ahead" | "remote-ahead" | "diverged" | "remote-unavailable",
  diskState: "same" | "different",
  options: { diskStatus?: "current" | "stale" | "local unsaved" | "mixed"; unsavedDirection?: "edits" | "missing" | "modified" | "mixed" | null } = {},
) {
  const remoteStatus = refState === "same"
    ? "in sync"
    : refState === "local-ahead"
      ? "local ahead"
      : refState === "remote-ahead"
        ? "remote ahead"
        : refState === "diverged"
          ? "conflict"
          : "remote unavailable";
  const diskStatus = options.diskStatus
    ?? (diskState === "same" ? "current" : "local unsaved");
  const spineState = refState === "remote-ahead"
    ? "remote-ahead"
    : refState === "diverged"
      ? "conflict"
      : refState === "remote-unavailable"
        ? "remote-unavailable"
        : "clean";
  mockInspectUserSyncState.mockResolvedValue({
    spineState,
    refState,
    diskState,
    remoteStatus,
    diskStatus,
    unsavedDirection: options.unsavedDirection ?? null,
  });
}

function setPolicy(policy: "on-sync" | "prompt" | "manual") {
  mockResolvePolicy.mockResolvedValue({ value: policy, source: "default" });
}

/**
 * Re-establish construction-time defaults after `vi.resetAllMocks()`.
 * Each test starts from a known mock state so default-driven branches
 * stay stable across the suite.
 */
function resetMockDefaults() {
  mockIsCancel.mockReturnValue(false);
  mockIsNonInteractive.mockReturnValue(false);
  mockSpinner.mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() }));
  mockBuildSaveSummary.mockReturnValue("save summary");
  mockBuildLoadSummary.mockReturnValue("load summary");
  mockRecordPartialPushMarker.mockResolvedValue(true);
  // Default: remote_sync enabled, worktree clean — qualifier silent.
  mockReadConfigSettings.mockResolvedValue({ settings: { "session.remote_sync": "enabled" } });
  mockRunWorktreeSyncStatus.mockResolvedValue({ state: "clean", ahead: 0, behind: 0, branch: "main" });
}

describe("decideSyncAction", () => {
  it("maps the shared sync model to noop/push/pull/load/conflict", () => {
    expect(decideSyncAction({
      spineState: "clean",
      refState: "same",
      diskState: "same",
      remoteStatus: "in sync",
      diskStatus: "current",
      unsavedDirection: null,
    })).toBe("noop");
    expect(decideSyncAction({
      spineState: "clean",
      refState: "same",
      diskState: "different",
      remoteStatus: "in sync",
      diskStatus: "local unsaved",
      unsavedDirection: "edits",
    })).toBe("push");
    expect(decideSyncAction({
      spineState: "clean",
      refState: "same",
      diskState: "different",
      remoteStatus: "in sync",
      diskStatus: "stale",
      unsavedDirection: "modified",
    })).toBe("load");
    expect(decideSyncAction({
      spineState: "clean",
      refState: "local-ahead",
      diskState: "same",
      remoteStatus: "local ahead",
      diskStatus: "current",
      unsavedDirection: null,
    })).toBe("push");
    expect(decideSyncAction({
      spineState: "clean",
      refState: "local-ahead",
      diskState: "different",
      remoteStatus: "local ahead",
      diskStatus: "stale",
      unsavedDirection: "modified",
    })).toBe("push-load");
    expect(decideSyncAction({
      spineState: "remote-ahead",
      refState: "remote-ahead",
      diskState: "same",
      remoteStatus: "remote ahead",
      diskStatus: "current",
      unsavedDirection: null,
    })).toBe("pull");
    expect(decideSyncAction({
      spineState: "remote-ahead",
      refState: "remote-ahead",
      diskState: "different",
      remoteStatus: "remote ahead",
      diskStatus: "local unsaved",
      unsavedDirection: "edits",
    })).toBe("conflict");
    expect(decideSyncAction({
      spineState: "conflict",
      refState: "diverged",
      diskState: "same",
      remoteStatus: "conflict",
      diskStatus: "current",
      unsavedDirection: null,
    })).toBe("conflict");
  });

  it("treats a HEAD-ancestor note as actionable (save) when remote is in sync and disk is current", () => {
    const base = {
      spineState: "clean",
      refState: "same",
      diskState: "same",
      remoteStatus: "in sync",
      diskStatus: "current",
      unsavedDirection: null,
    } as const;

    expect(decideSyncAction({
      ...base,
      localNoteFreshness: { state: "ancestor", commit: "a".repeat(40), commitShort: "aaaaaaa", ancestorDistance: 1 },
    })).toBe("push");

    // Every other freshness state — and the absence of the field — leaves the prior `noop` unchanged.
    for (const freshness of ["current-head", "missing", "outside-head-ancestry"] as const) {
      expect(decideSyncAction({
        ...base,
        localNoteFreshness: { state: freshness, commit: null, commitShort: null, ancestorDistance: 0 },
      })).toBe("noop");
    }
    expect(decideSyncAction(base)).toBe("noop");
  });

  it("routes zero-contested divergence to guidance and genuine conflict to the conflict select", () => {
    const base = {
      spineState: "conflict",
      refState: "diverged",
      diskState: "same",
      remoteStatus: "conflict",
      diskStatus: "current",
      unsavedDirection: null,
    } as const;

    for (const diskStatus of ["current", "stale", "local unsaved", "mixed"] as const) {
      for (const contentRelation of ["local-subset", "equal", "mixed-uncontested"] as const) {
        expect(decideSyncAction({ ...base, contentRelation, diskStatus })).toBe("guidance");
      }
      expect(decideSyncAction({ ...base, contentRelation: "conflicting", diskStatus })).toBe("conflict");
    }
    expect(decideSyncAction({
      ...base,
      spineState: "clean",
      remoteStatus: "local ahead",
      contentRelation: "remote-subset",
    })).toBe("push");
    expect(decideSyncAction({
      ...base,
      spineState: "clean",
      refState: "local-ahead",
      remoteStatus: "local ahead",
      contentRelation: "remote-subset",
    })).toBe("guidance");
    expect(decideSyncAction({
      ...base,
      spineState: "clean",
      refState: "local-ahead",
      remoteStatus: "local ahead",
      contentRelation: "remote-subset",
      diskStatus: "stale",
    })).toBe("load");
  });
});

describe("handleUserSync direction handling", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockHasLocalNotes.mockResolvedValue(false);
    process.exitCode = undefined;
  });

  it("reports already-in-sync without saving or pulling", async () => {
    setSyncState("same", "same");

    await handleUserSync();

    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockRunUserPull).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith("Local git note and working files are already up to date.");
    expect(mockOutro).toHaveBeenCalledWith("Done.");
  });

  it("renders guidance-only output for zero-contested diverged notes", async () => {
    mockInspectUserSyncState.mockResolvedValue({
      spineState: "conflict",
      refState: "diverged",
      contentRelation: "mixed-uncontested",
      diskState: "same",
      remoteStatus: "conflict",
      diskStatus: "current",
      unsavedDirection: null,
    });

    await handleUserSync();

    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("preflighted `arc user push`"));
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("Paired push defers"));
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockRunUserPull).not.toHaveBeenCalled();
    expect(mockRunUserSave).not.toHaveBeenCalled();
  });

  it("chooses push when disk has local unsaved files", async () => {
    setSyncState("same", "different", { diskStatus: "local unsaved", unsavedDirection: "edits" });
    setPolicy("on-sync");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockPushWithRecovery.mockResolvedValue({ kind: "pushed" });

    await handleUserSync();

    expect(mockLog.info).toHaveBeenCalledWith(
      "→ Saving working-file changes and pushing the local git note to remote.",
    );
    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
    expect(mockRunUserPull).not.toHaveBeenCalled();
  });

  it("chooses load when disk is stale against the local saved note", async () => {
    setSyncState("same", "different", { diskStatus: "stale", unsavedDirection: "modified" });
    mockRunUserLoad.mockResolvedValue({
      kind: "loaded",
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleUserSync();

    expect(mockLog.info).toHaveBeenCalledWith("→ Restoring the local git note to working files.");
    expect(mockRunUserLoad).toHaveBeenCalledTimes(1);
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockRunUserPull).not.toHaveBeenCalled();
  });

  it("chooses pull when remote is ahead and disk matches local state", async () => {
    setSyncState("remote-ahead", "same");
    mockRunUserPull.mockResolvedValue({
      kind: "loaded",
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleUserSync();

    expect(mockLog.info).toHaveBeenCalledWith(
      "→ Pulling the newer remote git note and restoring it to working files.",
    );
    expect(mockRunUserPull).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd() }),
    );
    const callArg = mockRunUserPull.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("force");
    expect(mockRunUserSave).not.toHaveBeenCalled();
  });

  it("confirms overwrite on pull direction when local notes exist", async () => {
    setSyncState("remote-ahead", "same");
    mockHasLocalNotes.mockResolvedValue(true);
    mockConfirm.mockResolvedValue(true);
    mockRunUserPull.mockResolvedValue({
      kind: "loaded",
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleUserSync();

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

    await handleUserSync();

    expect(mockLog.info).toHaveBeenCalledWith("Pull cancelled.");
    expect(mockRunUserPull).not.toHaveBeenCalled();
  });

  it("bypasses overwrite confirm when --yes is passed", async () => {
    setSyncState("remote-ahead", "same");
    mockHasLocalNotes.mockResolvedValue(true);
    mockRunUserPull.mockResolvedValue({
      kind: "loaded",
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleUserSync({ yes: true });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
  });

  it("bypasses overwrite confirm in non-TTY environments", async () => {
    setSyncState("remote-ahead", "same");
    mockHasLocalNotes.mockResolvedValue(true);
    mockIsNonInteractive.mockReturnValue(true);
    mockRunUserPull.mockResolvedValue({
      kind: "loaded",
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleUserSync();

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
  });

  it("offers push, inspect, or cancel for conflict without a pull option", async () => {
    setSyncState("diverged", "same");
    mockSelect.mockResolvedValue("inspect");

    await handleUserSync();

    expect(mockLog.warn).toHaveBeenCalledWith(
      "Local and remote git notes conflict (both moved since common ancestor).",
    );
    expect(mockSelect).toHaveBeenCalledTimes(1);
    const selectOptions = mockSelect.mock.calls[0]?.[0] as {
      options: { value: string }[];
    };
    expect(selectOptions.options.map((option) => option.value)).toEqual(["push", "inspect", "cancel"]);
    expect(mockRunUserPull).not.toHaveBeenCalled();
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("arc user status --verbose"));
  });

  it("prompts on conflict and respects push resolution", async () => {
    setSyncState("remote-ahead", "different");
    setPolicy("on-sync");
    mockSelect.mockResolvedValue("push");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockPushWithRecovery.mockResolvedValue({ kind: "pushed" });

    await handleUserSync();

    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
  });

  it("cancels the conflict flow cleanly", async () => {
    setSyncState("diverged", "same");
    mockSelect.mockResolvedValue("cancel");

    await handleUserSync();

    expect(mockLog.info).toHaveBeenCalledWith("Sync cancelled.");
    expect(mockRunUserSave).not.toHaveBeenCalled();
    expect(mockRunUserPull).not.toHaveBeenCalled();
  });

  it("pushes then loads when local note is ahead but disk is stale", async () => {
    setSyncState("local-ahead", "different", { diskStatus: "stale", unsavedDirection: "modified" });
    setPolicy("on-sync");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockPushWithRecovery.mockResolvedValue({ kind: "pushed" });
    mockRunUserLoad.mockResolvedValue({
      kind: "loaded",
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleUserSync();

    expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
    expect(mockRunUserLoad).toHaveBeenCalledTimes(1);
  });

});

describe("handleUserSync push policy", () => {
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

    await handleUserSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("policy: manual"));
  });

  it("prompts before push when policy is prompt", async () => {
    setPolicy("prompt");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockConfirm.mockResolvedValue(true);
    mockPushWithRecovery.mockResolvedValue({ kind: "pushed" });

    await handleUserSync();

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
  });

  it("sets exitCode when pull fails", async () => {
    setSyncState("remote-ahead", "same");
    mockRunUserPull.mockRejectedValue(new Error("couldn't find remote ref"));

    await handleUserSync();

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("couldn't find remote ref"));
    expect(process.exitCode).toBe(1);
  });

  it("stops pull direction without rendering load output when guarded fetch refuses", async () => {
    setSyncState("remote-ahead", "same");
    mockRunUserPull.mockResolvedValue({
      kind: "refused-local-ahead",
      localTip: "local",
      remoteTip: "remote",
    });

    await handleUserSync();

    expect(mockLog.error).toHaveBeenCalledWith("refused-local-ahead");
    expect(mockBuildLoadSummary).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("records a partial-push marker when notes push fails after clean worktree publish state", async () => {
    setSyncState("local-ahead", "same");
    setPolicy("on-sync");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockPushWithRecovery.mockResolvedValue({ kind: "failed", error: new Error("network timeout") });

    await handleUserSync();

    expect(mockRecordPartialPushMarker).toHaveBeenCalledWith(
      process.cwd(),
      expect.anything(),
      "andrew",
    );
    expect(process.exitCode).toBe(1);
  });

  it("reassures after save when push finds no local notes ref", async () => {
    setSyncState("local-ahead", "same");
    setPolicy("on-sync");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockPushWithRecovery.mockResolvedValue({ kind: "no-local-notes" });

    await handleUserSync();

    expect(mockRecordPartialPushMarker).toHaveBeenCalledWith(
      process.cwd(),
      expect.anything(),
      "andrew",
    );
    expect(mockLog.warn).toHaveBeenCalledWith(
      "User directory was saved locally — push manually with `arc user push`.",
    );
    expect(process.exitCode).toBe(1);
  });

  it("threads worktreeBranch into pushNotesWithReconcile; surfaces matrix-blocked notes push", async () => {
    setSyncState("local-ahead", "same");
    setPolicy("on-sync");
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    // Worktree-not-aligned-with-origin would surface from the matrix; the
    // user-sync handler renders the blocked-condition guidance and preserves
    // the local save. Simulate by returning the blocked discriminant.
    mockPushWithRecovery.mockResolvedValue({
      kind: "blocked",
      conditions: [
        {
          kind: "worktree-not-aligned-with-origin",
          disposition: "block",
          guidance: "Worktree has 2 unpushed commit(s) on `feature/x` — push the worktree first, then retry the notes push.",
          worktreeAlignment: { state: "local-ahead", ahead: 2, behind: 0 },
        },
      ],
    });

    await handleUserSync();

    expect(mockPushWithRecovery).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeBranch: "feature/x" }),
    );
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("push the worktree first"),
    );
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Local save preserved"),
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("handleUserSync non-TTY conflict degradation", () => {
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

    await handleUserSync();

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

    await handleUserSync();

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockRunUserPull).not.toHaveBeenCalled();
    expect(mockPushWithRecovery).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("save preserved"));
    expect(process.exitCode).toBeUndefined();
  });

  it("sets exitCode when save fails during non-TTY conflict degradation", async () => {
    setSyncState("diverged", "same");
    mockRunUserSave.mockRejectedValue(new UserSaveError("No eligible files found in user directory to save."));

    await handleUserSync();

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("No eligible files"));
    expect(process.exitCode).toBe(1);
  });
});

describe("handleUserSync worktree qualifier", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockHasLocalNotes.mockResolvedValue(false);
    process.exitCode = undefined;
  });

  it("emits a worktree drift qualifier when origin is ahead", async () => {
    setSyncState("same", "same");
    mockRunWorktreeSyncStatus.mockResolvedValue({ state: "remote-ahead", ahead: 0, behind: 3, branch: "main" });

    await handleUserSync();

    expect(mockLog.info).toHaveBeenCalledWith(
      "Local worktree HEAD is behind its origin upstream by 3 commit(s).",
    );
  });

  it("emits a divergence qualifier when worktree has diverged", async () => {
    setSyncState("same", "same");
    mockRunWorktreeSyncStatus.mockResolvedValue({ state: "diverged", ahead: 1, behind: 2, branch: "main" });

    await handleUserSync();

    expect(mockLog.info).toHaveBeenCalledWith(
      "Local worktree HEAD and its origin upstream have diverged (1 local ahead, 2 remote ahead).",
    );
  });

  it("emits a timeout-specific qualifier when the worktree probe times out", async () => {
    setSyncState("same", "same");
    mockRunWorktreeSyncStatus.mockResolvedValue({
      state: "remote-unavailable",
      ahead: 0,
      behind: 0,
      branch: "main",
      failureReason: "timeout",
    });

    await handleUserSync();

    expect(mockLog.info).toHaveBeenCalledWith(
      "Worktree local-to-origin comparison timed out; retry or use `--offline` to report local worktree refs only.",
    );
  });

  it("emits a branch-gone qualifier when the upstream branch is deleted on origin", async () => {
    setSyncState("same", "same");
    mockRunWorktreeSyncStatus.mockResolvedValue({ state: "branch-gone", ahead: 0, behind: 0, branch: "feat/x" });

    await handleUserSync();

    expect(mockLog.info).toHaveBeenCalledWith(
      "Local worktree's upstream branch no longer exists on origin (deleted upstream).",
    );
  });

  it("stays silent when worktree is clean", async () => {
    setSyncState("same", "same");
    mockRunWorktreeSyncStatus.mockResolvedValue({ state: "clean", ahead: 0, behind: 0, branch: "main" });

    await handleUserSync();

    const qualifierCalls = mockLog.info.mock.calls
      .map((call) => String(call[0] ?? ""))
      .filter((line) => line.startsWith("Worktree"));
    expect(qualifierCalls).toEqual([]);
  });

  it("skips the worktree probe when remote_sync is disabled", async () => {
    setSyncState("same", "same");
    mockReadConfigSettings.mockResolvedValue({ settings: { "session.remote_sync": "disabled" } });

    await handleUserSync();

    expect(mockRunWorktreeSyncStatus).not.toHaveBeenCalled();
    const qualifierCalls = mockLog.info.mock.calls
      .map((call) => String(call[0] ?? ""))
      .filter((line) => line.startsWith("Worktree"));
    expect(qualifierCalls).toEqual([]);
  });
});
