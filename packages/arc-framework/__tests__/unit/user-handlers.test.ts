/**
 * Unit tests for user handlers (push/pull).
 *
 * Tests the interactive divergence resolution flow in handleUserPush and
 * the fetch/pull overwrite flows in the user portability handlers.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

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

const mockRunUserPush = vi.fn();
const mockRunUserFetch = vi.fn();
const mockRunUserPull = vi.fn();
const mockRunUserStatus = vi.fn();
const mockRunUserSessionInitStatus = vi.fn();
const mockHasLocalNotes = vi.fn();
const mockBuildUserSessionInitStatusSummary = vi.fn((result: { summary?: string }) => result.summary ?? "");

vi.mock("../../src/commands/user.js", () => ({
  runUserSave: vi.fn(),
  runUserLoad: vi.fn(),
  runUserAdd: vi.fn(),
  runUserPush: (...args: unknown[]) => mockRunUserPush(...args),
  runUserFetch: (...args: unknown[]) => mockRunUserFetch(...args),
  runUserPull: (...args: unknown[]) => mockRunUserPull(...args),
  runUserStatus: (...args: unknown[]) => mockRunUserStatus(...args),
  runUserSessionInitStatus: (...args: unknown[]) => mockRunUserSessionInitStatus(...args),
  hasLocalNotes: (...args: unknown[]) => mockHasLocalNotes(...args),
  buildSaveSummary: vi.fn(() => ""),
  buildLoadSummary: vi.fn(() => ""),
  buildUserSessionInitStatusSummary: (result: { summary?: string }) => mockBuildUserSessionInitStatusSummary(result),
  buildUserStatusSummary: vi.fn((result: { summary?: string }) => result.summary ?? ""),
}));

const mockResolveUserIdentity = vi.fn();

// Mock runWithSpinner to just call the fn directly (skip spinner ceremony)
const mockRunWithSpinner = vi.fn(
  async (label: string, fn: () => Promise<unknown>, done: string) => { void label; void done; return fn(); },
);

vi.mock("../../src/handlers/shared.js", () => ({
  resolveUserIdentity: (...args: unknown[]) => mockResolveUserIdentity(...args),
  runWithSpinner: (...args: unknown[]) => mockRunWithSpinner(...(args as [string, () => Promise<unknown>, string])),
  isHandledError: () => false,
  isRemoteError: (msg: string) =>
    msg.includes("No configured push destination") || msg.includes("does not appear to be a git repository"),
  isNonInteractiveEnvironment: () => false,
  readPmMode: vi.fn(async () => "none"),
  readSessionRemoteSyncEnabled: vi.fn(async () => true),
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

const { handleUserPush, handleUserFetch, handleUserPull, handleUserStatus } = await import("../../src/handlers/user.js");

// --- handleUserPush tests ---

describe("handleUserPush divergence resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockIsCancel.mockReturnValue(false);
    mockRunWithSpinner.mockImplementation(
      async (label: string, fn: () => Promise<unknown>, done: string) => { void label; void done; return fn(); },
    );
    process.exitCode = undefined;
  });

  it("prompts for resolution on non-fast-forward rejection", async () => {
    mockRunUserPush
      .mockRejectedValueOnce(new Error("non-fast-forward"))
      .mockResolvedValueOnce(undefined);
    mockSelect.mockResolvedValue("force");

    await handleUserPush({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("remote has diverged"),
    );
    expect(mockSelect).toHaveBeenCalledTimes(1);
    // Force push retry
    expect(mockRunUserPush).toHaveBeenCalledTimes(2);
    expect(mockRunUserPush).toHaveBeenLastCalledWith(
      expect.objectContaining({ force: true }),
    );
  });

  it("pulls then pushes when user chooses pull resolution", async () => {
    mockRunUserPush
      .mockRejectedValueOnce(new Error("[rejected]"))
      .mockResolvedValueOnce(undefined);
    mockRunUserFetch.mockResolvedValue(undefined);
    mockSelect.mockResolvedValue("pull");

    await handleUserPush({});

    // Pull with force (diverged refs)
    expect(mockRunUserFetch).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
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
});

// --- handleUserFetch tests ---

describe("handleUserFetch overwrite flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockHasLocalNotes.mockResolvedValue(false);
    mockIsCancel.mockReturnValue(false);
    mockRunWithSpinner.mockImplementation(
      async (label: string, fn: () => Promise<unknown>, done: string) => { void label; void done; return fn(); },
    );
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
    vi.clearAllMocks();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockHasLocalNotes.mockResolvedValue(false);
    mockIsCancel.mockReturnValue(false);
    process.exitCode = undefined;
  });

  it("pulls and renders the load summary when fetch+load succeeds", async () => {
    mockRunUserPull.mockResolvedValue({
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

  it("sets exitCode when pull returns no note after fetch", async () => {
    mockRunUserPull.mockResolvedValue(null);

    await handleUserPull({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("No saved user directory"),
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("handleUserStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
