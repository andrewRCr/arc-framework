/**
 * Current work-unit dependency reconciliation.
 *
 * The pure planner preserves live scheduling edges, discharges satisfied ones,
 * and resolves retired targets through authenticated dependent-specific
 * receipts. The applier binds the resulting rewrite to the exact meta content
 * that produced it and stages only declared current-work-unit paths.
 *
 * `dischargeDepEdges` remains the activation compatibility entry point over the
 * same planner/applier.
 *
 * @module
 */

import {
  parseIdentifierList,
  parseMetaRecord,
  setMetaBulletFields,
} from "../../active/meta-reader.js";
import { canonicalDigest, type CanonicalDigest } from "../../canonical/canonical-json.js";
import type { LifecycleIndex } from "../lifecycle-index.js";
import { resolveSlugState } from "../lifecycle-resolver.js";
import type {
  RetirementDispositionQuery,
  RetirementDispositionQueryResult,
  RetirementEvidenceQuality,
} from "../retirement-disposition-query.js";

/** One evidence hop retained in a dependency repair. */
export interface DependencyReconcileEvidence {
  subject: string;
  quality: RetirementEvidenceQuality;
}

/** Closed reasons that refuse a dependency reconcile before mutation. */
export type DependencyReconcileConflictReason =
  | "self-dependency"
  | "missing-evidence"
  | "missing-target"
  | "ambiguous-evidence"
  | "unmapped-dependent"
  | "version-conflict"
  | "namespace-corrupt"
  | "rename-cycle"
  | "invalid-meta"
  | "stale-content";

/** One edge whose safe result could not be established. */
export interface DependencyReconcileConflict {
  edge: string;
  subject: string;
  reason: DependencyReconcileConflictReason;
}

/** Typed dependency component shared by current-WU reconcile consumers. */
export interface DependencyReconcileComponent {
  before: readonly string[];
  after: readonly string[];
  replacements: ReadonlyArray<{
    retiredSubject: string;
    replacementTargets: readonly string[];
    evidence: readonly DependencyReconcileEvidence[];
  }>;
  drops: ReadonlyArray<{
    retiredSubject: string;
    reason: string;
    evidence: readonly DependencyReconcileEvidence[];
  }>;
  discharged: readonly string[];
  live: readonly string[];
  conflicts: readonly DependencyReconcileConflict[];
}

/** Extensible current-WU reconcile shape; later phases add populated reference components. */
export type CurrentWuReconcilePlan =
  | {
      status: "ready";
      dependency: DependencyReconcileComponent;
      trackedReferences: { edits: readonly never[] };
      advisories: readonly string[];
    }
  | {
      status: "conflict";
      dependency: DependencyReconcileComponent;
      trackedReferences: { edits: readonly never[] };
      advisories: readonly string[];
    };

/** Pure dependency-plan inputs. */
export interface PlanDependencyReconcileInput {
  index: LifecycleIndex;
  dependentSlug: string;
  edges: readonly string[];
  queryDisposition: (input: RetirementDispositionQuery) => Promise<RetirementDispositionQueryResult>;
}

/** One exact current-WU edit guarded by the content that produced it. */
export interface CurrentWuReconcileEdit {
  path: string;
  expectedContentDigest: CanonicalDigest;
  content: string;
}

/** Complete current-WU plan carried unchanged from inspection into apply. */
export interface PreparedCurrentWuReconcile {
  slug: string;
  plan: CurrentWuReconcilePlan;
  edits: readonly CurrentWuReconcileEdit[];
}

/** I/O boundary for inspecting and applying one dependent-owned plan. */
export interface CurrentWuReconcileContext {
  index: LifecycleIndex;
  queryDisposition: (input: RetirementDispositionQuery) => Promise<RetirementDispositionQueryResult>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  stagePaths: (paths: readonly string[]) => Promise<void>;
}

/** Closed public operation result used by CLI and lifecycle callers. */
export type CurrentWuReconcileResult =
  | { status: "clean"; prepared: PreparedCurrentWuReconcile }
  | { status: "pending"; prepared: PreparedCurrentWuReconcile }
  | { status: "applied"; prepared: PreparedCurrentWuReconcile; stagedPaths: readonly string[] }
  | {
      status: "conflict";
      prepared: PreparedCurrentWuReconcile;
      reason: DependencyReconcileConflictReason;
    };

/** Current work-unit target and explicit apply mode. */
export interface CurrentWuReconcileOp {
  slug: string;
  metaPath: string;
  apply: boolean;
}

interface ResolvedRetiredEdge {
  targets: string[];
  discharged: string[];
  evidence: DependencyReconcileEvidence[];
  dropReason?: string;
}

/**
 * Plan the current work unit's dependency repair without reading or writing files.
 *
 * @param input - Current truth, parsed edges, and storage-independent receipt query
 * @returns A complete typed plan or conflicts that refuse the whole rewrite
 */
export async function planDependencyReconcile(
  input: PlanDependencyReconcileInput,
): Promise<CurrentWuReconcilePlan> {
  const before = canonicalEdges(input.edges);
  const after: string[] = [];
  const discharged: string[] = [];
  const live: string[] = [];
  const replacements: DependencyReconcileComponent["replacements"][number][] = [];
  const drops: DependencyReconcileComponent["drops"][number][] = [];
  const conflicts: DependencyReconcileConflict[] = [];

  for (const edge of before) {
    if (edge === input.dependentSlug) {
      conflicts.push({ edge, subject: edge, reason: "self-dependency" });
      continue;
    }
    const state = resolveSlugState(input.index, edge);
    if (state === "shipped" || state === "integrating") {
      discharged.push(edge);
      continue;
    }
    if (state !== "nonexistent") {
      after.push(edge);
      live.push(edge);
      continue;
    }

    const resolved = await resolveRetiredEdge(input, edge, edge, new Set());
    if ("conflict" in resolved) {
      conflicts.push(resolved.conflict);
      continue;
    }
    discharged.push(...resolved.discharged);
    if (resolved.dropReason !== undefined) {
      drops.push({
        retiredSubject: edge,
        reason: resolved.dropReason,
        evidence: resolved.evidence,
      });
      continue;
    }
    replacements.push({
      retiredSubject: edge,
      replacementTargets: canonicalEdges(resolved.targets),
      evidence: resolved.evidence,
    });
    after.push(...resolved.targets);
    live.push(...resolved.targets);
  }

  const component: DependencyReconcileComponent = {
    before,
    after: conflicts.length === 0 ? canonicalEdges(after) : before,
    replacements,
    drops,
    discharged: canonicalEdges(discharged),
    live: conflicts.length === 0 ? canonicalEdges(live) : before,
    conflicts,
  };
  return {
    status: conflicts.length === 0 ? "ready" : "conflict",
    dependency: component,
    trackedReferences: { edits: [] },
    advisories: [],
  };
}

async function resolveRetiredEdge(
  input: PlanDependencyReconcileInput,
  originalEdge: string,
  subject: string,
  visited: Set<string>,
): Promise<ResolvedRetiredEdge | { conflict: DependencyReconcileConflict }> {
  if (visited.has(subject)) {
    return { conflict: { edge: originalEdge, subject, reason: "rename-cycle" } };
  }
  visited.add(subject);
  const resolution = await input.queryDisposition({
    retiredSubject: subject,
    dependentSlug: input.dependentSlug,
  });
  if (resolution.status !== "unique") {
    return {
      conflict: {
        edge: originalEdge,
        subject,
        reason: conflictReason(resolution.status),
      },
    };
  }
  const evidence = [{ subject, quality: resolution.evidenceQuality }] satisfies DependencyReconcileEvidence[];
  switch (resolution.disposition.kind) {
    case "retarget": {
      const target = resolution.disposition.targetSlug;
      if (target === input.dependentSlug) {
        return { conflict: { edge: originalEdge, subject: target, reason: "self-dependency" } };
      }
      const state = resolveSlugState(input.index, target);
      if (state === "nonexistent") {
        const tail = await resolveRetiredEdge(input, originalEdge, target, visited);
        return "conflict" in tail ? tail : { ...tail, evidence: [...evidence, ...tail.evidence] };
      }
      return state === "shipped" || state === "integrating"
        ? { targets: [], discharged: [target], evidence }
        : { targets: [target], discharged: [], evidence };
    }
    case "replace": {
      const targets = canonicalEdges(resolution.disposition.replacementTargets);
      const retained: string[] = [];
      const satisfied: string[] = [];
      for (const target of targets) {
        if (target === input.dependentSlug) {
          return { conflict: { edge: originalEdge, subject: target, reason: "self-dependency" } };
        }
        const state = resolveSlugState(input.index, target);
        if (state === "nonexistent") {
          return { conflict: { edge: originalEdge, subject: target, reason: "missing-target" } };
        }
        (state === "shipped" || state === "integrating" ? satisfied : retained).push(target);
      }
      return { targets: retained, discharged: satisfied, evidence };
    }
    case "drop":
      return {
        targets: [],
        discharged: [],
        evidence,
        dropReason: resolution.disposition.reason,
      };
    case "abandoned":
      return {
        targets: [],
        discharged: [],
        evidence,
        dropReason: "retired work unit was abandoned",
      };
  }
}

function conflictReason(
  status: Exclude<RetirementDispositionQueryResult["status"], "unique">,
): DependencyReconcileConflictReason {
  switch (status) {
    case "absent":
      return "missing-evidence";
    case "ambiguous":
      return "ambiguous-evidence";
    case "unmapped-dependent":
      return "unmapped-dependent";
    case "version-conflict":
      return "version-conflict";
    case "namespace-corrupt":
      return "namespace-corrupt";
  }
}

function canonicalEdges(edges: readonly string[]): string[] {
  return [...new Set(edges)].sort((left, right) =>
    Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
}

/**
 * Inspect or apply one exact current-WU dependency reconcile.
 *
 * @param ctx - Lifecycle, receipt-query, filesystem, and staging boundaries
 * @param op - Dependent identity, owned meta path, and apply mode
 * @returns Closed clean, pending, applied, or conflict result
 */
export async function runCurrentWuReconcile(
  ctx: CurrentWuReconcileContext,
  op: CurrentWuReconcileOp,
): Promise<CurrentWuReconcileResult> {
  let content: string;
  let edges: string[];
  try {
    content = await ctx.readFile(op.metaPath);
    edges = parseIdentifierList(parseMetaRecord(content)["Depends On"]);
  } catch {
    const prepared = invalidPrepared(op, "invalid-meta");
    return { status: "conflict", prepared, reason: "invalid-meta" };
  }

  const plan = await planDependencyReconcile({
    index: ctx.index,
    dependentSlug: op.slug,
    edges,
    queryDisposition: ctx.queryDisposition,
  });
  const nextContent = setMetaBulletFields(content, {
    "Depends On": renderEdgeList([...plan.dependency.after]),
  });
  const edits: CurrentWuReconcileEdit[] = plan.status === "ready" && nextContent !== content
    ? [{
        path: op.metaPath,
        expectedContentDigest: canonicalDigest(content),
        content: nextContent,
      }]
    : [];
  const prepared: PreparedCurrentWuReconcile = { slug: op.slug, plan, edits };
  if (plan.status === "conflict") {
    return {
      status: "conflict",
      prepared,
      reason: plan.dependency.conflicts[0]?.reason ?? "invalid-meta",
    };
  }
  if (edits.length === 0) return { status: "clean", prepared };
  if (!op.apply) return { status: "pending", prepared };

  for (const edit of edits) {
    let current: string;
    try {
      current = await ctx.readFile(edit.path);
    } catch {
      return { status: "conflict", prepared, reason: "stale-content" };
    }
    if (canonicalDigest(current) !== edit.expectedContentDigest) {
      return { status: "conflict", prepared, reason: "stale-content" };
    }
  }
  for (const edit of edits) await ctx.writeFile(edit.path, edit.content);
  const stagedPaths = edits.map((edit) => edit.path);
  await ctx.stagePaths(stagedPaths);
  return { status: "applied", prepared, stagedPaths };
}

function invalidPrepared(
  op: Pick<CurrentWuReconcileOp, "slug">,
  reason: DependencyReconcileConflictReason,
): PreparedCurrentWuReconcile {
  return {
    slug: op.slug,
    edits: [],
    plan: {
      status: "conflict",
      dependency: {
        before: [],
        after: [],
        replacements: [],
        drops: [],
        discharged: [],
        live: [],
        conflicts: [{ edge: "", subject: op.slug, reason }],
      },
      trackedReferences: { edits: [] },
      advisories: [],
    },
  };
}

/** Dependencies for {@link dischargeDepEdges}. */
export interface DischargeDepEdgesContext {
  /** The lifecycle-complete index — resolves each dependency's state. */
  index: LifecycleIndex;
  /** Read the dependent's meta content (production binds `fs.readFile`). */
  readMeta: (metaPath: string) => Promise<string>;
  /** Write the dependent's rewritten meta (production binds `fs.writeFile`). */
  writeMeta: (metaPath: string, content: string) => Promise<void>;
}

/** The dependent WU being activated, and its meta path. */
export interface DischargeDepEdgesOp {
  /** The dependent's slug — whose `Depends On` edges are examined. */
  slug: string;
  /** Path to the dependent's meta (the gate rewrite target). */
  metaPath: string;
}

/** The partition of a dependent's edges after a discharge pass. */
export interface DischargeDepEdgesResult {
  /** Edges resolved off the gate (their dependency is `shipped` ∨ `integrating`). */
  discharged: string[];
  /** Edges still blocking (their dependency has not reached integration). */
  live: string[];
}

/** Render an identifier-list value (each element backticked), or the empty sentinel. */
function renderEdgeList(edges: string[]): string {
  return edges.length === 0 ? "[none]" : edges.map((s) => `\`${s}\``).join(", ");
}

/**
 * Discharge a newly-activated WU's satisfied `Depends On` edges: partition each
 * edge by the `shipped ∨ integrating` readiness verdict and, when any discharge,
 * rewrite the `Depends On` gate to the live set only. A WU with no edges — or no
 * satisfied edge — writes nothing.
 *
 * @param ctx - The index plus the meta read / write seams.
 * @param op - The dependent slug and its meta path.
 * @returns The discharged / live edge partition.
 */
export async function dischargeDepEdges(
  ctx: DischargeDepEdgesContext,
  op: DischargeDepEdgesOp,
): Promise<DischargeDepEdgesResult> {
  const result = await runCurrentWuReconcile({
    index: ctx.index,
    queryDisposition: () => Promise.resolve({ status: "absent" }),
    readFile: ctx.readMeta,
    writeFile: ctx.writeMeta,
    stagePaths: () => Promise.resolve(),
  }, { ...op, apply: true });
  return {
    discharged: [...result.prepared.plan.dependency.discharged],
    live: [...result.prepared.plan.dependency.live],
  };
}
