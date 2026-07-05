import { describe, it, expect } from "vitest";
import { join } from "node:path";

import {
  reconcileStatusUser,
  reconcileStatusUserSideEffect,
  reconcileRoadmap,
  type ReconcileStatusUserContext,
  type ReconcileRoadmapContext,
} from "../../../../src/lib/work-unit/side-effects/readiness-regen.js";
import type { LifecyclePosition } from "../../../../src/lib/work-unit/lifecycle-state.js";

const ACTIVE: LifecyclePosition = { phase: "Active", location: "active" };
const PARKED: LifecyclePosition = { phase: "Active", location: "planned" };

interface CtxState {
  composeCalls: number;
  mkdirs: string[];
  writes: { path: string; content: string }[];
  stages: string[];
}

/** Build a status-user context over a fixed composed view, recording all I/O. */
function buildCtx(view: string): { ctx: ReconcileStatusUserContext; state: CtxState } {
  const state: CtxState = { composeCalls: 0, mkdirs: [], writes: [], stages: [] };
  const ctx: ReconcileStatusUserContext = {
    composeView: async () => {
      state.composeCalls += 1;
      return view;
    },
    mkdir: async (path) => {
      state.mkdirs.push(path);
      return undefined;
    },
    writeFile: async (path, content) => {
      state.writes.push({ path, content });
    },
  };
  return { ctx, state };
}

/** Build a roadmap context over a fixed composed view, recording all I/O. */
function buildRoadmapCtx(view: string): { ctx: ReconcileRoadmapContext; state: CtxState } {
  const state: CtxState = { composeCalls: 0, mkdirs: [], writes: [], stages: [] };
  const ctx: ReconcileRoadmapContext = {
    composeView: async () => {
      state.composeCalls += 1;
      return view;
    },
    mkdir: async (path) => {
      state.mkdirs.push(path);
      return undefined;
    },
    writeFile: async (path, content) => {
      state.writes.push({ path, content });
    },
    stageFile: async (path) => {
      state.stages.push(path);
    },
  };
  return { ctx, state };
}

describe("reconcileStatusUser", () => {
  it("composes the view and writes STATUS.USER under the identity workspace", async () => {
    const { ctx, state } = buildCtx("## In Flight\n\nrows");

    const result = await reconcileStatusUser(ctx, { cwd: "/repo", identity: "andrew" });

    const expectedPath = join("/repo", ".arc", "user", "andrew", "STATUS.USER.md");
    expect(result).toEqual({ written: true, path: expectedPath });
    expect(state.mkdirs).toEqual([join("/repo", ".arc", "user", "andrew")]);
    expect(state.writes).toEqual([{ path: expectedPath, content: "## In Flight\n\nrows\n" }]);
  });

  it("does not double the trailing newline when the view already ends in one", async () => {
    const { ctx, state } = buildCtx("body\n");

    await reconcileStatusUser(ctx, { cwd: "/repo", identity: "andrew" });

    expect(state.writes[0]!.content).toBe("body\n");
  });

  it("skips entirely when identity is absent (the view is identity-scoped)", async () => {
    const { ctx, state } = buildCtx("body");

    const result = await reconcileStatusUser(ctx, { cwd: "/repo", identity: null });

    expect(result).toEqual({ written: false, path: null });
    expect(state.composeCalls).toBe(0);
    expect(state.writes).toEqual([]);
  });
});

describe("reconcileStatusUserSideEffect", () => {
  it("writes the real view and returns no advisory on success", async () => {
    const { ctx, state } = buildCtx("## In Flight\n\nrows");

    const advisory = await reconcileStatusUserSideEffect(ctx, {
      cwd: "/repo",
      identity: "andrew",
      slug: "demo-wu",
      from: PARKED,
      to: ACTIVE,
    });

    expect(advisory).toBeUndefined();
    expect(state.writes).toHaveLength(1);
  });

  it("degrades to an advisory (never throws) when the render fails", async () => {
    const ctx: ReconcileStatusUserContext = {
      composeView: () => Promise.reject(new Error("remote unreachable mid-render")),
      mkdir: async () => undefined,
      writeFile: async () => undefined,
    };

    const advisory = await reconcileStatusUserSideEffect(ctx, {
      cwd: "/repo",
      identity: "andrew",
      slug: "demo-wu",
      from: PARKED,
      to: ACTIVE,
    });

    expect(advisory).toContain("demo-wu");
    expect(advisory).toContain("Active/planned");
    expect(advisory).toContain("Active/active");
    expect(advisory).toMatch(/STATUS\.USER/);
    expect(advisory).toMatch(/arc status --user/);
  });

  it("returns no advisory when identity is absent (the reconcile skips, no failure)", async () => {
    const { ctx, state } = buildCtx("body");

    const advisory = await reconcileStatusUserSideEffect(ctx, {
      cwd: "/repo",
      identity: null,
      slug: "demo-wu",
      from: PARKED,
      to: ACTIVE,
    });

    expect(advisory).toBeUndefined();
    expect(state.writes).toEqual([]);
  });
});

describe("reconcileRoadmap", () => {
  it("writes and stages the deterministic ROADMAP view", async () => {
    const { ctx, state } = buildRoadmapCtx("# Roadmap\n\nrows");

    const advisory = await reconcileRoadmap(ctx, {
      cwd: "/repo",
      slug: "demo-wu",
      from: ACTIVE,
      to: PARKED,
    });

    const expectedPath = join("/repo", ".arc", "backlog", "ROADMAP.md");
    expect(advisory).toBeUndefined();
    expect(state.mkdirs).toEqual([join("/repo", ".arc", "backlog")]);
    expect(state.writes).toEqual([{ path: expectedPath, content: "# Roadmap\n\nrows\n" }]);
    expect(state.stages).toEqual([expectedPath]);
  });

  it("degrades to an advisory naming the WU and move when rendering fails", async () => {
    const ctx: ReconcileRoadmapContext = {
      composeView: () => Promise.reject(new Error("renderer unavailable")),
      mkdir: async () => undefined,
      writeFile: async () => undefined,
      stageFile: async () => undefined,
    };

    const advisory = await reconcileRoadmap(ctx, {
      cwd: "/repo",
      slug: "demo-wu",
      from: null,
      to: ACTIVE,
    });

    expect(advisory).toContain("demo-wu");
    expect(advisory).toContain("nonexistent");
    expect(advisory).toContain("Active/active");
    expect(advisory).toMatch(/ROADMAP/);
    expect(advisory).toMatch(/failed/);
  });
});
