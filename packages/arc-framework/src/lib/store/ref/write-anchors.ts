/** Attach changed state anchors' existing manifest trees to their owning record commits. */

import { StateVersionSchema } from "../identity.js";
import type { StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { PreparedRefMutation } from "./write-merge.js";
import type { RefWriteGroup } from "./write-commits.js";
import { readBatchObjects, type BatchObject } from "./batch-read.js";
import { readRefManifest } from "./manifest-read.js";
import type { KindDefinition } from "../registry.js";

/** Resolve changed anchors locally before any batch ref can be published. */
export async function prepareRefAnchors(context: RefBackendContext, writes: readonly PreparedRefMutation[],
  groups: ReadonlyMap<string, RefWriteGroup>): Promise<StoreRefusal | undefined> {
  const anchored = writes.filter(({ mutation }) => mutation.action === "put" && context.registry[mutation.reference.kind].anchorFields.length > 0);
  const oldOids = anchored.flatMap(({ home }) => {
    const oid = groups.get(home.ref)?.original.get(home.path)?.oid;
    return oid ? [oid] : [];
  });
  const objects = await readBatchObjects(context, [...new Set(oldOids)]);
  for (const write of anchored) {
    const group = groups.get(write.home.ref);
    if (!group) throw new Error("An anchored mutation has no prepared ref group");
    const refusal = await prepareAnchor(context, write, group, objects);
    if (refusal) return refusal;
  }
  return undefined;
}

async function prepareAnchor(context: RefBackendContext, { mutation, home }: PreparedRefMutation,
  group: RefWriteGroup, objects: ReadonlyMap<string, BatchObject | null>): Promise<StoreRefusal | undefined> {
  if (mutation.action !== "put") return undefined;
  const definition = context.registry[mutation.reference.kind];
  const field = definition.anchorFields[0];
  if (!field) throw new Error("An anchored kind has no declared field");
  const oldOid = group.original.get(home.path)?.oid;
  const prior = oldOid ? objects.get(oldOid) : null;
  const token = anchorValue(definition, mutation.content, field);
  const previous = anchorValue(definition, prior?.type === "blob" ? new TextDecoder().decode(prior.bytes) : undefined, field);
  if (token === previous) return undefined;
  if (token !== null && token !== undefined && !await resolvesManifest(context, token)) {
    return { code: "state-unresolvable", class: "recoverable", reference: mutation.reference,
      field, ...(typeof token === "string" ? { stateVersion: StateVersionSchema.parse(token) } : {}), historyRefs: [],
      condition: `Anchor field ${field} names a state version this clone cannot resolve.`,
      remedy: { text: `Write ${field} from the current version() or set it to null, then retry the whole batch.` } };
  }
  replaceManifest(group, home.manifestPath, token);
  return undefined;
}

function anchorValue(definition: KindDefinition, content: string | undefined, field: string): unknown {
  const parsed = content === undefined ? undefined : definition.parser?.(content);
  const fields: unknown = parsed?.success ? parsed.data : undefined;
  return typeof fields === "object" && fields !== null ? (fields as Record<string, unknown>)[field] : undefined;
}

async function resolvesManifest(context: RefBackendContext, token: unknown): Promise<boolean> {
  return typeof token === "string" && await readRefManifest(context, token) !== null;
}

function replaceManifest(group: RefWriteGroup, prefix: string, token: unknown): void {
  const path = prefix.slice(0, -1);
  for (const candidate of group.entries.keys()) {
    if (candidate === path || candidate.startsWith(prefix)) group.entries.delete(candidate);
  }
  if (typeof token === "string") group.entries.set(path, { path, mode: "040000", oid: token });
}
