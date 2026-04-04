/**
 * Unit tests for user handlers (push/pull).
 *
 * Tests the interactive divergence resolution flow in handleUserPush and
 * the pull overwrite flow in handleUserPull.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// --- Mocks ---

const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockSelect = vi.fn();
const mockConfirm = vi.fn();
const mockIsCancel = vi.fn(() => false) as Mock<(val: unknown) => boolean>;
const mockSpinnerInstance = { start: vi.fn(), stop: vi.fn() };

vi.mock("@clack/prompts", () => ({
  intro: (...args: unknown[]) => mockIntro(...args),
  outro: (...args: unknown[]) => mockOutro(...args),
  log: mockLog,
  select: (opts: unknown) => mockSelect(opts),
  confirm: (opts: unknown) => mockConfirm(opts),
  isCancel: (val: unknown) => mockIsCancel(val),
  spinner: () => mockSpinnerInstance,
}));

const mockRunUserPush = vi.fn();
const mockRunUserPull = vi.fn();
const mockHasLocalNotes = vi.fn();

vi.mock("../../src/commands/user.js", () => ({
  runUserSave: vi.fn(),
  runUserLoad: vi.fn(),
  runUserAdd: vi.fn(),
  runUserPush: (...args: unknown[]) => mockRunUserPush(...args),
  runUserPull: (...args: unknown[]) => mockRunUserPull(...args),
  hasLocalNotes: (...args: unknown[]) => mockHasLocalNotes(...args),
  buildSaveSummary: vi.fn(() => ""),
  buildLoadSummary: vi.fn(() => ""),
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
  readPmMode: vi.fn(async () => "none"),
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

const { handleUserPush, handleUserPull } = await import("../../src/handlers/user.js");

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
    mockRunUserPull.mockResolvedValue(undefined);
    mockSelect.mockResolvedValue("pull");

    await handleUserPush({});

    // Pull with force (diverged refs)
    expect(mockRunUserPull).toHaveBeenCalledWith(
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

// --- handleUserPull tests ---

describe("handleUserPull overwrite flow", () => {
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

  it("pulls without force when no local notes exist", async () => {
    mockHasLocalNotes.mockResolvedValue(false);
    mockRunUserPull.mockResolvedValue(undefined);

    await handleUserPull({});

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunUserPull).toHaveBeenCalledWith(
      expect.objectContaining({ force: false }),
    );
  });

  it("prompts and pulls with force when local notes exist and user confirms", async () => {
    mockHasLocalNotes.mockResolvedValue(true);
    mockConfirm.mockResolvedValue(true);
    mockRunUserPull.mockResolvedValue(undefined);

    await handleUserPull({});

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockRunUserPull).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
    );
  });

  it("cancels when user declines overwrite", async () => {
    mockHasLocalNotes.mockResolvedValue(true);
    mockConfirm.mockResolvedValue(false);

    await handleUserPull({});

    expect(mockLog.info).toHaveBeenCalledWith("Pull cancelled.");
    expect(mockRunUserPull).not.toHaveBeenCalled();
  });

  it("reports missing remote ref with identity hint", async () => {
    mockRunUserPull.mockRejectedValueOnce(
      new Error("couldn't find remote ref refs/notes/arc/user/andrew"),
    );

    await handleUserPull({});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('No notes found on remote for identity "andrew"'),
    );
    expect(process.exitCode).toBe(1);
  });
});
