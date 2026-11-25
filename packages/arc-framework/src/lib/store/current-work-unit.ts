/** Identity-based current-work-unit resolution over checkout-held records or a marker claim. */
import { ParsedMetaRecordSchema, type ParsedMetaRecord } from "../active/meta-schema.js";
import type { Store } from "./contract.js";
import { recordReferences, OwnerIdentitySchema, type RecordReference } from "./identity.js";
import { identifyWorkUnitArtifactPath } from "../layout/index.js";
import { parseMetaFile } from "../active/meta-reader.js";
import { readClaimedCurrentWorkUnit, type ClaimedCurrentWorkUnit } from "./current-work-unit-marker.js";
import { createStore } from "./create.js";
import { createDefaultStorePorts } from "./default-store-ports.js";
import type { StoreRecord } from "./read.js";
import type { ListingDiagnostic } from "./read.js";
import type { UnboundMarkerClassification } from "../locus/unbound-marker.js";
import type { StoreRefusal } from "./refusal.js";
import { workItemArtifactPath } from "./lifecycle-storage.js";
import { StoreRefusalError } from "./refusal-error.js";
import type { NativeTypedRefusal } from "./native-refusal.js";

/** One readable current candidate, retaining its identity when semantic parsing fails. */
export interface CurrentWorkUnitCandidate {
  reference: RecordReference;
  record?: ParsedMetaRecord;
  diagnostic?: ListingDiagnostic;
}
/**
 * Distinct checkout occupancy outcomes with actionable read warnings. `cause` is the native typed refusal that left an
 * off-branch store's checkout with no candidate, for a caller that reports it whole.
 */
export type CurrentWorkUnitResolution =
  | { status: "unbound"; candidates: []; warnings: string[]; unbound: UnboundMarkerClassification }
  | { status: "none"; candidates: []; warnings: string[]; cause?: NativeTypedRefusal }
  | { status: "resolved"; candidate: CurrentWorkUnitCandidate; candidates: [CurrentWorkUnitCandidate]; warnings: string[] }
  | { status: "ambiguous"; candidates: CurrentWorkUnitCandidate[]; warnings: string[] };
/** Resolve this checkout's current work-unit identity without reading other branches.
 * @param input - Checkout root and an optional already-bound operational store.
 * @returns Resolved, unbound, absent, or ambiguous candidates with their read diagnostics.
 */
export async function resolveCurrentWorkUnit(input: { cwd: string; store?: Store }): Promise<CurrentWorkUnitResolution> {
  const store = input.store ?? createStore(createDefaultStorePorts({ checkoutRoot: input.cwd }));
  const listing = await store.list({ family: "work-item", kind: "work-item/meta", filter: { locations: ["active"], heldHere: true } });
  const warnings: string[] = [];
  const candidates: CurrentWorkUnitCandidate[] = [];
  let marker: ClaimedCurrentWorkUnit | undefined;
  let refused: NativeTypedRefusal | undefined;
  if (listing.status === "ok" && listing.result.status === "complete") {
    for (const value of listing.result.records) {
      const candidate = await readableCandidate(input.cwd, value, warnings);
      if (candidate !== undefined) candidates.push(candidate);
    }
    for (const diagnostic of listing.result.diagnostics) {
      const candidate = await diagnosticCandidate(input.cwd, store, diagnostic, warnings);
      if (candidate !== undefined) candidates.push(candidate);
    }
  } else if (listing.status === "refused") {
    if (listing.refusal.code === "unsupported" && listing.refusal.class === "recoverable" && listing.refusal.case === "held-here") {
      marker = await readClaimedCurrentWorkUnit({ cwd: input.cwd, store }, warnings);
      const candidate = marker.kind === "present" ? await readableCandidate(input.cwd, marker.record, warnings) : undefined;
      if (candidate !== undefined) candidates.push(candidate);
    } else refused = refusedListing(store, listing.refusal, warnings);
  }
  else if (listing.result.status === "unreadable") warnings.push(listing.result.condition);
  candidates.sort((left, right) => left.reference.owner.name < right.reference.owner.name ? -1 : left.reference.owner.name > right.reference.owner.name ? 1 : 0);
  return resolution(candidates, warnings, marker, refused);
}

/** A refused listing warns; an off-branch store's refusal also returns whole as the absence's cause. */
function refusedListing(store: Store, refusal: StoreRefusal, warnings: string[]): NativeTypedRefusal | undefined {
  warnings.push(refusal.condition);
  return store.capabilities.stateOffBranch ? new StoreRefusalError(refusal, true) : undefined;
}

async function readableCandidate(checkoutRoot: string, value: StoreRecord, warnings: string[], diagnostic?: ListingDiagnostic): Promise<CurrentWorkUnitCandidate | undefined> {
  try { parseMetaFile(value.content); }
  catch (error) { warnings.push(`Malformed meta in ${await candidatePath(checkoutRoot, value.reference)}: ${error instanceof Error ? error.message : String(error)}`); return undefined; }
  const parsed = ParsedMetaRecordSchema.safeParse(value.fields);
  return { reference: value.reference, ...(parsed.success ? { record: parsed.data } : {}), ...(diagnostic === undefined ? {} : { diagnostic }) };
}
function resolution(candidates: CurrentWorkUnitCandidate[], warnings: string[], marker?: ClaimedCurrentWorkUnit,
  refused?: NativeTypedRefusal): CurrentWorkUnitResolution {
  if (marker?.kind === "unbound") return { status: "unbound", candidates: [], warnings, unbound: marker };
  if (candidates.length === 0) {
    const cause = refused ?? (marker?.kind === "absent" ? marker.cause : undefined);
    return { status: "none", candidates: [], warnings, ...(cause === undefined ? {} : { cause }) };
  }
  const [candidate] = candidates;
  if (candidates.length === 1 && candidate !== undefined) return { status: "resolved", candidate, candidates: [candidate], warnings };
  return { status: "ambiguous", candidates, warnings };
}

function candidatePath(checkoutRoot: string, reference: RecordReference): Promise<string> {
  return workItemArtifactPath(checkoutRoot, reference.owner.name, "meta", { kind: "active" }, null);
}
async function diagnosticCandidate(checkoutRoot: string, store: Store, diagnostic: ListingDiagnostic, warnings: string[]): Promise<CurrentWorkUnitCandidate | undefined> {
  const address = identifyWorkUnitArtifactPath(diagnostic.key);
  if (address === null || address.artifact !== "meta" || address.placement.kind !== "active") {
    warnings.push(diagnostic.condition); return undefined;
  }
  if (diagnostic.kind === "unreadable") { warnings.push(`Unable to read ${diagnostic.key}: ${diagnostic.condition}`); return undefined; }
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: address.slug }));
  try {
    const read = await store.read({ reference });
    if (read.status === "refused") { warnings.push(`Unable to read ${diagnostic.key}: ${read.refusal.condition}`); return undefined; }
    return await readableCandidate(checkoutRoot, read.result, warnings, diagnostic);
  } catch (error) { warnings.push(`Unable to read ${diagnostic.key}: ${error instanceof Error ? error.message : String(error)}`); return undefined; }
}
