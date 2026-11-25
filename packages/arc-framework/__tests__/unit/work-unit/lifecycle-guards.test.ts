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
  const dir = tier === "active" ? ".arc/active" : `.arc/${tier}/${slug}`;
  return buildLifecycleIndexFromMetas([{ path: `${dir}/meta-${slug}.md`, content: metaBody(slug, state) }]);
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
    currentWorkflow: null,
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

  /** An in-place re-attach op for `branch` — the placement the occupancy guard enforces over. */
  function inPlaceInputs(branch: string): TransitionInputs {
    return {
      worktreeOp: {
        mutation: "spawn",
        inPlace: true,
        branch,
        wuName: "demo",
        createBranch: false,
      },
    };
  }

  it("rejects an in-place re-attach when a different work unit occupies the checkout", async () => {
    const guard = makeWorktreeOccupancyGuard({
      cwd: "/repo",
      readActiveMetaCandidates: fakeReader([candidate({})]),
    });

    const result = await guard(guardCtx(index, "demo", inPlaceInputs("feat/demo")));
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.message).toMatch(/already holds an active work unit `other`.*Active/i);
  });

  it("does NOT reject a fresh re-attach spawn (resume / start@parked) when the base checkout is occupied", async () => {
    // A re-attach spawn (`createBranch: false`) lands nothing in the base `active/` —
    // the authoritative artifacts ride the preserved branch — so a base occupant is
    // no collision with the spawn target.
    const guard = makeWorktreeOccupancyGuard({
      cwd: "/repo",
      readActiveMetaCandidates: fakeReader([candidate({})]),
    });
    const reattachSpawn: TransitionInputs = {
      worktreeOp: {
        mutation: "spawn",
        branch: "feat/demo",
        base: "main",
        createBranch: false,
        locationTemplate: "{repo}.{branch}",
        repo: "repo",
        wuName: "demo",
        spawningIdentity: "andrew",
      },
    };
    expect(await guard(guardCtx(index, "demo", reattachSpawn))).toEqual({ ok: true });
  });

  it("rejects a branch-creating fresh spawn (graduate / create-new) when the base checkout is occupied", async () => {
    // A branch-creating spawn's `scaffold`/`relocate` leg writes the base `active/`
    // before the worktree spawns — the two-metas foot-gun — so a base occupant collides
    // even though the worktree lands elsewhere.
    const guard = makeWorktreeOccupancyGuard({
      cwd: "/repo",
      readActiveMetaCandidates: fakeReader([candidate({})]),
    });
    const createSpawn: TransitionInputs = {
      worktreeOp: {
        mutation: "spawn",
        branch: "plan/demo",
        base: "main",
        createBranch: true,
        locationTemplate: "{repo}.{branch}",
        repo: "repo",
        wuName: "demo",
        spawningIdentity: "andrew",
      },
    };
    const result = await guard(guardCtx(index, "demo", createSpawn));
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.message).toMatch(/already holds an active work unit `other`.*Active/i);
  });

  it("passes when the only occupant is the target work unit itself (in-place)", async () => {
    const guard = makeWorktreeOccupancyGuard({
      cwd: "/repo",
      readActiveMetaCandidates: fakeReader([
        candidate({ path: ".arc/active/meta-demo.md", filename: "meta-demo.md", branch: "feat/demo" }),
      ]),
    });

    expect(await guard(guardCtx(index, "demo", inPlaceInputs("feat/demo")))).toEqual({ ok: true });
  });

  it("passes when the checkout is empty (in-place)", async () => {
    const guard = makeWorktreeOccupancyGuard({ cwd: "/repo", readActiveMetaCandidates: fakeReader([]) });
    expect(await guard(guardCtx(index, "demo", inPlaceInputs("feat/demo")))).toEqual({ ok: true });
  });

  it("ignores a candidate whose state does not resolve to an occupying state (in-place)", async () => {
    // A null/absent State resolves to no position → not occupying → skipped.
    const guard = makeWorktreeOccupancyGuard({
      cwd: "/repo",
      readActiveMetaCandidates: fakeReader([candidate({ state: null })]),
    });
    expect(await guard(guardCtx(index, "demo", inPlaceInputs("feat/demo")))).toEqual({ ok: true });
  });
});

describe("buildFootgunGuards", () => {
  it("assembles every foot-gun / IO validator under its guard id", () => {
    const guards = buildFootgunGuards({ cwd: "/repo", readActiveMetaCandidates: fakeReader([]) });
    expect(guards["name-collision"]).toBe(nameCollisionGuard);
    expect(typeof guards["worktree-occupancy"]).toBe("function");
  });
});
