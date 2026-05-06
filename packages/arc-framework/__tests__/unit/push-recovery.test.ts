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
const mockFindNearestUserNote = vi.fn();

class MockUserSaveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserSaveError";
  }
}

class MockUserPushBlockedError extends Error {
  readonly conditions: unknown[];
  constructor(conditions: unknown[]) {
    super("blocked");
    this.name = "UserPushBlockedError";
    this.conditions = conditions;
  }
}

vi.mock("../../src/commands/user.js", () => ({
  runUserPush: (...args: unknown[]) => mockRunUserPush(...args),
  runUserFetch: (...args: unknown[]) => mockRunUserFetch(...args),
  runUserSave: (...args: unknown[]) => mockRunUserSave(...args),
  findNearestUserNote: (...args: unknown[]) => mockFindNearestUserNote(...args),
  UserSaveError: MockUserSaveError,
  UserPushBlockedError: MockUserPushBlockedError,
}));

const mockIsNonInteractive = vi.fn(() => false);
vi.mock("../../src/handlers/shared.js", () => ({
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
  isRemoteError: (msg: string) =>
    msg.includes("No configured push destination") || msg.includes("does not appear to be a git repository"),
  runWithSpinner: async (
    _output: unknown,
    _label: string,
    fn: () => Promise<unknown>,
  ) => fn(),
}));

const { pushWithInteractiveRecovery } = await import("../../src/handlers/push-recovery.js");
const { createSyncOutput } = await import("../../src/lib/sync-output.js");

// --- Tests ---

const io = {} as never;
const identity = "andrew";
const cwd = "/repo";
/**
 * Human-mode SyncOutput stub — its log/spinner methods delegate through the
 * file-scoped `@clack/prompts` mock above, so existing assertions on
 * `mockLog` and `mockSpinnerInstance` keep firing.
 */
const output = createSyncOutput(false);

describe("pushWithInteractiveRecovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockIsCancel.mockReturnValue(false);
    mockIsNonInteractive.mockReturnValue(false);
    mockFindNearestUserNote.mockResolvedValue({ note: null });
  });

  it("returns { kind: \"ok\" } when push succeeds on first try", async () => {
    mockRunUserPush.mockResolvedValue({ kind: "pushed" });
    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });
    expect(result).toEqual({ kind: "ok" });
    expect(mockRunUserPush).toHaveBeenCalledTimes(1);
    expect(mockRunUserPush).toHaveBeenCalledWith(expect.objectContaining({ cwd }));
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("reports matching remote/local notes without implying the local note is current for HEAD", async () => {
    mockRunUserPush.mockResolvedValue({ kind: "noop" });
    mockFindNearestUserNote.mockResolvedValue({
      note: {
        commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        reachableFromHead: true,
        fromAncestor: true,
        ancestorDistance: 2,
        noteHistoryDistance: 0,
        content: "{}",
      },
    });

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });

    expect(result).toEqual({ kind: "noop" });
    expect(mockSpinnerInstance.stop).toHaveBeenCalledWith(
      "Remote user notes already match local user notes.",
    );
    expect(mockLog.warn).toHaveBeenCalledWith(
      "Latest local user note is attached to a commit 2 commit(s) behind HEAD.",
    );
    expect(mockLog.info).toHaveBeenCalledWith(
      "Run `arc user save` or `arc sync` before relying on handoff.",
    );
  });

  it("returns no-remote when push fails with missing-remote error", async () => {
    mockRunUserPush.mockRejectedValue(new Error("No configured push destination"));
    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });
    expect(result).toEqual({ kind: "no-remote" });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns failed with original error for unknown push failure", async () => {
    const err = new Error("network timeout");
    mockRunUserPush.mockRejectedValue(err);
    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });
    expect(result).toEqual({ kind: "failed", error: err });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns ok-recovered (force) when user chooses force on divergence", async () => {
    mockRunUserPush
      .mockRejectedValueOnce(new Error("non-fast-forward"))
      .mockResolvedValueOnce(undefined);
    mockSelect.mockResolvedValue("force");

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });

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

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });

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

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });

    expect(result).toEqual({ kind: "failed", error: saveErr });
    // Initial push (rejected) → fetch → save (threw) → NO retry push
    expect(callOrder).toEqual(["push", "fetch", "save"]);
    expect(mockRunUserPush).toHaveBeenCalledTimes(1);
  });

  it("returns cancelled when user chooses cancel", async () => {
    mockRunUserPush.mockRejectedValue(new Error("non-fast-forward"));
    mockSelect.mockResolvedValue("cancel");
    mockIsCancel.mockImplementation((value) => value === "cancel");

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });

    expect(result).toEqual({ kind: "cancelled" });
  });

  it("returns cancelled when user presses Ctrl+C on the select", async () => {
    mockRunUserPush.mockRejectedValue(new Error("non-fast-forward"));
    mockSelect.mockResolvedValue(Symbol("cancel"));
    mockIsCancel.mockReturnValue(true);

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });

    expect(result).toEqual({ kind: "cancelled" });
  });

  it("returns failed with recovery error when force-push itself fails", async () => {
    const recoveryErr = new Error("auth failure during force push");
    mockRunUserPush
      .mockRejectedValueOnce(new Error("non-fast-forward"))
      .mockRejectedValueOnce(recoveryErr);
    mockSelect.mockResolvedValue("force");

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });

    expect(result).toEqual({ kind: "failed", error: recoveryErr });
  });

  it("surfaces divergence as failed-nontty-conflict when environment is non-interactive", async () => {
    mockRunUserPush.mockRejectedValue(new Error("non-fast-forward"));
    mockIsNonInteractive.mockReturnValue(true);

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });

    expect(result).toEqual({ kind: "failed-nontty-conflict" });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("surfaces [rejected] divergence as failed-nontty-conflict when non-interactive", async () => {
    mockRunUserPush.mockRejectedValue(new Error("[rejected] non-fast-forward"));
    mockIsNonInteractive.mockReturnValue(true);

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, output });

    expect(result).toEqual({ kind: "failed-nontty-conflict" });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("yes: auto-accepts merge on conflict — no prompt, runs fetch / re-save / push in order", async () => {
    const callOrder: string[] = [];
    mockRunUserPush
      .mockImplementationOnce(() => { callOrder.push("push"); return Promise.reject(new Error("non-fast-forward")); })
      .mockImplementationOnce(() => { callOrder.push("push"); return Promise.resolve(undefined); });
    mockRunUserFetch.mockImplementation(() => { callOrder.push("fetch"); return Promise.resolve(undefined); });
    mockRunUserSave.mockImplementation(() => {
      callOrder.push("save");
      return Promise.resolve({ identity, commit: "abc1234", fileCount: 1, warnings: [] });
    });

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, yes: true, output });

    expect(result).toEqual({ kind: "ok-recovered", via: "merge" });
    expect(mockSelect).not.toHaveBeenCalled();
    expect(callOrder).toEqual(["push", "fetch", "save", "push"]);
    expect(mockRunUserPush).toHaveBeenNthCalledWith(2, expect.not.objectContaining({ force: true }));
  });

  it("yes: overrides non-interactive — auto-merge instead of failed-nontty-conflict", async () => {
    mockIsNonInteractive.mockReturnValue(true);
    mockRunUserPush
      .mockRejectedValueOnce(new Error("non-fast-forward"))
      .mockResolvedValueOnce(undefined);
    mockRunUserFetch.mockResolvedValue(undefined);
    mockRunUserSave.mockResolvedValue({ identity, commit: "abc1234", fileCount: 1, warnings: [] });

    const result = await pushWithInteractiveRecovery({ io, identity, cwd, yes: true, output });

    expect(result).toEqual({ kind: "ok-recovered", via: "merge" });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("yes: never auto-selects force — destructive option requires explicit user choice", async () => {
    // Under --yes, a divergent push goes through merge recovery; force is never
    // invoked even though the user could have chosen it interactively. Pin by
    // asserting runUserPush is never called with force: true under yes.
    mockRunUserPush
      .mockRejectedValueOnce(new Error("non-fast-forward"))
      .mockResolvedValueOnce(undefined);
    mockRunUserFetch.mockResolvedValue(undefined);
    mockRunUserSave.mockResolvedValue({ identity, commit: "abc1234", fileCount: 1, warnings: [] });

    await pushWithInteractiveRecovery({ io, identity, cwd, yes: true, output });

    const forceCalls = mockRunUserPush.mock.calls.filter(
      (call) => (call[0] as { force?: boolean })?.force === true,
    );
    expect(forceCalls).toHaveLength(0);
  });
});
