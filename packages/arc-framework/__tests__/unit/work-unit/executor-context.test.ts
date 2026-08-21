/**
 * Unit tests for the executor-context binder's lifecycle ceremony seams.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { UserIOContext } from "../../../src/commands/user/types.js";

const mockBuildLifecycleIndex = vi.fn();
vi.mock("../../../src/lib/work-unit/lifecycle-index.js", () => ({
  buildLifecycleIndex: (...args: unknown[]) => mockBuildLifecycleIndex(...args),
}));

const mockPrepareCurrentWuReconcile = vi.fn();
const mockApplyPreparedCurrentWuReconcile = vi.fn();
vi.mock("../../../src/lib/work-unit/side-effects/discharge-dep-edges.js", () => ({
  prepareCurrentWuReconcile: (...args: unknown[]) => mockPrepareCurrentWuReconcile(...args),
  applyPreparedCurrentWuReconcile: (...args: unknown[]) => mockApplyPreparedCurrentWuReconcile(...args),
}));

const mockWithdrawPr = vi.fn();
vi.mock("../../../src/lib/work-unit/side-effects/withdraw-pr.js", () => ({
  withdrawPr: (...args: unknown[]) => mockWithdrawPr(...args),
}));

const mockRunUserOpen = vi.fn();
vi.mock("../../../src/commands/user/open.js", () => ({
  runUserOpen: (...args: unknown[]) => mockRunUserOpen(...args),
}));

const mockRunUserClose = vi.fn();
vi.mock("../../../src/commands/user/close.js", () => ({
  runUserClose: (...args: unknown[]) => mockRunUserClose(...args),
}));

const { buildExecutorContext } = await import("../../../src/lib/work-unit/executor-context.js");

/** A meta with the given Branch value, for the branch-resolution read. */
function metaWithBranch(branch: string): string {
  return (
    `# Metadata: foo\n\n` +
    `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
    `|-----------|-----------|------------|-----------|--------------|\n` +
    `| \`Integrating\` | \`andrew\` | \`${branch}\` | \`Novel\` | \`P1\` |\n\n` +
    `- **Next Action:** continue.\n\n---\n`
  );
}

/** A minimally complete lifecycle meta for current-workflow mutation coverage. */
function metaWithWorkflow(workflow: string): string {
  return metaWithBranch("feat/foo").replace(
    "- **Next Action:** continue.",
    `- **Current Workflow:** \`${workflow}\`\n- **Next Action:** continue.`,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mockBuildLifecycleIndex.mockResolvedValue(new Map());
  mockPrepareCurrentWuReconcile.mockResolvedValue({ status: "clean", prepared: { slug: "foo", plan: {}, edits: [] } });
  mockApplyPreparedCurrentWuReconcile.mockResolvedValue({
    status: "clean",
    prepared: { slug: "foo", plan: {}, edits: [] },
  });
  mockWithdrawPr.mockResolvedValue(undefined);
  mockRunUserOpen.mockResolvedValue(undefined);
  mockRunUserClose.mockResolvedValue(undefined);
});

function fakeIo(): UserIOContext {
  return {
    exec: vi.fn(async () => ({ stdout: "", stderr: "", code: 0 })),
    readFile: vi.fn(async () => "meta"),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    readDir: vi.fn(async () => []),
    writeNote: vi.fn(async () => undefined),
    readNote: vi.fn(async () => null),
  } as unknown as UserIOContext;
}

function buildCtx(identity: string | null = "andrew") {
  return buildExecutorContext({
    cwd: "/repo",
    io: fakeIo(),
    identity,
    teamMode: false,
    internalTemplateDir: "/tpl",
  });
}

/** Build a context whose meta read returns `metaContent` — for the branch-resolving side-effects. */
function buildCtxReadingMeta(metaContent: string) {
  const io = fakeIo();
  io.readFile = vi.fn(async () => metaContent);
  return buildExecutorContext({
    cwd: "/repo",
    io,
    identity: "andrew",
    teamMode: false,
    internalTemplateDir: "/tpl",
  });
}

const REOPEN_CTX = {
  cwd: "/repo",
  slug: "foo",
  from: { phase: "Integrating", location: "active" },
  to: { phase: "Active", location: "active" },
} as const;

describe("buildExecutorContext — current-WU reconcile binding", () => {
  it("prepares through the lifecycle and receipt boundaries", async () => {
    const ctx = buildCtx();

    await ctx.currentWuReconcile.prepare({
      slug: "foo",
      metaPath: ".arc/active/meta-foo.md",
    });

    expect(mockBuildLifecycleIndex).toHaveBeenCalledOnce();
    expect(mockPrepareCurrentWuReconcile).toHaveBeenCalledWith(expect.anything(), {
      slug: "foo",
      metaPath: ".arc/active/meta-foo.md",
    });
  });

  it("applies the caller's prepared plan without replanning", async () => {
    const ctx = buildCtx();
    const prepared = { slug: "foo", plan: {}, edits: [] };

    await ctx.currentWuReconcile.apply(prepared as never);

    expect(mockApplyPreparedCurrentWuReconcile).toHaveBeenCalledWith(expect.anything(), prepared);
    expect(mockPrepareCurrentWuReconcile).not.toHaveBeenCalled();
  });

  it("allows identity-independent worktree reconciliation when identity is unresolved", async () => {
    const ctx = buildCtx(null);

    await expect(ctx.reconcileWorkUnitWorktree?.({
      mutation: "spawn",
      inPlace: true,
      branch: "feat/foo",
      wuName: "foo",
      createBranch: false,
      deferCheckout: true,
    })).resolves.toMatchObject({ mutation: "spawn", branch: "feat/foo" });
  });
});

describe("buildExecutorContext — current-workflow consistency", () => {
  it("refuses an invalid Integrating workflow before writing", async () => {
    const io = fakeIo();
    io.readFile = vi.fn(async () => metaWithWorkflow("integrate-work-unit"));
    const ctx = buildExecutorContext({
      cwd: "/repo",
      io,
      identity: "andrew",
      teamMode: false,
      internalTemplateDir: "/tpl",
    });

    await expect(ctx.writeCurrentWorkflowField?.(".arc/active/meta-foo.md", "prepare-work-unit"))
      .rejects.toThrow(/Integrating|integrate-work-unit/u);
    expect(io.writeFile).not.toHaveBeenCalled();
  });

  it("writes a workflow valid for the lifecycle phase", async () => {
    const io = fakeIo();
    io.readFile = vi.fn(async () => metaWithWorkflow("prepare-work-unit"));
    const ctx = buildExecutorContext({
      cwd: "/repo",
      io,
      identity: "andrew",
      teamMode: false,
      internalTemplateDir: "/tpl",
    });

    await ctx.writeCurrentWorkflowField?.(".arc/active/meta-foo.md", "integrate-work-unit");
    expect(io.writeFile).toHaveBeenCalledWith(
      "/repo/.arc/active/meta-foo.md",
      expect.stringContaining("- **Current Workflow:** `integrate-work-unit`"),
    );
  });

  it("writes an intentional source-workflow recovery marker after the phase has moved", async () => {
    const io = fakeIo();
    io.readFile = vi.fn(async () => metaWithWorkflow("integrate-work-unit"));
    const ctx = buildExecutorContext({
      cwd: "/repo",
      io,
      identity: "andrew",
      teamMode: false,
      internalTemplateDir: "/tpl",
    });

    await ctx.writeCurrentWorkflowRecoveryMarker?.(
      ".arc/active/meta-foo.md",
      "prepare-work-unit",
    );
    expect(io.writeFile).toHaveBeenCalledWith(
      "/repo/.arc/active/meta-foo.md",
      expect.stringContaining("- **Current Workflow:** `prepare-work-unit`"),
    );
  });

  it("writes the inverse recovery marker after reopen has moved back to Active", async () => {
    const io = fakeIo();
    io.readFile = vi.fn(async () => metaWithWorkflow("prepare-work-unit").replace("Integrating", "Active"));
    const ctx = buildExecutorContext({
      cwd: "/repo",
      io,
      identity: "andrew",
      teamMode: false,
      internalTemplateDir: "/tpl",
    });

    await ctx.writeCurrentWorkflowRecoveryMarker?.(
      ".arc/active/meta-foo.md",
      "integrate-work-unit",
    );
    expect(io.writeFile).toHaveBeenCalledWith(
      "/repo/.arc/active/meta-foo.md",
      expect.stringContaining("- **Current Workflow:** `integrate-work-unit`"),
    );
  });
});

describe("buildExecutorContext — withdraw-pr binding", () => {
  it("registers the withdraw-pr side-effect handler", () => {
    expect(buildCtx().sideEffects?.["withdraw-pr"]).toBeDefined();
  });

  it("withdraws via the WU's resolved branch, defaulting to close mode", async () => {
    const handler = buildCtxReadingMeta(metaWithBranch("feat/foo")).sideEffects?.["withdraw-pr"];
    if (handler === undefined) throw new Error("withdraw-pr handler was not registered");

    const advisory = await handler({ ...REOPEN_CTX, inputs: {} });

    expect(mockWithdrawPr).toHaveBeenCalledWith(expect.anything(), { branch: "feat/foo", mode: "close" });
    expect(advisory).toBeUndefined();
  });

  it("forwards the draft withdrawal mode from inputs", async () => {
    const handler = buildCtxReadingMeta(metaWithBranch("feat/foo")).sideEffects?.["withdraw-pr"];
    if (handler === undefined) throw new Error("withdraw-pr handler was not registered");

    await handler({ ...REOPEN_CTX, inputs: { prWithdrawMode: "draft" } });

    expect(mockWithdrawPr).toHaveBeenCalledWith(expect.anything(), { branch: "feat/foo", mode: "draft" });
  });

  it("degrades to an advisory (never throws) when the gh op fails", async () => {
    mockWithdrawPr.mockRejectedValueOnce(new Error("gh: command not found"));
    const handler = buildCtxReadingMeta(metaWithBranch("feat/foo")).sideEffects?.["withdraw-pr"];
    if (handler === undefined) throw new Error("withdraw-pr handler was not registered");

    const advisory = await handler({ ...REOPEN_CTX, inputs: {} });

    expect(advisory).toMatch(/manual|gh|withdraw/i);
  });

  it("surfaces an advisory and never calls gh when the WU has no recorded branch", async () => {
    const handler = buildCtxReadingMeta(metaWithBranch("[none]")).sideEffects?.["withdraw-pr"];
    if (handler === undefined) throw new Error("withdraw-pr handler was not registered");

    const advisory = await handler({ ...REOPEN_CTX, inputs: {} });

    expect(mockWithdrawPr).not.toHaveBeenCalled();
    expect(advisory).toMatch(/branch/i);
  });
});

describe("buildExecutorContext — user-workspace binding", () => {
  const OPEN_CTX = {
    cwd: "/repo",
    slug: "foo",
    from: { phase: "Planning", location: "active" },
    to: { phase: "Active", location: "active" },
    inputs: {},
  } as const;
  const CLOSE_CTX = {
    cwd: "/repo",
    slug: "foo",
    from: { phase: "Active", location: "active" },
    to: { phase: "Active", location: "planned" },
    inputs: {},
  } as const;

  it("opens the workspace on a move into an active location (identity present)", async () => {
    const handler = buildCtx("andrew").sideEffects?.["user-workspace"];
    if (handler === undefined) throw new Error("user-workspace handler was not registered");

    await handler(OPEN_CTX);

    expect(mockRunUserOpen).toHaveBeenCalledWith(expect.objectContaining({ identity: "andrew", wuName: "foo" }));
    expect(mockRunUserClose).not.toHaveBeenCalled();
  });

  it("passes a transition-supplied SESSION-NOTES seed when opening the workspace", async () => {
    const handler = buildCtx("andrew").sideEffects?.["user-workspace"];
    if (handler === undefined) throw new Error("user-workspace handler was not registered");

    await handler({ ...OPEN_CTX, inputs: { sessionNotesSeed: "# seeded\n" } });

    expect(mockRunUserOpen).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "andrew", wuName: "foo", sessionNotesSeed: "# seeded\n" }),
    );
  });

  it("closes the workspace on a move out of an active location (identity present)", async () => {
    const handler = buildCtx("andrew").sideEffects?.["user-workspace"];
    if (handler === undefined) throw new Error("user-workspace handler was not registered");

    await handler(CLOSE_CTX);

    expect(mockRunUserClose).toHaveBeenCalledWith(expect.objectContaining({ identity: "andrew", wuName: "foo" }));
    expect(mockRunUserOpen).not.toHaveBeenCalled();
  });

  it("skips uniformly on BOTH open and close when identity is null", async () => {
    const handler = buildCtx(null).sideEffects?.["user-workspace"];
    if (handler === undefined) throw new Error("user-workspace handler was not registered");

    // Open path: previously fired `runUserOpen` with an empty identity — now skipped.
    await handler(OPEN_CTX);
    // Close path: already skipped before — stays skipped.
    await handler(CLOSE_CTX);

    expect(mockRunUserOpen).not.toHaveBeenCalled();
    expect(mockRunUserClose).not.toHaveBeenCalled();
  });
});

describe("buildExecutorContext — git executor cwd default + override", () => {
  it("defaults cwd to the repository root so cwd-relative ops resolve", async () => {
    const io = fakeIo();
    const ctx = buildExecutorContext({
      cwd: "/repo",
      io,
      identity: "andrew",
      teamMode: false,
      internalTemplateDir: "/tpl",
    });

    await ctx.exec!("git", ["mv", "a", "b"]);

    expect(io.exec).toHaveBeenCalledWith("git", ["mv", "a", "b"], { cwd: "/repo" });
  });

  it("honors an explicit per-call cwd over the default — the worktree-clean guard targets the right tree", async () => {
    const io = fakeIo();
    const ctx = buildExecutorContext({
      cwd: "/repo",
      io,
      identity: "andrew",
      teamMode: false,
      internalTemplateDir: "/tpl",
    });

    // The `worktree-clean` guard checks `git status` in the *target worktree*; the
    // default-to-repo pin must not clobber that, or the guard checks the base repo
    // (a dirty base then wrongly refuses a clean worktree's teardown).
    await ctx.exec!("git", ["status", "--porcelain"], { cwd: "/wt-foo" });

    expect(io.exec).toHaveBeenCalledWith("git", ["status", "--porcelain"], { cwd: "/wt-foo" });
  });

  it("can re-bind the executor context to a spawned worktree root", async () => {
    const io = fakeIo();
    const ctx = buildExecutorContext({
      cwd: "/repo",
      io,
      identity: "andrew",
      teamMode: false,
      internalTemplateDir: "/tpl",
    });
    const rebound = ctx.withCwd?.("/repo.plan-foo");
    if (rebound === undefined) throw new Error("withCwd was not registered");

    await rebound.exec!("git", ["status", "--short"]);

    expect(io.exec).toHaveBeenCalledWith("git", ["status", "--short"], { cwd: "/repo.plan-foo" });
  });
});
