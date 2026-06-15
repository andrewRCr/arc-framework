/**
 * Unit tests for the thin lifecycle executor — `executeTransition`.
 *
 * The four encoding mutators, the soft-field writer, and the side-effects reach
 * the executor as injected seams, so every behavior is asserted with spies over
 * an in-memory index: state resolution, illegal/guard/missing-input rejection
 * (no mutation), recoverable leg ordering, side-effects-after-encoding, the
 * soft-field disposition, and the ephemeral suggestion. The verb-specific
 * operands are supplied as `inputs`, never fabricated.
 */

import { describe, it, expect } from "vitest";

import {
  executeTransition,
  type EncodingLeg,
  type ExecuteTransitionContext,
  type GuardValidator,
  type SideEffectHandler,
  type TransitionInputs,
} from "../../../src/lib/work-unit/lifecycle-executor.js";
import type { MetaFieldName } from "../../../src/lib/active/meta-reader.js";
import type { LifecycleIndexFs, DirEntry } from "../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../src/lib/work-unit/lifecycle-transitions.js";

// ---------------------------------------------------------------------------
// In-memory index fixture — one meta per slug under a chosen tier.
// ---------------------------------------------------------------------------

interface MetaSpec {
  slug: string;
  /** Lifecycle tier directory under `.arc/` (e.g. `active`, `backlog/planned`). */
  tier: string;
  state: string;
  /** Optional nested subdir under the tier (cohort path / slug dir). */
  subdir?: string;
}

const CWD = "/repo";

/** Build an injectable index fs over a fixed set of metas. */
function buildIndexFs(metas: MetaSpec[]): LifecycleIndexFs {
  // dir (absolute) → entries
  const dirs = new Map<string, DirEntry[]>();
  const files = new Map<string, string>();

  const ensureDir = (dir: string): DirEntry[] => {
    let entries = dirs.get(dir);
    if (entries === undefined) {
      entries = [];
      dirs.set(dir, entries);
    }
    return entries;
  };
  const addChildDir = (parent: string, name: string): void => {
    const entries = ensureDir(parent);
    if (!entries.some((e) => e.name === name && e.isDirectory())) {
      entries.push({ name, isDirectory: () => true });
    }
  };

  for (const meta of metas) {
    const tierAbs = `${CWD}/.arc/${meta.tier}`;
    const dirAbs = meta.subdir === undefined ? tierAbs : `${tierAbs}/${meta.subdir}`;
    const filename = `meta-${meta.slug}.md`;
    // Register the dir chain so the recursive walk reaches nested metas.
    if (meta.subdir !== undefined) {
      const segments = meta.subdir.split("/");
      let parent = tierAbs;
      for (const seg of segments) {
        addChildDir(parent, seg);
        parent = `${parent}/${seg}`;
      }
    }
    ensureDir(dirAbs).push({ name: filename, isDirectory: () => false });
    const relPath = dirAbs.slice(CWD.length + 1) + `/${filename}`;
    files.set(
      `${dirAbs}/${filename}`,
      `# Metadata: ${meta.slug}\n\n` +
        `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
        `|-----------|-----------|------------|-----------|--------------|\n` +
        `| \`${meta.state}\` | \`andrew\` | \`feat/${meta.slug}\` | \`Novel\` | \`P1\` |\n\n` +
        `- **Last Completed:** prior phase.\n- **Next Task:** \`Task X\`\n- **Blockers:** [none]\n\n` +
        `- **Next Action:** continue.\n\n---\n`,
    );
    void relPath;
  }

  return {
    readdir: (path) => {
      const entries = dirs.get(path);
      if (entries === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
      return Promise.resolve(entries);
    },
    readFile: (path) => {
      const content = files.get(path);
      if (content === undefined) return Promise.reject(new Error(`ENOENT: ${path}`));
      return Promise.resolve(content);
    },
  };
}

// ---------------------------------------------------------------------------
// Spy context — records every seam invocation in one ordered log.
// ---------------------------------------------------------------------------

interface Spies {
  ctx: ExecuteTransitionContext;
  calls: string[];
  softWrites: { path: string; updates: Partial<Record<MetaFieldName, string>> }[];
}

interface SpyOptions {
  metas?: MetaSpec[];
  /** Make a named leg throw, to exercise the recoverable-failure path. */
  throwOnLeg?: EncodingLeg;
  guardValidators?: ExecuteTransitionContext["guardValidators"];
  sideEffects?: Partial<Record<SideEffectId, SideEffectHandler>>;
  /** Register the scaffold/remove artifact runner. */
  withScaffoldOrRemove?: boolean;
}

/**
 * Build an {@link ExecuteTransitionContext} of spies. Side-effect handlers
 * default to recording no-ops for every id so wiring-completeness passes; pass
 * `sideEffects` to override specific ones (e.g. to surface a roadmap advisory).
 */
function buildSpies(opts: SpyOptions = {}): Spies {
  const calls: string[] = [];
  const softWrites: Spies["softWrites"] = [];

  const ALL_SIDE_EFFECTS: SideEffectId[] = [
    "reconcile-roadmap",
    "reconcile-status-user",
    "discharge-dep-edges",
    "user-workspace",
    "withdraw-pr",
    "revert-merge",
  ];
  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ALL_SIDE_EFFECTS) {
    sideEffects[id] = () => {
      calls.push(`side:${id}`);
      return undefined;
    };
  }
  Object.assign(sideEffects, opts.sideEffects ?? {});

  const guardThrow = (leg: EncodingLeg): void => {
    if (opts.throwOnLeg === leg) throw new Error(`boom:${leg}`);
  };

  const ctx: ExecuteTransitionContext = {
    cwd: CWD,
    indexFs: buildIndexFs(opts.metas ?? []),
    setPhase: async (params) => {
      calls.push(`leg:setPhase:${params.phase}`);
      guardThrow("setPhase");
      return { phase: "Active" };
    },
    relocateArtifacts: async (params) => {
      calls.push(`leg:artifacts:relocate:${params.fromDir}->${params.toDir}`);
      guardThrow("artifacts");
      return { moved: [`meta-${params.slug}.md`] };
    },
    reconcileBranch: async (op) => {
      calls.push(`leg:branch:${op.mutation}`);
      guardThrow("reconcileBranch");
    },
    reconcileWorktree: async (op) => {
      calls.push(`leg:worktree:${op.mutation}`);
      guardThrow("reconcileWorktree");
      return op.mutation === "spawn"
        ? { mutation: "spawn", worktreePath: "/wt", branch: "feat/x" }
        : { mutation: "teardown", worktreePath: op.worktreePath, locusHopped: false };
    },
    scaffoldOrRemove: opts.withScaffoldOrRemove
      ? async (params) => {
          calls.push(`leg:artifacts:${params.disposition}`);
          guardThrow("artifacts");
        }
      : undefined,
    writeSoftFields: async (path, updates) => {
      calls.push(`soft:${Object.keys(updates).join(",")}`);
      softWrites.push({ path, updates });
    },
    guardValidators: opts.guardValidators,
    sideEffects,
  };

  return { ctx, calls, softWrites };
}

// A standard active-WU teardown target (park@Active, abandon@Active, archive).
const ACTIVE_META: MetaSpec = { slug: "demo", tier: "active", state: "Active" };
const INTEGRATING_META: MetaSpec = { slug: "demo", tier: "active", state: "Integrating" };
// A `State: Planning` WU live in `active/` — the `(Planning, active)` position `park@Planning` moves from.
const PLANNING_ACTIVE_META: MetaSpec = { slug: "demo", tier: "active", state: "Planning" };
const PLANNED_META: MetaSpec = { slug: "demo", tier: "backlog/planned", state: "Planning", subdir: "demo" };
const PROVISIONAL_META: MetaSpec = {
  slug: "demo",
  tier: "backlog/provisional",
  state: "Planning",
  subdir: "demo",
};

// ---------------------------------------------------------------------------
// 1. Resolve current state from the entry-built index.
// ---------------------------------------------------------------------------

describe("executeTransition — state resolution", () => {
  it("resolves the slug's (phase, location) and matches the legal edge", async () => {
    // `integrate` is legal only from (Active, active); the index places `demo` there.
    const { ctx, calls } = buildSpies({ metas: [ACTIVE_META] });

    const outcome = await executeTransition(ctx, {
      verb: "integrate",
      slug: "demo",
      inputs: { softFields: { nextAction: "Open the PR.", lastCompleted: "Phase 7." } },
    });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.from).toEqual({ phase: "Active", location: "active" });
    expect(outcome.to).toEqual({ phase: "Integrating", location: "active" });
    expect(calls).toContain("leg:setPhase:Integrating");
  });
});

// ---------------------------------------------------------------------------
// 2. Reject an illegal / unknown (verb, from) with an actionable message.
// ---------------------------------------------------------------------------

describe("executeTransition — illegal / unknown rejection", () => {
  it("rejects an explicitly-illegal cell with its reason, no mutation", async () => {
    // `integrate` from (Integrating, active) is a marked-illegal cell.
    const { ctx, calls } = buildSpies({ metas: [INTEGRATING_META] });

    const outcome = await executeTransition(ctx, { verb: "integrate", slug: "demo", inputs: {} });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.stage).toBe("lookup");
    expect(outcome.message).toMatch(/integrate.*illegal.*Integrating/i);
    expect(calls).toEqual([]);
  });

  it("rejects a non-creation verb against a nonexistent slug", async () => {
    const { ctx, calls } = buildSpies({ metas: [] });

    const outcome = await executeTransition(ctx, { verb: "park", slug: "ghost", inputs: {} });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.message).toMatch(/nonexistent|existing/i);
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Validate every declared guard; reject on first failure, no mutation.
// ---------------------------------------------------------------------------

describe("executeTransition — guard validation", () => {
  it("rejects when a declared guard fails (class-resolved), no mutation", async () => {
    // `promote` from provisional declares the class-resolved guard.
    const { ctx, calls } = buildSpies({ metas: [PROVISIONAL_META] });

    const outcome = await executeTransition(ctx, {
      verb: "promote",
      slug: "demo",
      inputs: { class: "[TBD]", toDir: ".arc/backlog/planned/demo" },
    });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.stage).toBe("guard");
    expect(outcome.message).toMatch(/Class/i);
    expect(calls).toEqual([]);
  });

  it("passes the class-resolved guard with a resolved Class supplied", async () => {
    const { ctx } = buildSpies({ metas: [PROVISIONAL_META] });

    const outcome = await executeTransition(ctx, {
      verb: "promote",
      slug: "demo",
      inputs: { class: "Novel", toDir: ".arc/backlog/planned/demo" },
    });

    expect(outcome.status).toBe("ok");
  });

  it("rejects when a declared guard has no validator wired", async () => {
    // `start` from provisional declares class-resolved (default) — but if we
    // override validators to drop it, the wiring check rejects.
    const { ctx, calls } = buildSpies({
      metas: [PLANNING_ACTIVE_META],
      guardValidators: {},
    });
    // A guard with no default and no injected validator: `worktree-clean` (park).
    const outcome = await executeTransition(ctx, {
      verb: "park",
      slug: "demo",
      inputs: { toDir: ".arc/backlog/planned/demo" },
    });

    // park@Planning declares worktree-clean, which has no default validator.
    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.stage).toBe("guard");
    expect(outcome.message).toMatch(/worktree-clean.*not wired/i);
    expect(calls).toEqual([]);
  });

  it("uses an injected guard validator when supplied", async () => {
    const clean: GuardValidator = () => ({ ok: true });
    const { ctx } = buildSpies({
      metas: [PLANNED_META],
      guardValidators: { "worktree-clean": clean },
    });
    // start from planned → graduate (relocate + branch create + worktree spawn).
    const outcome = await executeTransition(ctx, {
      verb: "start",
      slug: "demo",
      inputs: {
        class: "Novel",
        toDir: ".arc/active",
        branchOp: { mutation: "create" },
        worktreeOp: {
          mutation: "spawn",
          branch: "plan/demo",
          base: "main",
          locationTemplate: "{repo}.{branch}",
          repo: "repo",
          wuName: "demo",
          spawningIdentity: "andrew",
        },
      },
    });
    expect(outcome.status).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// 4. Fire encoding legs in a recoverable order; report a mid-bundle failure.
// ---------------------------------------------------------------------------

describe("executeTransition — encoding leg ordering & recovery", () => {
  it("fires worktree teardown before branch delete (the cross-leg constraint)", async () => {
    // park@Planning declares relocate + branch delete + worktree teardown.
    const { ctx, calls } = buildSpies({
      metas: [PLANNING_ACTIVE_META],
      guardValidators: { "worktree-clean": () => ({ ok: true }) },
    });

    const outcome = await executeTransition(ctx, {
      verb: "park",
      slug: "demo",
      inputs: {
        toDir: ".arc/backlog/planned/demo",
        branchOp: { mutation: "delete", branch: "plan/demo" },
        worktreeOp: { mutation: "teardown", worktreePath: "/wt", currentLocus: "/repo" },
      },
    });

    expect(outcome.status).toBe("ok");
    const legCalls = calls.filter((c) => c.startsWith("leg:"));
    // artifacts (relocate) → worktree (teardown) → branch (delete).
    expect(legCalls).toEqual([
      "leg:artifacts:relocate:.arc/active->.arc/backlog/planned/demo",
      "leg:worktree:teardown",
      "leg:branch:delete",
    ]);
    expect(calls.indexOf("leg:worktree:teardown")).toBeLessThan(calls.indexOf("leg:branch:delete"));
  });

  it("reports a mid-bundle leg failure as recoverable — no side-effects, no soft write", async () => {
    const { ctx, calls } = buildSpies({
      metas: [PLANNING_ACTIVE_META],
      guardValidators: { "worktree-clean": () => ({ ok: true }) },
      throwOnLeg: "reconcileWorktree",
    });

    const outcome = await executeTransition(ctx, {
      verb: "park",
      slug: "demo",
      inputs: {
        toDir: ".arc/backlog/planned/demo",
        branchOp: { mutation: "delete", branch: "plan/demo" },
        worktreeOp: { mutation: "teardown", worktreePath: "/wt", currentLocus: "/repo" },
      },
    });

    expect(outcome.status).toBe("encoding-failed");
    if (outcome.status !== "encoding-failed") return;
    expect(outcome.failedLeg).toBe("reconcileWorktree");
    expect(outcome.legsFired).toEqual(["artifacts"]); // relocate landed; worktree threw
    expect(outcome.message).toMatch(/boom:reconcileWorktree/);
    // No branch delete after the failed worktree leg, no side-effects, no soft write.
    expect(calls).not.toContain("leg:branch:delete");
    expect(calls.some((c) => c.startsWith("side:"))).toBe(false);
    expect(calls.some((c) => c.startsWith("soft:"))).toBe(false);
  });

  it("rejects before any mutation when a required leg operand is missing", async () => {
    const { ctx, calls } = buildSpies({
      metas: [PLANNING_ACTIVE_META],
      guardValidators: { "worktree-clean": () => ({ ok: true }) },
    });

    // park declares relocate + branch delete + worktree teardown but supplies none.
    const outcome = await executeTransition(ctx, { verb: "park", slug: "demo", inputs: {} });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.stage).toBe("inputs");
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. Side-effects fire only after the encoding legs succeed.
// ---------------------------------------------------------------------------

describe("executeTransition — side-effects after encoding", () => {
  it("fires declared side-effects after the legs, surfacing advisories", async () => {
    const { ctx, calls } = buildSpies({
      metas: [ACTIVE_META],
      sideEffects: {
        "reconcile-roadmap": () => "ROADMAP regen pending: `demo`.",
      },
    });

    const outcome = await executeTransition(ctx, {
      verb: "integrate",
      slug: "demo",
      inputs: { softFields: { nextAction: "Open the PR.", lastCompleted: "Phase 7." } },
    });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.sideEffectsFired).toEqual([
      "reconcile-roadmap",
      "reconcile-status-user",
      "user-workspace",
    ]);
    expect(outcome.advisories).toEqual(["ROADMAP regen pending: `demo`."]);
    // Every leg precedes every side-effect.
    const lastLeg = calls.map((c) => c.startsWith("leg:")).lastIndexOf(true);
    const firstSide = calls.findIndex((c) => c.startsWith("side:"));
    expect(lastLeg).toBeLessThan(firstSide);
  });

  it("rejects before mutation when a declared side-effect has no handler", async () => {
    const { ctx, calls } = buildSpies({ metas: [ACTIVE_META] });
    // Drop the user-workspace handler integrate declares.
    delete ctx.sideEffects?.["user-workspace"];

    const outcome = await executeTransition(ctx, {
      verb: "integrate",
      slug: "demo",
      inputs: { softFields: { nextAction: "x", lastCompleted: "y" } },
    });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.stage).toBe("inputs");
    expect(outcome.message).toMatch(/user-workspace.*no handler/i);
    expect(calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. Apply the soft-field disposition (reset constants + supplied inputs).
// ---------------------------------------------------------------------------

describe("executeTransition — soft-field disposition", () => {
  it("writes reset constants and supplied input values, leaves the rest", async () => {
    // integrate: nextTask reset [none]; nextAction + lastCompleted input; blockers leave.
    const { ctx, softWrites } = buildSpies({ metas: [ACTIVE_META] });

    const outcome = await executeTransition(ctx, {
      verb: "integrate",
      slug: "demo",
      inputs: { softFields: { nextAction: "Open the PR.", lastCompleted: "Phase 7 verified." } },
    });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(softWrites).toHaveLength(1);
    expect(softWrites[0]!.updates).toEqual({
      "Next Task": "[none]",
      "Next Action": "Open the PR.",
      "Last Completed": "Phase 7 verified.",
    });
    expect(softWrites[0]!.updates).not.toHaveProperty("Blockers");
    expect(outcome.softFieldsWritten).toEqual(["Last Completed", "Next Task", "Next Action"]);
  });

  it("writes soft fields in place (no relocate) at the meta's current path", async () => {
    // deactivate (Active → Planning): resets nextTask only, no location move.
    const { ctx, softWrites } = buildSpies({ metas: [ACTIVE_META] });

    const outcome = await executeTransition(ctx, {
      verb: "deactivate",
      slug: "demo",
      inputs: { branchOp: { mutation: "rename", branch: "feat/demo", toBranch: "plan/demo" } },
    });

    expect(outcome.status).toBe("ok");
    expect(softWrites[0]!.path).toBe(".arc/active/meta-demo.md");
    expect(softWrites[0]!.updates).toEqual({ "Next Task": "[none]" });
  });

  it("writes soft fields at the post-relocation path when the edge relocates (archive)", async () => {
    // archive (Active → Shipped): relocate + setPhase + teardown + delete, with
    // nextTask / nextAction / blockers reset and lastCompleted left.
    const { ctx, softWrites } = buildSpies({ metas: [ACTIVE_META] });
    const toDir = ".arc/completed/2026-q2/01_demo";

    const outcome = await executeTransition(ctx, {
      verb: "archive",
      slug: "demo",
      inputs: {
        toDir,
        branchOp: { mutation: "delete", branch: "feat/demo" },
        worktreeOp: { mutation: "teardown", worktreePath: "/wt", currentLocus: "/repo" },
      },
    });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    // The soft-field write targets the relocated meta, not the old active/ path.
    expect(softWrites[0]!.path).toBe(`${toDir}/meta-demo.md`);
    expect(softWrites[0]!.updates).toEqual({
      "Next Task": "[none]",
      Blockers: "[none]",
      "Next Action": "[none]",
    });
    expect(outcome.softFieldsWritten).toEqual(["Next Task", "Blockers", "Next Action"]);
  });

  it("rejects when an `input`-disposed soft field has no supplied value (never fabricated)", async () => {
    const { ctx, calls } = buildSpies({ metas: [ACTIVE_META] });

    // integrate needs nextAction + lastCompleted as inputs; supply neither.
    const outcome = await executeTransition(ctx, { verb: "integrate", slug: "demo", inputs: {} });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.stage).toBe("inputs");
    expect(outcome.message).toMatch(/Next Action|Last Completed/);
    expect(calls).toEqual([]);
  });

  it("skips the soft-field write on a deletion edge (no meta remains)", async () => {
    const { ctx, calls, softWrites } = buildSpies({
      metas: [PROVISIONAL_META],
      withScaffoldOrRemove: true,
    });

    // abandon from provisional removes artifacts; to === null → no soft write.
    const outcome = await executeTransition(ctx, {
      verb: "abandon",
      slug: "demo",
      inputs: { confirmed: true },
    });

    expect(outcome.status).toBe("ok");
    expect(softWrites).toEqual([]);
    expect(calls).toContain("leg:artifacts:remove");
  });
});

// ---------------------------------------------------------------------------
// 7. Emit the ephemeral next-step suggestion (advisory, never persisted).
// ---------------------------------------------------------------------------

describe("executeTransition — ephemeral suggestion", () => {
  it("surfaces the supplied suggestion in the outcome without persisting it", async () => {
    const { ctx, softWrites } = buildSpies({ metas: [ACTIVE_META] });

    const outcome = await executeTransition(ctx, {
      verb: "integrate",
      slug: "demo",
      inputs: {
        suggestion: "Open the PR with `gh pr create`.",
        softFields: { nextAction: "Open the PR.", lastCompleted: "done" },
      },
    });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.suggestion).toBe("Open the PR with `gh pr create`.");
    // The suggestion never reaches a soft-field write.
    for (const w of softWrites) {
      expect(Object.values(w.updates)).not.toContain("Open the PR with `gh pr create`.");
    }
  });

  it("returns a null suggestion when none is supplied", async () => {
    const { ctx } = buildSpies({ metas: [ACTIVE_META] });

    const outcome = await executeTransition(ctx, {
      verb: "deactivate",
      slug: "demo",
      inputs: { branchOp: { mutation: "rename", branch: "feat/demo", toBranch: "plan/demo" } },
    });

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.suggestion).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Never fabricate judgment values — require them in inputs.
// ---------------------------------------------------------------------------

describe("executeTransition — never fabricates judgment values", () => {
  it("rejects the destructive cascade without explicit confirmation", async () => {
    const { ctx, calls } = buildSpies({ metas: [PROVISIONAL_META], withScaffoldOrRemove: true });

    const outcome = await executeTransition(ctx, { verb: "abandon", slug: "demo", inputs: {} });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.stage).toBe("guard");
    expect(outcome.message).toMatch(/confirm/i);
    expect(calls).toEqual([]);
  });

  it("rejects a branchOp whose mutation disagrees with the edge", async () => {
    const { ctx, calls } = buildSpies({ metas: [ACTIVE_META] });

    // deactivate declares a branch `rename`; supply a `delete` instead.
    const inputs: TransitionInputs = {
      branchOp: { mutation: "delete", branch: "feat/demo" },
    };
    const outcome = await executeTransition(ctx, { verb: "deactivate", slug: "demo", inputs });

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.stage).toBe("inputs");
    expect(outcome.message).toMatch(/delete.*does not match.*rename/i);
    expect(calls).toEqual([]);
  });
});
