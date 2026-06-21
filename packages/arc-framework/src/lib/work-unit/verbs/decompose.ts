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

import { renderMetaFile, type MetaFieldOverrides } from "../../active/meta-reader.js";
import { ensureDir, type MkdirFn, type WriteFileFn } from "../../template/files.js";
import type { InternalEdge, NewMemberEntry } from "../decompose-cut-map.js";

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
