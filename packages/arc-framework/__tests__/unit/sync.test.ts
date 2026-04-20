/**
 * Unit tests for the sync handler.
 *
 * Covers policy dispatch (always / prompt / manual), non-interactive
 * degradation, save-failure short-circuit, and push-outcome rendering.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// --- Mocks ---

const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockNote = vi.fn();
const mockSpinner = vi.fn(() => ({ start: vi.fn(), stop: vi.fn() }));
const mockConfirm = vi.fn();
const mockIsCancel = vi.fn(() => false) as Mock<(v: unknown) => boolean>;

vi.mock("@clack/prompts", () => ({
  intro: (...args: unknown[]) => mockIntro(...args),
  outro: (...args: unknown[]) => mockOutro(...args),
  log: mockLog,
  note: (...args: unknown[]) => mockNote(...args),
  spinner: () => mockSpinner(),
  confirm: (...args: unknown[]) => mockConfirm(...args),
  isCancel: (v: unknown) => mockIsCancel(v),
}));

const mockRunUserSave = vi.fn();
const mockRunUserPull = vi.fn();
const mockRunUserLoad = vi.fn();
const mockBuildSaveSummary: (result: unknown) => string = vi.fn(() => "save summary");
const mockBuildLoadSummary: (result: unknown) => string = vi.fn(() => "load summary");

vi.mock("../../src/commands/user.js", () => ({
  runUserSave: (opts: unknown) => mockRunUserSave(opts),
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

const mockResolvePolicy = vi.fn();
vi.mock("../../src/lib/sync-policy.js", () => ({
  resolveSyncPushPolicy: (opts: unknown) => mockResolvePolicy(opts),
}));

const mockPushWithRecovery = vi.fn();
vi.mock("../../src/handlers/push-recovery.js", () => ({
  pushWithInteractiveRecovery: (io: unknown, identity: unknown) =>
    mockPushWithRecovery(io, identity),
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

// Import after mocks are set up
const { handleSync } = await import("../../src/handlers/sync.js");

// --- Setup helpers ---

function setPolicy(policy: "always" | "prompt" | "manual", source: "git-config" | "yaml" | "default" = "default") {
  mockResolvePolicy.mockResolvedValue({ policy, source });
}

function setSaveOk() {
  mockRunUserSave.mockResolvedValue({ warnings: [] });
}

// --- Tests ---

describe("handleSync save+push dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockIsCancel.mockReturnValue(false);
    mockIsNonInteractive.mockReturnValue(false);
    process.exitCode = undefined;
  });

  describe("policy: always", () => {
    beforeEach(() => setPolicy("always"));

    it("saves and pushes without prompting when push succeeds", async () => {
      setSaveOk();
      mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

      await handleSync({});

      expect(mockRunUserSave).toHaveBeenCalledTimes(1);
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
      expect(mockOutro).toHaveBeenCalledWith("Done.");
      expect(process.exitCode).toBeUndefined();
    });

    it("completes cleanly when push recovered via force-push", async () => {
      setSaveOk();
      mockPushWithRecovery.mockResolvedValue({ kind: "ok-recovered", via: "force" });

      await handleSync({});

      expect(mockOutro).toHaveBeenCalledWith("Done.");
      expect(process.exitCode).toBeUndefined();
    });

    it("sets exitCode and warns when push fails after successful save", async () => {
      setSaveOk();
      mockPushWithRecovery.mockResolvedValue({
        kind: "failed",
        error: new Error("network timeout"),
      });

      await handleSync({});

      expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("network timeout"));
      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("push manually"));
      expect(process.exitCode).toBe(1);
    });

    it("handles no-remote with specific guidance", async () => {
      setSaveOk();
      mockPushWithRecovery.mockResolvedValue({ kind: "no-remote" });

      await handleSync({});

      expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("No remote configured"));
      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("push manually"));
      expect(process.exitCode).toBe(1);
    });

    it("reports cancellation without setting exitCode", async () => {
      setSaveOk();
      mockPushWithRecovery.mockResolvedValue({ kind: "cancelled" });

      await handleSync({});

      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("Push cancelled"));
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe("policy: manual", () => {
    beforeEach(() => setPolicy("manual"));

    it("saves but does not push", async () => {
      setSaveOk();

      await handleSync({});

      expect(mockRunUserSave).toHaveBeenCalledTimes(1);
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockPushWithRecovery).not.toHaveBeenCalled();
      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("policy: manual"));
      expect(mockOutro).toHaveBeenCalledWith("Done.");
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe("policy: prompt", () => {
    beforeEach(() => setPolicy("prompt"));

    it("prompts, then pushes when user confirms", async () => {
      setSaveOk();
      mockConfirm.mockResolvedValue(true);
      mockPushWithRecovery.mockResolvedValue({ kind: "ok" });

      await handleSync({});

      expect(mockRunUserSave).toHaveBeenCalledTimes(1);
      expect(mockConfirm).toHaveBeenCalledTimes(1);
      expect(mockPushWithRecovery).toHaveBeenCalledTimes(1);
      expect(mockOutro).toHaveBeenCalledWith("Done.");
    });

    it("prompts, skips push when user declines", async () => {
      setSaveOk();
      mockConfirm.mockResolvedValue(false);

      await handleSync({});

      expect(mockRunUserSave).toHaveBeenCalledTimes(1);
      expect(mockConfirm).toHaveBeenCalledTimes(1);
      expect(mockPushWithRecovery).not.toHaveBeenCalled();
      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("Push skipped"));
      expect(mockOutro).toHaveBeenCalledWith("Done.");
      expect(process.exitCode).toBeUndefined();
    });

    it("prompts, skips push when user cancels (ctrl-c)", async () => {
      setSaveOk();
      mockConfirm.mockResolvedValue(Symbol("cancel"));
      mockIsCancel.mockReturnValue(true);

      await handleSync({});

      expect(mockPushWithRecovery).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    });

    it("degrades to manual in non-interactive environment", async () => {
      setSaveOk();
      mockIsNonInteractive.mockReturnValue(true);

      await handleSync({});

      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("Non-interactive"));
      expect(mockConfirm).not.toHaveBeenCalled();
      expect(mockPushWithRecovery).not.toHaveBeenCalled();
      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("policy: manual"));
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe("save failures short-circuit all policies", () => {
    for (const policy of ["always", "prompt", "manual"] as const) {
      it(`skips push (and prompt, if any) when save fails — policy: ${policy}`, async () => {
        setPolicy(policy);
        const { UserSaveError } = await import("../../src/commands/user.js");
        mockRunUserSave.mockRejectedValue(new UserSaveError("empty user directory"));

        await handleSync({});

        expect(mockLog.error).toHaveBeenCalledWith("empty user directory");
        expect(mockConfirm).not.toHaveBeenCalled();
        expect(mockPushWithRecovery).not.toHaveBeenCalled();
        expect(process.exitCode).toBe(1);
      });
    }
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
    expect(mockResolvePolicy).not.toHaveBeenCalled();
    expect(mockOutro).toHaveBeenCalledWith("Done.");
    expect(process.exitCode).toBeUndefined();
  });

  it("sets exitCode when pull fails before load", async () => {
    mockRunUserPull.mockRejectedValue(new Error("couldn't find remote ref"));

    await handleSync({ load: true });

    expect(mockRunUserPull).toHaveBeenCalledTimes(1);
    expect(mockRunUserLoad).not.toHaveBeenCalled();
    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("couldn't find remote ref"));
    expect(process.exitCode).toBe(1);
  });

  it("sets exitCode when load fails after successful pull", async () => {
    mockRunUserPull.mockResolvedValue(undefined);
    mockRunUserLoad.mockRejectedValue(new Error("corrupt note"));

    await handleSync({ load: true });

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("corrupt note"));
    expect(process.exitCode).toBe(1);
  });

  it("sets exitCode when load returns null (no note found)", async () => {
    mockRunUserPull.mockResolvedValue(undefined);
    mockRunUserLoad.mockResolvedValue(null);

    await handleSync({ load: true });

    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining("No saved user directory"));
    expect(process.exitCode).toBe(1);
  });
});
