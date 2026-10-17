/** Refuse preexisting state before acquiring or transforming any import source. */
import type { RefBackendContext } from "../context.js";
import type { Store } from "../../contract.js";
import type { StoreCommandResult } from "../../commands.js";
import { readRefRepository } from "../repository.js";
import { readRefTips } from "../batch-read.js";
import { isManifestRef } from "../manifest.js";
import { RecordReferenceSchema, type RecordReference } from "../../identity.js";

/** True identifies only this repository's own earlier import landing. */
export async function inspectImportDestination(context: RefBackendContext, store: Store, repositoryId: string | null): Promise<StoreCommandResult<boolean>> {
  const physical = await readRefRepository(context);
  const tips = await readRefTips(physical, { includeHistory: true });
  if (![...tips.keys()].some((ref) => isManifestRef(ref.replace("refs/arc/history/", "refs/arc/")))) return { status: "ok", result: false };
  const projectReference = (uid?: string) => RecordReferenceSchema.parse({ kind: "project-registry/identity",
    owner: { type: "project", name: "project", ...(uid ? { uid } : {}) } });
  const identity = await store.read({ reference: projectReference() });
  const remedy = { text: "Import from a clone whose store is empty and holds no state, then retry arc store migrate --import." };
  if (identity.status === "ok") {
    const value: unknown = JSON.parse(identity.result.content);
    const projectId = typeof value === "object" && value !== null && "projectId" in value ? value.projectId : undefined;
    if (typeof projectId === "string") {
      if (projectId === repositoryId) return { status: "ok", result: true };
      return { status: "refused", refusal: { code: "store", refusal: { code: "identity-mismatch", class: "recoverable",
        expected: projectReference(repositoryId ?? undefined), actual: projectReference(projectId),
        condition: `The store holds project ${projectId}; the repository identity is ${repositoryId ?? "not yet minted"}.`, remedy } } };
    }
  } else if (identity.refusal.code !== "not-found") return { status: "refused", refusal: { code: "store", refusal: identity.refusal } };
  const records: RecordReference[] = [];
  const found = await heldRecords(context, store);
  if (found.status === "refused") return found;
  records.push(...found.result);
  if (records.length === 0) records.push(projectReference());
  return { status: "refused", refusal: { code: "store", refusal: { code: "version-conflict", class: "recoverable", records,
    condition: "The store already holds state that cannot be identified as this import's landing.", remedy } } };
}

async function heldRecords(context: RefBackendContext, store: Store): Promise<StoreCommandResult<RecordReference[]>> {
  const records: RecordReference[] = [];
  for (const definition of Object.values(context.registry).filter(({ ref }) => ref !== undefined)) {
    const listed = await store.list({ family: definition.family, kind: definition.id });
    if (listed.status === "refused") return { status: "refused", refusal: { code: "store", refusal: listed.refusal } };
    if (listed.result.status === "complete") records.push(...listed.result.records.map(({ reference }) => reference));
  }
  return { status: "ok", result: records };
}
