/**
 * Unit tests for `handleStart`'s dispatch + reporting orchestration. The routing
 * core ({@link resolveStartDispatch}) and the per-arm cores are unit-tested
 * separately; these cover the handler-level glue the cores can't: the name-
 * required guard, the `--here` cold-start branch, routing each resolved arm to
 * its core, the directed refusal, confirm gating, and refusal reporting.
 *
 * `@clack/prompts`, the command module, the lifecycle index / executor binder,
 * the resume verb, and the shared helpers are mocked at the module seam.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

// --- Mocks ---

const mockOutro = vi.fn();
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockNote = vi.fn();
const mockConfirm = vi.fn();
const mockIsCancel = vi.fn(() => false) as Mock<(val: unknown) => boolean>;

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: (...args: unknown[]) => mockOutro(...args),
  log: mockLog,
  note: (...args: unknown[]) => mockNote(...args),
  confirm: (opts: unknown) => mockConfirm(opts),
  isCancel: (val: unknown) => mockIsCancel(val),
}));

const mockResolveStartDispatch = vi.fn();
const mockRunCreateNew = vi.fn();
const mockRunColdStart = vi.fn();
const mockRunGraduate = vi.fn();

vi.mock("../../../src/commands/start.js", () => ({
  resolveStartDispatch: (...args: unknown[]) => mockResolveStartDispatch(...args),
  runCreateNew: (...args: unknown[]) => mockRunCreateNew(...args),
  runColdStart: (...args: unknown[]) => mockRunColdStart(...args),
  runGraduate: (...args: unknown[]) => mockRunGraduate(...args),
  deriveColdStartWuName: () => "widget",
}));

const mockRunResume = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/park-resume.js", () => ({
  runResume: (...args: unknown[]) => mockRunResume(...args),
}));

vi.mock("../../../src/lib/work-unit/lifecycle-index.js", () => ({
  buildLifecycleIndex: async () => new Map([["widget", { path: ".arc/backlog/planned/widget/meta-widget.md" }]]),
}));

vi.mock("../../../src/lib/work-unit/executor-context.js", () => ({
  buildExecutorContext: () => ({}),
}));

vi.mock("../../../src/lib/active/meta-reader.js", () => ({
  parseMetaRecord: () => ({ Class: "Light" }),
}));

vi.mock("../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: async () => ({
    settings: { "branch.base": "main", "worktree.location_template": "../{repo}-{branch}" },
  }),
}));

vi.mock("../../../src/lib/git/worktree-roster.js", () => ({
  resolvePrimaryWorktreePath: async () => "/repos/myrepo",
}));

const mockIsNonInteractive = vi.fn(() => true);

vi.mock("../../../src/handlers/shared.js", () => ({
  resolveUserIdentity: async () => "andrew",
  isHandledError: () => false,
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
  requireArcProjectRoot: () => "/repo",
  resolveCurrentBranchName: async () => "feat/widget",
}));

vi.mock("../../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({ exec: vi.fn(), readFile: vi.fn(async () => ""), writeFile: vi.fn() }),
}));

vi.mock("../../../src/lib/paths.js", () => ({ getInternalTemplatePath: () => "/tmpl" }));

const { handleStart } = await import("../../../src/handlers/start.js");

describe("handleStart — dispatch orchestration", () => {
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsNonInteractive.mockReturnValue(true); // skip confirm by default
    mockIsCancel.mockReturnValue(false);
    savedExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
  });

  it("refuses the default path without a name — never dispatches", async () => {
    await handleStart(undefined, {});

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringMatching(/requires a work-unit name/i));
    expect(process.exitCode).toBe(1);
    expect(mockResolveStartDispatch).not.toHaveBeenCalled();
  });

  it("routes a nonexistent name to create-new and notes the spawn", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "create-new" });
    mockRunCreateNew.mockResolvedValue({
      ok: true,
      value: { worktreePath: "/repos/myrepo.plan-widget", branch: "plan/widget", wuName: "widget" },
    });

    await handleStart("widget", {});

    expect(mockRunCreateNew).toHaveBeenCalledTimes(1);
    expect((mockNote.mock.calls[0]?.[0] as string)).toContain("plan/widget");
    expect(process.exitCode).toBeUndefined();
  });

  it("routes a backlog stub to graduate, supplying the resolved Class", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "graduate" });
    mockRunGraduate.mockResolvedValue({
      status: "graduated",
      branch: "plan/widget",
      metaPath: ".arc/active/meta-widget.md",
      outcome: { status: "ok", advisories: [] },
    });

    await handleStart("widget", {});

    expect(mockRunGraduate).toHaveBeenCalledTimes(1);
    expect(mockRunGraduate.mock.calls[0]?.[1]).toMatchObject({ name: "widget", cls: "Light", baseBranch: "main" });
    expect((mockNote.mock.calls[0]?.[1] as string)).toBe("Graduated");
  });

  it("routes a parked WU to resume", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "resume" });
    mockRunResume.mockResolvedValue({
      status: "resumed",
      metaPath: ".arc/active/meta-widget.md",
      outcome: { status: "ok", advisories: [] },
    });

    await handleStart("widget", {});

    expect(mockRunResume).toHaveBeenCalledTimes(1);
    expect((mockNote.mock.calls[0]?.[1] as string)).toBe("Resumed");
  });

  it("surfaces a directed refusal and sets the exit code — no arm runs", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "refuse", reason: "`widget` is occupied — already Active." });

    await handleStart("widget", {});

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringMatching(/occupied/));
    expect(process.exitCode).toBe(1);
    expect(mockRunCreateNew).not.toHaveBeenCalled();
    expect(mockRunGraduate).not.toHaveBeenCalled();
    expect(mockRunResume).not.toHaveBeenCalled();
  });

  it("reports an arm refusal — surfaces the reason, sets the exit code, writes no note", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "graduate" });
    mockRunGraduate.mockResolvedValue({ status: "rejected", reason: "requires a resolved `Class`" });

    await handleStart("widget", {});

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringMatching(/class/i));
    expect(process.exitCode).toBe(1);
    expect(mockNote).not.toHaveBeenCalled();
  });

  it("`--here` with no name cold-starts in place, bypassing dispatch", async () => {
    mockRunColdStart.mockResolvedValue({
      ok: true,
      value: { worktreePath: "/repo", branch: "feat/widget", wuName: "widget" },
    });

    await handleStart(undefined, { here: true });

    expect(mockResolveStartDispatch).not.toHaveBeenCalled();
    expect(mockRunColdStart).toHaveBeenCalledTimes(1);
    expect((mockNote.mock.calls[0]?.[1] as string)).toBe("Cold-started");
  });

  it("`--here` against a nonexistent name cold-starts in place (not create-new spawn)", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "create-new" });
    mockRunColdStart.mockResolvedValue({
      ok: true,
      value: { worktreePath: "/repo", branch: "feat/widget", wuName: "widget" },
    });

    await handleStart("widget", { here: true });

    expect(mockRunColdStart).toHaveBeenCalledTimes(1);
    expect(mockRunCreateNew).not.toHaveBeenCalled();
  });

  it("`--here` against a backlog stub graduates in place (no spawn)", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "graduate" });
    mockRunGraduate.mockResolvedValue({
      status: "graduated",
      branch: "plan/widget",
      metaPath: ".arc/active/meta-widget.md",
      outcome: { status: "ok", advisories: [] },
    });

    await handleStart("widget", { here: true });

    expect(mockRunGraduate).toHaveBeenCalledTimes(1);
    expect(mockRunGraduate.mock.calls[0]?.[1]).toMatchObject({ name: "widget", cls: "Light", inPlace: true });
    expect(mockRunGraduate.mock.calls[0]?.[1]).not.toHaveProperty("baseBranch");
  });

  it("aborts on confirm-decline — routes nothing", async () => {
    mockIsNonInteractive.mockReturnValue(false);
    mockConfirm.mockResolvedValue(false);
    mockResolveStartDispatch.mockReturnValue({ arm: "create-new" });

    await handleStart("widget", {});

    expect(mockRunCreateNew).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringMatching(/cancelled/i));
    expect(process.exitCode).toBeUndefined();
  });
});
