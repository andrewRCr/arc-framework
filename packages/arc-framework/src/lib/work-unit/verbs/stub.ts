/**
 * The `stub` creation contract — the single chokepoint every backlog-tier
 * create routes through.
 *
 * `stub` mints a fresh, branchless work unit at a committed backlog tier
 * (`provisional` or `planned`, both physically under `backlog/`). It is the
 * enforcement front door: it refuses creation without an explicit **commitment**
 * and **priority**, plus a resolved **Class** for planned creation, never
 * substituting a silent `provisional` / `P3` default.
 * The required-fields *policy* is authored in the work-organization strategy;
 * the *enforcement mechanic* lives here. Because enforcement is pure over the
 * supplied inputs — it never defaults — the non-interactive case needs no TTY
 * branch: an absent value is the same rejection a missing flag is.
 *
 * The verb stays thin per the executor's contract: it validates + supplies the
 * judgment inputs, registers the `scaffold` artifact runner its edge declares,
 * and dispatches through {@link executeTransition}; the executor fires the
 * table-driven `scaffold` write, stages the created meta, then renders the
 * side-effects. The commitment selects which of the two `stub` edges fires
 * (provisional vs planned) and projects to the physical destination directory.
 *
 * @module
 */

import type { StoreRefusal } from "../../store/refusal.js";
import { join } from "node:path";
import { usesOffBranchState } from "../../store/lifecycle-write.js";
import { OwnerIdentitySchema, recordReferences } from "../../store/identity.js";
import { renderMetaFile as renderStoreMeta } from "../../store/kinds/meta/writers.js";
import { settleCreationSlugEdges } from "../../store/creation-slug-settlement.js";

import { renderMetaFile, type MetaRenderOverrides } from "../../active/meta-reader.js";
import { MetaPrioritySchema } from "../../active/meta-schema.js";
import { SlugSchema } from "../../kernel/index.js";
import { resolveArcPath } from "../../layout/index.js";
import { projectLifecycleStubMetaPath } from "../../store/lifecycle-stub.js";
import { ensureDir, type MkdirFn, type WriteFileFn } from "../../template/files.js";
import {
  executeTransition,
  type ExecuteTransitionContext,
  type TransitionOutcome,
} from "../lifecycle-executor.js";
import { validateStubParameters, type StubParams, type StubCommitment } from "./stub-parameters.js";
export type { StubParams, StubCommitment } from "./stub-parameters.js";

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

/** The outcome of a `stub` attempt — a rejection reason, or the scaffolded meta path. */
export type StubResult =
  | { status: "rejected"; reason: string; refusal?: StoreRefusal }
  | { status: "scaffolded"; outcome: TransitionOutcome; metaPath: string };

/**
 * Run the `stub` creation contract: enforce commitment, priority, and planned
 * Class, then scaffold the selected-tier meta through the executor.
 *
 * @param ctx - The executor seams plus the meta-write filesystem seam.
 * @param supplied - The new WU's name, committed tier, priority, and identity.
 * @returns A rejection (missing judgment) or the scaffolded meta's repo-relative path.
 */
export async function runStub(ctx: StubContext, supplied: StubParams): Promise<StubResult> {
  const verdict = validateStubParameters(supplied);
  if (verdict.status === "rejected") return verdict;
  const params = verdict.params;
  const { commitment, priority, cls, cohort } = verdict.params;
  const hasCohort = cohort !== undefined;
  const rawCohortSegments = cohort?.split("/") ?? [];
  if (usesOffBranchState(ctx.executor.store)) return runStoreStub(ctx, params, commitment, priority, cls, hasCohort ? cohort : undefined);
  const placement = {
    kind: "backlog",
    commitment,
    cohort: rawCohortSegments.map((segment) => SlugSchema.parse(segment)),
  } as const;
  const toDir = resolveArcPath({ kind: "work-unit-container", placement, slug: params.name });
  const metaPath = resolveArcPath({ kind: "work-unit-artifact", placement, slug: params.name, artifact: "meta" });

  const scaffoldOrRemove: ExecuteTransitionContext["scaffoldOrRemove"] = async ({ disposition, slug }) => {
    if (disposition !== "scaffold") {
      throw new Error(`stub scaffolds a fresh meta; received a \`${disposition}\` disposition.`);
    }
    const overrides: MetaRenderOverrides = {
      state: "Planning",
      owner: params.owner,
      branch: null,
      priority: MetaPrioritySchema.parse(priority),
    };
    if (params.origin !== undefined) {
      overrides.origin = params.origin === "[internal]" ? "internal" : params.origin;
    }
    if (params.design !== undefined) {
      overrides.design = params.design === "[none]" ? [] : [params.design];
    }
    if (cls !== undefined) overrides.workClass = cls;
    if (hasCohort) overrides.cohort = cohort;

    await ensureDir(join(ctx.executor.cwd, toDir), ctx.fs.mkdir);
    await ctx.fs.writeFile(join(ctx.executor.cwd, metaPath), renderMetaFile(slug, overrides));
  };

  const outcome = await executeTransition(
    { ...ctx.executor, scaffoldOrRemove },
    {
      verb: "stub",
      slug: params.name,
      inputs: { commitment, scaffoldMetaPath: metaPath, suggestion: params.suggestion },
    },
  );

  if (outcome.status !== "ok") {
    return { status: "rejected", reason: outcome.message };
  }
  return { status: "scaffolded", outcome, metaPath };
}

async function runStoreStub(ctx: StubContext, params: StubParams, commitment: StubCommitment, priority: string,
  cls: "Light" | "Heavy" | "Novel" | undefined, cohort: string | undefined): Promise<StubResult> {
  const metaPath = projectLifecycleStubMetaPath(params.name, commitment, cohort);
  const creationFields: MetaRenderOverrides = {
    state: "Planning", owner: params.owner, priority: MetaPrioritySchema.parse(priority),
    ...(params.origin === undefined ? {} : { origin: params.origin === "[internal]" ? "internal" : params.origin }),
    ...(params.design === undefined ? {} : { design: params.design === "[none]" ? [] : [params.design] }),
    ...(cls === undefined ? {} : { workClass: cls }), ...(cohort === undefined ? {} : { cohort }),
  };

    const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: params.name }));
    const store = ctx.executor.store;
    if (store === undefined) throw new Error("Store stub requires an operational store");
    const settlement = await settleCreationSlugEdges(store, params.name, reference.owner);
    const outcome = await executeTransition(ctx.executor, { verb: "stub", slug: params.name, inputs: {
      commitment, suggestion: params.suggestion,
      storeTransition: { additionalWrites: [...settlement.writes], observations: settlement.observations, create: { action: "put", reference, expected: null,
        content: renderStoreMeta(params.name, creationFields), placement: { kind: "backlog", commitment } } },
    } });
    if (outcome.status === "ok") return { status: "scaffolded", outcome, metaPath };
    const refusal = outcome.status === "rejected" ? outcome.refusal : undefined;
    return { status: "rejected", reason: `${outcome.message}${refusal === undefined ? "" : ` ${refusal.remedy.text}`}`,
      ...(refusal === undefined ? {} : { refusal }) };
}
