/**
 * Unit tests for `handleStart`'s create-new dispatch branch — the default
 * (bare `arc start <name>`) path that spawns an isolated worktree via
 * {@link runCreateNew}. The command core is unit-tested separately; these
 * cover the handler-level orchestration the core can't: the name-required
 * guard, the confirm-prompt gate (skipped under `--yes` / non-interactive),
 * refusal reporting, and the success `note`.
 *
 * `@clack/prompts`, the command core, and the shared helpers are mocked at the
 * module seam, matching the sibling user-handler tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

// --- Mocks ---

const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockNote = vi.fn();
const mockConfirm = vi.fn();
const mockIsCancel = vi.fn(() => false) as Mock<(val: unknown) => boolean>;

vi.mock("@clack/prompts", () => ({
  intro: (...args: unknown[]) => mockIntro(...args),
  outro: (...args: unknown[]) => mockOutro(...args),
  log: mockLog,
  note: (...args: unknown[]) => mockNote(...args),
  confirm: (opts: unknown) => mockConfirm(opts),
  isCancel: (val: unknown) => mockIsCancel(val),
}));

const mockRunCreateNew = vi.fn();
const mockRunColdStart = vi.fn();
const mockDeriveColdStartWuName = vi.fn(() => "widget");

vi.mock("../../../src/commands/start.js", () => ({
  runCreateNew: (...args: unknown[]) => mockRunCreateNew(...args),
  runColdStart: (...args: unknown[]) => mockRunColdStart(...args),
  deriveColdStartWuName: () => mockDeriveColdStartWuName(),
}));

const mockResolveUserIdentity = vi.fn(async () => "andrew");
const mockIsNonInteractive = vi.fn(() => false);

vi.mock("../../../src/handlers/shared.js", () => ({
  resolveUserIdentity: () => mockResolveUserIdentity(),
  isHandledError: () => false,
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
  requireArcProjectRoot: () => "/repo",
  resolveCurrentBranchName: async () => "feat/widget",
}));

vi.mock("../../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({}),
}));

vi.mock("../../../src/lib/paths.js", () => ({
  getInternalTemplatePath: () => "/tmpl",
}));

const { handleStart } = await import("../../../src/handlers/start.js");

/** A successful create-new outcome with the spawned worktree detail. */
function spawned() {
  return {
    ok: true as const,
    value: { worktreePath: "/repos/myrepo.plan-widget", branch: "plan/widget", wuName: "widget" },
  };
}

describe("handleStart — create-new dispatch", () => {
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveUserIdentity.mockResolvedValue("andrew");
    mockIsNonInteractive.mockReturnValue(false);
    mockIsCancel.mockReturnValue(false);
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
  });

  it("refuses without a name — errors, sets exit code, never confirms or spawns", async () => {
    await handleStart(undefined, {});

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringMatching(/requires a work-unit name/i));
    expect(process.exitCode).toBe(1);
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunCreateNew).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only name as no name", async () => {
    await handleStart("   ", {});

    expect(process.exitCode).toBe(1);
    expect(mockRunCreateNew).not.toHaveBeenCalled();
  });

  it("spawns on confirm-accept, passing the resolved context, then notes the result", async () => {
    mockConfirm.mockResolvedValue(true);
    mockRunCreateNew.mockResolvedValue(spawned());

    await handleStart("widget", {});

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockRunCreateNew).toHaveBeenCalledWith(
      { io: {}, internalTemplateDir: "/tmpl" },
      { worktreePath: "/repo", identity: "andrew", name: "widget" },
    );
    // Success reporting: the spawned branch + worktree land in the note.
    const noteArg = mockNote.mock.calls[0]?.[0] as string;
    expect(noteArg).toContain("plan/widget");
    expect(noteArg).toContain("/repos/myrepo.plan-widget");
    expect(mockOutro).toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("aborts on confirm-decline — no spawn, no error code", async () => {
    mockConfirm.mockResolvedValue(false);

    await handleStart("widget", {});

    expect(mockRunCreateNew).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringMatching(/cancelled/i));
    expect(process.exitCode).toBeUndefined();
  });

  it("aborts on confirm-cancel (Ctrl-C) — no spawn", async () => {
    mockConfirm.mockResolvedValue(Symbol("cancel"));
    mockIsCancel.mockReturnValue(true);

    await handleStart("widget", {});

    expect(mockRunCreateNew).not.toHaveBeenCalled();
  });

  it("skips the confirm prompt under --yes", async () => {
    mockRunCreateNew.mockResolvedValue(spawned());

    await handleStart("widget", { yes: true });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunCreateNew).toHaveBeenCalledTimes(1);
  });

  it("skips the confirm prompt in a non-interactive environment", async () => {
    mockIsNonInteractive.mockReturnValue(true);
    mockRunCreateNew.mockResolvedValue(spawned());

    await handleStart("widget", {});

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRunCreateNew).toHaveBeenCalledTimes(1);
  });

  it("reports a spawn refusal — surfaces the reason, sets exit code, writes no note", async () => {
    mockRunCreateNew.mockResolvedValue({ ok: false, reason: "could not resolve the primary worktree" });

    await handleStart("widget", { yes: true });

    expect(mockLog.error).toHaveBeenCalledWith("could not resolve the primary worktree");
    expect(process.exitCode).toBe(1);
    expect(mockNote).not.toHaveBeenCalled();
    expect(mockOutro).not.toHaveBeenCalled();
  });
});
