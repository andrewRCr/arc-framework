/**
 * The `decompose` executor — `runDecompose`'s deterministic legs over the
 * `lifecycle-transition-core` primitives.
 *
 * `decompose` is the first **batch / fan-out** verb: it turns one work unit into
 * a cohort of members, so it is orchestration over primitives — *not* a single
 * `executeTransition` edge (you cannot move one source into N destinations
 * through one transition call). This module holds the first leg: the **batch
 * N-member cohort scaffold**, which generalizes the shipped single-member
 * `arc stub --cohort` ({@link "./stub.ts"}) to N members in one call.
 *
 * The scaffold is a direct writer: for each member it mints a per-member subdir
 * carrying a `meta-<member>.md` + `draft-<member>.md` skeleton, with fields set
 * from the cut-map and the origin. It writes **skeletons only** — the design
 * *content* distribution stays the workflow's conservation gate, honoring the
 * executor's no-fabricate-content contract. ROADMAP regen and origin teardown
 * are the verb's other legs, fired once around this scaffold, not per member.
 *
 * @module
 */

import { join } from "node:path";

import { parseMetaRecord, renderMetaFile, type MetaFieldOverrides } from "../../active/meta-reader.js";
import { ensureDir, type MkdirFn, type WriteFileFn } from "../../template/files.js";
import { repointDependsOn } from "../decompose-sweep.js";
import type { DecomposeParams, InternalEdge, NewMemberEntry } from "../decompose-cut-map.js";
import { buildLifecycleIndex, type LifecycleIndex } from "../lifecycle-index.js";
import { resolveReverseDeps } from "../lifecycle-deps.js";
import {
  executeTransition,
  type ArtifactRunner,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import { resolveSlugState } from "../lifecycle-resolver.js";
import type { Location, Phase } from "../lifecycle-state.js";
import { artifactMatcher, pruneEmptyBacklogSource } from "../mutators/relocate-artifacts.js";

/** Filesystem seam for writing the scaffolded member metas + drafts. */
export interface CohortMemberScaffoldFs {
  mkdir: MkdirFn;
  writeFile: WriteFileFn;
}

/** The seams the batch scaffold drives: the repo root plus the meta/draft write seam. */
export interface ScaffoldCohortMembersContext {
  /** Repository root the relative artifact paths resolve against. */
  cwd: string;
  fs: CohortMemberScaffoldFs;
}

/**
 * The origin-inherited field values every member carries. Resolved from the
 * origin meta by the caller — the executor never re-reads it. `Origin` shares
 * the decomposed concern's provenance; `Owner` and `Priority` inherit because a
 * decomposition stays one developer's concern and the cut-map carries no
 * per-member priority. `Class`, by contrast, is per-member (it lives on each
 * {@link NewMemberEntry}).
 */
export interface ScaffoldOriginContext {
  /** The origin's `Origin` provenance → each member's `Origin`. */
  origin: string;
  /** The origin's `Owner` → each member's `Owner`. */
  owner: string;
  /** The origin's `Priority` → each member's `Priority`. */
  priority: string;
}

/** The resolved request the batch scaffold writes. */
export interface ScaffoldCohortMembersParams {
  /**
   * The resolved cohort placement path the members nest under — dual-placed (the
   * meta `Cohort` field + the draft header). All three parent-position arms
   * collapse to this single value: the caller resolves it (the cut-map's cohort
   * for the standalone / in-cohort arms, the origin's existing cohort for the
   * at-cap lateral fan-out).
   */
  cohort: string;
  /** Origin-inherited field values. */
  originContext: ScaffoldOriginContext;
  /** The cut's new members, in cut-map order. */
  members: NewMemberEntry[];
  /** Internal dependency edges among the members (`from` depends on `to`). */
  internalEdges: InternalEdge[];
}

/** One scaffolded member's repo-relative artifact paths — the substrate the verb's result reports. */
export interface ScaffoldedMember {
  /** The member slug. */
  slug: string;
  /** Repo-relative path to the scaffolded `meta-<slug>.md`. */
  metaPath: string;
  /** Repo-relative path to the scaffolded `draft-<slug>.md`. */
  draftPath: string;
}

/**
 * Resolve a member's full `Depends On` set: its genuine outgoing edges plus the
 * internal edges it originates (`from === slug`), in declared order with
 * duplicates collapsed. Never blanket-inherits the origin's edges — a member
 * that does not touch `X` is not gated behind it.
 */
function memberDependsOn(slug: string, member: NewMemberEntry, internalEdges: InternalEdge[]): string[] {
  const deps = [...member.dependsOn];
  for (const edge of internalEdges) {
    if (edge.from === slug && !deps.includes(edge.to)) deps.push(edge.to);
  }
  return deps;
}

/**
 * Render a fresh member `draft-<slug>.md` skeleton — the pre-PRD synthesis
 * structure the conservation gate fills, mirroring `template-draft.md` (the
 * instructional comment dropped, as {@link renderMetaFile} drops it for metas).
 * The `Cohort` header line is the dual-placement mirror of the meta field.
 *
 * @param slug - The member work-unit slug → the H1 and filename stem.
 * @param origin - The inherited `Origin` provenance for the header.
 * @param cohort - The member's cohort path, mirrored into the header.
 * @returns The rendered draft markdown, terminated by a single newline.
 */
export function renderMemberDraft(slug: string, origin: string, cohort: string): string {
  return `# Draft: ${slug}

- **Origin:** ${origin}
- **Cohort:** \`${cohort}\`
- **Purpose:** —

---

## Problem / Motivation

What are we solving and why? Frame as a problem, not a solution. Include why this matters now.

## Alternatives

Approaches considered and their trade-offs. Even brief notes on rejected alternatives help prevent revisiting the
same ground later.

- **Option A:** Description and key trade-offs
- **Option B:** Description and key trade-offs

## Unknowns and Assumptions

What don't we know yet? What are we assuming? Flag assumptions that are risky or unvalidated — these may need
investigation before committing to a PRD.

## Scope Estimate

Rough size: Small (hours-days) | Medium (days-week) | Large (week+)

Dependencies on other work, if any.
`;
}

/**
 * Scaffold N cohort members in one call — `runDecompose`'s batch-scaffold leg.
 *
 * For each member it ensures a per-member subdir under
 * `backlog/planned/<cohort>/<member>/` and writes a `meta-<member>.md` +
 * `draft-<member>.md` skeleton, with fields set from the cut and the origin:
 * `Origin` / `Owner` / `Priority` inherited (via {@link ScaffoldOriginContext}),
 * `Class` per-member from the cut, `Design` the member's own draft, `State`
 * `Planning`, `Cohort` dual-placed, and `Depends On` distributed by actual need
 * (outgoing + internal edges, never blanket-inherited). It writes skeletons
 * only — design-content distribution is the workflow's conservation gate.
 *
 * @param ctx - The repo root and the meta/draft write seam.
 * @param params - The resolved cohort placement, origin-inherited fields, members, and internal edges.
 * @returns Each scaffolded member's repo-relative meta + draft paths, in cut-map order.
 */
export async function scaffoldCohortMembers(
  ctx: ScaffoldCohortMembersContext,
  params: ScaffoldCohortMembersParams,
): Promise<ScaffoldedMember[]> {
  const { cohort, originContext, members, internalEdges } = params;
  const scaffolded: ScaffoldedMember[] = [];

  for (const member of members) {
    const dir = `.arc/backlog/planned/${cohort}/${member.slug}`;
    const metaPath = `${dir}/meta-${member.slug}.md`;
    const draftPath = `${dir}/draft-${member.slug}.md`;

    const overrides: MetaFieldOverrides = {
      State: "Planning",
      Owner: originContext.owner,
      Branch: "[none]",
      Class: member.workClass,
      Priority: originContext.priority,
      Cohort: cohort,
      Origin: originContext.origin,
      Design: `draft-${member.slug}.md`,
    };
    const deps = memberDependsOn(member.slug, member, internalEdges);
    if (deps.length > 0) overrides["Depends On"] = deps.join(", ");

    await ensureDir(join(ctx.cwd, dir), ctx.fs.mkdir);
    await ctx.fs.writeFile(join(ctx.cwd, metaPath), renderMetaFile(member.slug, overrides));
    await ctx.fs.writeFile(join(ctx.cwd, draftPath), renderMemberDraft(member.slug, originContext.origin, cohort));

    scaffolded.push({ slug: member.slug, metaPath, draftPath });
  }

  return scaffolded;
}

// ---------------------------------------------------------------------------
// runDecompose — the fan-out verb over the four legs
// ---------------------------------------------------------------------------

/** Artifact-removal seam for the origin teardown's `remove` disposition (list, delete, prune). */
export interface DecomposeRemoveFs {
  /** List entry names directly under a directory (matches `fs.readdir(p)`). */
  readdir: (path: string) => Promise<string[]>;
  /** Remove one file (matches `fs.rm(p)`). */
  rm: (path: string) => Promise<void>;
  /** Remove an emptied directory (matches `fs.rmdir(p)`); best-effort. */
  rmdir: (path: string) => Promise<void>;
}

/** The seams `runDecompose` drives across its four legs. */
export interface RunDecomposeContext {
  /**
   * The executor's transition engine (minus the `scaffoldOrRemove` runner, which
   * the verb builds) — drives the origin-teardown edge, stages the re-pointed
   * dependents, builds the index, and carries the render side-effect handlers.
   */
  executor: Omit<ExecuteTransitionContext, "scaffoldOrRemove">;
  /** Meta/draft write seam — the member scaffolds and the re-pointed dependent metas. */
  fs: CohortMemberScaffoldFs;
  /** Artifact-removal seam for the origin teardown. */
  removeFs: DecomposeRemoveFs;
}

/** The operational inputs a `runDecompose` supplies beyond the cut-map. */
export interface RunDecomposeParams {
  /** The validated cut-map — the judgment the executor refuses to fabricate. */
  cut: DecomposeParams;
}

/** One incoming edge re-pointed off the retired origin. */
export interface RepointedEdge {
  /** The dependent WU whose `Depends On` edge named the origin. */
  dependent: string;
  /** The delivering member(s) the edge now names. */
  to: string[];
}

/**
 * The started origin's out-of-band teardown locators — what the workflow's
 * post-merge `arc teardown <slug> --force` call targets. Resolved from meta
 * fields (never `git branch` inference), since `arc teardown` does the git-roster
 * branch / worktree resolution itself at teardown time.
 */
export interface OriginTeardown {
  /** The retired origin slug — the `arc teardown <slug> --force` target. */
  slug: string;
  /** The origin's branch (from the meta `Branch` field) — surfaced for the allocation-map PR description. */
  branch: string;
}

/** The structured account a `runDecompose` returns — the substrate the workflow renders into the allocation map. */
export interface DecomposeResult {
  /** The members scaffolded, in cut order. */
  members: ScaffoldedMember[];
  /** The incoming edges re-pointed off the retired origin (empty on the extraction shape). */
  repointed: RepointedEdge[];
  /** Whether the origin was retired (artifacts removed) or survives (extraction). */
  origin: "retired" | "survived";
  /**
   * The started origin's out-of-band teardown locators, or `null` when none is
   * owed — the extraction shape (origin survives) or a branchless backlog-stub
   * origin (no branch / worktree to reap). The workflow runs `arc teardown
   * <slug> --force` post-merge with these.
   */
  teardown: OriginTeardown | null;
}

/** The outcome of a `runDecompose` — a rejection reason, or the structured account of what it did. */
export type RunDecomposeResult =
  | { status: "rejected"; reason: string }
  | { status: "decomposed"; result: DecomposeResult };

/**
 * Run the decompose verb's deterministic legs over the cut-map — fan-out
 * orchestration, *not* a single `executeTransition` edge: (1) batch-scaffold the
 * new members, (2) retire the origin's **artifacts** through its
 * position-appropriate reserved edge — skipped on the extraction shape, where the
 * origin survives, (3) re-point every incoming `Depends On` edge off a retired
 * origin to the delivering members, and (4) regenerate the ROADMAP on every shape
 * (carried by the retirement edge's render side-effect when one fires; driven
 * directly on the edge-less extraction shape). It writes member skeletons and
 * retires / re-points; it never edits existing artifacts (the heterogeneous homes
 * are workflow-authored) and never relocates a surviving origin (the
 * extraction-park is a separate step).
 *
 * A started origin's branch + worktree teardown is **out-of-band**, not an
 * in-verb leg: firing it here would trip on the verb's own staged (uncommitted)
 * tree and, in-place, target the un-removable primary worktree. Instead
 * `runDecompose` returns its locators in `result.teardown`, and the workflow runs
 * `arc teardown <slug> --force` once the decompose has committed and merged. A
 * backlog-stub origin owns no branch / worktree, so `teardown` is `null` there as
 * on the extraction shape.
 *
 * Every leg resolves state from the logical `(phase, location)` + meta fields —
 * never `git branch` / `git log` inference (the arc-backend design guard).
 *
 * @param ctx - The executor seams plus the scaffold and origin-removal fs seams.
 * @param params - The validated cut-map and the origin worktree locators.
 * @returns A rejection, or the structured account of members, re-points, and origin disposition.
 */
export async function runDecompose(
  ctx: RunDecomposeContext,
  params: RunDecomposeParams,
): Promise<RunDecomposeResult> {
  const { executor } = ctx;
  const { cut } = params;
  const originSlug = cut.origin.slug;

  const index = await buildLifecycleIndex({ cwd: executor.cwd, fs: executor.indexFs });
  const originEntry = index.get(originSlug);
  if (originEntry === undefined) {
    return { status: "rejected", reason: `decompose origin "${originSlug}" is absent from the lifecycle index.` };
  }
  const originRecord = parseMetaRecord(await executor.indexFs.readFile(join(executor.cwd, originEntry.path)));

  // The resolved member-enrolment cohort: the cut-map's cohort for the standalone
  // / in-cohort arms; the origin's existing cohort for the at-cap lateral fan-out
  // (no new node minted), which the cut-map omits.
  const placementCohort = cut.cohort ?? originEntry.cohort ?? undefined;
  if (placementCohort === undefined || placementCohort === "") {
    return {
      status: "rejected",
      reason: `decompose needs a cohort placement: the cut-map omits one and origin "${originSlug}" carries no cohort.`,
    };
  }

  const newMembers = cut.entries.filter((e): e is NewMemberEntry => e.kind === "new-member");

  // Leg 1 — batch N-member scaffold.
  const members = await scaffoldCohortMembers(
    { cwd: executor.cwd, fs: ctx.fs },
    {
      cohort: placementCohort,
      originContext: {
        origin: originRecord.Origin ?? "[internal]",
        owner: originRecord.Owner ?? "—",
        priority: originRecord.Priority ?? "P3",
      },
      members: newMembers,
      internalEdges: cut.internalEdges,
    },
  );

  const originRetired = cut.shape !== "extraction";
  // A started (`Planning`-phase, `active`-location) origin owns a branch + worktree
  // whose teardown runs post-merge; resolve the signal before the artifact remove,
  // while the origin is still in the index.
  const originStarted = resolveSlugState(index, originSlug) === "planning";
  let repointed: RepointedEdge[] = [];
  let teardown: OriginTeardown | null = null;

  if (originRetired) {
    // Leg 3 — incoming-edge re-point sweep (scans the index directly, so it catches
    // dependents the cut-map didn't enumerate). The origin's deliverable is now the
    // whole cohort, so each dependent re-points to the full new-member set; the
    // workflow's allocation map narrows specific edges as judgment.
    const deliveringMembers = newMembers.map((m) => m.slug);
    repointed = await sweepIncomingEdges(ctx, index, originSlug, deliveringMembers);

    // Leg 2 — origin artifact retirement via the reserved edge; its render side-effect fires Leg 4.
    const outcome = await tearDownOrigin(ctx, originSlug);
    if (outcome.status !== "ok") {
      return { status: "rejected", reason: outcome.message };
    }

    // A started origin's branch + worktree teardown is deferred out-of-band — return
    // its locators for the workflow's post-merge `arc teardown --force`. A backlog
    // stub owns no branch / worktree, so none is owed.
    if (originStarted) {
      teardown = { slug: originSlug, branch: originRecord.Branch ?? "[none]" };
    }
  } else {
    // Extraction: the origin survives — no retirement edge, no sweep — but Leg 4 still
    // fires (members appear in `backlog/planned/**`; the thinned origin stays in flight).
    await regenerateRoadmap(ctx, originSlug, originEntry.phase, originEntry.location);
  }

  return {
    status: "decomposed",
    result: { members, repointed, origin: originRetired ? "retired" : "survived", teardown },
  };
}

/**
 * Re-point every incoming `Depends On` edge that names `originSlug` to the
 * delivering members. Discovers dependents over the index ({@link
 * resolveReverseDeps}), rewrites each via {@link repointDependsOn}, and writes +
 * stages only the metas that actually changed (the rewrite is a no-op when the
 * origin is absent, so a non-edge prose mention never triggers a write).
 */
async function sweepIncomingEdges(
  ctx: RunDecomposeContext,
  index: LifecycleIndex,
  originSlug: string,
  deliveringMembers: string[],
): Promise<RepointedEdge[]> {
  const { executor } = ctx;
  const repointed: RepointedEdge[] = [];
  for (const slug of resolveReverseDeps(index, originSlug)) {
    const entry = index.get(slug);
    if (entry === undefined) continue;
    const abs = join(executor.cwd, entry.path);
    const before = await executor.indexFs.readFile(abs);
    const after = repointDependsOn(before, originSlug, deliveringMembers);
    if (after === before) continue;
    await ctx.fs.writeFile(abs, after);
    if (executor.stageMeta !== undefined) await executor.stageMeta(entry.path);
    repointed.push({ dependent: slug, to: deliveringMembers });
  }
  return repointed;
}

/**
 * Retire the origin's **artifacts** through its position-appropriate reserved
 * edge — `decompose@planning` for a started origin, the artifacts-only
 * `decompose@planned` / `decompose@provisional` for a backlog stub. Every edge
 * fires `artifacts: remove` alone; a started origin's branch + worktree teardown
 * is out-of-band (post-merge `arc teardown --force`), never an in-verb leg. The
 * `remove` runner deletes the origin's artifact set and prunes the emptied
 * backlog subdir so a retired stub leaves no orphaned cohort dir.
 */
async function tearDownOrigin(
  ctx: RunDecomposeContext,
  originSlug: string,
): Promise<TransitionOutcome> {
  const { executor } = ctx;
  const scaffoldOrRemove = buildOriginRemoveRunner(executor.cwd, ctx.removeFs);
  return executeTransition({ ...executor, scaffoldOrRemove }, { verb: "decompose", slug: originSlug, inputs: {} });
}

/**
 * Build the origin teardown's `remove` artifact runner: delete the origin's own
 * artifact set (by slug) from its source directory, then prune the now-emptied
 * backlog subdir(s) via the shared {@link pruneEmptyBacklogSource} (a no-op for a
 * flat `active/` origin, which has no per-WU subdir to drop).
 */
function buildOriginRemoveRunner(cwd: string, removeFs: DecomposeRemoveFs): ArtifactRunner {
  return async ({ disposition, slug, fromDir }) => {
    if (disposition !== "remove") {
      throw new Error(`decompose retires the origin via removal; received a \`${disposition}\` disposition.`);
    }
    if (fromDir === null) throw new Error("decompose origin-remove requires a source directory.");

    const absDir = join(cwd, fromDir);
    const matcher = artifactMatcher(slug);
    const names = (await removeFs.readdir(absDir)).filter((n) => matcher.test(n)).sort();
    for (const n of names) await removeFs.rm(join(absDir, n));

    await pruneEmptyBacklogSource(removeFs, absDir);
  };
}

/**
 * Drive ROADMAP regen directly — the extraction shape's Leg 4, where no teardown
 * edge fires to carry the render side-effect. Invokes the same `reconcile-roadmap`
 * handler the edge would, so regen fires exactly once on every shape.
 */
async function regenerateRoadmap(
  ctx: RunDecomposeContext,
  originSlug: string,
  phase: Phase,
  location: Location,
): Promise<void> {
  const handler = ctx.executor.sideEffects?.["reconcile-roadmap"];
  if (handler === undefined) return;
  await handler({ cwd: ctx.executor.cwd, slug: originSlug, from: { phase, location }, to: null, inputs: {} });
}
