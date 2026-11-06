/** Establish physical backlog ownership before interpreting an unindexed file's name. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gateRead } from "./read-gate.js";
import { parseStampedFile } from "./stamp.js";
import { inspectProspectiveStub, type ProspectiveStub } from "./stub-adoption.js";
import { ArcLayoutAddressSchema, resolveArcPath, identifyArcFileAddress, type ArcLayoutAddress } from "../../layout/index.js";
import { COHORT_SEGMENT_CAP } from "../../active/cohort-path.js";
import { readLifecycleMetaFields } from "../lifecycle-write.js";
import { workItemLayoutPlacement } from "../lifecycle-storage.js";
import { markStoreRefusal } from "./refusal-mark.js";
import type { Store } from "../contract.js";
import { sameOwner } from "../identity.js";
import type { StoreRecord } from "../read.js";
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";

/** Physical coordinates remain separate from the exact record that authorizes writes. */
export type WorkItemContainer = Extract<ArcLayoutAddress, { kind: "work-unit-container" }>;
/** Evidence for one unindexed path, without a store-wide listing. */
export interface BacklogOwnershipInput {
  readonly checkout: string;
  readonly identity: string;
  readonly path: string;
  readonly store: Pick<Store, "read" | "lookup">;
  readonly index: Pick<ProjectionIndex, "entries">;
}
/** Exactly one established container, or a refusal preserving the unadopted file. */
export type BacklogOwnership = { readonly kind: "owned"; readonly container: WorkItemContainer; readonly record: StoreRecord }
  | { readonly kind: "prospective"; readonly container: WorkItemContainer; readonly metaPath: string;
      readonly params: Extract<ProspectiveStub, { kind: "stub" }>["params"] }
  | { readonly kind: "refused"; readonly mark: RefusedMark };

type OwnedContainer = Exclude<BacklogOwnership, { kind: "refused" }>;
type StoredOwner = Extract<BacklogOwnership, { kind: "owned" }>;
type StoredProbe = Extract<BacklogOwnership, { kind: "owned" | "refused" }> | { kind: "absent" };
type CandidateProbe = { kind: "owners"; owners: readonly OwnedContainer[] } | { kind: "invalid"; mark: RefusedMark } | Extract<BacklogOwnership, { kind: "refused" }>;
type IndexedProbe = { kind: "indexed"; owners: readonly StoredOwner[] } | Extract<BacklogOwnership, { kind: "refused" }>;
type ProspectiveProbe = Exclude<BacklogOwnership, { kind: "owned" }> | { kind: "absent" } | { kind: "invalid"; mark: RefusedMark };

/** Acquire all qualifying evidence before choosing the container for one unindexed file. */
export async function resolveBacklogOwnership(input: BacklogOwnershipInput): Promise<BacklogOwnership> {
  const owners: OwnedContainer[] = [], invalid: RefusedMark[] = [];
  const containers = candidateContainers(input.path);
  for (const container of containers) {
    const candidate = await readCandidateOwners(input, container);
    if (candidate.kind === "refused") return candidate;
    if (candidate.kind === "invalid") invalid.push(candidate.mark);
    if (candidate.kind === "owners") owners.push(...candidate.owners);
  }
  return selectContainer(input.path, owners, invalid, containers);
}

async function readCandidateOwners(input: BacklogOwnershipInput, container: WorkItemContainer): Promise<CandidateProbe> {
  const indexed = await readIndexedOwners(input, container);
  if (indexed.kind === "refused") return indexed;
  const owners: OwnedContainer[] = [];
  for (const owner of indexed.owners) addStoredOwner(owners, owner);
  const stored = await readStoredOwner(input, container);
  if (stored.kind === "refused") return stored;
  if (stored.kind === "owned") addStoredOwner(owners, stored);
  if (owners.length > 0) return { kind: "owners", owners };
  const proposed = await readProspectiveOwner(input, container);
  if (proposed.kind === "prospective") return { kind: "owners", owners: [proposed] };
  return proposed.kind === "absent" ? { kind: "owners", owners: [] } : proposed;
}

function selectContainer(path: string, owners: readonly OwnedContainer[], invalid: readonly RefusedMark[],
  containers: readonly WorkItemContainer[]): BacklogOwnership {
  const only = owners[0];
  if (owners.length === 1 && only !== undefined) return only;
  if (owners.length > 1) return { kind: "refused", mark: {
    reason: `Conflicting work-item containers for ${path}: ${owners.map(describeOwner).join(", ")}.`,
    remedy: { text: "Repair the named container evidence or move the file into one unambiguous work-item folder, then retry." },
  } };
  if (invalid[0] !== undefined) return { kind: "refused", mark: invalid[0] };
  return { kind: "refused", mark: { reason: `No work-item container is established for ${path}.`,
    remedy: { text: `Establish one work-item folder, then retry adoption. ${containers.map(stubRemedy).filter(Boolean).join(" Or ")}` } } };
}

function addStoredOwner(owners: OwnedContainer[], incoming: StoredOwner): void {
  if (!owners.some(owner => owner.kind === "owned" && resolveArcPath(owner.container) === resolveArcPath(incoming.container)
    && sameOwner(owner.record.reference.owner, incoming.record.reference.owner))) owners.push(incoming);
}

function describeOwner(owner: OwnedContainer): string {
  const path = resolveArcPath(owner.container);
  if (owner.kind === "prospective") return `${path} (proposed ${owner.params.name})`;
  const subject = owner.record.reference.owner;
  return `${path} (${subject.name}${subject.type === "person" || subject.uid === undefined ? "" : ` @${subject.uid}`})`;
}

async function readIndexedOwners(input: BacklogOwnershipInput, container: WorkItemContainer): Promise<IndexedProbe> {
  const owners: StoredOwner[] = [];
  for (const [path, entry] of Object.entries(input.index.entries)) {
    if (entry.kind !== "record" || entry.reference.kind !== "work-item/meta") continue;
    const address = identifyArcFileAddress(path, { workItem: container });
    if (address?.kind !== "work-unit-artifact" || address.artifact !== "meta") continue;
    const read = await input.store.read({ reference: entry.reference });
    if (read.status === "refused") return { kind: "refused", mark: markStoreRefusal(read.refusal) };
    if (read.result.reference.kind !== "work-item/meta") return { kind: "refused", mark: {
      reason: `Indexed metadata ${path} now names ${read.result.reference.kind}; its work-unit folder cannot be established.`,
      remedy: { text: "Reproject the work item's current role, or move the new file into an established work-unit folder, then retry." },
    } };
    owners.push({ kind: "owned", container, record: read.result });
  }
  return { kind: "indexed", owners };
}

async function readStoredOwner(input: BacklogOwnershipInput, container: WorkItemContainer): Promise<StoredProbe> {
  const found = await input.store.lookup({ kind: "slug", slug: container.slug });
  if (found.status === "refused") return found.refusal.code === "not-found" ? { kind: "absent" }
    : { kind: "refused", mark: markStoreRefusal(found.refusal) };
  if (found.result.reference.kind !== "work-item/meta") return { kind: "absent" };
  const read = await input.store.read({ reference: found.result.reference });
  if (read.status === "refused") return { kind: "refused", mark: markStoreRefusal(read.refusal) };
  const record = read.result;
  if (record.reference.kind !== "work-item/meta" || record.placement?.kind !== "backlog") return { kind: "absent" };
  const fields = readLifecycleMetaFields(record);
  if (fields.status === "refused") return { kind: "refused", mark: markStoreRefusal(fields.refusal) };
  try {
    const placement = await workItemLayoutPlacement(input.checkout, record.reference.owner.name, record.placement, fields.result.cohort);
    const canonical: WorkItemContainer = { kind: "work-unit-container", slug: record.reference.owner.name, placement };
    return resolveArcPath(canonical) === resolveArcPath(container) ? { kind: "owned", container, record } : { kind: "absent" };
  } catch (error) {
    return { kind: "refused", mark: { reason: `Cannot establish the stored container for ${record.reference.owner.name}: ${error instanceof Error ? error.message : String(error)}`,
      remedy: { text: "Repair the stored primary's placement and Cohort, then retry adoption." } } };
  }
}

async function readProspectiveOwner(input: BacklogOwnershipInput, container: WorkItemContainer): Promise<ProspectiveProbe> {
  const metaPath = resolveArcPath({ kind: "work-unit-artifact", slug: container.slug, placement: container.placement, artifact: "meta" });
  try {
    const gate = await gateRead({ path: join(input.checkout, metaPath), markdown: false });
    if (gate.kind === "absent" || gate.kind === "no-edit") return { kind: "absent" };
    if (gate.kind === "pending") return { kind: "refused", mark: { reason: `Prospective metadata ${metaPath} is ${gate.reason}.`,
      remedy: { text: "Let the metadata save finish, then retry adoption." } } };
    const content = parseStampedFile(await readFile(join(input.checkout, metaPath), "utf8")).content;
    const inspected = inspectProspectiveStub(container, content, input.identity);
    return inspected.kind === "refused" ? { kind: "invalid", mark: inspected.mark }
      : { kind: "prospective", container, metaPath, params: inspected.params };
  } catch (error) {
    return { kind: "refused", mark: { reason: `Cannot read prospective metadata ${metaPath}: ${error instanceof Error ? error.message : String(error)}`,
      remedy: { text: "Restore readable metadata at the named path, then retry adoption." } } };
  }
}

function stubRemedy(container: WorkItemContainer): string {
  const placement = container.placement;
  if (placement.kind !== "backlog" || placement.commitment === "provisional" && placement.cohort.length > 0) return "";
  return `Run arc stub ${container.slug} --commitment ${placement.commitment} --priority <priority>`
    + (placement.commitment === "planned" ? " --class <class>" : "")
    + (placement.cohort.length === 0 ? "" : ` --cohort ${placement.cohort.join("/")}`) + ".";
}

function candidateContainers(path: string): WorkItemContainer[] {
  const parts = path.split("/");
  if (parts[0] !== ".arc" || parts[1] !== "backlog") return [];
  const candidates: WorkItemContainer[] = [];
  for (let end = 4; end <= Math.min(parts.length - 1, 4 + COHORT_SEGMENT_CAP); end += 1) {
    const parsed = ArcLayoutAddressSchema.safeParse({ kind: "work-unit-container", slug: parts[end - 1],
      placement: { kind: "backlog", commitment: parts[2], cohort: parts.slice(3, end - 1) } });
    if (parsed.success && parsed.data.kind === "work-unit-container" && path.startsWith(`${resolveArcPath(parsed.data)}/`)) {
      candidates.push(parsed.data);
    }
  }
  return candidates;
}
