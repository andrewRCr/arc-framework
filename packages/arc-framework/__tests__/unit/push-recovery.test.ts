/**
 * Unit tests for pushWithInteractiveRecovery.
 *
 * Covers the discriminated PushResult surface: ok, ok-recovered (force / merge),
 * cancelled, no-remote, failed, and non-interactive degradation.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// --- Mocks ---

const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockSelect = vi.fn();
const mockIsCancel = vi.fn(() => false) as Mock<(v: unknown) => boolean>;
const mockSpinnerInstance = { start: vi.fn(), stop: vi.fn() };

vi.mock("@clack/prompts", () => ({
  log: mockLog,
  select: (opts: unknown) => mockSelect(opts),
  isCancel: (v: unknown) => mockIsCancel(v),
  spinner: () => mockSpinnerInstance,
}));

const mockRunUserPush = vi.fn();
const mockRunUserFetch = vi.fn();
const mockRunUserSave = vi.fn();

class MockUserSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserSaveError";
  }
}

vi.mock("../../src/commands/user.js", () => ({
  runUserPush: (...args: unknown[]) => mockRunUserPush(...args),
  runUserFetch: (...args: unknown[]) => mockRunUserFetch(...args),
  runUserSave: (...args: unknown[]) => mockRunUserSave(...args),
  UserSaveError: MockUserSaveError,
}));

const mockIsNonInteractive = vi.fn(() => false);
vi.mock("../../src/handlers/shared.js", () => ({
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
  isRemoteError: (msg: string) =>
    msg.includes("No configured push destination") || msg.includes("does not appear to be a git repository"),
  runWithSpinner: async (_label: string, fn: () => Promise<unknown>) => fn(),
}));

const { pushWithInteractiveRecovery } = await import("../../src/handlers/push-recovery.js");

// --- Tests ---

const io = {} as never;
const identity = "andrew";
const cwd = "/repo";

describe("pushWithInteractiveRecovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
    mockIsNonInteractive.mockReturnValue(false);
  });

  it("returns { kind: \"ok\" } when push succeeds on first try", async () => {
    mockRunUserPush.mockResolvedValue(undefined);
    const result = await pushWithInteractiveRecovery(io, identity, cwd);
    expect(result).toEqual({ kind: "ok" });
    expect(mockRunUserPush).toHaveBeenCalledTimes(1);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns no-remote when push fails with missing-remote error", async () => {
    mockRunUserPush.mockRejectedValue(new Error("No configured push destination"));
    const result = await pushWithInteractiveRecovery(io, identity, cwd);
    expect(result).toEqual({ kind: "no-remote" });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns failed with original error for unknown push failure", async () => {
    const err = new Error("network timeout");
    mockRunUserPush.mockRejectedValue(err);
    const result = await pushWithInteractiveRecovery(io, identity, cwd);
    expect(result).toEqual({ kind: "failed", error: err });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns ok-recovered (force) when user chooses force on divergence", async () => {
    mockRunUserPush
      .mockRejectedValueOnce(new Error("non-fast-forward"))
      .mockResolvedValueOnce(undefined);
    mockSelect.mockResolvedValue("force");

    const result = await pushWithInteractiveRecovery(io, identity, cwd);

    expect(result).toEqual({ kind: "ok-recovered", via: "force" });
    expect(mockRunUserPush).toHaveBeenNthCalledWith(2, expect.objectContaining({ force: true }));
  });

  it("returns ok-recovered (merge) when user chooses merge — runs fetch, re-save, push in order", async () => {
    const callOrder: string[] = [];
    mockRunUserPush
      .mockImplementationOnce(() => { callOrder.push("push"); return Promise.reject(new Error("[rejected]")); })
      .mockImplementationOnce(() => { callOrder.push("push"); return Promise.resolve(undefined); });
    mockRunUserFetch.mockImplementation(() => {
      callOrder.push("fetch");
      return Promise.resolve(undefined);
    });
    mockRunUserSave.mockImplementation(() => {
      callOrder.push("save");
      return Promise.resolve({ identity, commit: "abc1234", fileCount: 1, warnings: [] });
    });
    mockSelect.mockResolvedValue("merge");

    const result = await pushWithInteractiveRecovery(io, identity, cwd);

    expect(result).toEqual({ kind: "ok-recovered", via: "merge" });
    // Sequence: initial push (rejected) → force-fetch → re-save → retry push (no force)
    expect(callOrder).toEqual(["push", "fetch", "save", "push"]);
    expect(mockRunUserFetch).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    expect(mockRunUserSave).toHaveBeenCalledWith(expect.objectContaining({ cwd, identity }));
    expect(mockRunUserPush).toHaveBeenNthCalledWith(2, expect.objectContaining({ identity }));
    expect(mockRunUserPush).toHaveBeenNthCalledWith(2, expect.not.objectContaining({ force: true }));
  });

  it("returns failed without pushing when re-save throws UserSaveError", async () => {
    const saveErr = new MockUserSaveError("No eligible files found in user directory to save.");
    const callOrder: string[] = [];
    mockRunUserPush.mockImplementationOnce(() => {
      callOrder.push("push");
      return Promise.reject(new Error("non-fast-forward"));
    });
    mockRunUserFetch.mockImplementation(() => {
      callOrder.push("fetch");
      return Promise.resolve(undefined);
    });
    mockRunUserSave.mockImplementation(() => {
      callOrder.push("save");
      return Promise.reject(saveErr);
    });
    mockSelect.mockResolvedValue("merge");

    const result = await pushWithInteractiveRecovery(io, identity, cwd);

    expect(result).toEqual({ kind: "failed", error: saveErr });
    // Initial push (rejected) → fetch → save (threw) → NO retry push
    expect(callOrder).toEqual(["push", "fetch", "save"]);
    expect(mockRunUserPush).toHaveBeenCalledTimes(1);
  });

  it("returns cancelled when user chooses cancel", async () => {
    mockRunUserPush.mockRejectedValue(new Error("non-fast-forward"));
    mockSelect.mockResolvedValue("cancel");
    mockIsCancel.mockImplementation((value) => value === "cancel");

    const result = await pushWithInteractiveRecovery(io, identity, cwd);

    expect(result).toEqual({ kind: "cancelled" });
  });

  it("returns cancelled when user presses Ctrl+C on the select", async () => {
    mockRunUserPush.mockRejectedValue(new Error("non-fast-forward"));
    mockSelect.mockResolvedValue(Symbol("cancel"));
    mockIsCancel.mockReturnValue(true);

    const result = await pushWithInteractiveRecovery(io, identity, cwd);

    expect(result).toEqual({ kind: "cancelled" });
  });

  it("returns failed with recovery error when force-push itself fails", async () => {
    const recoveryErr = new Error("auth failure during force push");
    mockRunUserPush
      .mockRejectedValueOnce(new Error("non-fast-forward"))
      .mockRejectedValueOnce(recoveryErr);
    mockSelect.mockResolvedValue("force");

    const result = await pushWithInteractiveRecovery(io, identity, cwd);

    expect(result).toEqual({ kind: "failed", error: recoveryErr });
  });

  it("surfaces divergence as failed-nontty-conflict when environment is non-interactive", async () => {
    mockRunUserPush.mockRejectedValue(new Error("non-fast-forward"));
    mockIsNonInteractive.mockReturnValue(true);

    const result = await pushWithInteractiveRecovery(io, identity, cwd);

    expect(result).toEqual({ kind: "failed-nontty-conflict" });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("surfaces [rejected] divergence as failed-nontty-conflict when non-interactive", async () => {
    mockRunUserPush.mockRejectedValue(new Error("[rejected] non-fast-forward"));
    mockIsNonInteractive.mockReturnValue(true);

    const result = await pushWithInteractiveRecovery(io, identity, cwd);

    expect(result).toEqual({ kind: "failed-nontty-conflict" });
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
