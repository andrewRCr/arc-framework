/** Bind cohort files to an established live membership or exact canonical archive coordinates. */
import { validateCohortPath } from "../../active/cohort-path.js";
import type { ArcLayoutAddress } from "../../layout/index.js";
import { readLifecycleMetaFields } from "../lifecycle-write.js";
import { OwnerIdentitySchema, recordReferences } from "../identity.js";
import { parseCohortDocument } from "../kinds/cohort/parser.js";
import type { ProjectionSelectionContext } from "./selection-context.js";
import type { AdoptionReference } from "./adoption-target.js";
import { readAdoptionClaim } from "./adoption-claim.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { cohortDocumentPath } from "../lifecycle-record-path.js";
import type { StoreRecord } from "../read.js";

type CohortAddress = Extract<ArcLayoutAddress, { kind: "cohort-copy" | "cohort-document" }>;

/** Resolve only an existing cohort generation, respecting canonical placement and the current claim's membership. */
export function resolveCohortAdoption(root: ProjectionSelectionContext, path: string, address: CohortAddress): Promise<AdoptionReference> {
  if (address.kind === "cohort-copy") return resolveCohortCopyAdoption(root, address);
  const name = address.cohort[1] ?? address.cohort[0];
  return address.placement.kind === "completed" ? resolveArchivedCohort(root, path, name)
    : readLiveCohort(root, name, address.cohort.length === 2 ? address.cohort[0] : null);
}

/** A copy establishes no new cohort: its claimed membership and stored Parent must select one live generation. */
async function resolveCohortCopyAdoption(root: ProjectionSelectionContext,
  address: Extract<ArcLayoutAddress, { kind: "cohort-copy" }>): Promise<AdoptionReference> {
  const current = await readAdoptionClaim(root);
  if (current.kind === "refused") return current;
  if (current.record.reference.kind !== "work-item/meta") return missingCohort(address.cohort);
  const fields = readLifecycleMetaFields(current.record);
  if (fields.status === "refused") return { kind: "refused", mark: markStoreRefusal(fields.refusal, root.context.verb) };
  const membership = fields.result.cohort;
  if (membership === null || validateCohortPath(membership) !== null) return missingCohort(address.cohort);
  const names = membership.split("/"), level = names.indexOf(address.cohort);
  if (level < 0) return missingCohort(address.cohort);
  return readLiveCohort(root, address.cohort, names[level - 1] ?? null);
}

async function readLiveCohort(root: ProjectionSelectionContext, name: string, expectedParent: string | null): Promise<AdoptionReference> {
  const reference = recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name }));
  const read = await root.store.read({ reference });
  if (read.status === "refused") return read.refusal.code === "not-found" ? missingLiveCohort(name, expectedParent)
    : { kind: "refused", mark: markStoreRefusal(read.refusal, root.context.verb) };
  const parent = parseCohortDocument(read.result.content);
  if (read.result.placement !== undefined || !parent.success || parent.data.parent !== expectedParent) {
    return missingLiveCohort(name, expectedParent);
  }
  return { kind: "reference", reference: read.result.reference };
}

async function resolveArchivedCohort(root: ProjectionSelectionContext, path: string, name: string): Promise<AdoptionReference> {
  const listing = await root.store.list({ family: "cohort", kind: "cohort/document", filter: { locations: ["completed"] } });
  if (listing.status === "refused") return { kind: "refused", mark: markStoreRefusal(listing.refusal, root.context.verb) };
  const result = listing.result;
  if (result.status === "unreadable") return { kind: "refused", mark: { reason: result.condition, remedy: result.remedy } };
  if (result.status === "absent") return missingArchive(path);
  if (result.missed || result.diagnostics.length > 0) {
    const first = result.diagnostics[0];
    return first === undefined ? missingArchive(path) : { kind: "refused", mark: { reason: first.condition, remedy: first.remedy } };
  }
  const matching: StoreRecord[] = [];
  for (const record of result.records) {
    if (record.reference.owner.name !== name) continue;
    const parsed = parseCohortDocument(record.content);
    if (!parsed.success) return missingArchive(path);
    if (cohortDocumentPath({ ...record, fields: parsed.data }) === path) matching.push(record);
  }
  const only = matching.length === 1 ? matching[0] : undefined;
  return only === undefined ? missingArchive(path) : { kind: "reference", reference: only.reference };
}

function missingArchive(path: string): Extract<AdoptionReference, { kind: "refused" }> {
  return { kind: "refused", mark: { reason: `No unique archived cohort record is established at ${path}.`,
    remedy: { text: "Restore the cohort archive record at the named quarter and closeout coordinates, then retry." } } };
}

function missingCohort(name: string): Extract<AdoptionReference, { kind: "refused" }> {
  return { kind: "refused", mark: { reason: `No live cohort ${name} is established by this checkout's work-unit membership and the cohort's Parent.`,
    remedy: { text: "Apply the edit in the cohort's canonical file, or repair the work unit's Cohort field and the cohort's live record and Parent, then retry." } } };
}

function missingLiveCohort(name: string, parent: string | null): Extract<AdoptionReference, { kind: "refused" }> {
  return { kind: "refused", mark: { reason: `File adoption requires an existing live cohort ${name} with Parent ${parent ?? "[none]"}.`,
    remedy: { text: "Restore the cohort's live record and matching Parent, or move the file to an existing cohort's canonical path, then retry. A dropped document does not create a cohort." } } };
}
