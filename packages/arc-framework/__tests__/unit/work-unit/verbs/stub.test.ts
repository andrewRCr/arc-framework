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

import { parseMetaRecord } from "../../../../src/lib/active/meta-reader.js";
import { digestBytes } from "../../../../src/lib/canonical/canonical-json.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import { validatePlanningArtifactTuple } from "../../../../src/lib/work-unit/planning-artifact-tuple.js";
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
  staged: string[];
}

/** Build a `runStub` context of spies over an empty index + an in-memory fs. */
function buildHarness(): Harness {
  const writes: Harness["writes"] = [];
  const mkdirs: string[] = [];
  const staged: string[] = [];

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
    reconcileWorkUnitWorktree: async () => ({ mutation: "spawn", worktreePath: "/wt", branch: "x" }),
    writeBranchField: async () => {},
    writeCurrentWorkflowField: async () => {},
    writeDesignField: async () => {},
    writeSoftFields: async () => {},
    stageMeta: async (path) => {
      staged.push(path);
    },
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

  return { ctx: { executor, fs }, writes, mkdirs, staged };
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
    const { ctx, writes, mkdirs, staged } = buildHarness();

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
    expect(staged).toEqual([result.metaPath]);
  });

  it("preserves accepted display sentinels at the semantic renderer boundary", async () => {
    const { ctx, writes } = buildHarness();

    const result = await runStub(ctx, { ...BASE, origin: "[internal]", design: "[none]" });

    expect(result.status).toBe("scaffolded");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.content).toContain("- **Origin:** [internal]");
    expect(writes[0]!.content).toContain("- **Design:** [none]");
  });

  it("emits a planned meta that the planning launch validator accepts", async () => {
    const { ctx, writes } = buildHarness();
    const result = await runStub(ctx, BASE);

    expect(result.status).toBe("scaffolded");
    if (result.status !== "scaffolded") return;
    const content = writes[0]!.content;
    expect(validatePlanningArtifactTuple({
      expectedSlug: "foo",
      metaPath: result.metaPath,
      metaContent: content,
      meta: parseMetaRecord(content),
      artifacts: [{
        path: result.metaPath,
        state: {
          kind: "file",
          mode: "100644",
          contentDigest: digestBytes(new TextEncoder().encode(content)),
        },
      }],
    })).toMatchObject({
      status: "valid",
      profile: { kind: "draft", sourceDesign: [] },
      expectedWorkflow: "draft-design",
      taskAuthority: "none",
    });
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

describe("runStub — cohort placement", () => {
  it("places the member under the cohort tree and writes the Cohort field", async () => {
    const { ctx, writes, mkdirs } = buildHarness();

    const result = await runStub(ctx, { ...BASE, cohort: "lifecycle-state-machine" });

    expect(result.status).toBe("scaffolded");
    if (result.status !== "scaffolded") return;
    expect(result.metaPath).toBe(".arc/backlog/planned/lifecycle-state-machine/foo/meta-foo.md");
    expect(mkdirs).toContain("/repo/.arc/backlog/planned/lifecycle-state-machine/foo");
    expect(writes[0]!.path).toBe("/repo/.arc/backlog/planned/lifecycle-state-machine/foo/meta-foo.md");
    expect(writes[0]!.content).toContain("lifecycle-state-machine");
  });

  it("supports a nested cohort path within the segment cap", async () => {
    const { ctx } = buildHarness();

    const result = await runStub(ctx, { ...BASE, cohort: "parent/child" });

    expect(result.status).toBe("scaffolded");
    if (result.status !== "scaffolded") return;
    expect(result.metaPath).toBe(".arc/backlog/planned/parent/child/foo/meta-foo.md");
  });

  it("still enforces the stub guards under --cohort (priority required)", async () => {
    const { ctx, writes } = buildHarness();

    const result = await runStub(ctx, { ...BASE, cohort: "lifecycle-state-machine", priority: undefined });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/priority/i);
    expect(writes).toEqual([]);
  });

  it("requires a planned commitment — a provisional cohort member is invisible to the resolver", async () => {
    const { ctx, writes } = buildHarness();

    const result = await runStub(ctx, { ...BASE, commitment: "provisional", cohort: "lifecycle-state-machine" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/cohort/i);
    expect(writes).toEqual([]);
  });

  it("rejects an unsafe cohort path without scaffolding", async () => {
    for (const cohort of ["../escape", "/abs"]) {
      const { ctx, writes, mkdirs } = buildHarness();

      const result = await runStub(ctx, { ...BASE, cohort });

      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") continue;
      expect(result.reason).toMatch(/cohort/i);
      expect(writes).toEqual([]);
      expect(mkdirs).toEqual([]);
    }
  });

  it("rejects a cohort segment outside the canonical slug grammar", async () => {
    const { ctx, writes, mkdirs } = buildHarness();

    const result = await runStub(ctx, { ...BASE, cohort: "Not-A-Slug" });

    expect(result.status).toBe("rejected");
    expect(writes).toEqual([]);
    expect(mkdirs).toEqual([]);
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

describe("runStub — initial Class", () => {
  it("writes an explicit resolved Class into the scaffolded meta", async () => {
    const { ctx, writes } = buildHarness();

    const result = await runStub(ctx, { ...BASE, cls: "Light" });

    expect(result.status).toBe("scaffolded");
    expect(writes).toHaveLength(1);
    expect(writes[0]!.content).toContain("`Light`");
    expect(writes[0]!.content).not.toContain("[TBD]");
  });

  it("normalizes a lowercase Class value to the codified form", async () => {
    const { ctx, writes } = buildHarness();

    const result = await runStub(ctx, { ...BASE, cls: "heavy" });

    expect(result.status).toBe("scaffolded");
    expect(writes[0]!.content).toContain("`Heavy`");
  });

  it("defaults to the [TBD] sentinel when no Class is supplied", async () => {
    const { ctx, writes } = buildHarness();

    const result = await runStub(ctx, { ...BASE });

    expect(result.status).toBe("scaffolded");
    expect(writes[0]!.content).toContain("[TBD]");
  });

  it("rejects an unresolvable Class value without scaffolding", async () => {
    const { ctx, writes } = buildHarness();

    const result = await runStub(ctx, { ...BASE, cls: "medium" });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/not a resolved Class/i);
    expect(writes).toEqual([]);
  });
});
