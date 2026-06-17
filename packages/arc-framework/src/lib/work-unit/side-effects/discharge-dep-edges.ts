/**
 * The `discharge-dep-edges` side-effect — the write half of dep-edge discharge,
 * fired at `activate`.
 *
 * `Depends On` carries two concerns under one label: a **live scheduling gate**
 * (currently-blocking deps) and **build lineage** (atemporal "built on B"). This
 * treats the field as the *live gate* and resolves satisfied edges off it at the
 * lifecycle trigger — here, `activate`. Lineage is **not** mirrored into a
 * parallel field (a second source of truth, unwarranted without a consumer):
 * "resolve" is not "destroy" — a discharged edge's history lives in git, the
 * `completed/` archive, and the work unit's own design prose, so dropping it from
 * the gate loses nothing while stopping a stale edge from misleading a later read.
 *
 * The readiness verdict is composed over the resolver's enum — a dep is
 * dischargeable when it is `shipped` **or** `integrating` (the team-review-latency
 * / stacked-delivery case: a dependent may start at its dependency's *integration*,
 * not only its merge) — without redefining the resolver's merged-only `shipped?`.
 * Activation does not imply all deps landed: each edge is examined and only the
 * satisfied ones discharge; unlanded deps stay live (the real remaining blockers).
 *
 * The mechanic rewrites the `Depends On` markdown bullet; the list mutation maps
 * 1:1 to a structured `dependsOn` array, so a later record-backed store can adopt
 * it without reshaping. The index and the meta read/write are injected seams.
 *
 * @module
 */

import { setMetaBulletFields } from "../../active/meta-reader.js";
import { resolveDepStates } from "../lifecycle-deps.js";
import type { LifecycleIndex } from "../lifecycle-index.js";
import { resolveSlugState } from "../lifecycle-resolver.js";

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
  const discharged: string[] = [];
  const live: string[] = [];

  for (const edge of resolveDepStates(ctx.index, op.slug)) {
    const ready = edge.landed || resolveSlugState(ctx.index, edge.slug) === "integrating";
    (ready ? discharged : live).push(edge.slug);
  }

  if (discharged.length > 0) {
    const content = await ctx.readMeta(op.metaPath);
    await ctx.writeMeta(op.metaPath, setMetaBulletFields(content, { "Depends On": renderEdgeList(live) }));
  }

  return { discharged, live };
}
