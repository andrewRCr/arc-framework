/**
 * Unit tests for pushWithInteractiveRecovery.
 *
 * Covers the discriminated PushResult surface: ok, ok-recovered (force / pull-then-push),
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
const mockRunUserPull = vi.fn();

vi.mock("../../src/commands/user.js", () => ({
  runUserPush: (...args: unknown[]) => mockRunUserPush(...args),
  runUserPull: (...args: unknown[]) => mockRunUserPull(...args),
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

describe("pushWithInteractiveRecovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
    mockIsNonInteractive.mockReturnValue(false);
  });

  it("returns { kind: \"ok\" } when push succeeds on first try", async () => {
    mockRunUserPush.mockResolvedValue(undefined);
    const result = await pushWithInteractiveRecovery(io, identity);
    expect(result).toEqual({ kind: "ok" });
    expect(mockRunUserPush).toHaveBeenCalledTimes(1);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns no-remote when push fails with missing-remote error", async () => {
    mockRunUserPush.mockRejectedValue(new Error("No configured push destination"));
    const result = await pushWithInteractiveRecovery(io, identity);
    expect(result).toEqual({ kind: "no-remote" });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns failed with original error for unknown push failure", async () => {
    const err = new Error("network timeout");
    mockRunUserPush.mockRejectedValue(err);
    const result = await pushWithInteractiveRecovery(io, identity);
    expect(result).toEqual({ kind: "failed", error: err });
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns ok-recovered (force) when user chooses force on divergence", async () => {
    mockRunUserPush
      .mockRejectedValueOnce(new Error("non-fast-forward"))
      .mockResolvedValueOnce(undefined);
    mockSelect.mockResolvedValue("force");

    const result = await pushWithInteractiveRecovery(io, identity);

    expect(result).toEqual({ kind: "ok-recovered", via: "force" });
    expect(mockRunUserPush).toHaveBeenNthCalledWith(2, expect.objectContaining({ force: true }));
  });

  it("returns ok-recovered (pull-then-push) when user chooses pull", async () => {
    mockRunUserPush
      .mockRejectedValueOnce(new Error("[rejected]"))
      .mockResolvedValueOnce(undefined);
    mockRunUserPull.mockResolvedValue(undefined);
    mockSelect.mockResolvedValue("pull");

    const result = await pushWithInteractiveRecovery(io, identity);

    expect(result).toEqual({ kind: "ok-recovered", via: "pull-then-push" });
    expect(mockRunUserPull).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    expect(mockRunUserPush).toHaveBeenNthCalledWith(2, expect.objectContaining({ identity }));
  });

  it("returns cancelled when user chooses cancel", async () => {
    mockRunUserPush.mockRejectedValue(new Error("non-fast-forward"));
    mockSelect.mockResolvedValue("cancel");

    const result = await pushWithInteractiveRecovery(io, identity);

    expect(result).toEqual({ kind: "cancelled" });
  });

  it("returns cancelled when user presses Ctrl+C on the select", async () => {
    mockRunUserPush.mockRejectedValue(new Error("non-fast-forward"));
    mockSelect.mockResolvedValue(Symbol("cancel"));
    mockIsCancel.mockReturnValue(true);

    const result = await pushWithInteractiveRecovery(io, identity);

    expect(result).toEqual({ kind: "cancelled" });
  });

  it("returns failed with recovery error when force-push itself fails", async () => {
    const recoveryErr = new Error("auth failure during force push");
    mockRunUserPush
      .mockRejectedValueOnce(new Error("non-fast-forward"))
      .mockRejectedValueOnce(recoveryErr);
    mockSelect.mockResolvedValue("force");

    const result = await pushWithInteractiveRecovery(io, identity);

    expect(result).toEqual({ kind: "failed", error: recoveryErr });
  });

  it("surfaces divergence as failed (no prompt) when environment is non-interactive", async () => {
    const divergenceErr = new Error("non-fast-forward");
    mockRunUserPush.mockRejectedValue(divergenceErr);
    mockIsNonInteractive.mockReturnValue(true);

    const result = await pushWithInteractiveRecovery(io, identity);

    expect(result).toEqual({ kind: "failed", error: divergenceErr });
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
