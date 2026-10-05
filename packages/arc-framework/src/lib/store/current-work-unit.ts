/** Identity-based current-work-unit resolution over checkout-held records or a marker claim. */
import { ParsedMetaRecordSchema, type ParsedMetaRecord } from "../active/meta-schema.js";
import type { Store } from "./contract.js";
import { recordReferences, OwnerIdentitySchema, type RecordReference } from "./identity.js";
import { identifyWorkUnitArtifactPath, resolveArcPath } from "../layout/index.js";
import { parseMetaFile } from "../active/meta-reader.js";
import { readClaimedCurrentWorkUnit } from "./current-work-unit-marker.js";
import { createStore } from "./create.js";
import { createDefaultStorePorts } from "./default-ports.js";
import type { StoreRecord } from "./read.js";
import type { ListingDiagnostic } from "./read.js";

/** One readable current candidate, retaining its identity when semantic parsing fails. */
export interface CurrentWorkUnitCandidate {
  reference: RecordReference;
  record?: ParsedMetaRecord;
  diagnostic?: ListingDiagnostic;
}
/** Distinct checkout occupancy outcomes with actionable read warnings. */
export type CurrentWorkUnitResolution =
  | { status: "none"; candidates: []; warnings: string[] }
  | { status: "resolved"; candidate: CurrentWorkUnitCandidate; candidates: [CurrentWorkUnitCandidate]; warnings: string[] }
  | { status: "ambiguous"; candidates: CurrentWorkUnitCandidate[]; warnings: string[] };
/** Resolve this checkout's current work-unit identity without reading other branches.
 * @param input - Checkout root and an optional already-bound operational store.
 * @returns Resolved, absent, or ambiguous candidates with their read diagnostics.
 */
export async function resolveCurrentWorkUnit(input: { cwd: string; store?: Store }): Promise<CurrentWorkUnitResolution> {
  const store = input.store ?? createStore(createDefaultStorePorts({ checkoutRoot: input.cwd }));
  const listing = await store.list({ family: "work-item", kind: "work-item/meta", filter: { locations: ["active"], heldHere: true } });
  const warnings: string[] = [];
  const candidates: CurrentWorkUnitCandidate[] = [];
  if (listing.status === "ok" && listing.result.status === "complete") {
    for (const value of listing.result.records) {
      const candidate = readableCandidate(value, warnings);
      if (candidate !== undefined) candidates.push(candidate);
    }
    for (const diagnostic of listing.result.diagnostics) {
      const candidate = await diagnosticCandidate(store, diagnostic, warnings);
      if (candidate !== undefined) candidates.push(candidate);
    }
  } else if (listing.status === "refused") {
    if (listing.refusal.code === "unsupported" && listing.refusal.class === "recoverable" && listing.refusal.case === "held-here") {
      const value = await readClaimedCurrentWorkUnit({ cwd: input.cwd, store }, warnings);
      const candidate = value === undefined ? undefined : readableCandidate(value, warnings);
      if (candidate !== undefined) candidates.push(candidate);
    } else warnings.push(listing.refusal.condition);
  }
  else if (listing.result.status === "unreadable") warnings.push(listing.result.condition);
  candidates.sort((left, right) => left.reference.owner.name < right.reference.owner.name ? -1 : left.reference.owner.name > right.reference.owner.name ? 1 : 0);
  return resolution(candidates, warnings);
}

function readableCandidate(value: StoreRecord, warnings: string[], diagnostic?: ListingDiagnostic): CurrentWorkUnitCandidate | undefined {
  try { parseMetaFile(value.content); }
  catch (error) { warnings.push(`Malformed meta in ${candidatePath(value.reference)}: ${error instanceof Error ? error.message : String(error)}`); return undefined; }
  const parsed = ParsedMetaRecordSchema.safeParse(value.fields);
  return { reference: value.reference, ...(parsed.success ? { record: parsed.data } : {}), ...(diagnostic === undefined ? {} : { diagnostic }) };
}
function resolution(candidates: CurrentWorkUnitCandidate[], warnings: string[]): CurrentWorkUnitResolution {
  if (candidates.length === 0) return { status: "none", candidates: [], warnings };
  const [candidate] = candidates;
  if (candidates.length === 1 && candidate !== undefined) return { status: "resolved", candidate, candidates: [candidate], warnings };
  return { status: "ambiguous", candidates, warnings };
}

function candidatePath(reference: RecordReference): string {
  return resolveArcPath({ kind: "work-unit-artifact", artifact: "meta", slug: reference.owner.name,
    placement: { kind: "active", scope: { kind: "project" } } });
}
async function diagnosticCandidate(store: Store, diagnostic: ListingDiagnostic, warnings: string[]): Promise<CurrentWorkUnitCandidate | undefined> {
  const address = identifyWorkUnitArtifactPath(diagnostic.key);
  if (address === null || address.artifact !== "meta" || address.placement.kind !== "active") {
    warnings.push(diagnostic.condition); return undefined;
  }
  if (diagnostic.kind === "unreadable") { warnings.push(`Unable to read ${diagnostic.key}: ${diagnostic.condition}`); return undefined; }
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: address.slug }));
  try {
    const read = await store.read({ reference });
    if (read.status === "refused") { warnings.push(`Unable to read ${diagnostic.key}: ${read.refusal.condition}`); return undefined; }
    return readableCandidate(read.result, warnings, diagnostic);
  } catch (error) { warnings.push(`Unable to read ${diagnostic.key}: ${error instanceof Error ? error.message : String(error)}`); return undefined; }
}
