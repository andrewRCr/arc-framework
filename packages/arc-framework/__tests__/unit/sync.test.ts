/**
 * Unit tests for the sync handler.
 *
 * Tests error paths: push failure after successful save, pull failure before
 * load, identity resolution failure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockNote = vi.fn();
const mockSpinner = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));

vi.mock("@clack/prompts", () => ({
  intro: (...args: unknown[]) => mockIntro(...args),
  outro: (...args: unknown[]) => mockOutro(...args),
  log: mockLog,
  note: (...args: unknown[]) => mockNote(...args),
  spinner: () => mockSpinner(),
}));

const mockRunUserSave = vi.fn();
const mockRunUserPush = vi.fn();
const mockRunUserPull = vi.fn();
const mockRunUserLoad = vi.fn();
const mockBuildSaveSummary: (result: unknown) => string = vi.fn(() => "save summary");
const mockBuildLoadSummary: (result: unknown) => string = vi.fn(() => "load summary");

vi.mock("../../src/commands/user.js", () => ({
  runUserSave: (opts: unknown) => mockRunUserSave(opts),
  runUserPush: (opts: unknown) => mockRunUserPush(opts),
  runUserPull: (opts: unknown) => mockRunUserPull(opts),
  runUserLoad: (opts: unknown) => mockRunUserLoad(opts),
  buildSaveSummary: (result: unknown) => mockBuildSaveSummary(result),
  buildLoadSummary: (result: unknown) => mockBuildLoadSummary(result),
  UserSaveError: class UserSaveError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "UserSaveError";
    }
  },
}));

const mockResolveUserIdentity = vi.fn();
vi.mock("../../src/handlers/shared.js", () => ({
  resolveUserIdentity: (...args: unknown[]) => mockResolveUserIdentity(...args),
  isHandledError: () => false,
}));

vi.mock("../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({}),
}));

// Import after mocks are set up
const { handleSync } = await import("../../src/handlers/sync.js");

// --- Tests ---

describe("handleSync (save + push)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("completes successfully when save and push both succeed", async () => {
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockRunUserPush.mockResolvedValue(undefined);

    await handleSync({});

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockRunUserPush).toHaveBeenCalledTimes(1);
    expect(mockOutro).toHaveBeenCalledWith("Done.");
    expect(process.exitCode).toBeUndefined();
  });

  it("sets exitCode and warns when push fails after successful save", async () => {
    mockRunUserSave.mockResolvedValue({ warnings: [] });
    mockRunUserPush.mockRejectedValue(new Error("network timeout"));

    await handleSync({});

    expect(mockRunUserSave).toHaveBeenCalledTimes(1);
    expect(mockRunUserPush).toHaveBeenCalledTimes(1);
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("network timeout"),
    );
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("push manually"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("sets exitCode when save fails with UserSaveError", async () => {
    // Import the mock class to construct the error
    const { UserSaveError } = await import("../../src/commands/user.js");
    mockRunUserSave.mockRejectedValue(new UserSaveError("no user directory"));

    await handleSync({});

    expect(mockLog.error).toHaveBeenCalledWith("no user directory");
    expect(mockRunUserPush).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handleSync --load (pull + load)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    process.exitCode = undefined;
  });

  it("completes successfully when pull and load both succeed", async () => {
    mockRunUserPull.mockResolvedValue(undefined);
    mockRunUserLoad.mockResolvedValue({ files: ["SESSION-NOTES.md"], commit: "abc123" });

    await handleSync({ load: true });

    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
    expect(mockRunUserLoad).toHaveBeenCalledTimes(1);
    expect(mockOutro).toHaveBeenCalledWith("Done.");
    expect(process.exitCode).toBeUndefined();
  });

  it("sets exitCode when pull fails before load", async () => {
    mockRunUserPull.mockRejectedValue(new Error("couldn't find remote ref"));

    await handleSync({ load: true });

    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
    expect(mockRunUserLoad).not.toHaveBeenCalled();
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("couldn't find remote ref"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("sets exitCode when load fails after successful pull", async () => {
    mockRunUserPull.mockResolvedValue(undefined);
    mockRunUserLoad.mockRejectedValue(new Error("corrupt note"));

    await handleSync({ load: true });

    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
    expect(mockRunUserLoad).toHaveBeenCalledTimes(1);
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("corrupt note"),
    );
    expect(process.exitCode).toBe(1);
  });

  it("sets exitCode when load returns null (no note found)", async () => {
    mockRunUserPull.mockResolvedValue(undefined);
    mockRunUserLoad.mockResolvedValue(null);

    await handleSync({ load: true });

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("No saved user directory"),
    );
    expect(process.exitCode).toBe(1);
  });
});
