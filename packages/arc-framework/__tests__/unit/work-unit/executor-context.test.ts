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

const { buildExecutorContext } = await import("../../../src/lib/work-unit/executor-context.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildLifecycleIndex.mockResolvedValue(new Map());
  mockDischargeDepEdges.mockResolvedValue({ discharged: ["dep-a", "dep-b"], live: [] });
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

function buildCtx() {
  return buildExecutorContext({
    cwd: "/repo",
    io: fakeIo(),
    identity: "andrew",
    teamMode: false,
    internalTemplateDir: "/tpl",
  });
}

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
