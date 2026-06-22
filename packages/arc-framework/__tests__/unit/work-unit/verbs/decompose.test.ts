/**
 * Unit tests for the `decompose` executor's batch N-member cohort scaffold — the
 * first of `runDecompose`'s four legs.
 *
 * The leg generalizes the shipped single-member `arc stub --cohort` to a batch:
 * one call mints N member subdirs, each carrying a `meta-<member>.md` +
 * `draft-<member>.md` skeleton, with fields set from the cut-map and origin. It
 * is a direct writer over `primitives` (not N `executeTransition` calls), so the
 * fs seam is injected and every behavior is asserted over the captured writes.
 * The executor writes **skeletons only** — design-content distribution stays the
 * workflow's conservation gate, honoring the no-fabricate-content contract.
 */

import { describe, it, expect } from "vitest";

import { parseMetaRecord, renderMetaFile, type MetaFieldOverrides } from "../../../../src/lib/active/meta-reader.js";
import {
  runDecompose,
  scaffoldCohortMembers,
  type RunDecomposeContext,
  type ScaffoldCohortMembersContext,
  type ScaffoldCohortMembersParams,
} from "../../../../src/lib/work-unit/verbs/decompose.js";
import type { DecomposeParams, NewMemberEntry } from "../../../../src/lib/work-unit/decompose-cut-map.js";
import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";

const CWD = "/repo";

interface Harness {
  ctx: ScaffoldCohortMembersContext;
  writes: { path: string; content: string }[];
  mkdirs: string[];
}

/** A `scaffoldCohortMembers` context capturing every mkdir + write over an in-memory fs. */
function buildHarness(): Harness {
  const writes: Harness["writes"] = [];
  const mkdirs: string[] = [];
  const ctx: ScaffoldCohortMembersContext = {
    cwd: CWD,
    fs: {
      mkdir: async (path) => {
        mkdirs.push(String(path));
        return undefined;
      },
      writeFile: async (path, content) => {
        writes.push({ path: String(path), content });
      },
    },
  };
  return { ctx, writes, mkdirs };
}

/** A new-member cut entry with the per-test fields varied over a sane default. */
function member(slug: string, over: Partial<NewMemberEntry> = {}): NewMemberEntry {
  return {
    kind: "new-member",
    slug,
    workClass: "Light",
    dependsOn: [],
    receives: ["problem-statement"],
    ...over,
  };
}

const ORIGIN_CONTEXT: ScaffoldCohortMembersParams["originContext"] = {
  origin: "[internal]",
  owner: "andrew",
  priority: "P1",
};

/** Pull the captured write for a member's meta / draft by repo-relative tail. */
function writeFor(writes: Harness["writes"], tail: string): { path: string; content: string } {
  const hit = writes.find((w) => w.path.endsWith(tail));
  if (hit === undefined) throw new Error(`no write ending in "${tail}" (saw ${writes.map((w) => w.path).join(", ")})`);
  return hit;
}

describe("scaffoldCohortMembers — batch N-member scaffold", () => {
  it("scaffolds N (≥ 2) member dirs, each with a meta- and draft- skeleton", async () => {
    const { ctx, writes, mkdirs } = buildHarness();

    const result = await scaffoldCohortMembers(ctx, {
      cohort: "neo",
      originContext: ORIGIN_CONTEXT,
      members: [member("alpha"), member("beta"), member("gamma")],
      internalEdges: [],
    });

    expect(result.map((m) => m.slug)).toEqual(["alpha", "beta", "gamma"]);
    // One dir + two files (meta, draft) per member.
    expect(mkdirs).toContain("/repo/.arc/backlog/planned/neo/alpha");
    expect(mkdirs).toContain("/repo/.arc/backlog/planned/neo/gamma");
    expect(writes).toHaveLength(6);
    expect(result[0]).toEqual({
      slug: "alpha",
      metaPath: ".arc/backlog/planned/neo/alpha/meta-alpha.md",
      draftPath: ".arc/backlog/planned/neo/alpha/draft-alpha.md",
    });
    expect(writeFor(writes, "/neo/beta/meta-beta.md").content).toContain("# Metadata: beta");
    expect(writeFor(writes, "/neo/beta/draft-beta.md").content).toContain("# Draft: beta");
  });

  it("inherits Origin, sets Design to the member's own draft, State Planning, and per-member Class", async () => {
    const { ctx, writes } = buildHarness();

    await scaffoldCohortMembers(ctx, {
      cohort: "neo",
      originContext: { origin: "https://example.test/issue/7", owner: "andrew", priority: "P1" },
      members: [member("alpha", { workClass: "Heavy" }), member("beta", { workClass: "Light" })],
      internalEdges: [],
    });

    const alpha = writeFor(writes, "/neo/alpha/meta-alpha.md").content;
    // Origin inherited from the origin WU (a real URL renders as an autolink).
    expect(alpha).toContain("<https://example.test/issue/7>");
    // Design points at the member's own draft.
    expect(alpha).toContain("`draft-alpha.md`");
    expect(alpha).toContain("Planning");
    expect(alpha).toContain("`Heavy`");
    // Class is per-member from the cut — not inherited across members.
    expect(writeFor(writes, "/neo/beta/meta-beta.md").content).toContain("`Light`");
    // Owner + Priority inherited from the origin.
    expect(alpha).toContain("andrew");
    expect(alpha).toContain("P1");
  });

  it("dual-places the cohort path in the member meta and the draft header", async () => {
    const { ctx, writes } = buildHarness();

    await scaffoldCohortMembers(ctx, {
      cohort: "neo",
      originContext: ORIGIN_CONTEXT,
      members: [member("alpha"), member("beta")],
      internalEdges: [],
    });

    expect(writeFor(writes, "/neo/alpha/meta-alpha.md").content).toContain("**Cohort:** `neo`");
    expect(writeFor(writes, "/neo/alpha/draft-alpha.md").content).toContain("**Cohort:** `neo`");
  });

  it("distributes Depends On by actual need — outgoing + internal edges, never blanket-inherited", async () => {
    const { ctx, writes } = buildHarness();

    await scaffoldCohortMembers(ctx, {
      cohort: "neo",
      originContext: ORIGIN_CONTEXT,
      members: [
        member("alpha", { dependsOn: ["external-x"] }),
        member("beta"),
        member("gamma"),
      ],
      // beta depends on alpha (delivery order); gamma carries no edge.
      internalEdges: [{ from: "beta", to: "alpha" }],
    });

    // alpha keeps only its genuine outgoing edge.
    const alpha = writeFor(writes, "/neo/alpha/meta-alpha.md").content;
    expect(alpha).toContain("**Depends On:** `external-x`");
    // beta gains the internal edge to alpha.
    expect(writeFor(writes, "/neo/beta/meta-beta.md").content).toContain("**Depends On:** `alpha`");
    // gamma depends on nothing — no blanket inheritance from the origin or siblings.
    expect(writeFor(writes, "/neo/gamma/meta-gamma.md").content).toContain("**Depends On:** [none]");
  });

  it("merges a member's outgoing and internal edges without duplication", async () => {
    const { ctx, writes } = buildHarness();

    await scaffoldCohortMembers(ctx, {
      cohort: "neo",
      originContext: ORIGIN_CONTEXT,
      members: [member("alpha"), member("beta", { dependsOn: ["alpha", "external-x"] })],
      internalEdges: [{ from: "beta", to: "alpha" }],
    });

    const beta = writeFor(writes, "/neo/beta/meta-beta.md").content;
    // alpha appears once though it arrives from both the outgoing and the internal edge.
    expect(beta).toContain("**Depends On:** `alpha`, `external-x`");
  });
});

describe("scaffoldCohortMembers — the three parent-position placement arms", () => {
  const cases: { arm: string; cohort: string; dir: string }[] = [
    { arm: "standalone → top-level cohort", cohort: "neo", dir: ".arc/backlog/planned/neo/alpha" },
    { arm: "in-cohort → sub-cohort", cohort: "lifecycle/neo", dir: ".arc/backlog/planned/lifecycle/neo/alpha" },
    { arm: "at-cap → lateral fan-out (origin's existing cohort)", cohort: "agile/parallelism", dir: ".arc/backlog/planned/agile/parallelism/alpha" },
  ];

  for (const { arm, cohort, dir } of cases) {
    it(`places members correctly: ${arm}`, async () => {
      const { ctx, writes, mkdirs } = buildHarness();

      const result = await scaffoldCohortMembers(ctx, {
        cohort,
        originContext: ORIGIN_CONTEXT,
        members: [member("alpha"), member("beta")],
        internalEdges: [],
      });

      expect(mkdirs).toContain(`/repo/${dir}`);
      expect(result[0]!.metaPath).toBe(`${dir}/meta-alpha.md`);
      expect(writeFor(writes, `${dir}/draft-alpha.md`)).toBeDefined();
      // The dual-placed Cohort field carries the full path, whatever the arm.
      expect(writeFor(writes, `${dir}/meta-alpha.md`).content).toContain(`**Cohort:** \`${cohort}\``);
    });
  }
});

// ---------------------------------------------------------------------------
// runDecompose — the fan-out verb (origin teardown · sweep · regen · result)
// ---------------------------------------------------------------------------

/** A lifecycle-index meta fixture — its `(phase, location)` derives from tier + State. */
interface MetaSpec {
  slug: string;
  /** Tier dir under `.arc/` (e.g. `active`, `backlog/planned`). */
  tier: string;
  /** Per-WU subdir under the tier; empty for the flat `active/` layout. */
  subdir: string;
  state: string;
  branch?: string;
  cohort?: string;
  dependsOn?: string[];
  origin?: string;
}

/** Render a fixture meta via the production projection, so `parseMetaRecord` round-trips it. */
function metaContent(spec: MetaSpec): string {
  const o: MetaFieldOverrides = {
    State: spec.state,
    Owner: "andrew",
    Branch: spec.branch ?? "[none]",
    Class: "Heavy",
    Priority: "P1",
  };
  if (spec.cohort !== undefined) o.Cohort = spec.cohort;
  if (spec.dependsOn !== undefined && spec.dependsOn.length > 0) o["Depends On"] = spec.dependsOn.join(", ");
  if (spec.origin !== undefined) o.Origin = spec.origin;
  return renderMetaFile(spec.slug, o);
}

/** Build an injectable lifecycle-index fs over a fixed set of metas (mirrors the abandon harness). */
function buildIndexFs(metas: MetaSpec[]): LifecycleIndexFs {
  const dirs = new Map<string, DirEntry[]>();
  const files = new Map<string, string>();
  const ensure = (dir: string): DirEntry[] => {
    let e = dirs.get(dir);
    if (e === undefined) {
      e = [];
      dirs.set(dir, e);
    }
    return e;
  };
  const addChildDir = (parent: string, name: string): void => {
    const e = ensure(parent);
    if (!e.some((c) => c.name === name && c.isDirectory())) e.push({ name, isDirectory: () => true });
  };

  for (const meta of metas) {
    const tierAbs = `${CWD}/.arc/${meta.tier}`;
    let dirAbs = tierAbs;
    let parent = tierAbs;
    for (const seg of meta.subdir.split("/").filter((s) => s !== "")) {
      addChildDir(parent, seg);
      parent = `${parent}/${seg}`;
      dirAbs = parent;
    }
    const filename = `meta-${meta.slug}.md`;
    ensure(dirAbs).push({ name: filename, isDirectory: () => false });
    files.set(`${dirAbs}/${filename}`, metaContent(meta));
  }

  return {
    readdir: (path) => {
      const e = dirs.get(path);
      return e === undefined ? Promise.reject(new Error(`ENOENT: ${path}`)) : Promise.resolve(e);
    },
    readFile: (path) => {
      const c = files.get(path);
      return c === undefined ? Promise.reject(new Error(`ENOENT: ${path}`)) : Promise.resolve(c);
    },
  };
}

interface RunHarness {
  ctx: RunDecomposeContext;
  writes: { path: string; content: string }[];
  removed: string[];
  rmdirs: string[];
  staged: string[];
  fired: SideEffectId[];
  branchOps: string[];
  worktreeOps: string[];
}

/**
 * Build a `runDecompose` context of spies. `removeTree` seeds the origin-removal
 * fs as an in-memory directory tree (absolute dir → entry names), so the prune
 * walk-up emerges from real emptiness rather than a canned response.
 */
function buildRunHarness(metas: MetaSpec[], removeTree: Record<string, string[]> = {}): RunHarness {
  const writes: RunHarness["writes"] = [];
  const removed: string[] = [];
  const rmdirs: string[] = [];
  const staged: string[] = [];
  const fired: SideEffectId[] = [];
  const branchOps: string[] = [];
  const worktreeOps: string[] = [];

  const tree = new Map<string, Set<string>>(
    Object.entries(removeTree).map(([dir, names]) => [dir, new Set(names)]),
  );
  const removeFs: RunDecomposeContext["removeFs"] = {
    readdir: (path) => {
      const s = tree.get(String(path));
      return s === undefined ? Promise.reject(new Error(`ENOENT: ${String(path)}`)) : Promise.resolve([...s]);
    },
    rm: async (path) => {
      const p = String(path);
      removed.push(p);
      const slash = p.lastIndexOf("/");
      tree.get(p.slice(0, slash))?.delete(p.slice(slash + 1));
    },
    rmdir: async (path) => {
      const p = String(path);
      rmdirs.push(p);
      tree.delete(p);
      const slash = p.lastIndexOf("/");
      tree.get(p.slice(0, slash))?.delete(p.slice(slash + 1));
    },
  };

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user", "user-workspace"] satisfies SideEffectId[]) {
    sideEffects[id] = () => {
      fired.push(id);
      return undefined;
    };
  }

  const executor: Omit<ExecuteTransitionContext, "scaffoldOrRemove"> = {
    cwd: CWD,
    indexFs: buildIndexFs(metas),
    setPhase: async () => ({ phase: "Planning" }),
    relocateArtifacts: async () => ({ moved: [] }),
    reconcileBranch: async (op) => {
      branchOps.push(op.mutation === "delete" ? `delete:${op.branch}` : op.mutation);
    },
    reconcileWorktree: async (op) => {
      worktreeOps.push(op.mutation);
      return op.mutation === "teardown"
        ? { mutation: "teardown", worktreePath: op.worktreePath, locusHopped: true }
        : { mutation: "spawn", worktreePath: "/wt", branch: "x" };
    },
    writeBranchField: async () => {},
    writeCurrentWorkflowField: async () => {},
    writeDesignField: async () => {},
    writeSoftFields: async () => {},
    stageMeta: async (metaPath) => {
      staged.push(metaPath);
    },
    sideEffects,
    guardValidators: { "worktree-clean": () => ({ ok: true }) },
  };

  const fs: ScaffoldCohortMembersContext["fs"] = {
    mkdir: async () => undefined,
    writeFile: async (path, content) => {
      writes.push({ path: String(path), content });
    },
  };

  return { ctx: { executor, fs, removeFs }, writes, removed, rmdirs, staged, fired, branchOps, worktreeOps };
}

function newMember(slug: string, over: Partial<NewMemberEntry> = {}): NewMemberEntry {
  return { kind: "new-member", slug, workClass: "Light", dependsOn: [], receives: ["problem-statement"], ...over };
}

/** A symmetric, standalone two-member cut over origin `mono` → cohort `mono`. */
function symmetricCut(over: Partial<DecomposeParams> = {}): DecomposeParams {
  return {
    schemaVersion: 1,
    origin: { slug: "mono", phase: "Planning", location: "active" },
    shape: "symmetric",
    parentPosition: "standalone",
    cohort: "mono",
    entries: [newMember("alpha"), newMember("beta")],
    internalEdges: [],
    ...over,
  };
}

describe("runDecompose — origin teardown via the reserved edges (Task 3.2)", () => {
  it("retires a started origin's artifacts but defers branch + worktree teardown out-of-band", async () => {
    const h = buildRunHarness([{ slug: "mono", tier: "active", subdir: "", state: "Planning", branch: "plan/mono" }], {
      [`${CWD}/.arc/active`]: ["meta-mono.md", "draft-mono.md"],
    });

    const result = await runDecompose(h.ctx, { cut: symmetricCut() });

    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;
    expect(result.result.origin).toBe("retired");
    expect(h.removed).toContain(`${CWD}/.arc/active/meta-mono.md`);
    // Teardown is out-of-band (post-merge `arc teardown --force`): the verb fires no
    // in-verb branch / worktree legs and instead returns the locators for the workflow.
    expect(h.branchOps).toEqual([]);
    expect(h.worktreeOps).toEqual([]);
    expect(result.result.teardown).toEqual({ slug: "mono", branch: "plan/mono" });
  });

  it("fires decompose@planned for a backlog-stub origin — artifacts removed, no teardown owed", async () => {
    const h = buildRunHarness(
      [{ slug: "mono", tier: "backlog/planned", subdir: "mono", state: "Planning", cohort: "mono" }],
      { [`${CWD}/.arc/backlog/planned/mono`]: ["meta-mono.md", "draft-mono.md"] },
    );

    const result = await runDecompose(h.ctx, { cut: symmetricCut({ shape: "backlog-stub-source" }) });

    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;
    expect(h.removed).toContain(`${CWD}/.arc/backlog/planned/mono/meta-mono.md`);
    // A planned-tier stub has no branch / worktree — nothing to tear down, in-verb or out.
    expect(h.branchOps).toEqual([]);
    expect(h.worktreeOps).toEqual([]);
    expect(result.result.teardown).toBeNull();
  });

  it("prunes the emptied subdir of a retired backlog stub — no orphaned cohort dir, parent kept", async () => {
    // An at-cap origin sits at the two-segment cohort `parent/sub`; its members fan
    // out laterally as siblings. Retiring it must drop only its own emptied subdir.
    const h = buildRunHarness(
      [{ slug: "mono", tier: "backlog/planned", subdir: "parent/sub/mono", state: "Planning", cohort: "parent/sub" }],
      {
        [`${CWD}/.arc/backlog/planned/parent/sub/mono`]: ["meta-mono.md", "draft-mono.md"],
        [`${CWD}/.arc/backlog/planned/parent/sub`]: ["mono", "alpha", "beta", "cohort-sub.md"],
      },
    );

    const result = await runDecompose(h.ctx, {
      cut: symmetricCut({ shape: "backlog-stub-source", parentPosition: "at-cap", cohort: undefined }),
    });

    expect(result.status).toBe("decomposed");
    // Members fan out under the origin's existing cohort (the at-cap arm).
    expect(h.writes.some((w) => w.path === `${CWD}/.arc/backlog/planned/parent/sub/alpha/meta-alpha.md`)).toBe(true);
    // The origin's own emptied subdir is pruned; the occupied parent is not.
    expect(h.rmdirs).toContain(`${CWD}/.arc/backlog/planned/parent/sub/mono`);
    expect(h.rmdirs).not.toContain(`${CWD}/.arc/backlog/planned/parent/sub`);
  });

  it("fires no teardown edge on the extraction shape — the origin survives", async () => {
    const h = buildRunHarness([
      { slug: "mono", tier: "active", subdir: "", state: "Active", branch: "feat/mono" },
    ]);

    const cut = symmetricCut({
      shape: "extraction",
      origin: { slug: "mono", phase: "Active", location: "active" },
      entries: [newMember("alpha"), { kind: "surviving-origin", slug: "mono", disposition: "keep-active" }],
    });
    const result = await runDecompose(h.ctx, { cut });

    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;
    expect(result.result.origin).toBe("survived");
    // No origin artifacts removed, no branch / worktree torn down, no teardown owed.
    expect(h.removed).toEqual([]);
    expect(h.branchOps).toEqual([]);
    expect(h.worktreeOps).toEqual([]);
    expect(result.result.teardown).toBeNull();
  });
});

describe("runDecompose — sweep, regen, and structured result (Task 3.3)", () => {
  it("re-points an incoming Depends On edge off the retired origin to the delivering members", async () => {
    const h = buildRunHarness(
      [
        { slug: "mono", tier: "active", subdir: "", state: "Planning", branch: "plan/mono" },
        // A dependent the cut-map never enumerated — caught by the direct index scan.
        { slug: "dependent", tier: "active", subdir: "", state: "Active", dependsOn: ["mono", "other"] },
      ],
      { [`${CWD}/.arc/active`]: ["meta-mono.md", "draft-mono.md"] },
    );

    const result = await runDecompose(h.ctx, { cut: symmetricCut() });

    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;
    expect(result.result.repointed).toEqual([{ dependent: "dependent", to: ["alpha", "beta"] }]);
    // The dependent meta is rewritten (origin slot → delivering members) and staged.
    const rewrite = h.writes.find((w) => w.path === `${CWD}/.arc/active/meta-dependent.md`);
    expect(rewrite).toBeDefined();
    expect(rewrite!.content).toContain("`alpha`");
    expect(rewrite!.content).toContain("`beta`");
    expect(rewrite!.content).toContain("`other`");
    expect(rewrite!.content).not.toMatch(/\*\*Depends On:\*\*[^\n]*`mono`/);
    expect(h.staged).toContain(".arc/active/meta-dependent.md");
  });

  it("regenerates the ROADMAP on a retired shape — carried by the teardown edge", async () => {
    const h = buildRunHarness([{ slug: "mono", tier: "active", subdir: "", state: "Planning", branch: "plan/mono" }], {
      [`${CWD}/.arc/active`]: ["meta-mono.md"],
    });

    await runDecompose(h.ctx, { cut: symmetricCut() });

    expect(h.fired).toContain("reconcile-roadmap");
  });

  it("regenerates the ROADMAP on the extraction shape — driven directly, no teardown edge", async () => {
    const h = buildRunHarness([{ slug: "mono", tier: "active", subdir: "", state: "Active", branch: "feat/mono" }]);

    await runDecompose(h.ctx, {
      cut: symmetricCut({
        shape: "extraction",
        origin: { slug: "mono", phase: "Active", location: "active" },
        entries: [newMember("alpha"), { kind: "surviving-origin", slug: "mono", disposition: "keep-active" }],
      }),
    });

    // Exactly once, though no transition edge fired to carry it.
    expect(h.fired.filter((id) => id === "reconcile-roadmap")).toEqual(["reconcile-roadmap"]);
  });

  it("returns a structured account of members scaffolded, edges re-pointed, and origin disposition", async () => {
    const h = buildRunHarness(
      [
        { slug: "mono", tier: "active", subdir: "", state: "Planning", branch: "plan/mono", origin: "[internal]" },
        { slug: "dependent", tier: "active", subdir: "", state: "Active", dependsOn: ["mono"] },
      ],
      { [`${CWD}/.arc/active`]: ["meta-mono.md"] },
    );

    const result = await runDecompose(h.ctx, { cut: symmetricCut() });

    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;
    expect(result.result.members.map((m) => m.slug)).toEqual(["alpha", "beta"]);
    expect(result.result.members[0]!.metaPath).toBe(".arc/backlog/planned/mono/alpha/meta-alpha.md");
    expect(result.result.repointed).toEqual([{ dependent: "dependent", to: ["alpha", "beta"] }]);
    expect(result.result.origin).toBe("retired");
    expect(result.result.teardown).toEqual({ slug: "mono", branch: "plan/mono" });
  });

  it("rejects when the origin is absent from the index", async () => {
    const h = buildRunHarness([]);

    const result = await runDecompose(h.ctx, { cut: symmetricCut() });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/origin.*absent|not found/i);
  });
});

// ---------------------------------------------------------------------------
// Symmetric-shape regression fixture — golden parity vs. a hand-rolled cohort
// ---------------------------------------------------------------------------

/**
 * A golden lock on the symmetric cell: a representative monolith → multi-member
 * split (the shape that minted the lifecycle cohort by hand) must reproduce the
 * hand-rolled result exactly — every member's full field set, the by-need
 * dependency distribution, and the incoming re-point. Any drift in the scaffold's
 * field composition or the meta projection breaks this, not just a behavior test.
 */
describe("runDecompose — symmetric-shape regression (hand-rolled parity)", () => {
  it("reproduces the hand-rolled cohort result: member fields, distributed edges, re-point", async () => {
    const h = buildRunHarness(
      [
        { slug: "monolith", tier: "active", subdir: "", state: "Planning", branch: "plan/monolith", origin: "[internal]" },
        { slug: "downstream", tier: "active", subdir: "", state: "Active", dependsOn: ["monolith"] },
      ],
      { [`${CWD}/.arc/active`]: ["meta-monolith.md", "draft-monolith.md"] },
    );

    const cut: DecomposeParams = {
      schemaVersion: 1,
      origin: { slug: "monolith", phase: "Planning", location: "active" },
      shape: "symmetric",
      parentPosition: "standalone",
      cohort: "lifecycle-machine",
      entries: [
        newMember("resolver", { workClass: "Heavy", dependsOn: [] }),
        newMember("transition-core", { workClass: "Heavy", dependsOn: [] }),
        newMember("closeout", { workClass: "Light", dependsOn: [] }),
      ],
      // Authored from the cut's delivery order: core after resolver, closeout last.
      internalEdges: [
        { from: "transition-core", to: "resolver" },
        { from: "closeout", to: "transition-core" },
      ],
    };

    const result = await runDecompose(h.ctx, { cut });

    expect(result.status).toBe("decomposed");
    if (result.status !== "decomposed") return;

    // The golden field set per member — inherited Origin/Owner/Priority, per-member
    // Class, own Design, dual-placed Cohort, by-need Depends On, and unset fields at
    // their defaults (nothing else leaked in).
    const golden: Record<string, Record<string, string | null>> = {
      resolver: { Class: "Heavy", "Depends On": "[none]" },
      "transition-core": { Class: "Heavy", "Depends On": "resolver" },
      closeout: { Class: "Light", "Depends On": "transition-core" },
    };
    for (const [slug, expected] of Object.entries(golden)) {
      const record = parseMetaRecord(writeFor(h.writes, `/lifecycle-machine/${slug}/meta-${slug}.md`).content);
      expect(record).toMatchObject({
        State: "Planning",
        Owner: "andrew",
        Branch: "[none]",
        Class: expected.Class,
        Priority: "P1",
        Cohort: "lifecycle-machine",
        Origin: "[internal]",
        Design: `draft-${slug}.md`,
        "Depends On": expected["Depends On"],
        // Untouched fields stay at their fresh-scaffold defaults — no leakage.
        "Task List": "[none]",
        "Current Workflow": "[none]",
        "PR URL": "[none]",
      });
    }

    // The incoming edge re-points to the full delivering cohort, in cut order.
    expect(result.result.repointed).toEqual([
      { dependent: "downstream", to: ["resolver", "transition-core", "closeout"] },
    ]);
    expect(result.result.members.map((m) => m.metaPath)).toEqual([
      ".arc/backlog/planned/lifecycle-machine/resolver/meta-resolver.md",
      ".arc/backlog/planned/lifecycle-machine/transition-core/meta-transition-core.md",
      ".arc/backlog/planned/lifecycle-machine/closeout/meta-closeout.md",
    ]);
    expect(result.result.origin).toBe("retired");
  });
});
