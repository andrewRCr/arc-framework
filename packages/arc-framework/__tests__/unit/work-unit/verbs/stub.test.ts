/**
 * Unit tests for the `stub` creation contract — the single create chokepoint.
 *
 * `stub` is the backlog-tier, branchless create verb: it refuses creation
 * without an explicit commitment (`provisional` | `planned`) and priority — no
 * silent `provisional` / `P3` default — then scaffolds the selected-tier meta
 * under `backlog/`, routing through the executor's table-driven `scaffold` leg.
 * The fs write and the executor seams are injected, so each behavior is asserted
 * over spies. Enforcement is pure over supplied inputs (it never defaults), so
 * the non-interactive case is the same rejection — no TTY branch in the contract.
 */

import { describe, it, expect } from "vitest";

import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import { runStub, type StubContext, type StubParams } from "../../../../src/lib/work-unit/verbs/stub.js";

const CWD = "/repo";

/** An empty index fs — no metas, so any name resolves `nonexistent` (the create source). */
const EMPTY_INDEX_FS: LifecycleIndexFs = {
  readdir: () => Promise.resolve([]),
  readFile: () => Promise.reject(new Error("ENOENT")),
};

interface Harness {
  ctx: StubContext;
  writes: { path: string; content: string }[];
  mkdirs: string[];
}

/** Build a `runStub` context of spies over an empty index + an in-memory fs. */
function buildHarness(): Harness {
  const writes: Harness["writes"] = [];
  const mkdirs: string[] = [];

  const sideEffects: ExecuteTransitionContext["sideEffects"] = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user"] satisfies SideEffectId[]) {
    sideEffects[id] = () => undefined;
  }

  const executor: Omit<ExecuteTransitionContext, "scaffoldOrRemove"> = {
    cwd: CWD,
    indexFs: EMPTY_INDEX_FS,
    setPhase: async () => ({ phase: "Planning" }),
    relocateArtifacts: async () => ({ moved: [] }),
    reconcileBranch: async () => {},
    reconcileWorktree: async () => ({ mutation: "spawn", worktreePath: "/wt", branch: "x" }),
    writeBranchField: async () => {},
    writeSoftFields: async () => {},
    sideEffects,
  };

  const fs: StubContext["fs"] = {
    mkdir: async (path) => {
      mkdirs.push(String(path));
    },
    writeFile: async (path, content) => {
      writes.push({ path: String(path), content });
    },
  };

  return { ctx: { executor, fs }, writes, mkdirs };
}

const BASE: StubParams = {
  name: "foo",
  commitment: "planned",
  priority: "P1",
  owner: "andrew",
};

describe("runStub — commitment enforcement", () => {
  it("rejects a stub with no commitment supplied (no default tier)", async () => {
    const { ctx, writes } = buildHarness();

    const result = await runStub(ctx, { ...BASE, commitment: undefined });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/commitment/i);
    expect(writes).toEqual([]);
  });
});

describe("runStub — priority enforcement", () => {
  it("rejects a stub with no priority supplied (no silent P3)", async () => {
    const { ctx, writes } = buildHarness();

    const result = await runStub(ctx, { ...BASE, priority: undefined });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/priority/i);
    expect(writes).toEqual([]);
  });
});

describe("runStub — scaffolds the selected tier", () => {
  it("scaffolds the planned-tier meta under backlog/ when both are supplied", async () => {
    const { ctx, writes, mkdirs } = buildHarness();

    const result = await runStub(ctx, { ...BASE, commitment: "planned", priority: "P1" });

    expect(result.status).toBe("scaffolded");
    if (result.status !== "scaffolded") return;
    // Routed through the executor's table-driven scaffold leg — not a bypass.
    expect(result.outcome.status).toBe("ok");
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("stub");
      expect(result.outcome.to).toEqual({ phase: "Planning", location: "planned" });
    }
    // The meta lands at the per-WU subdir under the committed tier.
    expect(result.metaPath).toBe(".arc/backlog/planned/foo/meta-foo.md");
    expect(mkdirs).toContain("/repo/.arc/backlog/planned/foo");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.path).toBe("/repo/.arc/backlog/planned/foo/meta-foo.md");
    expect(writes[0]!.content).toContain("# Metadata: foo");
    expect(writes[0]!.content).toContain("Planning");
    expect(writes[0]!.content).toContain("P1");
  });

  it("routes a provisional commitment to the provisional tier (edge disambiguation)", async () => {
    const { ctx, writes } = buildHarness();

    const result = await runStub(ctx, { ...BASE, commitment: "provisional", priority: "P2" });

    expect(result.status).toBe("scaffolded");
    if (result.status !== "scaffolded") return;
    expect(result.metaPath).toBe(".arc/backlog/provisional/foo/meta-foo.md");
    if (result.outcome.status === "ok") {
      expect(result.outcome.to).toEqual({ phase: "Planning", location: "provisional" });
    }
    expect(writes[0]!.path).toBe("/repo/.arc/backlog/provisional/foo/meta-foo.md");
    expect(writes[0]!.content).toContain("P2");
  });
});

describe("runStub — never defaults (non-interactive safety)", () => {
  it("refuses rather than scaffolding a default provisional/P3 stub when judgment is absent", async () => {
    const { ctx, writes } = buildHarness();

    // Neither commitment nor priority supplied — the non-TTY case has no prompt
    // to fill them, and the contract never defaults: it rejects, writing nothing.
    const result = await runStub(ctx, { ...BASE, commitment: undefined, priority: undefined });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/refus|default/i);
    expect(writes).toEqual([]);
  });
});
