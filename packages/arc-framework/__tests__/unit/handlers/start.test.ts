/**
 * Unit tests for `handleStart`'s dispatch + reporting orchestration. The routing
 * core ({@link resolveStartDispatch}) and the per-arm cores are unit-tested
 * separately; these cover the handler-level glue the cores can't: the name-
 * required guard, the `--here` cold-start branch, routing each resolved arm to
 * its core, the directed refusal, confirm gating, and refusal reporting.
 *
 * `@clack/prompts`, the command module, the composed lifecycle index / executor binder,
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
const mockExec = vi.fn();
const mockReadFile = vi.fn(async () => "");
const mockWriteFile = vi.fn();
const mockMkdir = vi.fn();
const mockResolveComposedLifecycleIndex = vi.fn();
const mockBaseReadFile = vi.fn(async () => "");
const mockBaseFs = {
  readdir: vi.fn(async () => []),
  readFile: mockBaseReadFile,
};
const mockCreateProjectViewRefSnapshot = vi.fn();
const mockRefreshBase = vi.fn(async () => "origin/main");

vi.mock("../../../src/commands/start.js", () => ({
  buildCreateNewCeremonyCommitMessage: (name: string) =>
    `chore(arc): start ${name} in planning\n\nContext: meta-${name}.md (activation)\n`,
  buildGraduateCeremonyCommitMessage: (name: string) =>
    `chore(arc): graduate ${name} into active\n\nContext: meta-${name}.md (activation)\n`,
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

vi.mock("../../../src/lib/work-unit/composed-lifecycle-index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/work-unit/composed-lifecycle-index.js")>();
  return {
    ...actual,
    resolveComposedLifecycleIndex: (...args: unknown[]) => mockResolveComposedLifecycleIndex(...args),
  };
});

vi.mock("../../../src/lib/git/refresh-base.js", () => ({
  refreshBase: () => mockRefreshBase(),
}));

vi.mock("../../../src/lib/status/project-view-ref.js", () => ({
  createProjectViewRefSnapshot: (...args: unknown[]) => mockCreateProjectViewRefSnapshot(...args),
}));

vi.mock("../../../src/lib/work-unit/executor-context.js", () => ({
  buildExecutorContext: () => ({}),
}));

vi.mock("../../../src/lib/active/meta-reader.js", () => ({
  parseMetaRecord: () => ({ Class: "Light" }),
}));

vi.mock("../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: async () => ({
    settings: {
      "branch.base": "main",
      "worktree.location_template": "../{repo}-{branch}",
      "worktree.post_create": "",
      "worktree.harness_dirs": ".claude,.codex,.gemini,.opencode",
    },
  }),
}));

vi.mock("../../../src/lib/git/worktree-roster.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/lib/git/worktree-roster.js")>();
  return {
    ...actual,
    resolvePrimaryWorktreePath: async () => "/repos/myrepo",
  };
});

const mockIsNonInteractive = vi.fn(() => true);

vi.mock("../../../src/handlers/shared.js", () => ({
  resolveUserIdentity: async () => "andrew",
  isHandledError: () => false,
  isNonInteractiveEnvironment: () => mockIsNonInteractive(),
  requireArcProjectRoot: () => "/repo",
  resolveCurrentBranchName: async () => "feat/widget",
}));

vi.mock("../../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({
    exec: mockExec,
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  }),
}));

vi.mock("../../../src/lib/paths.js", () => ({ getInternalTemplatePath: () => "/tmpl" }));

const { handleStart } = await import("../../../src/handlers/start.js");

describe("handleStart — dispatch orchestration", () => {
  let savedExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExec.mockImplementation(async (_cmd, args) =>
      args[0] === "rev-parse" && String(args[1]).endsWith("^{commit}")
        ? { stdout: "base123\n", stderr: "" }
        : { stdout: "", stderr: "" },
    );
    mockReadFile.mockResolvedValue("");
    mockBaseReadFile.mockResolvedValue("");
    mockCreateProjectViewRefSnapshot.mockResolvedValue({ ok: true, fs: mockBaseFs });
    mockRefreshBase.mockResolvedValue("origin/main");
    mockMkdir.mockResolvedValue(undefined);
    mockIsNonInteractive.mockReturnValue(true); // skip confirm by default
    mockIsCancel.mockReturnValue(false);
    mockResolveComposedLifecycleIndex.mockResolvedValue({
      index: new Map([
        [
          "widget",
          {
            slug: "widget",
            phase: "Planning",
            location: "planned",
            cohort: null,
            dependsOn: [],
            path: ".arc/backlog/planned/widget/meta-widget.md",
          },
        ],
      ]),
      qualityFacts: { warnings: [], resultMarks: [], bySlug: new Map() },
      worktreePathBySlug: new Map(),
      liveRefs: {},
      reachable: true,
    });
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

    await handleStart("widget", { new: true });

    expect(mockRunCreateNew).toHaveBeenCalledTimes(1);
    expect(mockResolveStartDispatch).toHaveBeenCalledWith(expect.any(Map), "widget", { create: true });
    expect(mockRunCreateNew.mock.calls[0]?.[1]).toMatchObject({ baseRef: "base123" });
    expect((mockNote.mock.calls[0]?.[0] as string)).toContain("plan/widget");
    expect(process.exitCode).toBeUndefined();
  });

  it.each([
    ["0\t0", "synced with origin"],
    ["0\t3", "3 behind origin"],
    ["2\t0", "local base 2 ahead of origin"],
    ["2\t3", "local base diverged from origin: 2 ahead, 3 behind"],
  ])("reports the exact create-new cut base (%s)", async (distance, qualifier) => {
    mockResolveStartDispatch.mockReturnValue({ arm: "create-new" });
    mockRunCreateNew.mockResolvedValue({
      ok: true,
      value: { worktreePath: "/repos/myrepo.plan-widget", branch: "plan/widget", wuName: "widget" },
    });
    mockExec.mockImplementation(async (_cmd, args) => {
      if (args[0] === "rev-parse" && String(args[1]).endsWith("^{commit}")) {
        return { stdout: "base123\n", stderr: "" };
      }
      if (args[0] === "rev-list") return { stdout: distance, stderr: "" };
      return { stdout: "", stderr: "" };
    });

    await handleStart("widget", { new: true });

    expect(mockLog.info).toHaveBeenCalledWith(`Cut from: main @ base123 (${qualifier})`);
  });

  it("reports a local-base fallback when origin cannot supply the cut", async () => {
    mockRefreshBase.mockResolvedValue("main");
    mockResolveStartDispatch.mockReturnValue({ arm: "create-new" });
    mockRunCreateNew.mockResolvedValue({
      ok: true,
      value: { worktreePath: "/repos/myrepo.plan-widget", branch: "plan/widget", wuName: "widget" },
    });

    await handleStart("widget", { new: true });

    expect(mockLog.info).toHaveBeenCalledWith(
      "Cut from: main @ base123 (local base; origin unavailable)",
    );
  });

  it("does not block the start when the origin relationship cannot be read", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "create-new" });
    mockRunCreateNew.mockResolvedValue({
      ok: true,
      value: { worktreePath: "/repos/myrepo.plan-widget", branch: "plan/widget", wuName: "widget" },
    });
    mockExec.mockImplementation(async (_cmd, args) => {
      if (args[0] === "rev-parse" && String(args[1]).endsWith("^{commit}")) {
        return { stdout: "base123\n", stderr: "" };
      }
      if (args[0] === "rev-list") throw new Error("relationship unavailable");
      return { stdout: "", stderr: "" };
    });

    await handleStart("widget", { new: true });

    expect(mockLog.info).toHaveBeenCalledWith(
      "Cut from: main @ base123 (origin relation unavailable)",
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("shell-completes a create-new start with a deterministic commit and push", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "create-new" });
    mockRunCreateNew.mockResolvedValue({
      ok: true,
      value: { worktreePath: "/repos/myrepo.plan-widget", branch: "plan/widget", wuName: "widget" },
    });
    mockExec.mockImplementation(async (_cmd, args) =>
      args[0] === "rev-parse" ? { stdout: "abc1234\n", stderr: "" } : { stdout: "", stderr: "" },
    );

    await handleStart("widget", { new: true });

    expect(mockExec).toHaveBeenCalledWith(
      "git",
      ["add", ".arc/active/meta-widget.md", ".arc/backlog/ROADMAP.md"],
      { cwd: "/repos/myrepo.plan-widget" },
    );
    expect(mockExec).toHaveBeenCalledWith(
      "git",
      [
        "commit",
        "-m",
        "chore(arc): start widget in planning",
        "-m",
        "Context: meta-widget.md (activation)",
      ],
      { cwd: "/repos/myrepo.plan-widget" },
    );
    expect(mockExec).toHaveBeenCalledWith(
      "git",
      ["push", "-u", "origin", "plan/widget"],
      { cwd: "/repos/myrepo.plan-widget" },
    );
    expect(mockLog.info).toHaveBeenCalledWith("Committed abc1234 and pushed plan/widget.");
    expect(mockNote).toHaveBeenCalledWith(
      expect.stringContaining(
        "Primary — start a fresh session in `/repos/myrepo.plan-widget` with your harness of choice, " +
          "then invoke `arc-session`",
      ),
      "Next session",
    );
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
    expect(mockRunGraduate.mock.calls[0]?.[1]).toMatchObject({ name: "widget", cls: "Light", baseBranch: "base123" });
    expect(mockResolveComposedLifecycleIndex).toHaveBeenCalledWith(expect.objectContaining({
      fs: mockBaseFs,
      oracle: expect.objectContaining({ baseBranch: "main" }),
    }));
    expect(mockBaseReadFile).toHaveBeenCalledWith("/repo/.arc/backlog/planned/widget/meta-widget.md");
    expect((mockNote.mock.calls[0]?.[1] as string)).toBe("Graduated");
  });

  it("refuses a --class that conflicts with the meta's resolved Class — no arm runs", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "graduate" });

    // The mocked meta records `Class: Light`; the flag disagrees.
    await handleStart("widget", { class: "Heavy" });

    expect(mockRunGraduate).not.toHaveBeenCalled();
    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("conflicts with the meta's recorded Class"));
    expect(process.exitCode).toBe(1);
  });

  it("accepts a --class that matches the meta's resolved Class — no persistence write requested", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "graduate" });
    mockRunGraduate.mockResolvedValue({
      status: "graduated",
      branch: "plan/widget",
      metaPath: ".arc/active/meta-widget.md",
      outcome: { status: "ok", advisories: [] },
    });

    await handleStart("widget", { class: "Light" });

    expect(mockRunGraduate).toHaveBeenCalledTimes(1);
    expect(mockRunGraduate.mock.calls[0]?.[1]).toMatchObject({ name: "widget", cls: "Light", writeClass: false });
    expect(process.exitCode).toBeUndefined();
  });

  it("shell-completes a graduate spawn with a deterministic commit and push in the spawned worktree", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "graduate" });
    mockRunGraduate.mockResolvedValue({
      status: "graduated",
      branch: "plan/widget",
      metaPath: ".arc/active/meta-widget.md",
      worktreePath: "/repos/myrepo.plan-widget",
      outcome: { status: "ok", advisories: [] },
    });
    mockExec.mockImplementation(async (_cmd, args) =>
      args[0] === "rev-parse" ? { stdout: "def5678\n", stderr: "" } : { stdout: "", stderr: "" },
    );

    await handleStart("widget", {});

    expect(mockExec).toHaveBeenCalledWith(
      "git",
      ["add", ".arc/active/meta-widget.md", ".arc/backlog/ROADMAP.md"],
      { cwd: "/repos/myrepo.plan-widget" },
    );
    expect(mockExec).toHaveBeenCalledWith(
      "git",
      [
        "commit",
        "-m",
        "chore(arc): graduate widget into active",
        "-m",
        "Context: meta-widget.md (activation)",
      ],
      { cwd: "/repos/myrepo.plan-widget" },
    );
    expect(mockExec).toHaveBeenCalledWith(
      "git",
      ["push", "-u", "origin", "plan/widget"],
      { cwd: "/repos/myrepo.plan-widget" },
    );
    expect(mockLog.info).toHaveBeenCalledWith("Committed def5678 and pushed plan/widget.");
    expect(mockNote).toHaveBeenCalledWith(
      expect.stringContaining(
        "Primary — start a fresh session in `/repos/myrepo.plan-widget` with your harness of choice, " +
          "then invoke `arc-session`",
      ),
      "Next session",
    );
    expect(process.exitCode).toBeUndefined();
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

  it("`--here` against a parked WU resumes in place (no spawn)", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "resume" });
    mockRunResume.mockResolvedValue({
      status: "resumed",
      metaPath: ".arc/active/meta-widget.md",
      outcome: { status: "ok", advisories: [] },
    });

    await handleStart("widget", { here: true });

    expect(mockRunResume).toHaveBeenCalledTimes(1);
    expect(mockRunResume.mock.calls[0]?.[1]).toMatchObject({ name: "widget", inPlace: true });
    expect((mockNote.mock.calls[0]?.[1] as string)).toBe("Resumed (in place)");
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

  it.each([
    ["create-new", "non-interactive", {}, true],
    ["graduate", "non-interactive", {}, true],
    ["create-new", "--yes", { yes: true }, false],
    ["graduate", "--yes", { yes: true }, false],
  ] as const)("refuses an indeterminate %s minting arm under %s execution", async (
    arm,
    _label,
    opts,
    nonInteractive,
  ) => {
    mockIsNonInteractive.mockReturnValue(nonInteractive);
    mockResolveStartDispatch.mockReturnValue({ arm });
    mockResolveComposedLifecycleIndex.mockResolvedValue({
      index: new Map(),
      qualityFacts: { warnings: [], resultMarks: ["indeterminate"], bySlug: new Map() },
      worktreePathBySlug: new Map(),
      liveRefs: {},
      reachable: false,
    });

    await handleStart("widget", opts);

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringMatching(/cannot safely start.*indeterminate/is));
    expect(process.exitCode).toBe(1);
    expect(mockRunCreateNew).not.toHaveBeenCalled();
    expect(mockRunGraduate).not.toHaveBeenCalled();
  });

  it("proceeds through an indeterminate minting arm only after interactive confirmation", async () => {
    mockIsNonInteractive.mockReturnValue(false);
    mockConfirm.mockResolvedValue(true);
    mockResolveStartDispatch.mockReturnValue({ arm: "create-new" });
    mockResolveComposedLifecycleIndex.mockResolvedValue({
      index: new Map(),
      qualityFacts: { warnings: [], resultMarks: ["indeterminate"], bySlug: new Map() },
      worktreePathBySlug: new Map(),
      liveRefs: {},
      reachable: false,
    });
    mockRunCreateNew.mockResolvedValue({
      ok: true,
      value: { worktreePath: "/repos/myrepo.plan-widget", branch: "plan/widget", wuName: "widget" },
    });

    await handleStart("widget", {});

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/indeterminate/i) }));
    expect(mockRunCreateNew).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  it("cancels cleanly when interactive indeterminacy confirmation is declined", async () => {
    mockIsNonInteractive.mockReturnValue(false);
    mockConfirm.mockResolvedValue(false);
    mockResolveStartDispatch.mockReturnValue({ arm: "graduate" });
    mockResolveComposedLifecycleIndex.mockResolvedValue({
      index: new Map(),
      qualityFacts: { warnings: [], resultMarks: ["indeterminate"], bySlug: new Map() },
      worktreePathBySlug: new Map(),
      liveRefs: {},
      reachable: false,
    });

    await handleStart("widget", {});

    expect(mockRunGraduate).not.toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringMatching(/cancelled/i));
    expect(process.exitCode).toBeUndefined();
  });

  it("keeps an explicit --here cold-start available when live truth is indeterminate", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "create-new" });
    mockResolveComposedLifecycleIndex.mockResolvedValue({
      index: new Map(),
      qualityFacts: { warnings: [], resultMarks: ["indeterminate"], bySlug: new Map() },
      worktreePathBySlug: new Map(),
      liveRefs: {},
      reachable: false,
    });
    mockRunColdStart.mockResolvedValue({
      ok: true,
      value: { worktreePath: "/repo", branch: "feat/widget", wuName: "widget" },
    });

    await handleStart("widget", { here: true, yes: true });

    expect(mockRunColdStart).toHaveBeenCalledTimes(1);
    expect(mockLog.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it("refuses an indeterminate in-place graduation even with --yes", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "graduate" });
    mockResolveComposedLifecycleIndex.mockResolvedValue({
      index: new Map(),
      qualityFacts: { warnings: [], resultMarks: ["indeterminate"], bySlug: new Map() },
      worktreePathBySlug: new Map(),
      liveRefs: {},
      reachable: false,
    });

    await handleStart("widget", { here: true, yes: true });

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringMatching(/cannot safely start.*indeterminate/is));
    expect(process.exitCode).toBe(1);
    expect(mockRunGraduate).not.toHaveBeenCalled();
    expect(mockRunColdStart).not.toHaveBeenCalled();
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

  it("`--here` with a whitespace-only name treats it as omitted and cold-starts in place", async () => {
    mockRunColdStart.mockResolvedValue({
      ok: true,
      value: { worktreePath: "/repo", branch: "feat/widget", wuName: "widget" },
    });

    await handleStart("   ", { here: true });

    expect(mockResolveStartDispatch).not.toHaveBeenCalled();
    expect(mockRunColdStart).toHaveBeenCalledTimes(1);
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

  it("refuses an in-place graduation when the invoking meta differs from base", async () => {
    mockResolveStartDispatch.mockReturnValue({ arm: "graduate" });
    mockBaseReadFile.mockResolvedValue("base meta");
    mockReadFile.mockResolvedValue("stale meta");

    await handleStart("widget", { here: true });

    expect(mockRunGraduate).not.toHaveBeenCalled();
    expect(mockLog.error).toHaveBeenCalledWith(expect.stringMatching(/differs from the base snapshot/iu));
    expect(process.exitCode).toBe(1);
  });

  it("fails closed when the base lifecycle snapshot is unreadable", async () => {
    mockCreateProjectViewRefSnapshot.mockResolvedValue({ ok: false, reason: "could not read base lifecycle tree" });

    await handleStart("widget", { new: true });

    expect(mockResolveStartDispatch).not.toHaveBeenCalled();
    expect(mockRunCreateNew).not.toHaveBeenCalled();
    expect(mockLog.error).toHaveBeenCalledWith("could not read base lifecycle tree");
    expect(process.exitCode).toBe(1);
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

  it("names the commit and push side effect in spawned-start confirmation prompts", async () => {
    mockIsNonInteractive.mockReturnValue(false);
    mockConfirm.mockResolvedValue(false);
    mockResolveStartDispatch.mockReturnValue({ arm: "graduate" });

    await handleStart("widget", {});

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/commit and push the start ceremony/i),
      }),
    );
    expect(mockRunGraduate).not.toHaveBeenCalled();
  });
});
