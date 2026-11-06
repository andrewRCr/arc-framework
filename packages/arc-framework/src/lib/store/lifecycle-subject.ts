/** Shared local lifecycle subject selection with evidence retained for each reader's policy. */
import { renderInFlightWarning } from "../git/in-flight-derivation.js";
import { readdir, readFile } from "node:fs/promises";
import type { GitExec } from "../git/index.js";
import type { Store } from "./contract.js";
import type { StoreResult } from "./refusal.js";
import { readLifecycleView } from "./lifecycle-view.js";
import { readWorkUnit, usesOffBranchState } from "./lifecycle-write.js";
import { isComposedLifecycleSlugIndeterminate, resolveCallerComposedLifecycleIndex, type ComposedLifecycleIndexResult } from "../work-unit/composed-lifecycle-index.js";
import { resolveSlugQuery, type SlugStateQuery } from "../work-unit/lifecycle-query.js";

type StoreView = Extract<Awaited<ReturnType<typeof readLifecycleView>>, { status: "ok" }>["result"];
/** Selected query plus the provenance needed for presentation or launch admission. */
export type LifecycleSubjectSelection =
  | { backend: "legacy"; query: SlugStateQuery; indeterminateReason: string | null; composed: ComposedLifecycleIndexResult }
  | { backend: "store"; query: SlugStateQuery; view: StoreView; record: Awaited<ReturnType<typeof readWorkUnit>> };
/** Request-bound acquisition context; selection never refreshes the Store. */
export interface LifecycleSubjectReadContext { cwd: string; exec: GitExec; identity: string | null; store?: Store }

/** Read a subject through the selected backend without interpreting its state as launch permission. */
export async function resolveLifecycleSubject(context: LifecycleSubjectReadContext, slug: string,
  acquisitionPolicy: "local" | "passive-live" = "local"): Promise<StoreResult<LifecycleSubjectSelection>> {
  if (context.store !== undefined && usesOffBranchState(context.store)) return readStoreSubject(context.cwd, context.store, slug);
  const composed = await resolveCallerComposedLifecycleIndex({ ...context, acquisitionPolicy,
    fs: { readdir: path => readdir(path, { withFileTypes: true }), readFile: path => readFile(path, "utf8") } });
  const indeterminateReason = isComposedLifecycleSlugIndeterminate(composed, slug)
    ? composed.qualityFacts.warnings.map(renderInFlightWarning).join("\n") || `Lifecycle evidence for '${slug}' is indeterminate.` : null;
  return { status: "ok", result: { backend: "legacy", indeterminateReason, query: resolveSlugQuery(composed.index, slug), composed } };
}

async function readStoreSubject(checkoutRoot: string, store: Store, slug: string): Promise<StoreResult<LifecycleSubjectSelection>> {
  const view = await readLifecycleView(checkoutRoot, store);
  if (view.status === "refused") return view;
  const record = await readWorkUnit(store, slug);
  if (record.status === "refused" && record.refusal.code !== "not-found") return record;
  if (record.status === "ok" && record.result.conflicts.length > 0) {
    return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: record.result.reference,
      rule: "lifecycle.meta-conflict", condition: `The named work-unit primary has unresolved conflicts: ${record.result.conflicts.map(reference => JSON.stringify(reference)).join(", ")}.`,
      remedy: { text: "Resolve the named conflict records, then retry this status query." } } };
  }
  return { status: "ok", result: { backend: "store", view: view.result, record,
    query: resolveSlugQuery(view.result.index, record.status === "ok" ? record.result.reference.owner.name : slug) } };
}
