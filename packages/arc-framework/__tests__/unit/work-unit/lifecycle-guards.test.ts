/**
 * Unit tests for the two foot-gun guard predicates — `name-collision` and
 * `worktree-occupancy`. The index is built from in-memory metas; the
 * worktree-occupancy guard's active-meta reader is an injected fake, so both
 * resolve from meta + location with no filesystem or git access.
 */

import { describe, it, expect } from "vitest";

import {
  buildFootgunGuards,
  hasNameCollision,
  makeWorktreeOccupancyGuard,
  nameCollisionGuard,
} from "../../../src/lib/work-unit/lifecycle-guards.js";
import type { GuardContext, TransitionInputs } from "../../../src/lib/work-unit/lifecycle-executor.js";
import { buildLifecycleIndexFromMetas, type LifecycleIndex } from "../../../src/lib/work-unit/lifecycle-index.js";
import type { ReaderResult } from "../../../src/lib/active/meta-reader.js";
import type { MetaFileCandidate } from "../../../src/commands/active/types.js";

/** A meta body with a given State, for index construction. */
function metaBody(slug: string, state: string): string {
  return (
    `# Metadata: ${slug}\n\n` +
    `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
    `|-----------|-----------|------------|-----------|--------------|\n` +
    `| \`${state}\` | \`andrew\` | \`feat/${slug}\` | \`Novel\` | \`P1\` |\n\n---\n`
  );
}

/** Build an index placing `slug` under `tier` with `state`. */
function indexWith(slug: string, tier: string, state: string): LifecycleIndex {
  return buildLifecycleIndexFromMetas([
    { path: `.arc/${tier}/${slug}/meta-${slug}.md`, content: metaBody(slug, state) },
  ]);
}

/** A guard context with the given index + slug (position/inputs unused by these guards). */
function guardCtx(index: LifecycleIndex, slug: string, inputs: TransitionInputs = {}): GuardContext {
  return { index, slug, position: null, inputs };
}

/** A minimal active-meta candidate. */
function candidate(over: Partial<MetaFileCandidate>): MetaFileCandidate {
  return {
    path: ".arc/active/meta-other.md",
    filename: "meta-other.md",
    branch: "feat/other",
    state: "Active",
    nextTask: null,
    taskList: null,
    nextAction: null,
    ...over,
  };
}

/** A fake active-meta reader returning a fixed candidate set. */
function fakeReader(candidates: MetaFileCandidate[]): (cwd: string) => Promise<ReaderResult> {
  return () => Promise.resolve({ layout: "full", candidates, warnings: [] });
}

describe("hasNameCollision", () => {
  it("is true when the slug already resolves to a work unit", () => {
    expect(hasNameCollision(indexWith("demo", "backlog/provisional", "Planning"), "demo")).toBe(true);
    expect(hasNameCollision(indexWith("demo", "backlog/planned", "Planning"), "demo")).toBe(true);
    expect(hasNameCollision(indexWith("demo", "active", "Active"), "demo")).toBe(true);
  });

  it("is false for a nonexistent slug", () => {
    expect(hasNameCollision(indexWith("demo", "backlog/provisional", "Planning"), "ghost")).toBe(false);
    expect(hasNameCollision(buildLifecycleIndexFromMetas([]), "demo")).toBe(false);
  });
});

describe("nameCollisionGuard", () => {
  it("rejects when the slug already exists (graduate, never scaffold)", () => {
    const result = nameCollisionGuard(guardCtx(indexWith("demo", "backlog/planned", "Planning"), "demo"));
    expect(result).toMatchObject({ ok: false });
    if (result instanceof Promise || result.ok) throw new Error("expected a sync rejection");
    expect(result.message).toMatch(/already exists.*graduates/i);
  });

  it("passes for a nonexistent slug (the create-new edge proceeds)", () => {
    expect(nameCollisionGuard(guardCtx(buildLifecycleIndexFromMetas([]), "demo"))).toEqual({ ok: true });
  });
});

describe("makeWorktreeOccupancyGuard", () => {
  const index = buildLifecycleIndexFromMetas([]);

  it("rejects when a different work unit occupies the worktree", async () => {
    const guard = makeWorktreeOccupancyGuard({
      cwd: "/repo",
      readActiveMetaCandidates: fakeReader([candidate({})]),
    });

    const result = await guard(guardCtx(index, "demo"));
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.message).toMatch(/already holds an active work unit `other`.*Active/i);
  });

  it("passes when the only occupant is the target work unit itself", async () => {
    const guard = makeWorktreeOccupancyGuard({
      cwd: "/repo",
      readActiveMetaCandidates: fakeReader([
        candidate({ path: ".arc/active/meta-demo.md", filename: "meta-demo.md", branch: "feat/demo" }),
      ]),
    });

    expect(await guard(guardCtx(index, "demo"))).toEqual({ ok: true });
  });

  it("passes when the worktree is empty", async () => {
    const guard = makeWorktreeOccupancyGuard({ cwd: "/repo", readActiveMetaCandidates: fakeReader([]) });
    expect(await guard(guardCtx(index, "demo"))).toEqual({ ok: true });
  });

  it("ignores a candidate whose state does not resolve to an occupying state", async () => {
    // A null/absent State resolves to no position → not occupying → skipped.
    const guard = makeWorktreeOccupancyGuard({
      cwd: "/repo",
      readActiveMetaCandidates: fakeReader([candidate({ state: null })]),
    });
    expect(await guard(guardCtx(index, "demo"))).toEqual({ ok: true });
  });

  it("treats a lite-layout same-branch candidate as the target, not a collision", async () => {
    const guard = makeWorktreeOccupancyGuard({
      cwd: "/repo",
      readActiveMetaCandidates: fakeReader([
        candidate({ path: ".arc/active/status.md", filename: "status.md", branch: "plan/demo" }),
      ]),
    });
    // The start would spawn `plan/demo`; the lite candidate backs the same branch.
    const inputs: TransitionInputs = {
      worktreeOp: {
        mutation: "spawn",
        branch: "plan/demo",
        base: "main",
        locationTemplate: "{repo}.{branch}",
        repo: "repo",
        wuName: "demo",
        spawningIdentity: "andrew",
      },
    };
    expect(await guard(guardCtx(index, "demo", inputs))).toEqual({ ok: true });
  });
});

describe("buildFootgunGuards", () => {
  it("assembles both foot-gun validators under their guard ids", () => {
    const guards = buildFootgunGuards({ cwd: "/repo", readActiveMetaCandidates: fakeReader([]) });
    expect(guards["name-collision"]).toBe(nameCollisionGuard);
    expect(typeof guards["worktree-occupancy"]).toBe("function");
  });
});
