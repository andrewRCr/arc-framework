/** Version-bound record preparation and atomic persistence shared by lifecycle verbs. */
import { posix } from "node:path";
import { ParsedMetaRecordSchema, type ParsedMetaRecord } from "../active/meta-schema.js";
import { resolveArcPath, type WorkUnitPlacement } from "../layout/index.js";
import { ArchiveSequenceSchema, SlugSchema } from "../kernel/index.js";
import type { Store } from "./contract.js";
import { LinksSchema, CallerProvenanceSchema, type Links, type CallerProvenance } from "./links.js";
import type { StoreRecord } from "./read.js";
import type { StoreResult } from "./refusal.js";
import { BatchInputSchema, MutationSchema, type Mutation, type BatchResult } from "./write.js";
import { WritePlacementSchema, type WritePlacement, type ReadPlacement } from "./placement.js";

/** Select the lifecycle arm once at its invocation boundary.
 * @param store - Optional injected operational store.
 * @returns Whether operational state is off the code branch.
 */
export function usesOffBranchState(store?: Store): boolean { return store?.capabilities.stateOffBranch === true; }

/** Read a work unit by logical slug, retaining its exact version and identity.
 * @param store - Operational store.
 * @param slug - Current or former work-unit slug.
 * @returns The metadata record, or the store's refusal.
 */
export async function readWorkUnit(store: Store, slug: string): Promise<StoreResult<StoreRecord>> {
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) });
  if (lookup.status === "refused") return lookup;
  if (lookup.result.reference.kind !== "work-item/meta") return { status: "refused", refusal: {
    code: "record-malformed", class: "recoverable", reference: lookup.result.reference, rule: "lifecycle.work-unit",
    condition: `\`${slug}\` resolves to an Errand rather than a work unit.`,
    remedy: { text: `Use the Errand verb for \`${slug}\`, or name a work unit.` },
  } };
  return store.read({ reference: lookup.result.reference });
}

/** Validate fields from the exact selected metadata record without imposing a verb's lifecycle policy. */
export function readLifecycleMetaFields(record: StoreRecord): StoreResult<ParsedMetaRecord> {
  const parsed = ParsedMetaRecordSchema.safeParse(record.fields);
  if (parsed.success) return { status: "ok", result: parsed.data };
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: record.reference,
    rule: "lifecycle.meta-fields", condition: `Metadata fields for \`${record.reference.owner.name}\` could not be read.`,
    remedy: { text: "Repair the work unit's metadata fields, then retry." } } };
}

/** Convert backend-assigned read placement into the caller's write coordinates.
 * @param record - Record carrying its selected placement.
 * @returns Placement without archive sequence, or absence for a non-primary record.
 */
export function recordWritePlacement(record: StoreRecord): WritePlacement | undefined {
  const placement = record.placement;
  return placement === undefined ? undefined : WritePlacementSchema.parse(placement.kind === "completed"
    ? { kind: "completed", quarter: placement.quarter } : placement);
}

/** Prepare an expected-version put, preserving placement and omitting unset links.
 * @param record - Exact record basis read by the verb.
 * @param changes - New content and explicit placement or links changes.
 * @returns Validated primary or companion mutation.
 */
export function recordPut(record: StoreRecord, changes: { content?: string; placement?: WritePlacement; links?: Links } = {}): Mutation {
  const primary = record.reference.kind === "work-item/meta" || record.reference.kind === "work-item/record";
  const placement = changes.placement ?? (primary ? recordWritePlacement(record) : undefined);
  return MutationSchema.parse({ action: "put", reference: record.reference, expected: record.version,
    content: changes.content ?? record.content, ...(placement === undefined ? {} : { placement }),
    ...(changes.links === undefined ? {} : { links: changes.links }) });
}

/** Land the complete prepared writes under one caller provenance.
 * @param store - Operational store.
 * @param writes - Version-bound mutations.
 * @param provenance - Verb, lifecycle action, and optional bound code head.
 * @returns One atomic result or the original store refusal.
 */
export function batchLifecycleWrites(store: Store, writes: readonly Mutation[], provenance: CallerProvenance): Promise<StoreResult<BatchResult>> {
  return store.batch(BatchInputSchema.parse({ writes: [...writes], provenance: CallerProvenanceSchema.parse(provenance) }));
}

/** Replace keyed link entries while retaining every unrelated link.
 * @param prior - Links read with the primary.
 * @param patch - Link keys and entries written by this verb.
 * @param retire - Explicit branch and task keys removed by the verb.
 * @returns Strict whole replacement links.
 */
export function mergeLifecycleLinks(prior: Links | undefined, patch: Links,
  retire: { branches?: readonly { repository: string; ref: string }[]; taskCaptures?: readonly string[] } = {}): Links {
  const result: Links = { ...prior, ...patch };
  if (prior?.branches !== undefined || patch.branches !== undefined || retire.branches !== undefined) {
    const key = (branch: { repository: string; ref: string }): string => JSON.stringify([branch.repository, branch.ref]);
    const branches = new Map((prior?.branches ?? []).map((branch) => [key(branch), branch]));
    for (const branch of retire.branches ?? []) branches.delete(key(branch));
    for (const branch of patch.branches ?? []) branches.set(key(branch), branch);
    result.branches = [...branches.values()];
  }
  if (prior?.taskCaptures !== undefined || patch.taskCaptures !== undefined || retire.taskCaptures !== undefined) {
    const retired = new Set(retire.taskCaptures ?? []);
    const captures = Object.fromEntries(Object.entries(prior?.taskCaptures ?? {}).filter(([task]) => !retired.has(task)));
    Object.assign(captures, patch.taskCaptures);
    result.taskCaptures = captures;
  }
  return LinksSchema.parse(result);
}

/** Project the selected meta's report path without granting any path-based write authority.
 * @param record - Exact selected metadata record.
 * @param override - Optional requested placement for a move's destination report.
 * @returns Canonical projected metadata path.
 */
export function workUnitMetaPath(record: StoreRecord, override?: ReadPlacement | WritePlacement): string {
  const selected = override ?? record.placement;
  if (selected === undefined) throw new Error("A work-unit meta has no placement");
  let placement: WorkUnitPlacement;
  if (selected.kind === "active") placement = { kind: "active", scope: { kind: "project" } };
  else if (selected.kind === "backlog") {
    const fields = ParsedMetaRecordSchema.parse(record.fields);
    placement = { ...selected, cohort: (fields.cohort ?? "").split("/").filter(Boolean).map((part) => SlugSchema.parse(part)) };
  } else {
    if (!("sequence" in selected)) throw new Error("A completed meta's report path requires its assigned archive sequence");
    placement = { kind: "completed", quarter: selected.quarter, sequence: ArchiveSequenceSchema.parse(selected.sequence) };
  }
  return resolveArcPath({ kind: "work-unit-artifact", placement, slug: record.reference.owner.name, artifact: "meta" });
}

/** Project an own artifact basename without constructing a path in the verb.
 * @param slug - Current work-unit name.
 * @param artifact - Own draft or spec role.
 * @returns Canonical own artifact filename.
 */
export function workUnitArtifactName(slug: string, artifact: "draft" | "spec"): string {
  return posix.basename(resolveArcPath({ kind: "work-unit-artifact", artifact, slug: SlugSchema.parse(slug),
    placement: { kind: "active", scope: { kind: "project" } } }));
}
