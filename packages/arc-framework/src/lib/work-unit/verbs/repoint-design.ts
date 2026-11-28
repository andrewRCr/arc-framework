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
 *   finalization, riding the draft-retire edge. Over a store that keeps state off
 *   the branch, the same write removes the draft record, so the pointer never names
 *   a spec while the draft survives; the in-repo arm repoints only.
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

import { posix } from "node:path";

import { resolveArcPath } from "../../layout/index.js";
import { isSlugSafe } from "../../kernel/schema/slug.js";
import { readWorkUnit, readOwnDraft, recordPut, batchLifecycleWrites, usesOffBranchState, workUnitMetaPath, workUnitArtifactName } from "../../store/lifecycle-write.js";
import { recordReferences, sameOwner, type OwnerIdentity } from "../../store/identity.js";
import { observeRecords } from "../../store/record-observations.js";
import type { Store } from "../../store/contract.js";
import type { StoreRecord } from "../../store/read.js";
import type { Mutation, RecordObservation } from "../../store/write.js";
import type { StoreRefusal, StoreResult } from "../../store/refusal.js";
import { ParsedMetaRecordSchema } from "../../active/meta-schema.js";
import { BEGIN_CURRENT_WORKFLOW_SENTINEL } from "../../active/current-workflow-consistency.js";
import { writeMetaCurrentWorkflow, writeMetaNextAction } from "../../store/kinds/meta/writers.js";
import { writeMetaDesign } from "../../store/kinds/meta/writers.js";
import type { ExecuteTransitionContext } from "../lifecycle-executor.js";

/** The executor capability the design repoint needs — nothing more. */
export type RepointDesignContext = Pick<ExecuteTransitionContext, "cwd" | "writeDesignField" | "store">;

/** The planning moment driving the repoint. */
export type RepointDesignEvent = "draft-created" | "spec-finalized";

/** The outcome of a {@link runRepointDesign} run. */
export type RepointDesignResult =
  | { status: "ok"; metaPath: string; design: string; removedDraft?: string }
  | { status: "rejected"; reason: string; refusal?: StoreRefusal };

/**
 * Repoint the named WU's `Design` for the given planning `event`, resolving the
 * new value against the current (parsed) `Design` list so layered siblings
 * survive.
 *
 * @param ctx - The executor seam carrying the design-field write.
 * @param params - The selected owner for store writes or a slug for in-repo writes, the planning event, and the
 *   parsed in-repo `Design` list.
 * @returns `ok` with the written meta path and composed `Design` value, or `rejected` with a reason.
 */
export async function runRepointDesign(
  ctx: RepointDesignContext,
  params: ({ owner: OwnerIdentity } | { name: string }) & { event: RepointDesignEvent; currentDesign?: string[] },
): Promise<RepointDesignResult> {
  const name = ("owner" in params ? params.owner.name : params.name).trim();
  if (name === "") {
    return { status: "rejected", reason: "A work-unit name is required to repoint `Design`." };
  }
  // `name` flows straight into the meta path and the draft/spec refs below, so
  // reject anything but a slug before it can escape `.arc/active/`.
  if (!isSlugSafe(name)) {
    return {
      status: "rejected",
      reason: "`repoint-design` requires a slug-safe name (`[a-z0-9-]`, no path separators or dot segments).",
    };
  }

  if (ctx.store !== undefined && usesOffBranchState(ctx.store)) {
    if (!("owner" in params)) throw new Error("A store repoint requires a selected work-unit owner");
    return repointThroughStore(ctx.cwd, ctx.store, params.owner, params.event);
  }
  const placement = { kind: "active", scope: { kind: "project" } } as const;
  const draftRef = posix.basename(resolveArcPath({ kind: "work-unit-artifact", placement, slug: name, artifact: "draft" }));
  const specRef = posix.basename(resolveArcPath({ kind: "work-unit-artifact", placement, slug: name, artifact: "spec" }));
  const current = params.currentDesign ?? [];

  // Repoint swaps the WU's own draft↔spec member for the event's target, preserving
  // order and any layered siblings, then dedups so the field stays authoritative —
  // never both the draft and the spec for this WU, never a doubled target.
  const targetRef = params.event === "draft-created" ? draftRef : specRef;
  const supersededRef = params.event === "draft-created" ? specRef : draftRef;
  const swapped = current.map((entry) => (entry === supersededRef ? targetRef : entry));
  const withTarget = swapped.includes(targetRef) ? swapped : [...swapped, targetRef];
  const next = withTarget.filter((entry, index) => withTarget.indexOf(entry) === index);

  const design = next.length === 0 ? "[none]" : next.join(", ");
  const metaPath = resolveArcPath({
    kind: "work-unit-artifact",
    placement,
    slug: name,
    artifact: "meta",
  });
  await ctx.writeDesignField(metaPath, design);
  return { status: "ok", metaPath, design };
}

async function repointThroughStore(cwd: string, store: Store, owner: OwnerIdentity, event: RepointDesignEvent): Promise<RepointDesignResult> {
  const read = await readRepointSubject(store, owner);
  if (read.status === "refused") return rejected(read.refusal);
  const record = read.result;
  const current = ParsedMetaRecordSchema.parse(record.fields).design;
  const draft = workUnitArtifactName(record.reference.owner.name, "draft"), spec = workUnitArtifactName(record.reference.owner.name, "spec");
  const next = repointedDesign(current, draft, spec, event);
  let content = writeMetaDesign(record.content, next);
  if (event === "spec-finalized" && ParsedMetaRecordSchema.parse(record.fields).state === "Planning") {
    content = writeMetaNextAction(writeMetaCurrentWorkflow(content, "generate-tasks"), BEGIN_CURRENT_WORKFLOW_SENTINEL);
  }
  const metaPath = await workUnitMetaPath(cwd, record);
  const retired = event === "spec-finalized" ? await readOwnDraft(store, record) : undefined;
  if (retired?.status === "refused") return rejected(retired.refusal);
  const observations: RecordObservation[] = [];
  if (event === "spec-finalized") {
    const storedSpec = await readStoredSpec(store, record, spec);
    if (storedSpec.status === "refused") return rejected(storedSpec.refusal);
    observations.push(...observeRecords([storedSpec.result]));
    if (retired === undefined) {
      observations.push({ reference: recordReferences["work-item/draft"](record.reference.owner), expected: null });
    }
  }
  const writes: Mutation[] = [recordPut(record, { content })];
  if (retired !== undefined) writes.push({ action: "remove", reference: retired.result.reference, expected: retired.result.version });
  const written = await batchLifecycleWrites(store, writes, { verb: "repoint-design", lifecycleAction: event }, observations);
  if (written.status === "refused") return rejected(repointWriteRefusal(written.refusal, event));
  return { status: "ok", metaPath, design: next.length === 0 ? "[none]" : next.join(", "),
    ...(retired === undefined ? {} : { removedDraft: draft }) };
}

async function readRepointSubject(store: Store, owner: OwnerIdentity): Promise<StoreResult<StoreRecord>> {
  const lookup = await store.lookup({ kind: "slug", slug: owner.name });
  if (lookup.status === "refused") return lookup;
  const actual = lookup.result.reference;
  if (!sameOwner(actual.owner, owner)) {
    return { status: "refused", refusal: { code: "identity-mismatch", class: "recoverable",
      expected: recordReferences["work-item/meta"](owner), actual,
      condition: `The name \`${owner.name}\` now resolves to a different owner than this checkout selected.`,
      remedy: { argv: ["arc", "locus"], text: "Verify the checkout binding and retry from the intended work unit's checkout." },
    } };
  }
  return readWorkUnit(store, owner.name, owner);
}

async function readStoredSpec(store: Store, meta: StoreRecord, filename: string): Promise<StoreResult<StoreRecord>> {
  const read = await store.read({ reference: recordReferences["work-item/spec"](meta.reference.owner) });
  if (read.status === "refused" && read.refusal.code === "not-found") {
    return { status: "refused", refusal: { ...read.refusal,
      condition: `No stored spec \`${filename}\` exists for this work unit.`,
      remedy: { argv: ["arc", "save"], text: "Save the spec from this checkout, then rerun `arc repoint-design spec-finalized`." },
    } };
  }
  return read;
}

function repointWriteRefusal(refusal: StoreRefusal, event: RepointDesignEvent): StoreRefusal {
  if (event !== "spec-finalized" || refusal.code !== "version-conflict") return refusal;
  return { ...refusal, remedy: { argv: ["arc", "status", "--json"],
    text: "Inspect the current work unit, review its stored design again, then rerun `arc repoint-design spec-finalized`." } };
}

function rejected(refusal: StoreRefusal): RepointDesignResult {
  return { status: "rejected", reason: refusal.condition, refusal };
}

function repointedDesign(current: readonly string[], draft: string, spec: string, event: RepointDesignEvent): string[] {
  const target = event === "draft-created" ? draft : spec, superseded = event === "draft-created" ? spec : draft;
  const swapped = current.map((entry) => entry === superseded ? target : entry);
  return [...new Set(swapped.includes(target) ? swapped : [...swapped, target])];
}
