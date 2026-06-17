/**
 * The event-driven `Design` repoint — the design-pointer write half of the
 * planning-stage-pointer mechanics.
 *
 * `Design` advances by event, never by a presence-scan over the artifact set: a
 * half-written spec must not repoint the field while the draft is still
 * authoritative. Two planning moments fire it, each riding an existing workflow
 * step (no new ceremony):
 *
 * - `draft-created` — `[none] → draft-<name>.md`, when a first draft is produced
 *   (conditional: a `Light` WU that drafts no design goes straight to a spec).
 * - `spec-finalized` — `draft-<name>.md → spec-<name>.md` at `create-spec`
 *   finalization, riding the draft-retire edge (the draft-delete itself is the
 *   workflow's; this is the pointer move).
 *
 * `Design` is an identifier-list, so a repoint operates on the **parsed list** —
 * the draft member is swapped for the spec, layered siblings preserved — never a
 * blind whole-field overwrite. The composed value fires through the executor's
 * `writeDesignField` seam (the same write surface the stage-pointer mechanics
 * extend).
 *
 * The CLI verb spelling is provisional, pending idiomatic-alignment; the
 * invocation points (draft creation, create-spec finalization) are pinned.
 *
 * @module
 */

import type { ExecuteTransitionContext } from "../lifecycle-executor.js";

/** The executor capability the design repoint needs — nothing more. */
export type RepointDesignContext = Pick<ExecuteTransitionContext, "writeDesignField">;

/** The planning moment driving the repoint. */
export type RepointDesignEvent = "draft-created" | "spec-finalized";

/** The outcome of a {@link runRepointDesign} run. */
export type RepointDesignResult =
  | { status: "ok"; metaPath: string; design: string }
  | { status: "rejected"; reason: string };

/**
 * Repoint the named WU's `Design` for the given planning `event`, resolving the
 * new value against the current (parsed) `Design` list so layered siblings
 * survive.
 *
 * @param ctx - The executor seam carrying the design-field write.
 * @param params - `name` (the WU slug, resolving `.arc/active/meta-<name>.md` and the `draft-`/`spec-` filenames),
 *   the `event`, and `currentDesign` (the parsed identifier-list, from `parseIdentifierList`).
 * @returns `ok` with the written meta path and composed `Design` value, or `rejected` with a reason.
 */
export async function runRepointDesign(
  ctx: RepointDesignContext,
  params: { name: string; event: RepointDesignEvent; currentDesign: string[] },
): Promise<RepointDesignResult> {
  const name = params.name.trim();
  if (name === "") {
    return { status: "rejected", reason: "A work-unit name is required to repoint `Design`." };
  }

  const draftRef = `draft-${name}.md`;
  const specRef = `spec-${name}.md`;
  const current = params.currentDesign;

  let next: string[];
  if (params.event === "draft-created") {
    // `[none] → draft-<name>.md`. Idempotent when the draft already points;
    // additive (never clobbering) if a list is somehow already present.
    next = current.includes(draftRef) ? current : [...current, draftRef];
  } else {
    // create-spec finalization: swap the draft member for the spec, preserving
    // order and any layered siblings; the direct (no-draft) path just adds the
    // spec. Idempotent when the spec already points.
    if (current.includes(draftRef)) {
      next = current.map((entry) => (entry === draftRef ? specRef : entry));
    } else if (current.includes(specRef)) {
      next = current;
    } else {
      next = [...current, specRef];
    }
  }

  const design = next.length === 0 ? "[none]" : next.join(", ");
  const metaPath = `.arc/active/meta-${name}.md`;
  await ctx.writeDesignField(metaPath, design);
  return { status: "ok", metaPath, design };
}
