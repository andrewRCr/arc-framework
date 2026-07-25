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
  parseMetaRecord,
  setMetaBulletFields,
} from "../../active/meta-reader.js";
import { canonicalDigest, type CanonicalDigest } from "../../canonical/canonical-json.js";
import type { LifecycleIndex } from "../lifecycle-index.js";
import { resolveSlugState } from "../lifecycle-resolver.js";
import {
  enumerateReferenceTransitions,
  planReferenceReconcile,
  type ReferenceAdvisory,
  type ReferenceTransitionConflict,
  type TrackedReferenceReplacement,
} from "../reference-reconcile.js";
import type { RetirementRecordEnumerationResult } from "../retirement-record-enumeration.js";
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
  | "reference-history-conflict"
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

/** One mechanically rewritable tracked-reference artifact. */
export interface TrackedReferencePlanEdit {
  path: string;
  replacements: readonly TrackedReferenceReplacement[];
}

/** Typed tracked-reference component shared by CLI and session consumers. */
export interface TrackedReferenceReconcileComponent {
  edits: readonly TrackedReferencePlanEdit[];
  conflicts?: readonly ReferenceTransitionConflict[];
}

/** Complete current-WU reconcile plan across dependency, tracked, and advisory components. */
export type CurrentWuReconcilePlan =
  | {
      status: "ready";
      dependency: DependencyReconcileComponent;
      trackedReferences: TrackedReferenceReconcileComponent;
      advisories: readonly ReferenceAdvisory[];
    }
  | {
      status: "conflict";
      dependency: DependencyReconcileComponent;
      trackedReferences: TrackedReferenceReconcileComponent;
      advisories: readonly ReferenceAdvisory[];
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

/** Exact content version checked even when its artifact needs no write. */
export interface CurrentWuReconcileGuard {
  path: string;
  expectedContentDigest: CanonicalDigest;
}

/** Complete current-WU plan carried unchanged from inspection into apply. */
export interface PreparedCurrentWuReconcile {
  slug: string;
  plan: CurrentWuReconcilePlan;
  guards?: readonly CurrentWuReconcileGuard[];
  edits: readonly CurrentWuReconcileEdit[];
}

/** I/O boundary for inspecting and applying one dependent-owned plan. */
export interface CurrentWuReconcileContext {
  index: LifecycleIndex;
  queryDisposition: (input: RetirementDispositionQuery) => Promise<RetirementDispositionQueryResult>;
  enumerateRetirementRecords?: () => Promise<RetirementRecordEnumerationResult>;
  listArtifactPaths?: (slug: string, metaPath: string) => Promise<readonly string[]>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  stagePaths: (paths: readonly string[]) => Promise<void>;
  captureIndexState: () => Promise<() => Promise<void>>;
}

/** Read-only dependencies for producing one exact current-WU reconcile plan. */
export type CurrentWuReconcilePrepareContext = Pick<
  CurrentWuReconcileContext,
  "index" | "queryDisposition" | "enumerateRetirementRecords" | "listArtifactPaths" | "readFile"
>;

/** Mutation dependencies for applying a previously prepared exact plan. */
export type CurrentWuReconcileApplyContext = Pick<
  CurrentWuReconcileContext,
  "readFile" | "writeFile" | "stagePaths" | "captureIndexState"
>;

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

/** Ceremony seam that carries one prepared reconcile across a lifecycle transition. */
export interface CurrentWuReconcileCeremony {
  prepare: (
    op: Omit<CurrentWuReconcileOp, "apply">,
  ) => Promise<Extract<CurrentWuReconcileResult, { status: "clean" | "pending" | "conflict" }>>;
  apply: (prepared: PreparedCurrentWuReconcile) => Promise<CurrentWuReconcileResult>;
}

/** Lifecycle executor extension required by dependent-owned write ceremonies. */
export interface CurrentWuReconcileHost {
  currentWuReconcile: CurrentWuReconcileCeremony;
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
    discharged: conflicts.length === 0 ? canonicalEdges(discharged) : [],
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
  const inspected = await prepareCurrentWuReconcile(ctx, op);
  if (inspected.status === "conflict" || !op.apply) return inspected;
  return applyPreparedCurrentWuReconcile(ctx, inspected.prepared);
}

/**
 * Produce one exact current-WU reconcile plan without mutation.
 *
 * @param ctx - Lifecycle, receipt-query, and read boundaries
 * @param op - Dependent identity and owned meta path
 * @returns A clean, pending, or conflict inspection result
 */
export async function prepareCurrentWuReconcile(
  ctx: CurrentWuReconcilePrepareContext,
  op: Omit<CurrentWuReconcileOp, "apply">,
): Promise<Extract<CurrentWuReconcileResult, { status: "clean" | "pending" | "conflict" }>> {
  let content: string;
  let edges: string[];
  try {
    content = await ctx.readFile(op.metaPath);
    const record = parseMetaRecord(content);
    edges = record.dependsOn;
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

  const artifactPaths = ctx.listArtifactPaths === undefined
    ? [op.metaPath]
    : canonicalEdges(await ctx.listArtifactPaths(op.slug, op.metaPath));
  if (!artifactPaths.includes(op.metaPath)) artifactPaths.push(op.metaPath);
  artifactPaths.sort(byteSort);
  const artifacts = await Promise.all(artifactPaths.map(async (path) => ({
    path,
    content: path === op.metaPath ? content : await ctx.readFile(path),
  })));
  const referencePlan = await prepareReferencePlan(ctx, artifacts);
  const combinedPlan: CurrentWuReconcilePlan = {
    status: plan.status === "conflict" || referencePlan.status === "conflict" ? "conflict" : "ready",
    dependency: plan.dependency,
    trackedReferences: {
      edits: referencePlan.edits.map(({ path, replacements }) => ({ path, replacements })),
      ...(referencePlan.conflicts.length > 0 ? { conflicts: referencePlan.conflicts } : {}),
    },
    advisories: referencePlan.advisories,
  };
  const nextByPath = new Map(referencePlan.edits.map((edit) => [edit.path, edit.content]));
  nextByPath.set(op.metaPath, setMetaBulletFields(nextByPath.get(op.metaPath) ?? content, {
    "Depends On": renderEdgeList([...plan.dependency.after]),
  }));
  const guards = artifacts.map(({ path, content: artifactContent }) => ({
    path,
    expectedContentDigest: canonicalDigest(artifactContent),
  }));
  const edits: CurrentWuReconcileEdit[] = combinedPlan.status === "ready"
    ? artifacts.flatMap(({ path, content: artifactContent }) => {
        const nextContent = nextByPath.get(path) ?? artifactContent;
        return nextContent === artifactContent
          ? []
          : [{ path, expectedContentDigest: canonicalDigest(artifactContent), content: nextContent }];
      })
    : [];
  const prepared: PreparedCurrentWuReconcile = { slug: op.slug, plan: combinedPlan, guards, edits };
  if (combinedPlan.status === "conflict") {
    return {
      status: "conflict",
      prepared,
      reason: plan.dependency.conflicts[0]?.reason ?? "reference-history-conflict",
    };
  }
  if (edits.length === 0 && combinedPlan.advisories.length === 0) return { status: "clean", prepared };
  return { status: "pending", prepared };
}

/**
 * Apply a previously prepared exact reconcile without querying or replanning.
 *
 * @param ctx - Read, write, and staging boundaries
 * @param prepared - The exact plan produced before the enclosing ceremony mutated
 * @returns A clean, pending-advisory, applied, or stale-content conflict result
 */
export async function applyPreparedCurrentWuReconcile(
  ctx: CurrentWuReconcileApplyContext,
  prepared: PreparedCurrentWuReconcile,
): Promise<CurrentWuReconcileResult> {
  if (prepared.plan.status === "conflict") {
    return {
      status: "conflict",
      prepared,
      reason: prepared.plan.dependency.conflicts[0]?.reason ?? "invalid-meta",
    };
  }
  if (prepared.edits.length === 0) {
    return prepared.plan.advisories.length === 0
      ? { status: "clean", prepared }
      : { status: "pending", prepared };
  }

  const originalByPath = new Map<string, string>();
  for (const guard of prepared.guards ?? prepared.edits) {
    let current: string;
    try {
      current = await ctx.readFile(guard.path);
    } catch {
      return { status: "conflict", prepared, reason: "stale-content" };
    }
    if (canonicalDigest(current) !== guard.expectedContentDigest) {
      return { status: "conflict", prepared, reason: "stale-content" };
    }
    originalByPath.set(guard.path, current);
  }

  const restoreIndexState = await ctx.captureIndexState();
  const attemptedPaths: string[] = [];
  const stagedPaths = prepared.edits.map((edit) => edit.path);
  try {
    for (const edit of prepared.edits) {
      attemptedPaths.push(edit.path);
      await ctx.writeFile(edit.path, edit.content);
    }
    await ctx.stagePaths(stagedPaths);
  } catch (error) {
    const rollbackFailures: string[] = [];
    for (const path of [...new Set(attemptedPaths)].reverse()) {
      const original = originalByPath.get(path);
      if (original === undefined) {
        rollbackFailures.push(`${path}: original content unavailable`);
        continue;
      }
      try {
        await ctx.writeFile(path, original);
      } catch (rollbackError) {
        rollbackFailures.push(`${path}: ${errorMessage(rollbackError)}`);
      }
    }
    try {
      await restoreIndexState();
    } catch (rollbackError) {
      rollbackFailures.push(`index: ${errorMessage(rollbackError)}`);
    }
    if (rollbackFailures.length > 0) {
      throw new Error(
        `current-WU reconcile failed: ${errorMessage(error)}. `
        + `Rollback was incomplete: ${rollbackFailures.join("; ")}.`,
        { cause: error },
      );
    }
    throw error;
  }
  return { status: "applied", prepared, stagedPaths };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function invalidPrepared(
  op: Pick<CurrentWuReconcileOp, "slug">,
  reason: DependencyReconcileConflictReason,
): PreparedCurrentWuReconcile {
  return {
    slug: op.slug,
    guards: [],
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

async function prepareReferencePlan(
  ctx: CurrentWuReconcilePrepareContext,
  artifacts: ReadonlyArray<{ path: string; content: string }>,
): Promise<ReturnType<typeof planReferenceReconcile>> {
  if (ctx.enumerateRetirementRecords === undefined || ctx.listArtifactPaths === undefined) {
    return planReferenceReconcile({ transitions: [], artifacts });
  }
  const projected = enumerateReferenceTransitions(await ctx.enumerateRetirementRecords());
  if (projected.status === "conflict") {
    return {
      status: "conflict",
      edits: [],
      advisories: [],
      conflicts: [{ subject: "", reason: projected.reason }],
    };
  }
  return planReferenceReconcile({ transitions: projected.transitions, artifacts });
}

function byteSort(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
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
    captureIndexState: () => Promise.resolve(() => Promise.resolve()),
  }, { ...op, apply: true });
  return {
    discharged: [...result.prepared.plan.dependency.discharged],
    live: [...result.prepared.plan.dependency.live],
  };
}
