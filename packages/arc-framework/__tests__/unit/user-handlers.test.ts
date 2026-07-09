/**
 * Unit tests for user handlers (push/pull).
 *
 * Tests the interactive divergence resolution flow in handleUserPush and
 * the fetch/pull overwrite flows in the user portability handlers.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

import { UserFacingError } from "../../src/lib/errors.js";

// --- Mocks ---

const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockNote = vi.fn();
const mockSelect = vi.fn();
const mockConfirm = vi.fn();
const mockIsCancel = vi.fn(() => false) as Mock<(val: unknown) => boolean>;
const mockSpinnerInstance = { start: vi.fn(), stop: vi.fn() };

vi.mock("@clack/prompts", () => ({
  intro: (...args: unknown[]) => mockIntro(...args),
  outro: (...args: unknown[]) => mockOutro(...args),
  log: mockLog,
  note: (...args: unknown[]) => mockNote(...args),
  select: (opts: unknown) => mockSelect(opts),
  confirm: (opts: unknown) => mockConfirm(opts),
  isCancel: (val: unknown) => mockIsCancel(val),
  spinner: () => mockSpinnerInstance,
}));

const mockRunUserSave = vi.fn();
const mockRunUserPush = vi.fn();
const mockRunUserFetch = vi.fn();
const mockRunUserPull = vi.fn();
const mockRunUserLoad = vi.fn();
const mockRunUserAdd = vi.fn();
const mockRunUserOpen = vi.fn();
const mockRunUserClose = vi.fn();
const mockFindStaleUserWuSubdirs = vi.fn();
const mockListUserWuSubdirContents = vi.fn();
const mockRemoveStaleUserWuSubdir = vi.fn();
const mockReconcileRetiredSubdirsStandalone = vi.fn();
const mockRunUserStatus = vi.fn();
const mockRunUserSessionInitStatus = vi.fn();
const mockRunUserCompact = vi.fn();
const mockHasLocalNotes = vi.fn();
const mockBuildSaveSummary: Mock<(result: unknown) => string> = vi.fn(() => "");
const mockBuildLoadSummary: Mock<(result: unknown) => string> = vi.fn(() => "");
const mockBuildUserCompactSummary: Mock<(result: unknown) => string> = vi.fn(() => "");
const mockBuildUserStatusSummary = vi.fn((result: { summary?: string }) => result.summary ?? "");
const mockBuildUserSessionInitStatusSummary = vi.fn((result: { summary?: string }) => result.summary ?? "");

class MockUserPushBlockedError extends Error {
  readonly conditions: unknown[];
  constructor(conditions: unknown[]) {
    super("blocked");
    this.name = "UserPushBlockedError";
    this.conditions = conditions;
  }
}

vi.mock("../../src/commands/user.js", () => ({
  runUserSave: (...args: unknown[]) => mockRunUserSave(...args),
  runUserLoad: (...args: unknown[]) => mockRunUserLoad(...args),
  runUserAdd: (...args: unknown[]) => mockRunUserAdd(...args),
  runUserOpen: (...args: unknown[]) => mockRunUserOpen(...args),
  runUserClose: (...args: unknown[]) => mockRunUserClose(...args),
  findStaleUserWuSubdirs: (...args: unknown[]) => mockFindStaleUserWuSubdirs(...args),
  listUserWuSubdirContents: (...args: unknown[]) => mockListUserWuSubdirContents(...args),
  removeStaleUserWuSubdir: (...args: unknown[]) => mockRemoveStaleUserWuSubdir(...args),
  reconcileRetiredSubdirsStandalone: (...args: unknown[]) => mockReconcileRetiredSubdirsStandalone(...args),
  runUserPush: (...args: unknown[]) => mockRunUserPush(...args),
  runUserFetch: (...args: unknown[]) => mockRunUserFetch(...args),
  runUserPull: (...args: unknown[]) => mockRunUserPull(...args),
  runUserStatus: (...args: unknown[]) => mockRunUserStatus(...args),
  runUserSessionInitStatus: (...args: unknown[]) => mockRunUserSessionInitStatus(...args),
  runUserCompact: (...args: unknown[]) => mockRunUserCompact(...args),
  hasLocalNotes: (...args: unknown[]) => mockHasLocalNotes(...args),
  buildSaveSummary: (result: unknown) => mockBuildSaveSummary(result),
  buildLoadSummary: (result: unknown) => mockBuildLoadSummary(result),
  buildUserCompactSummary: (result: unknown) => mockBuildUserCompactSummary(result),
  buildUserSessionInitStatusSummary: (result: { summary?: string }) => mockBuildUserSessionInitStatusSummary(result),
  buildUserStatusSummary: (result: { summary?: string }) => mockBuildUserStatusSummary(result),
  UserPushBlockedError: MockUserPushBlockedError,
}));

const mockResolveUserIdentity = vi.fn();
const mockReadConfigSettings = vi.fn();

// Mock runWithSpinner to just call the fn directly (skip spinner ceremony)
const mockRunWithSpinner = vi.fn(
  async (
    output: unknown,
    label: string,
    fn: () => Promise<unknown>,
    done: string,
  ) => { void output; void label; void done; return fn(); },
);

const mockIsNonInteractive = vi.fn(() => false);

vi.mock("../../src/handlers/shared.js", () => ({
  resolveUserIdentity: (...args: unknown[]) => mockResolveUserIdentity(...args),
  runWithSpinner: (...args: unknown[]) =>
    mockRunWithSpinner(
      ...(args as [unknown, string, () => Promise<unknown>, string]),
    ),
  isHandledError: () => false,
  isRemoteError: (msg: string) =>
    msg.includes("No configured push destination") || msg.includes("does not appear to be a git repository"),
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
  requireArcProjectRoot: () => process.cwd(),
  resolveCurrentBranchName: async () => "feature/x",
  isUserFetchSuccess: (result: { kind: string }) =>
    result.kind === "fast-forwarded" || result.kind === "created",
  isUserFetchOutcome: (result: { kind: string } | null) =>
    result !== null && result.kind !== "loaded",
  reportUserFetchOutcome: (
    result: { kind: string; error?: Error },
    identity: string,
    operation: "fetch" | "pull",
  ) => {
    if (result.kind === "remote-unavailable") {
      const message = result.error?.message ?? "";
      if (message.includes("couldn't find remote ref")) {
        mockLog.warn(`No notes found on remote for identity "${identity}".`);
      } else {
        mockLog.error(`Failed to ${operation} user notes: ${message}`);
      }
      process.exitCode = 1;
      return;
    }
    mockLog.error(`${operation} refused for ${identity}`);
    process.exitCode = 1;
  },
  ARC_PROJECT_ROOT_ERROR: "Not inside an ARC project (no .arc/ directory found walking up from cwd).",
}));

vi.mock("../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: (...args: unknown[]) => mockReadConfigSettings(...args),
}));

vi.mock("../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({}),
}));

const mockResolveArcRoot = vi.fn();

vi.mock("../../src/lib/paths.js", () => ({
  getInternalTemplatePath: () => "/templates",
  resolveArcRoot: (startDir?: string) => mockResolveArcRoot(startDir),
}));

vi.mock("../../src/lib/git/index.js", () => ({
  slugifyIdentity: (s: string) => s.toLowerCase(),
  isRefusalCondition: (c: { disposition: string }) =>
    c.disposition === "block" || c.disposition === "caller-resolvable",
}));

const mockPushNotesWithReconcile = vi.fn();
vi.mock("../../src/handlers/push-recovery.js", () => ({
  pushNotesWithReconcile: (...args: unknown[]) => mockPushNotesWithReconcile(...args),
}));

const {
  handleUserPush, handleUserFetch, handleUserPull, handleUserLoad, handleUserStatus,
  handleUserOpen, handleUserClose, handleUserCompact,
} = await import("../../src/handlers/user.js");

/**
 * Re-establish construction-time defaults after `vi.resetAllMocks()`.
 * `vi.resetAllMocks()` clears implementations as well as call history.
 */
function resetMockDefaults() {
  mockIsCancel.mockReturnValue(false);
  mockIsNonInteractive.mockReturnValue(false);
  mockRunWithSpinner.mockImplementation(
    async (
      output: unknown,
      label: string,
      fn: () => Promise<unknown>,
      done: string,
    ) => { void output; void label; void done; return fn(); },
  );
  mockBuildSaveSummary.mockReturnValue("");
  mockBuildLoadSummary.mockReturnValue("");
  mockBuildUserStatusSummary.mockImplementation((result: { summary?: string }) => result.summary ?? "");
  mockBuildUserSessionInitStatusSummary.mockImplementation((result: { summary?: string }) => result.summary ?? "");
  mockReadConfigSettings.mockResolvedValue({
    settings: {
      "branch.base": "main",
      "branch.protection": "partial",
      "commit.format": "conventional",
      "commit.context_footer": "required",
      "commit.custom_pattern": "",
      "commit.context_pattern": "",
      "merge.strategy": "merge",
      "review.pre_merge": "enabled",
      "platform.type": "github",
      "pm.mode": "none",
      "team.mode": "false",
      "session.remote_sync": "enabled",
      "user.notes_push": "on-sync",
    },
    defaultsApplied: [],
    errors: [],
  });
  mockResolveArcRoot.mockReturnValue(process.cwd());
}

// --- handleUserPush tests ---

describe("handleUserPush", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it.each([
    ["pushed", { kind: "pushed" }],
    ["reconciled", { kind: "reconciled" }],
    ["noop", { kind: "noop" }],
  ])("auto-reconcile outcome %s → reports Done without prompting", async (_label, outcome) => {
    mockPushNotesWithReconcile.mockResolvedValue(outcome);

    await handleUserPush({});

    expect(mockOutro).toHaveBeenCalledWith("Done.");
    expect(mockSelect).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("reports missing remote with a helpful message and exits 1", async () => {
    mockPushNotesWithReconcile.mockResolvedValue({ kind: "no-remote" });

    await handleUserPush({});

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("No remote configured"),
    );
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("git remote add origin"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("threads worktreeBranch into the reconcile pusher; surfaces matrix-blocked guidance and exits 1", async () => {
    mockPushNotesWithReconcile.mockResolvedValue({
      kind: "blocked",
      conditions: [
        {
          kind: "worktree-not-aligned-with-origin",
          disposition: "block",
          guidance: "Worktree has 2 unpushed commit(s) on `feature/x` — push the worktree first.",
          worktreeAlignment: { state: "local-ahead", ahead: 2, behind: 0 },
        },
      ],
    });

    await handleUserPush({});

    expect(mockPushNotesWithReconcile).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeBranch: "feature/x" }),
    );
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("push the worktree first"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("rethrows an unhandled failure from the reconcile pusher", async () => {
    const err = new Error("network timeout");
    mockPushNotesWithReconcile.mockResolvedValue({ kind: "failed", error: err });

    await expect(handleUserPush({})).rejects.toThrow("network timeout");
  });

  it("surfaces a reconcile conflict message and exits 1 without throwing", async () => {
    mockPushNotesWithReconcile.mockResolvedValue({
      kind: "conflict",
      message: "Concurrent notes on commit abc12345 could not be auto-merged.",
    });

    await handleUserPush({});

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("could not be auto-merged"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("--force escape hatch pushes forcibly via runUserPush, bypassing reconcile", async () => {
    mockRunUserPush.mockResolvedValue({ kind: "pushed" });

    await handleUserPush({ force: true });

    expect(mockRunUserPush).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
    expect(mockPushNotesWithReconcile).not.toHaveBeenCalled();
    expect(mockOutro).toHaveBeenCalledWith("Done.");
  });
});

// --- handleUserFetch tests ---

describe("handleUserFetch flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockHasLocalNotes.mockResolvedValue(false);
    process.exitCode = undefined;
  });

  it("fetches through the guarded fetch path without an overwrite prompt", async () => {
    mockHasLocalNotes.mockResolvedValue(false);
    mockRunUserFetch.mockResolvedValue({
      kind: "fast-forwarded",
      localTip: "local",
      remoteTip: "remote",
    });

    await handleUserFetch({});

    expect(mockConfirm).not.toHaveBeenCalled();
    const callArg = mockRunUserFetch.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg).toEqual(expect.objectContaining({ identity: "andrew" }));
    expect(callArg).not.toHaveProperty("force");
  });

  it("does not prompt or force-overwrite when local notes exist", async () => {
    mockHasLocalNotes.mockResolvedValue(true);
    mockRunUserFetch.mockResolvedValue({
      kind: "fast-forwarded",
      localTip: "local",
      remoteTip: "remote",
    });

    await handleUserFetch({});

    expect(mockConfirm).not.toHaveBeenCalled();
    const callArg = mockRunUserFetch.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg).toEqual(expect.objectContaining({ identity: "andrew" }));
    expect(callArg).not.toHaveProperty("force");
  });

  it("reports missing remote ref with identity hint", async () => {
    mockRunUserFetch.mockResolvedValue({
      kind: "remote-unavailable",
      error: new Error("couldn't find remote ref refs/notes/arc/user/andrew"),
    });

    await handleUserFetch({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('No notes found on remote for identity "andrew"'),
    );
    expect(process.exitCode).toBe(1);
  });
});

// --- handleUserPull tests ---

describe("handleUserPull fetch+load flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockHasLocalNotes.mockResolvedValue(false);
    process.exitCode = undefined;
  });

  it("pulls and renders the load summary when fetch+load succeeds", async () => {
    mockRunUserPull.mockResolvedValue({
      kind: "loaded",
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleUserPull({});

    expect(mockRunUserPull).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd() }),
    );
    const callArg = mockRunUserPull.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg).not.toHaveProperty("force");
    expect(mockOutro).toHaveBeenCalledWith("Done.");
  });

  it("prompts before pulling when local notes exist", async () => {
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

    await handleUserPull({});

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    const callArg = mockRunUserPull.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg).toEqual(expect.objectContaining({ identity: "andrew" }));
    expect(callArg).not.toHaveProperty("force");
  });

  it("cancels cleanly when user declines overwrite", async () => {
    mockHasLocalNotes.mockResolvedValue(true);
    mockConfirm.mockResolvedValue(false);

    await handleUserPull({});

    expect(mockLog.info).toHaveBeenCalledWith("Pull cancelled.");
    expect(mockRunUserPull).not.toHaveBeenCalled();
  });

  it("bypasses overwrite confirm when --yes is passed", async () => {
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

    await handleUserPull({ yes: true });

    expect(mockConfirm).not.toHaveBeenCalled();
    const callArg = mockRunUserPull.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg).toEqual(expect.objectContaining({ identity: "andrew" }));
    expect(callArg).not.toHaveProperty("force");
  });

  it("bypasses overwrite confirm in non-TTY environments", async () => {
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

    await handleUserPull({});

    expect(mockConfirm).not.toHaveBeenCalled();
    const callArg = mockRunUserPull.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg).toEqual(expect.objectContaining({ identity: "andrew" }));
    expect(callArg).not.toHaveProperty("force");
  });

  it("sets exitCode when pull returns no note after fetch", async () => {
    mockRunUserPull.mockResolvedValue(null);

    await handleUserPull({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("No saved user directory"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("skips load rendering when guarded pull refuses local-ahead notes", async () => {
    mockRunUserPull.mockResolvedValue({
      kind: "refused-local-ahead",
      localTip: "local",
      remoteTip: "remote",
    });

    await handleUserPull({});

    expect(mockLog.error).toHaveBeenCalledWith("pull refused for andrew");
    expect(mockNote).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handleUserLoad empty result", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("falls back to 'No saved user directory' without setting exit code when load returns null", async () => {
    mockRunUserLoad.mockResolvedValue(null);

    await handleUserLoad({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("No saved user directory"),
    );
    // Plain "no note" stays at exit 0 — unambiguous state, nothing to load.
    expect(process.exitCode).toBeUndefined();
  });
});

describe("handleUserCompact", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockRunUserCompact.mockResolvedValue({
      kind: "nothing-to-prune",
      identity: "andrew",
      retainedCount: 1,
      prunedCount: 0,
    });
    mockBuildUserCompactSummary.mockReturnValue("Nothing to prune. Retained 1 note(s).");
    process.exitCode = undefined;
  });

  it("renders the compact summary from the command layer", async () => {
    await handleUserCompact({});

    expect(mockRunUserCompact).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd(), identity: "andrew" }),
    );
    expect(mockNote).toHaveBeenCalledWith("Nothing to prune. Retained 1 note(s).", "Compact");
    expect(mockOutro).toHaveBeenCalledWith("Done.");
    expect(process.exitCode).toBeUndefined();
  });

  it("sets a failure exit code when compaction succeeds but marker publication fails", async () => {
    mockRunUserCompact.mockResolvedValue({
      kind: "compacted",
      identity: "andrew",
      generation: 3,
      preCompactionTip: "a".repeat(40),
      snapshotTip: "b".repeat(40),
      backupRef: "refs/backup/arc-user-andrew-compaction-g2",
      retainedCount: 5,
      prunedCount: 10,
      marker: "failed",
      backupPrune: { deletedRefs: [], failedRefs: [] },
    });
    mockBuildUserCompactSummary.mockReturnValue("Generation marker: failed.");

    await handleUserCompact({});

    expect(mockNote).toHaveBeenCalledWith("Generation marker: failed.", "Compact");
    expect(mockOutro).toHaveBeenCalledWith("Failed.");
    expect(process.exitCode).toBe(1);
  });
});

describe("handleUserStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("renders the status summary from the command layer", async () => {
    mockRunUserStatus.mockResolvedValue({
      summary: "andrew: remote note ahead",
    });

    await handleUserStatus({});

    expect(mockRunUserStatus).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd(), identity: "andrew", offline: undefined, all: undefined }),
    );
    expect(mockNote).toHaveBeenCalledWith("andrew: remote note ahead", "Status");
    expect(mockOutro).toHaveBeenCalledWith("Done.");
  });

  it("passes offline and all flags through to the status command", async () => {
    mockRunUserStatus.mockResolvedValue({
      summary: "andrew: in sync (offline)",
    });

    await handleUserStatus({ offline: true, all: true });

    expect(mockRunUserStatus).toHaveBeenCalledWith(
      expect.objectContaining({ offline: true, all: true }),
    );
  });

  it("uses the session-init probe surface when requested", async () => {
    mockRunUserSessionInitStatus.mockResolvedValue({
      summary: "andrew: session-init remote notes ahead",
    });

    await handleUserStatus({ sessionInit: true });

    expect(mockRunUserSessionInitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd(), identity: "andrew", remoteSyncEnabled: true }),
    );
    expect(mockRunUserStatus).not.toHaveBeenCalled();
    expect(mockNote).toHaveBeenCalledWith("andrew: session-init remote notes ahead", "Session Init");
  });
});

describe("handleUserStatus --json retrofit", () => {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let writes: string[];

  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
    writes = [];
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString());
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  it("writes the full status result as JSON to stdout and skips Clack ceremony", async () => {
    const result = {
      identity: "andrew",
      headline: "git note up to date",
      remoteStatus: "in sync",
      diskStatus: "current",
      summary: "andrew: git note up to date",
      actionHint: null,
      detailLines: [],
      remoteChecked: true,
      refState: "same",
      diskState: "same",
      savedCommit: "abc1234",
      savedFromAncestor: false,
      ancestorDistance: 0,
      savedAtRelative: null,
      unsavedDirection: null,
      backupFiles: [],
      remoteIdentities: [],
    };
    mockRunUserStatus.mockResolvedValue(result);

    await handleUserStatus({ json: true });

    expect(mockIntro).not.toHaveBeenCalled();
    expect(mockOutro).not.toHaveBeenCalled();
    expect(mockNote).not.toHaveBeenCalled();

    const out = writes.join("");
    const parsed = JSON.parse(out.trim()) as typeof result;
    expect(parsed).toEqual(result);
  });

  it("writes the session-init result as JSON when --json and --session-init are combined", async () => {
    const result = {
      identity: "andrew",
      state: "clean",
      summary: "andrew: session-init remote state clean",
      detailLines: ["Remote notes match local notes."],
      actionHint: null,
      shouldPromptToPull: false,
    };
    mockRunUserSessionInitStatus.mockResolvedValue(result);

    await handleUserStatus({ json: true, sessionInit: true });

    expect(mockNote).not.toHaveBeenCalled();
    expect(mockRunUserStatus).not.toHaveBeenCalled();

    const out = writes.join("");
    const parsed = JSON.parse(out.trim()) as typeof result;
    expect(parsed).toEqual(result);
  });

  it("passes offline and all flags through alongside --json", async () => {
    mockRunUserStatus.mockResolvedValue({ identity: "andrew", summary: "" });

    await handleUserStatus({ json: true, offline: true, all: true });

    expect(mockRunUserStatus).toHaveBeenCalledWith(
      expect.objectContaining({ offline: true, all: true }),
    );
  });

  it("emits a JSON error envelope and skips Clack when identity is unresolvable under --json", async () => {
    mockResolveUserIdentity.mockRejectedValue(new UserFacingError({
      code: "IDENTITY_MISSING",
      whatHappened: "No identity configured.",
      why: "User commands require arc.identity to be set in git config.",
      whatToDo: "Run 'arc init' first.",
    }));

    await handleUserStatus({ json: true });

    expect(mockIntro).not.toHaveBeenCalled();
    expect(mockOutro).not.toHaveBeenCalled();
    expect(mockNote).not.toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(mockRunUserStatus).not.toHaveBeenCalled();

    const out = writes.join("");
    const parsed = JSON.parse(out.trim()) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe("IDENTITY_MISSING");
    expect(parsed.error.message).toBe("No identity configured.");
    expect(process.exitCode).toBe(1);
  });

  it("emits a JSON error envelope when the cwd is not inside an ARC project under --json", async () => {
    mockResolveArcRoot.mockReturnValue(null);

    await handleUserStatus({ json: true });

    expect(mockIntro).not.toHaveBeenCalled();
    expect(mockOutro).not.toHaveBeenCalled();
    expect(mockNote).not.toHaveBeenCalled();
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(mockRunUserStatus).not.toHaveBeenCalled();

    const out = writes.join("");
    const parsed = JSON.parse(out.trim()) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe("NOT_IN_ARC_PROJECT");
    expect(parsed.error.message).toContain("Not inside an ARC project");
    expect(process.exitCode).toBe(1);
  });
});

// --- handleUserOpen tests ---

describe("handleUserOpen", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockReconcileRetiredSubdirsStandalone.mockResolvedValue(new Set());
    mockFindStaleUserWuSubdirs.mockResolvedValue([]);
    mockRunUserOpen.mockResolvedValue(undefined);
    process.exitCode = undefined;
  });

  it("opens the WU subdir without prompting when no stale subdirs exist", async () => {
    await handleUserOpen("feature-x");

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockRemoveStaleUserWuSubdir).not.toHaveBeenCalled();
    expect(mockRunUserOpen).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "andrew", wuName: "feature-x" }),
    );
  });

  it("reconciles a shipped retired subdir up front, with no prompt", async () => {
    // The reconcile clears the shipped subdir; nothing residual remains to prompt over.
    mockReconcileRetiredSubdirsStandalone.mockResolvedValue(new Set(["shipped-wu"]));
    mockFindStaleUserWuSubdirs.mockResolvedValue([]);

    await handleUserOpen("feature-x");

    expect(mockReconcileRetiredSubdirsStandalone).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "andrew" }),
    );
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockRemoveStaleUserWuSubdir).not.toHaveBeenCalled();
    expect(mockRunUserOpen).toHaveBeenCalled();
  });

  it("surfaces a residual unresolvable subdir with a default-keep, non-destructive prompt", async () => {
    mockFindStaleUserWuSubdirs.mockResolvedValue(["prior-wu"]);
    mockSelect.mockResolvedValue("keep");

    await handleUserOpen("feature-x");

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Stale subdir user/andrew/prior-wu/"),
        initialValue: "keep",
      }),
    );
    // Default keep is non-destructive: the subdir survives and the open proceeds.
    expect(mockRemoveStaleUserWuSubdir).not.toHaveBeenCalled();
    expect(mockRunUserOpen).toHaveBeenCalled();
  });

  it("auto-skips to keep under a non-interactive environment — no prompt, no removal, no abort", async () => {
    mockIsNonInteractive.mockReturnValue(true);
    mockFindStaleUserWuSubdirs.mockResolvedValue(["prior-wu"]);

    await handleUserOpen("feature-x");

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockRemoveStaleUserWuSubdir).not.toHaveBeenCalled();
    expect(mockRunUserOpen).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "andrew", wuName: "feature-x" }),
    );
  });

  it("inspect lists subdir contents and re-prompts", async () => {
    mockFindStaleUserWuSubdirs.mockResolvedValue(["prior-wu"]);
    mockListUserWuSubdirContents.mockResolvedValue([
      { name: "SESSION-NOTES.md", size: 123 },
    ]);
    mockSelect.mockResolvedValueOnce("inspect").mockResolvedValueOnce("remove");

    await handleUserOpen("feature-x");

    expect(mockListUserWuSubdirContents).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "andrew", subdir: "prior-wu" }),
    );
    expect(mockSelect).toHaveBeenCalledTimes(2);
    expect(mockNote).toHaveBeenCalledWith(
      expect.stringContaining("SESSION-NOTES.md"),
      expect.stringContaining("Contents of user/andrew/prior-wu/"),
    );
    expect(mockRemoveStaleUserWuSubdir).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "andrew", subdir: "prior-wu" }),
    );
    expect(mockRunUserOpen).toHaveBeenCalled();
  });

  it("`remove` deletes the residual stale subdir and proceeds to runUserOpen", async () => {
    mockFindStaleUserWuSubdirs.mockResolvedValue(["prior-wu"]);
    mockSelect.mockResolvedValue("remove");

    await handleUserOpen("feature-x");

    expect(mockRemoveStaleUserWuSubdir).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "andrew", subdir: "prior-wu" }),
    );
    expect(mockRunUserOpen).toHaveBeenCalledAfter(
      mockRemoveStaleUserWuSubdir as unknown as Mock,
    );
  });

  it("a cancelled prompt keeps the subdir and still opens — never aborts", async () => {
    mockFindStaleUserWuSubdirs.mockResolvedValue(["prior-wu"]);
    mockSelect.mockResolvedValue(Symbol("cancel"));
    mockIsCancel.mockReturnValue(true);

    await handleUserOpen("feature-x");

    expect(mockRemoveStaleUserWuSubdir).not.toHaveBeenCalled();
    expect(mockRunUserOpen).toHaveBeenCalled();
  });

  it("surfaces a clear error when identity is missing", async () => {
    mockResolveUserIdentity.mockRejectedValue(
      new UserFacingError({
        code: "IDENTITY_MISSING",
        whatHappened: "No identity configured.",
        why: "User commands require arc.identity to be set in git config.",
        whatToDo: "Run 'arc init' first.",
      }),
    );

    // The file-scoped isHandledError mock returns false, so a UserFacingError
    // re-throws out of the handler. The behavior we're asserting is that the
    // open path short-circuits — no stale-prompt and no runUserOpen.
    await expect(handleUserOpen("feature-x")).rejects.toThrow(UserFacingError);
    expect(mockFindStaleUserWuSubdirs).not.toHaveBeenCalled();
    expect(mockRunUserOpen).not.toHaveBeenCalled();
  });
});

// --- handleUserClose tests ---

describe("handleUserClose", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockRunUserClose.mockResolvedValue(undefined);
    process.exitCode = undefined;
  });

  it("calls runUserClose with the resolved identity and target WU", async () => {
    await handleUserClose("feature-x");

    expect(mockRunUserClose).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "andrew", wuName: "feature-x" }),
    );
  });

  it("surfaces a clear error when identity is missing", async () => {
    mockResolveUserIdentity.mockRejectedValue(
      new UserFacingError({
        code: "IDENTITY_MISSING",
        whatHappened: "No identity configured.",
        why: "User commands require arc.identity to be set in git config.",
        whatToDo: "Run 'arc init' first.",
      }),
    );

    await expect(handleUserClose("feature-x")).rejects.toThrow(UserFacingError);
    expect(mockRunUserClose).not.toHaveBeenCalled();
  });
});
