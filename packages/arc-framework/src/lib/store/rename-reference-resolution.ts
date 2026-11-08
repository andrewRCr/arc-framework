/** Family-scoped interpretation of a name before rewriting shared rename references. */
import type { Store } from "./contract.js";
import { OwnerIdentitySchema, RecordReferenceSchema, sameOwner, type RecordReference } from "./identity.js";
import type { StoreResult } from "./refusal.js";
import type { StoreRecord } from "./read.js";
import type { RecordObservation } from "./write.js";
import { observeRecords } from "./record-observations.js";
import { SlugSchema } from "../kernel/index.js";
import { renderExplained } from "./pull-consumption.js";
import type { RenameReport } from "../work-unit/rename-report.js";

/** Whether ranked references to one name can designate this rename's subject. */
export type RenameReferenceResolution = "subject" | "ambiguous" | "other";

/** A resolution together with the exact records whose presence decided it. */
export interface RenameResolutionEvidence { resolution: RenameReferenceResolution; evidence: RecordObservation[] }

/** Resolve a name once within its declared owner family, returning every record the decision read.
 * @param store - Store view the decision reads.
 * @param subject - The rename's subject.
 * @param name - Name whose references would be rewritten.
 * @returns The resolution and an observation of each resolved or tied record, or the unavailable read.
 */
export async function readRenameResolution(store: Pick<Store, "read">, subject: RecordReference,
  name: string): Promise<StoreResult<RenameResolutionEvidence>> {
  const family = subject.owner.type === "cohort" ? "cohort" : "work-item";
  const reference = RecordReferenceSchema.parse({ owner: OwnerIdentitySchema.parse({ type: family, name }),
    kind: family === "cohort" ? "cohort/document" : "work-item/meta" });
  const read = await store.read({ reference });
  if (read.status === "ok") return { status: "ok", result: {
    resolution: sameOwner(read.result.reference.owner, subject.owner) ? "subject" : "other", evidence: observeRecords([read.result]) } };
  if (read.refusal.code !== "ambiguous-match") return read;
  const tied: StoreRecord[] = [];
  for (const candidate of read.refusal.candidates) {
    const exact = await store.read({ reference: candidate });
    if (exact.status === "refused") return exact;
    tied.push(exact.result);
  }
  return { status: "ok", result: { evidence: observeRecords(tied),
    resolution: read.refusal.candidates.some(candidate => sameOwner(candidate.owner, subject.owner)) ? "ambiguous" : "other" } };
}

/** Resolve a name once within its declared owner family, retaining unavailable evidence as a refusal. */
export async function resolveRenameReferences(store: Pick<Store, "read">, subject: RecordReference,
  name: string): Promise<StoreResult<RenameReferenceResolution>> {
  const resolved = await readRenameResolution(store, subject, name);
  return resolved.status === "refused" ? resolved : { status: "ok", result: resolved.result.resolution };
}

/** Observe ties left by a landed rename without turning a diagnostic failure into another mutation attempt. */
export async function observeRenameFormerName(store: Pick<Store, "lookup">, source: string): Promise<{
  ties: RenameReport["formerSlugTies"]; advisories: string[];
}> {
  const empty = { ties: [], advisories: [] };
  const unavailable = `Could not check ties for former name ${JSON.stringify(source)}:`;
  try {
    const found = await store.lookup({ kind: "slug", slug: SlugSchema.parse(source) });
    if (found.status === "ok" || found.refusal.code === "not-found") return empty;
    const refusal = found.refusal;
    if (refusal.code === "ambiguous-match" && refusal.tie?.name === "former") return {
      ties: [{ slug: source, condition: refusal.condition, remedy: refusal.remedy }], advisories: [],
    };
    if (refusal.code === "ambiguous-match" && refusal.tie?.name === "current") return empty;
    return { ties: [], advisories: [renderExplained([unavailable, refusal.condition], refusal.remedy)] };
  } catch (error) {
    return { ties: [], advisories: [`${unavailable} ${error instanceof Error ? error.message : String(error)}`] };
  }
}
