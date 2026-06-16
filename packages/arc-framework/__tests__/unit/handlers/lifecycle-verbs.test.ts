/**
 * Unit tests for the lifecycle verb handlers — the dispatch + refusal glue around
 * each `run*` transition. The dispatch core, the verbs, and the preamble seams
 * (identity, config, executor build, worktree resolution) are mocked at the module
 * seam; these assert each command dispatches its transition with the assembled
 * inputs and refuses (without dispatching) when a required input is absent.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockLogError = vi.fn();
const mockLogInfo = vi.fn();
const mockNote = vi.fn();
vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: (...a: unknown[]) => mockNote(...a),
  log: { error: (...a: unknown[]) => mockLogError(...a), info: (...a: unknown[]) => mockLogInfo(...a) },
}));

vi.mock("../../../src/handlers/shared.js", () => ({
  resolveUserIdentity: async () => "andrew",
  requireArcProjectRoot: () => "/repo",
  isHandledError: () => false,
}));

vi.mock("../../../src/lib/io-context.js", () => ({
  createUserIOContext: () => ({
    exec: vi.fn(),
    readFile: vi.fn(async () => "meta"),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  }),
}));

vi.mock("../../../src/lib/config/status-reader.js", () => ({
  readConfigSettings: async () => ({
    settings: { "team.mode": "false", "worktree.location_template": "../{repo}-{branch}" },
  }),
}));

vi.mock("../../../src/lib/work-unit/executor-context.js", () => ({ buildExecutorContext: () => ({}) }));
vi.mock("../../../src/lib/paths.js", () => ({ getInternalTemplatePath: () => "/tpl" }));

vi.mock("../../../src/lib/git/worktree-roster.js", () => ({
  resolvePrimaryWorktreePath: async () => "/repos/myrepo",
  resolveWorktreePathsByBranch: async () => new Map<string, string>(),
  runWorktreeRoster: async () => ({ entries: [], warnings: [] }),
}));

vi.mock("../../../src/lib/active/meta-reader.js", () => ({
  parseMetaRecord: () => ({ Branch: "feat/foo" }),
  readActiveMetaCandidates: async () => ({ candidates: [{ filename: "meta-foo.md" }] }),
}));

vi.mock("../../../src/lib/work-unit/lifecycle-index.js", () => ({ buildLifecycleIndex: async () => new Map() }));

const mockRunStub = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/stub.js", () => ({ runStub: (...a: unknown[]) => mockRunStub(...a) }));

const mockRunPromote = vi.fn();
const mockRunDemote = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/promote-demote.js", () => ({
  runPromote: (...a: unknown[]) => mockRunPromote(...a),
  runDemote: (...a: unknown[]) => mockRunDemote(...a),
}));

const mockRunPark = vi.fn();
const mockRunResume = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/park-resume.js", () => ({
  runPark: (...a: unknown[]) => mockRunPark(...a),
  runResume: (...a: unknown[]) => mockRunResume(...a),
}));

const mockRunActivate = vi.fn();
const mockRunDeactivate = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/activate-deactivate.js", () => ({
  runActivate: (...a: unknown[]) => mockRunActivate(...a),
  runDeactivate: (...a: unknown[]) => mockRunDeactivate(...a),
}));

const mockRunAbandon = vi.fn();
const mockPlanAbandon = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/abandon.js", () => ({
  runAbandon: (...a: unknown[]) => mockRunAbandon(...a),
  planAbandon: (...a: unknown[]) => mockPlanAbandon(...a),
}));

const mockRunReopen = vi.fn();
vi.mock("../../../src/lib/work-unit/verbs/reopen.js", () => ({
  runReopen: (...a: unknown[]) => mockRunReopen(...a),
}));

// The `gh`-backed PR source feeds the `pr-unmerged` guard input; the factory returns
// the source fn, so handler tests drive merge state (and gh-failure degradation) by
// resolving / rejecting that fn.
const mockPrSource = vi.fn();
const mockCreateGhWorkUnitPrSource = vi.fn();
vi.mock("../../../src/lib/session-init/work-unit-pr-source.js", () => ({
  createGhWorkUnitPrSource: (...a: unknown[]) => mockCreateGhWorkUnitPrSource(...a),
}));

// The slug→state resolver feeds the handler's impact-plan composition; keep the
// rest of the resolver real (the dispatch core's `deriveState` rides on it).
const mockResolveSlugState = vi.fn();
vi.mock("../../../src/lib/work-unit/lifecycle-resolver.js", async (orig) => ({
  ...(await orig<typeof import("../../../src/lib/work-unit/lifecycle-resolver.js")>()),
  resolveSlugState: (...a: unknown[]) => mockResolveSlugState(...a),
}));

const {
  handleStub,
  handlePromote,
  handleDemote,
  handlePark,
  handleResume,
  handleActivate,
  handleDeactivate,
  handleAbandon,
  handleReopen,
} = await import("../../../src/handlers/lifecycle.js");

const okOutcome = { status: "ok", advisories: [] as string[] };

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
  mockRunStub.mockResolvedValue({ status: "scaffolded", outcome: okOutcome, metaPath: ".arc/backlog/provisional/foo/meta-foo.md" });
  mockRunPromote.mockResolvedValue({ status: "moved", outcome: okOutcome, metaPath: ".arc/backlog/planned/foo/meta-foo.md" });
  mockRunDemote.mockResolvedValue({ status: "moved", outcome: okOutcome, metaPath: ".arc/backlog/provisional/foo/meta-foo.md" });
  mockRunPark.mockResolvedValue({ status: "parked", outcome: okOutcome, metaPath: ".arc/backlog/planned/foo/meta-foo.md" });
  mockRunResume.mockResolvedValue({ status: "resumed", outcome: okOutcome, metaPath: ".arc/active/meta-foo.md" });
  mockRunActivate.mockResolvedValue({ status: "activated", outcome: okOutcome, metaPath: ".arc/active/meta-foo.md" });
  mockRunDeactivate.mockResolvedValue({ status: "deactivated", outcome: okOutcome, metaPath: ".arc/active/meta-foo.md" });
  mockRunAbandon.mockResolvedValue({ status: "abandoned", outcome: okOutcome });
  mockResolveSlugState.mockReturnValue("active");
  mockPlanAbandon.mockReturnValue({ legal: true, lines: ["Artifacts: remove the work unit's artifact set"] });
  mockRunReopen.mockResolvedValue({ status: "reopened", outcome: okOutcome, metaPath: ".arc/active/meta-foo.md" });
  mockCreateGhWorkUnitPrSource.mockReturnValue(mockPrSource);
  mockPrSource.mockResolvedValue(new Map([["feat/foo", { merged: false }]]));
});

afterEach(() => {
  process.exitCode = undefined;
});

describe("handleStub", () => {
  it("dispatches runStub with the assembled inputs", async () => {
    await handleStub("foo", { commitment: "provisional", priority: "P1", origin: "#42" });
    expect(mockRunStub).toHaveBeenCalledTimes(1);
    expect(mockRunStub.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      commitment: "provisional",
      priority: "P1",
      owner: "andrew",
      origin: "#42",
    });
  });

  it("narrows an invalid commitment to undefined (runStub then refuses)", async () => {
    await handleStub("foo", { commitment: "bogus", priority: "P1" });
    expect(mockRunStub.mock.calls[0]?.[1]).toMatchObject({ commitment: undefined });
  });

  it("refuses without a name and never dispatches", async () => {
    await handleStub(undefined, { commitment: "provisional", priority: "P1" });
    expect(mockRunStub).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handlePromote / handleDemote", () => {
  it("promote dispatches runPromote for the slug", async () => {
    await handlePromote("foo");
    expect(mockRunPromote).toHaveBeenCalledTimes(1);
    expect(mockRunPromote.mock.calls[0]?.[1]).toEqual({ name: "foo" });
  });

  it("demote dispatches runDemote for the slug", async () => {
    await handleDemote("foo");
    expect(mockRunDemote).toHaveBeenCalledTimes(1);
    expect(mockRunDemote.mock.calls[0]?.[1]).toEqual({ name: "foo" });
  });

  it("a bare slug-required verb surfaces the candidate list and never dispatches", async () => {
    await handlePromote(undefined);
    expect(mockRunPromote).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handlePark", () => {
  it("dispatches runPark with the reason, resolved worktree path, and current locus", async () => {
    await handlePark("foo", { reason: "shelving for a higher-priority pivot" });
    expect(mockRunPark).toHaveBeenCalledTimes(1);
    expect(mockRunPark.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      reason: "shelving for a higher-priority pivot",
      worktreePath: "/repo",
      currentLocus: "/repo",
    });
  });
});

describe("handleResume", () => {
  it("dispatches runResume with the spawn config", async () => {
    await handleResume("foo");
    expect(mockRunResume).toHaveBeenCalledTimes(1);
    expect(mockRunResume.mock.calls[0]?.[1]).toMatchObject({
      name: "foo",
      locationTemplate: "../{repo}-{branch}",
      repo: "myrepo",
      spawningIdentity: "andrew",
    });
  });

  it("dispatches an in-place runResume under `--here` (no spawn config)", async () => {
    await handleResume("foo", { here: true });
    expect(mockRunResume).toHaveBeenCalledTimes(1);
    expect(mockRunResume.mock.calls[0]?.[1]).toEqual({ name: "foo", inPlace: true });
  });
});

describe("handleActivate", () => {
  it("dispatches runActivate, composing the working branch from --type and the slug", async () => {
    await handleActivate("foo", { type: "feat", task: "Task 1.1 — start", action: "Begin the loop" });
    expect(mockRunActivate).toHaveBeenCalledTimes(1);
    expect(mockRunActivate.mock.calls[0]?.[1]).toEqual({
      name: "foo",
      toBranch: "feat/foo",
      nextTask: "Task 1.1 — start",
      nextAction: "Begin the loop",
    });
  });

  it("refuses without the branch type / orientation inputs and never dispatches", async () => {
    await handleActivate("foo", { type: "feat" });
    expect(mockRunActivate).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handleDeactivate", () => {
  it("dispatches runDeactivate for the slug", async () => {
    await handleDeactivate("foo");
    expect(mockRunDeactivate).toHaveBeenCalledTimes(1);
    expect(mockRunDeactivate.mock.calls[0]?.[1]).toEqual({ name: "foo" });
  });
});

describe("handleAbandon", () => {
  it("prints the impact plan and refuses without --yes, never dispatching the cascade", async () => {
    await handleAbandon("foo", {});
    expect(mockNote).toHaveBeenCalledTimes(1);
    expect(mockRunAbandon).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("dispatches runAbandon with the confirmation flag when --yes is given", async () => {
    await handleAbandon("foo", { yes: true });
    expect(mockNote.mock.calls[0]?.[1]).toContain("impact plan");
    expect(mockRunAbandon).toHaveBeenCalledTimes(1);
    expect(mockRunAbandon.mock.calls[0]?.[1]).toMatchObject({ name: "foo", confirmed: true });
  });

  it("refuses an illegal source state up front, printing no plan and never dispatching", async () => {
    mockResolveSlugState.mockReturnValue("integrating");
    mockPlanAbandon.mockReturnValue({ legal: false, lines: [] });
    await handleAbandon("foo", { yes: true });
    expect(mockNote).not.toHaveBeenCalled();
    expect(mockRunAbandon).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("a bare invocation (no slug) surfaces the candidate list and never dispatches", async () => {
    await handleAbandon(undefined, {});
    expect(mockRunAbandon).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});

describe("handleReopen", () => {
  it("reopens an unmerged WU, forwarding the resolved merge fact and the default close mode", async () => {
    await handleReopen("foo", {});
    expect(mockRunReopen).toHaveBeenCalledTimes(1);
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({ name: "foo", prMerged: false, withdrawMode: "close" });
  });

  it("forwards the draft withdrawal mode under --keep-pr", async () => {
    await handleReopen("foo", { keepPr: true });
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({ withdrawMode: "draft" });
  });

  it("forwards a merged PR fact and surfaces the resulting rejection", async () => {
    mockPrSource.mockResolvedValueOnce(new Map([["feat/foo", { merged: true }]]));
    mockRunReopen.mockResolvedValueOnce({ status: "rejected", reason: "the PR has already merged — back out via a new WU." });
    await handleReopen("foo", {});
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({ prMerged: true });
    expect(mockLogError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("degrades the merge fact to undefined when gh is unavailable, still reopening", async () => {
    mockPrSource.mockRejectedValueOnce(new Error("gh: command not found"));
    await handleReopen("foo", {});
    expect(mockRunReopen).toHaveBeenCalledTimes(1);
    expect(mockRunReopen.mock.calls[0]?.[1]?.prMerged).toBeUndefined();
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({ name: "foo", withdrawMode: "close" });
  });

  it("defaults a bare invocation to the current worktree's WU", async () => {
    await handleReopen(undefined, {});
    expect(mockRunReopen).toHaveBeenCalledTimes(1);
    expect(mockRunReopen.mock.calls[0]?.[1]).toMatchObject({ name: "foo" });
  });
});
