/**
 * The `stub` creation contract — the single chokepoint every backlog-tier
 * create routes through.
 *
 * `stub` mints a fresh, branchless work unit at a committed backlog tier
 * (`provisional` or `planned`, both physically under `backlog/`). It is the
 * enforcement front door: it refuses creation without an explicit **commitment**
 * and **priority**, never substituting a silent `provisional` / `P3` default.
 * The required-fields *policy* is authored in the work-organization strategy;
 * the *enforcement mechanic* lives here. Because enforcement is pure over the
 * supplied inputs — it never defaults — the non-interactive case needs no TTY
 * branch: an absent value is the same rejection a missing flag is.
 *
 * The verb stays thin per the executor's contract: it validates + supplies the
 * judgment inputs, registers the `scaffold` artifact runner its edge declares,
 * and dispatches through {@link executeTransition}; the executor fires the
 * table-driven legs (here, just the `scaffold` write) and the render
 * side-effects. The commitment selects which of the two `stub` edges fires
 * (provisional vs planned) and projects to the physical destination directory.
 *
 * @module
 */

import { join } from "node:path";

import { isSafeCohortPath, validateCohortPath } from "../../active/cohort-path.js";
import { renderMetaFile, type MetaFieldOverrides } from "../../active/meta-reader.js";
import { ensureDir, type MkdirFn, type WriteFileFn } from "../../template/files.js";
import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import { isSlugSafe } from "../slug.js";

/** The backlog tier a stub commits to — both live physically under `backlog/`. */
export type StubCommitment = "provisional" | "planned";

/** Filesystem seam for writing the scaffolded backlog meta. */
export interface StubScaffoldFs {
  mkdir: MkdirFn;
  writeFile: WriteFileFn;
}

/**
 * The seams `runStub` drives. `executor` carries the transition engine's
 * dependencies *except* the `scaffold` runner, which the contract builds from
 * its own inputs; `fs` is the meta-write seam that runner uses.
 */
export interface StubContext {
  executor: Omit<ExecuteTransitionContext, "scaffoldOrRemove">;
  fs: StubScaffoldFs;
}

/** The judgment + identity inputs a `stub` creation supplies. */
export interface StubParams {
  /** New work-unit name — must not already exist (the create edge requires a nonexistent source). */
  name: string;
  /** Committed backlog tier — required; no default tier is ever assumed. */
  commitment: StubCommitment | undefined;
  /** Work-unit priority written into the scaffolded meta — required; no silent `P3`. */
  priority: string | undefined;
  /** Identity owning the new stub — the meta `Owner`. */
  owner: string;
  /** Parsed external reference (issue / URL) → meta `Origin`, when supplied. */
  origin?: string;
  /** Parsed ARC artifact (spec / draft) → meta `Design`, when supplied. */
  design?: string;
  /** Ephemeral next-step suggestion to surface (advisory; never persisted). */
  suggestion?: string;
  /**
   * Cohort path to enrol the new member under → meta `Cohort` + a cohort-tree
   * placement (`backlog/planned/<cohort>/<name>/`). Single member only; the
   * batch cohort-tree scaffold is `decompose-matrix`'s.
   */
  cohort?: string;
}

/** The outcome of a `stub` attempt — a rejection reason, or the scaffolded meta path. */
export type StubResult =
  | { status: "rejected"; reason: string }
  | { status: "scaffolded"; outcome: TransitionOutcome; metaPath: string };

/**
 * Run the `stub` creation contract: enforce commitment + priority, then scaffold
 * the selected-tier meta through the executor.
 *
 * @param ctx - The executor seams plus the meta-write filesystem seam.
 * @param params - The new WU's name, committed tier, priority, and identity.
 * @returns A rejection (missing judgment) or the scaffolded meta's repo-relative path.
 */
export async function runStub(ctx: StubContext, params: StubParams): Promise<StubResult> {
  // `name` flows straight into directory/file path composition below, so reject
  // anything but a slug before it can escape the artifact root via separators or
  // dot-segments and write an arbitrary repo path.
  if (!isSlugSafe(params.name)) {
    return {
      status: "rejected",
      reason: "`stub` requires a slug-safe name (`[a-z0-9-]`, no path separators or dot segments).",
    };
  }
  if (params.commitment !== "provisional" && params.commitment !== "planned") {
    return {
      status: "rejected",
      reason: "`stub` requires an explicit commitment (`provisional` | `planned`) — refusing to default.",
    };
  }
  if (params.priority === undefined || params.priority.trim() === "") {
    return {
      status: "rejected",
      reason: "`stub` requires an explicit priority — refusing to default (no silent `P3`).",
    };
  }

  const commitment = params.commitment;
  const priority = params.priority;

  // `--cohort` enrols the member in a cohort tree. Cohorts live exclusively
  // under `backlog/planned/` (the membership resolver scans only there), so a
  // provisional cohort member would be invisible — require `planned` rather than
  // silently override the supplied commitment. The path guard mirrors every
  // other callsite that interpolates the field into a directory.
  const cohort = params.cohort?.trim();
  const hasCohort = cohort !== undefined && cohort !== "";
  if (hasCohort) {
    if (commitment !== "planned") {
      return {
        status: "rejected",
        reason: "`stub --cohort` requires `--commitment planned` — cohort members are planned-tier.",
      };
    }
    if (!isSafeCohortPath(cohort)) {
      return {
        status: "rejected",
        reason: `\`stub --cohort\` rejects an unsafe cohort path "${cohort}" (no \`..\`, leading \`/\`, or backslash).`,
      };
    }
    const shapeError = validateCohortPath(cohort);
    if (shapeError !== null) {
      return { status: "rejected", reason: `\`stub --cohort\`: ${shapeError}.` };
    }
  }

  // Logical tier → physical destination: a per-WU subdir under the committed
  // tier, nested in the cohort tree when `--cohort` enrols it.
  const toDir = hasCohort
    ? `.arc/backlog/${commitment}/${cohort}/${params.name}`
    : `.arc/backlog/${commitment}/${params.name}`;
  const metaPath = `${toDir}/meta-${params.name}.md`;

  const scaffoldOrRemove: ExecuteTransitionContext["scaffoldOrRemove"] = async ({ disposition, slug }) => {
    if (disposition !== "scaffold") {
      throw new Error(`stub scaffolds a fresh meta; received a \`${disposition}\` disposition.`);
    }
    const overrides: MetaFieldOverrides = {
      State: "Planning",
      Owner: params.owner,
      Branch: "[none]",
      Priority: priority,
    };
    if (params.origin !== undefined) overrides.Origin = params.origin;
    if (params.design !== undefined) overrides.Design = params.design;
    if (hasCohort) overrides.Cohort = cohort;

    await ensureDir(join(ctx.executor.cwd, toDir), ctx.fs.mkdir);
    await ctx.fs.writeFile(join(ctx.executor.cwd, toDir, `meta-${slug}.md`), renderMetaFile(slug, overrides));
  };

  const outcome = await executeTransition(
    { ...ctx.executor, scaffoldOrRemove },
    { verb: "stub", slug: params.name, inputs: { commitment, suggestion: params.suggestion } },
  );

  if (outcome.status !== "ok") {
    return { status: "rejected", reason: outcome.message };
  }
  return { status: "scaffolded", outcome, metaPath };
}
