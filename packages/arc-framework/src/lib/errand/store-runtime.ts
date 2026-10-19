/** Expected-version ordinary Errand operations over the selected operational store. */
import { SlugSchema, ArchiveQuarterSchema } from "../kernel/index.js";
import type { Store } from "../store/contract.js";
import { OwnerIdentitySchema, recordReferences, sameReference } from "../store/identity.js";
import type { StoreRecord } from "../store/read.js";
import type { Links } from "../store/links.js";
import type { Mutation } from "../store/write.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "../store/project-identity.js";
import { createStoreSyncPort, type StoreSyncPort } from "../store/operational-sync.js";
import { deserializeTransientIdentityRecord, serializeTransientIdentityRecord, type TransientIdentityRecord } from "./identity-record.js";
import { ordinaryErrandTransform, type OrdinaryErrandRecord, type OrdinaryErrandTransition, type OrdinaryErrandTransform } from "./identity-transitions.js";
import type { IdentityTransactionOutcome } from "./identity-transaction.js";

/** Shared invocation ports; companions join the primary's atomic batch. */
export interface ErrandStoreOptions {
  store: Store;
  identity: string;
  sync?: StoreSyncPort;
  projectId?: () => Promise<string>;
  now?: () => string;
  provenanceVerb?: string;
  companionWrites?: readonly Mutation[];
  landingCommit?: NonNullable<Links["landingCommit"]>;
}
/** Exact readable active record, or an actionable expected failure. */
export type StoreErrandRead = { kind: "ready"; record: TransientIdentityRecord | null }
  | { kind: "refused"; reason: string } | { kind: "error"; message: string };
type Basis = { kind: "ready"; saved: StoreRecord | null; record: OrdinaryErrandRecord | null }
  | Extract<StoreErrandRead, { kind: "refused" | "error" }>;

/** Read only active ordinary Errands, pulling through the invocation's sync port first.
 * @param options - Selected store and identity.
 * @param slug - Human handle or claim's current slug.
 * @param claimId - Exact generation for all operations after open.
 * @returns Valid owned Errand, absence, or refusal.
 */
export async function readStoreErrand(options: ErrandStoreOptions, slug: string, claimId?: string): Promise<StoreErrandRead> {
  const basis = await readBasis(options, slug, claimId);
  return basis.kind === "ready" ? { kind: "ready", record: basis.record } : basis;
}
/** Apply today's pure ordinary transition once against the version observed through the store.
 * @param options - Invocation and atomic companion writes.
 * @param request - Exact expected transition and authorization.
 * @returns Applied/idempotent or the existing expected-state refusal.
 */
export async function transitionStoreErrand(options: ErrandStoreOptions, request: OrdinaryErrandTransition): Promise<IdentityTransactionOutcome<OrdinaryErrandRecord | null>> {
  const slug = request.kind === "create" ? request.record.slug : request.previous.slug;
  const claimId = request.kind === "create" ? undefined : request.previous.claimId;
  const basis = await readBasis(options, slug, claimId, request.kind === "retire");
  if (basis.kind !== "ready") return transactionFailure(basis);
  if (request.kind === "retire" && basis.saved?.placement?.kind === "completed") return { kind: "idempotent", value: null, tip: null };
  const owned = request.kind === "create" ? { ...request, record: { ...request.record, owner: SlugSchema.parse(options.identity) } } : request;
  const transitionOptions = request.kind === "resume" ? { ...options, companionWrites: [] } : options;
  return applyTransform(transitionOptions, slug, basis, ordinaryErrandTransform(owned), request.kind === "retire" ? request.previous : undefined);
}
/** Restore an exact prior generation after provisioning fails, with the same version-bound admission.
 * @param options - Selected operational store.
 * @param previous - Generation to locate.
 * @param transform - Existing rollback computation.
 * @param retire - Retain this generation at completed when rolling back a fresh claim.
 * @returns Rollback's transaction outcome.
 */
export async function transformStoreErrand(options: ErrandStoreOptions, previous: OrdinaryErrandRecord,
  transform: OrdinaryErrandTransform, retire = false): Promise<IdentityTransactionOutcome<OrdinaryErrandRecord | null>> {
  const basis = await readBasis(options, previous.slug, previous.claimId, retire);
  if (retire && basis.kind === "ready" && basis.saved?.placement?.kind === "completed") return { kind: "idempotent", value: null, tip: null };
  return basis.kind === "ready" ? applyTransform(options, previous.slug, basis, transform, retire ? previous : undefined) : transactionFailure(basis);
}
async function readBasis(options: ErrandStoreOptions, slug: string, claimId?: string, completed = false): Promise<Basis> {
  const pulled = await (options.sync ?? createStoreSyncPort()).pull();
  if (pulled.status === "unreachable") return { kind: "refused", reason: `${pulled.condition} ${pulled.remedy.text}` };
  const found = await options.store.lookup(claimId === undefined ? { kind: "slug", slug: SlugSchema.parse(slug) }
    : { kind: "claim", claim: { kind: "errand", slug: SlugSchema.parse(slug), claimId } });
  if (found.status === "refused") return found.refusal.code === "not-found" ? { kind: "ready", saved: null, record: null }
    : { kind: "refused", reason: formatRefusal(found.refusal) };
  const read = await options.store.read({ reference: found.result.reference });
  if (read.status === "refused") return { kind: "refused", reason: formatRefusal(read.refusal) };
  return decodeBasis(read.result, slug, options.identity, completed);
}
function decodeBasis(saved: StoreRecord, slug: string, identity: string, completed: boolean): Basis {
  const conflict = errandConflict(saved);
  if (conflict !== null) return conflict;
  if (saved.reference.kind !== "work-item/record") return { kind: "refused", reason: `The slug ${slug} belongs to a work unit; choose another Errand slug.` };
  if (saved.placement?.kind !== "active" && !(completed && saved.placement?.kind === "completed")) return { kind: "ready", saved: null, record: null };
  const decoded = deserializeTransientIdentityRecord(saved.content, saved.reference.owner.name);
  if (decoded.kind !== "valid" || decoded.record.kind !== "errand" || decoded.record.purpose !== "errand") {
    return { kind: "refused", reason: `Malformed Errand record ${saved.reference.owner.name}: ${decoded.kind === "malformed" ? decoded.message : decoded.kind}. Repair the record, then retry.` };
  }
  const record = decoded.record;
  if (record.owner === undefined) return { kind: "refused", reason: `Malformed Errand record ${slug}: owner is missing. Repair its owner, then retry.` };
  if (record.owner !== identity) return { kind: "refused", reason: `Errand ${slug} is owned by ${record.owner}. Choose another slug for a new Errand.` };
  return { kind: "ready", saved, record };
}
async function applyTransform(options: ErrandStoreOptions, slug: string, basis: Extract<Basis, { kind: "ready" }>,
  transform: OrdinaryErrandTransform, retirement?: OrdinaryErrandRecord): Promise<IdentityTransactionOutcome<OrdinaryErrandRecord | null>> {
  const records = new Map<string, TransientIdentityRecord>(basis.record === null ? [] : [[slug, basis.record]]);
  const decision = transform(records);
  if (decision.kind !== "applied") return decision.kind === "idempotent" ? { ...decision, tip: null } : decision;
  const computed = decision.records.get(slug);
  if (computed === undefined && retirement === undefined) return { kind: "refused", reason: "Errand removal requires an exact retirement generation." };
  const prepared = await prepareMutation(options, slug, basis.saved, computed, retirement);
  if (prepared.kind === "refused") return prepared;
  const { mutation, content, links, placement, reference } = prepared;
  const companions = options.companionWrites ?? [];
  const primaryGuard = companions.find(write => sameReference(write.reference, reference));
  if (primaryGuard !== undefined && primaryGuard.expected !== mutation.expected) return { kind: "refused", reason: "The Errand primary changed after entry preparation. Read its entries again, then retry; no writes were applied." };
  const written = await options.store.batch({ writes: [mutation, ...companions.filter(write => !sameReference(write.reference, reference))],
    provenance: { verb: options.provenanceVerb ?? "errand", lifecycleAction: retirement === undefined ? "update" : "retire" } });
  if (written.status === "ok") return { kind: "applied", value: decision.value, tip: "store" };
  if (written.refusal.code === "version-conflict") return rereadExpectedMutation(options.store, slug,
    { reference, content, placement: placement.kind, links }, decision.value);
  return { kind: "refused", reason: formatRefusal(written.refusal) };
}
async function rereadExpectedMutation(store: Store, slug: string,
  expected: { reference: StoreRecord["reference"]; content: string; placement: string; links: Links | undefined },
  value: OrdinaryErrandRecord | null): Promise<IdentityTransactionOutcome<OrdinaryErrandRecord | null>> {
  const reread = await store.read({ reference: expected.reference });
  const conflict = reread.status === "ok" ? errandConflict(reread.result) : null;
  if (conflict !== null) return conflict;
  if (reread.status === "ok" && agrees(reread.result, expected.content, expected.placement, expected.links)) return { kind: "idempotent", value, tip: null };
  return { kind: "refused", reason: `Identity '${slug}' changed before the requested transition` };
}
function errandConflict(saved: StoreRecord): Extract<Basis, { kind: "refused" }> | null {
  return saved.conflicts.length === 0 ? null : { kind: "refused", reason:
    `The Errand primary has unresolved conflicts: ${saved.conflicts.map(reference => JSON.stringify(reference)).join(", ")}. Resolve the named conflict records, then retry the Errand command.` };
}
function transactionFailure(failure: Extract<Basis, { kind: "refused" | "error" }>): IdentityTransactionOutcome<never> {
  return failure.kind === "error" ? { ...failure, stage: "basis" } : failure;
}
function formatRefusal(refusal: { code: string; condition: string; remedy: { text: string } }): string {
  return `${refusal.code}: ${refusal.condition} ${refusal.remedy.text}`;
}

async function prepareMutation(options: ErrandStoreOptions, slug: string, saved: StoreRecord | null,
  computed: TransientIdentityRecord | undefined, retirement: OrdinaryErrandRecord | undefined) {
  const now = options.now?.() ?? new Date().toISOString();
  if (computed === undefined && retirement === undefined) return { kind: "refused" as const, reason: "Errand removal requires an exact retirement generation." };
  const value = computed ?? { ...retirement, updatedAt: now } as OrdinaryErrandRecord;
  const content = serializeTransientIdentityRecord(value);
  const plannedOwner = options.companionWrites?.find(write => write.action === "put" && write.reference.kind === "work-item/description"
    && write.reference.owner.type === "work-item" && write.reference.owner.name === slug)?.reference.owner;
  const reference = saved?.reference ?? recordReferences["work-item/record"](plannedOwner ?? OwnerIdentitySchema.parse({ type: "work-item", name: slug }));
  let links = saved?.links;
  if (saved === null) {
    const project = await resolveProjectIdentity(options.projectId ?? createProjectIdentityReader(options.store));
    if (project.status !== "ready") return { kind: "refused" as const, reason: `${project.reason} ${project.remedy.text}` };
    if (value.branch === null) return { kind: "refused" as const, reason: "An ordinary Errand must name its code branch." };
    links = { branches: [{ repository: project.id, ref: value.branch, linkedAs: "created", excluded: [] }] };
  }
  if (retirement !== undefined) links = retirementLinks(links, options.landingCommit);
  const date = new Date(now), quarter = ArchiveQuarterSchema.parse(`${date.getUTCFullYear()}-q${Math.floor(date.getUTCMonth() / 3) + 1}`);
  const placement = retirement === undefined ? { kind: "active" as const } : { kind: "completed" as const, quarter };
  const mutation: Mutation = { action: "put", reference, expected: saved?.version ?? null, content, placement,
    ...(links === undefined ? {} : { links }) };
  return { kind: "ready" as const, mutation, content, links, placement, reference };
}
function retirementLinks(links: Links | undefined, landingCommit: Links["landingCommit"]): Links {
  const remaining = { ...links };
  delete remaining.landingCommit;
  return { ...remaining, ...(landingCommit === undefined ? {} : { landingCommit }) };
}
function agrees(saved: StoreRecord, content: string, placement: string, links: Links | undefined): boolean {
  return saved.content === content && saved.placement?.kind === placement && JSON.stringify(saved.links ?? {}) === JSON.stringify(links ?? {});
}
