/** Decide whether a refused hand edit needs one base recovery or remains safely at its path. */
import { sameReference } from "../identity.js";
import { KIND_REGISTRY } from "../registry.js";
import type { StoreRefusal } from "../refusal.js";
import type { TakeInRequest } from "./take-in-port.js";
import type { WriteBackContext } from "./write-back.js";

/** Claim the command's one recovery allowance before any asynchronous reread. */
export async function decideWriteBackRefusal(context: WriteBackContext, request: TakeInRequest, refusal: StoreRefusal): Promise<
  { kind: "recover" } | { kind: "held"; refusal: StoreRefusal }
> {
  const reference = request.entry.reference;
  if (refusal.code !== "version-conflict" || KIND_REGISTRY[reference.kind].merge === "single-writer"
    || context.versionRecoveries?.some(each => sameReference(each, reference))) return { kind: "held", refusal };
  context.versionRecoveries?.push(reference);
  const read = await context.store.read({ reference });
  if (read.status === "refused") return { kind: "held", refusal: read.refusal.code === "not-found" ? {
    ...read.refusal, condition: `The record projected at ${request.path} was removed; its edit has been preserved.`,
    remedy: { text: "Copy out anything wanted from this file, then remove it or resolve the removed record before retrying." },
  } : read.refusal };
  context.memo?.drop(reference);
  return { kind: "recover" };
}
