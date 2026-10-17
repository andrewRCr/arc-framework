/** The backend-owned project identity value and its single logical owner. */

import { z } from "zod";
import { RecordReferenceSchema, OwnerIdentitySchema, type RecordReference, type OwnerIdentity } from "../identity.js";
import type { ListInput, ListingDiagnostic } from "../read.js";
import type { Mutation } from "../write.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { parseRefTreeObject } from "./tree-content.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";

const ProjectIdentitySchema = z.strictObject({ projectId: z.uuid().refine((id) => id === id.toLowerCase()) });

/** Parse the exact backend-owned identity shape without normalizing its UUID spelling. */
export function parseProjectIdentity(content: string): { projectId: string } | null {
  try {
    const result = ProjectIdentitySchema.safeParse(JSON.parse(content));
    return result.success ? result.data : null;
  } catch { return null; }
}

/** Enforce the project identity's shape independently of replaceable kind parsers. */
export function checkProjectIdentity(reference: RecordReference, content: string): StoreRefusal | undefined {
  if (reference.kind !== "project-registry/identity" || parseProjectIdentity(content)) return undefined;
  return projectIdentityFailure(reference);
}

/** Include identity and its containing tree in an operation's existing object batch. */
export function projectIdentityQueries(tips: ReadonlyMap<string, string>): string[] {
  const tip = tips.get("refs/arc/project/registry");
  return tip ? [`${tip}^{tree}`, `${tip}:identity.json`] : [];
}

/** Resolve the one project from already acquired objects, distinguishing absent and unavailable identity. */
export function projectOwnerFromObjects(tips: ReadonlyMap<string, string>, objects: ReadonlyMap<string, BatchObject | null>): StoreResult<OwnerIdentity> {
  const tip = tips.get("refs/arc/project/registry");
  if (!tip) return { status: "ok", result: projectOwner() };
  const entries = parseRefTreeObject(objects.get(`${tip}^{tree}`));
  if (!entries) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "refs/arc/project/registry",
    condition: "The registry's captured tree is unavailable.", remedy: { text: "Restore or fetch the registry objects, then retry." } } };
  return projectOwnerFromEntries(entries, objects, objects.get(`${tip}:identity.json`));
}

/** Resolve project ownership inside a complete captured or prepared tree view. */
export function projectOwnerFromEntries(entries: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>,
  captured?: BatchObject | null): StoreResult<OwnerIdentity> {
  const entry = entries.find(({ path }) => path === "identity.json");
  if (!entry) return { status: "ok", result: projectOwner() };
  const object = captured ?? objects.get(entry.oid);
  const reference = RecordReferenceSchema.parse({ owner: projectOwner(), kind: "project-registry/identity" });
  if (object?.type !== "blob") return { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", reference, historyRefs: [],
    condition: `The project identity blob ${entry.oid} is unavailable.`, remedy: { text: "Restore or fetch the identity objects, then retry." } } };
  const content = new TextDecoder().decode(object.bytes);
  const identity = parseProjectIdentity(content);
  if (!identity) return { status: "refused", refusal: { ...projectIdentityFailure(reference),
    remedy: { text: "Repair identity.json forward on refs/arc/project/registry with exactly projectId and a lowercase UUID, then retry." } } };
  return { status: "ok", result: projectOwner(identity.projectId) };
}

/** Canonicalize matching project handles and refuse callers naming another project. */
export function admitProjectReference(reference: RecordReference, owner: OwnerIdentity): StoreResult<RecordReference> {
  const requested = reference.owner;
  if (requested.type !== "project") return { status: "ok", result: reference };
  const actual = RecordReferenceSchema.parse({ ...reference, owner });
  if (requested.name !== owner.name || requested.uid !== undefined && (owner.type === "person" || requested.uid !== owner.uid)) {
    return { status: "refused", refusal: { code: "identity-mismatch", class: "recoverable", expected: reference, actual,
      condition: "The reference names another project.", remedy: { text: "Use the store's project owner named project and its current project ID, then retry." } } };
  }
  return { status: "ok", result: actual };
}

/** Resolve project mutations against one captured registry and any same-batch identity change. */
export async function bindProjectMutations(context: RefBackendContext, writes: readonly Mutation[],
  tips: ReadonlyMap<string, string>): Promise<StoreResult<Mutation[]>> {
  if (!writes.some((write) => [write.reference, ...write.resolves ?? []].some(({ owner }) => owner.type === "project"))) return { status: "ok", result: [...writes] };
  const captured = projectOwnerFromObjects(tips, await readBatchObjects(context, projectIdentityQueries(tips)));
  if (captured.status === "refused") return captured;
  const final = finalProjectOwner(writes, captured.result);
  const admitted = captured.result.type !== "person" && captured.result.uid ? captured.result : final;
  const result: Mutation[] = [];
  for (const write of writes) {
    const reference = bindProjectReference(write.reference, admitted, final);
    if (reference.status === "refused") return reference;
    const resolves: RecordReference[] = [];
    for (const item of write.resolves ?? []) {
      const found = bindProjectReference(item, admitted, final);
      if (found.status === "refused") return found;
      resolves.push(found.result);
    }
    result.push({ ...write, reference: reference.result, ...(write.resolves === undefined ? {} : { resolves }) });
  }
  return { status: "ok", result };
}

function bindProjectReference(reference: RecordReference, before: OwnerIdentity, after: OwnerIdentity): StoreResult<RecordReference> {
  const admitted = admitProjectReference(reference, before);
  return admitted.status === "refused" || reference.owner.type !== "project" ? admitted
    : { status: "ok", result: RecordReferenceSchema.parse({ ...reference, owner: after }) };
}

function projectOwner(uid?: string): OwnerIdentity {
  return OwnerIdentitySchema.parse({ type: "project", name: "project", ...(uid ? { uid } : {}) });
}

function projectIdentityFailure(reference: RecordReference): StoreRefusal {
  return { code: "record-malformed", class: "recoverable", reference, rule: "store.project-identity",
    condition: "The project identity must contain exactly projectId with a lowercase UUID value.",
    remedy: { text: "Write exactly {\"projectId\": <lowercase UUID>} and retry." } };
}

function finalProjectOwner(writes: readonly Mutation[], before: OwnerIdentity): OwnerIdentity {
  const identity = writes.find((write) => write.reference.kind === "project-registry/identity");
  if (identity?.action === "remove") return projectOwner();
  if (identity?.action === "put" && before.type !== "person" && !before.uid) return projectOwner(parseProjectIdentity(identity.content)?.projectId);
  return before;
}

/** Bind a project owner filter through the same identity admission as direct references. */
export function projectListInput(input: ListInput, owner: OwnerIdentity): StoreResult<ListInput> {
  if (input.owner?.type !== "project") return { status: "ok", result: input };
  const reference = RecordReferenceSchema.parse({ owner: input.owner,
    kind: input.family === "project-inbox" ? "project-inbox/inbox" : "project-registry/identity" });
  const admitted = admitProjectReference(reference, owner);
  return admitted.status === "refused" ? admitted : { status: "ok", result: { ...input, owner: admitted.result.owner } };
}

/** Keep listing records observable while marking unresolved project ownership as incomplete evidence. */
export function projectListingBinding(result: StoreResult<OwnerIdentity>): { owner: OwnerIdentity; diagnostic?: ListingDiagnostic } {
  if (result.status === "ok") return { owner: result.result };
  const refusal = result.refusal;
  return { owner: projectOwner(), diagnostic: { kind: refusal.code === "record-malformed" ? "malformed" : "unreadable",
    key: refusal.code === "namespace-corrupt" ? refusal.namespace : "identity.json", condition: refusal.condition, remedy: refusal.remedy } };
}
