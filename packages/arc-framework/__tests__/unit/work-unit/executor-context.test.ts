/**
 * Unit tests for the executor-context binder's `discharge-dep-edges` wiring — the
 * deferred dep-edge-discharge `SideEffectHandler` the `activate` edge fires. The
 * lifecycle-index build and the discharge core are mocked at the module seam; these
 * assert the handler is registered and delegates to `dischargeDepEdges` with the
 * activated WU's meta path, surfacing its discharge count as an advisory.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import type { UserIOContext } from "../../../src/commands/user/types.js";

const mockBuildLifecycleIndex = vi.fn();
vi.mock("../../../src/lib/work-unit/lifecycle-index.js", () => ({
  buildLifecycleIndex: (...args: unknown[]) => mockBuildLifecycleIndex(...args),
}));

const mockDischargeDepEdges = vi.fn();
vi.mock("../../../src/lib/work-unit/side-effects/discharge-dep-edges.js", () => ({
  dischargeDepEdges: (...args: unknown[]) => mockDischargeDepEdges(...args),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildLifecycleIndex.mockResolvedValue(new Map());
  mockDischargeDepEdges.mockResolvedValue({ discharged: ["dep-a", "dep-b"], live: [] });
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

describe("buildExecutorContext — discharge-dep-edges binding", () => {
  it("registers the discharge-dep-edges side-effect handler", () => {
    expect(buildCtx().sideEffects?.["discharge-dep-edges"]).toBeDefined();
  });

  it("delegates to dischargeDepEdges with the activated WU's meta path and surfaces the count", async () => {
    const handler = buildCtx().sideEffects?.["discharge-dep-edges"];
    if (handler === undefined) throw new Error("discharge-dep-edges handler was not registered");

    const advisory = await handler({
      cwd: "/repo",
      slug: "foo",
      from: { phase: "Planning", location: "active" },
      to: { phase: "Active", location: "active" },
      inputs: {},
    });

    expect(mockDischargeDepEdges).toHaveBeenCalledWith(expect.anything(), {
      slug: "foo",
      metaPath: ".arc/active/meta-foo.md",
    });
    expect(advisory).toContain("Discharged 2");
  });

  it("produces no advisory when nothing discharges", async () => {
    mockDischargeDepEdges.mockResolvedValueOnce({ discharged: [], live: ["dep-a"] });
    const handler = buildCtx().sideEffects?.["discharge-dep-edges"];
    if (handler === undefined) throw new Error("discharge-dep-edges handler was not registered");

    const advisory = await handler({
      cwd: "/repo",
      slug: "foo",
      from: { phase: "Planning", location: "active" },
      to: { phase: "Active", location: "active" },
      inputs: {},
    });

    expect(advisory).toBeUndefined();
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
