/** The sole local mutation caused by a read source: adopting an absent project identity. */

import { RecordReferenceSchema } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { readRefRecord } from "./read.js";
import { readSourceContext } from "./read-source-namespace.js";
import { writeRefRecord } from "./write.js";

/** Adopt only into a local-only store, retaining every existing identity and enforcing create-only writes. */
export async function adoptSourceProjectIdentity(context: RefBackendContext, remote: RefRemoteDesignation,
  designation: RefDesignation): Promise<StoreResult<boolean>> {
  if (remote.role !== "read" || designation.pushes.length > 0) return { status: "ok", result: false };
  const reference = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
  const current = await readRefRecord(context, { reference });
  if (current.status === "ok") return { status: "ok", result: false };
  if (current.refusal.code !== "not-found") return current;
  const source = await readRefRecord(readSourceContext(context, remote.name), { reference });
  if (source.status === "refused") return source.refusal.code === "not-found" ? { status: "ok", result: false } : source;
  const written = await writeRefRecord(context, { action: "put", reference, content: source.result.content,
    expected: null, provenance: { verb: "sync", lifecycleAction: "adopt-project-id" } });
  return written.status === "refused" ? written : { status: "ok", result: true };
}
