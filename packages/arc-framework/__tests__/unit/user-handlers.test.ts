/**
 * Unit tests for user handlers (push/pull).
 *
 * Tests the interactive divergence resolution flow in handleUserPush and
 * the fetch/pull overwrite flows in the user portability handlers.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

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
const mockRunUserStatus = vi.fn();
const mockRunUserSessionInitStatus = vi.fn();
const mockHasLocalNotes = vi.fn();
const mockBuildSaveSummary: Mock<(result: unknown) => string> = vi.fn(() => "");
const mockBuildLoadSummary: Mock<(result: unknown) => string> = vi.fn(() => "");
const mockBuildUserStatusSummary = vi.fn((result: { summary?: string }) => result.summary ?? "");
const mockBuildUserSessionInitStatusSummary = vi.fn((result: { summary?: string }) => result.summary ?? "");

vi.mock("../../src/commands/user.js", () => ({
  runUserSave: (...args: unknown[]) => mockRunUserSave(...args),
  runUserLoad: (...args: unknown[]) => mockRunUserLoad(...args),
  runUserAdd: (...args: unknown[]) => mockRunUserAdd(...args),
  runUserPush: (...args: unknown[]) => mockRunUserPush(...args),
  runUserFetch: (...args: unknown[]) => mockRunUserFetch(...args),
  runUserPull: (...args: unknown[]) => mockRunUserPull(...args),
  runUserStatus: (...args: unknown[]) => mockRunUserStatus(...args),
  runUserSessionInitStatus: (...args: unknown[]) => mockRunUserSessionInitStatus(...args),
  hasLocalNotes: (...args: unknown[]) => mockHasLocalNotes(...args),
  buildSaveSummary: (result: unknown) => mockBuildSaveSummary(result),
  buildLoadSummary: (result: unknown) => mockBuildLoadSummary(result),
  buildUserSessionInitStatusSummary: (result: { summary?: string }) => mockBuildUserSessionInitStatusSummary(result),
  buildUserStatusSummary: (result: { summary?: string }) => mockBuildUserStatusSummary(result),
}));

const mockResolveUserIdentity = vi.fn();
const mockReadConfigSettings = vi.fn();

// Mock runWithSpinner to just call the fn directly (skip spinner ceremony)
const mockRunWithSpinner = vi.fn(
  async (label: string, fn: () => Promise<unknown>, done: string) => { void label; void done; return fn(); },
);

const mockIsNonInteractive = vi.fn(() => false);

vi.mock("../../src/handlers/shared.js", () => ({
  resolveUserIdentity: (...args: unknown[]) => mockResolveUserIdentity(...args),
  runWithSpinner: (...args: unknown[]) => mockRunWithSpinner(...(args as [string, () => Promise<unknown>, string])),
  isHandledError: () => false,
  isRemoteError: (msg: string) =>
    msg.includes("No configured push destination") || msg.includes("does not appear to be a git repository"),
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
  requireArcProjectRoot: () => process.cwd(),
}));

vi.mock("../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: (...args: unknown[]) => mockReadConfigSettings(...args),
}));

vi.mock("../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({}),
}));

vi.mock("../../src/lib/paths.js", () => ({
  getInternalTemplatePath: () => "/templates",
}));

vi.mock("../../src/lib/git/index.js", () => ({
  slugifyIdentity: (s: string) => s.toLowerCase(),
}));

const { handleUserPush, handleUserFetch, handleUserPull, handleUserLoad, handleUserStatus } = await import("../../src/handlers/user.js");

/**
 * Re-establish construction-time defaults after `vi.resetAllMocks()`.
 * See DEV-RULES.PROJECT § Mock hygiene.
 */
function resetMockDefaults() {
  mockIsCancel.mockReturnValue(false);
  mockIsNonInteractive.mockReturnValue(false);
  mockRunWithSpinner.mockImplementation(
    async (label: string, fn: () => Promise<unknown>, done: string) => { void label; void done; return fn(); },
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
      "user.sync_push": "always",
    },
    defaultsApplied: [],
    errors: [],
  });
}

// --- handleUserPush tests ---

describe("handleUserPush divergence resolution", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("prompts for resolution on non-fast-forward rejection", async () => {
    mockRunUserPush
      .mockRejectedValueOnce(new Error("non-fast-forward"))
      .mockResolvedValueOnce(undefined);
    mockSelect.mockResolvedValue("force");

    await handleUserPush({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("notes conflict"),
    );
    expect(mockSelect).toHaveBeenCalledTimes(1);
    // Force push retry
    expect(mockRunUserPush).toHaveBeenCalledTimes(2);
    expect(mockRunUserPush).toHaveBeenLastCalledWith(
      expect.objectContaining({ force: true }),
    );
  });

  it("merges (fetch → re-save → push) when user chooses merge resolution", async () => {
    mockRunUserPush
      .mockRejectedValueOnce(new Error("[rejected]"))
      .mockResolvedValueOnce(undefined);
    mockRunUserFetch.mockResolvedValue(undefined);
    mockRunUserSave.mockResolvedValue({ identity: "andrew", commit: "abc1234", fileCount: 1, warnings: [] });
    mockSelect.mockResolvedValue("merge");

    await handleUserPush({});

    // Fetch with force (aligns local with remote)
    expect(mockRunUserFetch).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
    // Re-save writes current disk state on top of the aligned base
    expect(mockRunUserSave).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "andrew", cwd: process.cwd() }),
    );
    // Then push (no force — refs should now be aligned)
    expect(mockRunUserPush).toHaveBeenCalledTimes(2);
    expect(mockRunUserPush).toHaveBeenLastCalledWith(
      expect.objectContaining({ identity: "andrew" }),
    );
    expect(mockOutro).toHaveBeenCalledWith("Done.");
  });

  it("cancels gracefully when user chooses cancel", async () => {
    mockRunUserPush.mockRejectedValueOnce(new Error("non-fast-forward"));
    mockSelect.mockResolvedValue("cancel");

    await handleUserPush({});

    expect(mockLog.info).toHaveBeenCalledWith("Push cancelled.");
    expect(mockRunUserPush).toHaveBeenCalledTimes(1);
  });

  it("cancels gracefully when user presses Ctrl+C on select", async () => {
    mockRunUserPush.mockRejectedValueOnce(new Error("non-fast-forward"));
    mockSelect.mockResolvedValue(Symbol("cancel"));
    mockIsCancel.mockReturnValue(true);

    await handleUserPush({});

    expect(mockLog.info).toHaveBeenCalledWith("Push cancelled.");
  });

  it("reports missing remote with helpful message", async () => {
    mockRunUserPush.mockRejectedValueOnce(
      new Error("No configured push destination"),
    );

    await handleUserPush({});

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("No remote configured"),
    );
    expect(mockLog.info).toHaveBeenCalledWith(
      expect.stringContaining("git remote add origin"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("renders failed-nontty-conflict banner without prompting when non-interactive", async () => {
    mockRunUserPush.mockRejectedValueOnce(new Error("non-fast-forward"));
    mockIsNonInteractive.mockReturnValue(true);

    await handleUserPush({});

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("conflict"));
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("non-interactive"));
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("save preserved"));
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

// --- handleUserFetch tests ---

describe("handleUserFetch overwrite flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockHasLocalNotes.mockResolvedValue(false);
    process.exitCode = undefined;
  });

  it("fetches without force when no local notes exist", async () => {
    mockHasLocalNotes.mockResolvedValue(false);
    mockRunUserFetch.mockResolvedValue(undefined);

    await handleUserFetch({});

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunUserFetch).toHaveBeenCalledWith(
      expect.objectContaining({ force: false }),
    );
  });

  it("prompts and fetches with force when local notes exist and user confirms", async () => {
    mockHasLocalNotes.mockResolvedValue(true);
    mockConfirm.mockResolvedValue(true);
    mockRunUserFetch.mockResolvedValue(undefined);

    await handleUserFetch({});

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockRunUserFetch).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
  });

  it("cancels when user declines overwrite", async () => {
    mockHasLocalNotes.mockResolvedValue(true);
    mockConfirm.mockResolvedValue(false);

    await handleUserFetch({});

    expect(mockLog.info).toHaveBeenCalledWith("Fetch cancelled.");
    expect(mockRunUserFetch).not.toHaveBeenCalled();
  });

  it("bypasses overwrite confirm when --yes is passed", async () => {
    mockHasLocalNotes.mockResolvedValue(true);
    mockRunUserFetch.mockResolvedValue(undefined);

    await handleUserFetch({ yes: true });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunUserFetch).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
  });

  it("bypasses overwrite confirm in non-TTY environments", async () => {
    mockHasLocalNotes.mockResolvedValue(true);
    mockIsNonInteractive.mockReturnValue(true);
    mockRunUserFetch.mockResolvedValue(undefined);

    await handleUserFetch({});

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunUserFetch).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
  });

  it("reports missing remote ref with identity hint", async () => {
    mockRunUserFetch.mockRejectedValueOnce(
      new Error("couldn't find remote ref refs/notes/arc/user/andrew"),
    );

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
      expect.objectContaining({ cwd: process.cwd(), force: false }),
    );
    expect(mockOutro).toHaveBeenCalledWith("Done.");
  });

  it("prompts before force-pulling when local notes exist", async () => {
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
    expect(mockRunUserPull).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
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
    expect(mockRunUserPull).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
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
    expect(mockRunUserPull).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
  });

  it("sets exitCode when pull returns no note after fetch", async () => {
    mockRunUserPull.mockResolvedValue(null);

    await handleUserPull({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("No saved user directory"),
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("handleUserLoad walk-exhausted diagnostic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("threads --max-walk through to runUserLoad", async () => {
    mockRunUserLoad.mockResolvedValue({
      kind: "loaded",
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleUserLoad({ maxWalk: 500 });

    expect(mockRunUserLoad).toHaveBeenCalledWith(
      expect.objectContaining({ maxAncestorWalk: 500 }),
    );
  });

  it("emits the walk-exhausted diagnostic and exits 1 when load returns a walk-exhausted outcome", async () => {
    mockRunUserLoad.mockResolvedValue({ kind: "walk-exhausted", walked: 1000, maxWalk: 1000 });

    await handleUserLoad({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("walked 1000 ancestors without finding a note"),
    );
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("--max-walk"),
    );
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("arc user status"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("falls back to 'No saved user directory' without setting exit code when load returns null", async () => {
    mockRunUserLoad.mockResolvedValue(null);

    await handleUserLoad({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("No saved user directory"),
    );
    expect(mockLog.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("walked"),
    );
    // Plain "no note" stays at exit 0 — unambiguous state, nothing to load.
    expect(process.exitCode).toBeUndefined();
  });
});

describe("handleUserPull walk-exhausted diagnostic", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetMockDefaults();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockHasLocalNotes.mockResolvedValue(false);
    process.exitCode = undefined;
  });

  it("threads --max-walk through to runUserPull", async () => {
    mockRunUserPull.mockResolvedValue({
      kind: "loaded",
      identity: "andrew",
      commit: "abc1234",
      fileCount: 1,
      fromAncestor: false,
      ancestorDistance: 0,
      warnings: [],
    });

    await handleUserPull({ maxWalk: 250 });

    expect(mockRunUserPull).toHaveBeenCalledWith(
      expect.objectContaining({ maxAncestorWalk: 250 }),
    );
  });

  it("emits walk-exhausted diagnostic and sets exitCode 1 when cap hit without find", async () => {
    mockRunUserPull.mockResolvedValue({ kind: "walk-exhausted", walked: 50, maxWalk: 50 });

    await handleUserPull({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("walked 50 ancestors without finding a note"),
    );
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
      summary: "andrew: remote ahead",
    });

    await handleUserStatus({});

    expect(mockRunUserStatus).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd(), identity: "andrew", offline: undefined, all: undefined }),
    );
    expect(mockNote).toHaveBeenCalledWith("andrew: remote ahead", "Status");
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
      headline: "in sync",
      summary: "andrew: in sync",
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
});
