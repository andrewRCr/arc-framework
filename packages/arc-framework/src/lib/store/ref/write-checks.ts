/** Run registered admission checks against final prepared record bytes. */

import type { BatchInput } from "../write.js";
import type { RecordReference } from "../identity.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import { composeWriteCheckRefusal, deriveWriteCheckWriter, type BrokenRule } from "../write-check.js";
import type { RefBackendContext } from "./context.js";
import type { PreparedRefMutation } from "./write-merge.js";
import type { RefWriteGroup } from "./write-commits.js";
import { readBatchObjects, type BatchObject } from "./batch-read.js";
import { createRefWriteViews } from "./write-views.js";

/** Check every caller mutation in order, retaining the original and final bytes. */
export async function checkRefWrites(context: RefBackendContext, writes: readonly PreparedRefMutation[],
  groups: ReadonlyMap<string, RefWriteGroup>, tips: ReadonlyMap<string, string>, provenance: BatchInput["provenance"]): Promise<StoreRefusal | undefined> {
  const checked = writes.filter(({ mutation }) => context.registry[mutation.reference.kind].check !== null);
  if (checked.length === 0) return undefined;
  const queries = checked.flatMap(({ home }) => [groups.get(home.ref)?.original.get(home.path)?.oid,
    groups.get(home.ref)?.entries.get(home.path)?.oid].filter((oid): oid is string => oid !== undefined));
  const objects = await readBatchObjects(context, [...new Set(queries)]);
  const { before, after } = createRefWriteViews(context, tips, groups);
  const results: { reference: RecordReference; rules: readonly BrokenRule[] }[] = [];
  for (const { mutation, home } of checked) {
    const group = groups.get(home.ref);
    if (!group) throw new Error("A checked mutation has no captured ref group");
    const priorSide = checkRecord(context, mutation.reference, group.original.get(home.path)?.oid, objects);
    if (priorSide.status === "refused") return priorSide.refusal;
    const nextSide = checkRecord(context, mutation.reference, group.entries.get(home.path)?.oid, objects);
    if (nextSide.status === "refused") return nextSide.refusal;
    const prior = priorSide.result, next = nextSide.result;
    const check = context.registry[mutation.reference.kind].check;
    if (!check) continue;
    results.push({ reference: mutation.reference, rules: await check({ reference: mutation.reference, before, after,
      writer: deriveWriteCheckWriter(provenance), ...(prior ? { prior } : {}),
      ...(next ? { next: { content: next.content, fields: next.fields } } : {}) }) });
  }
  return composeWriteCheckRefusal(results);
}

function checkRecord(context: RefBackendContext, reference: RecordReference, oid: string | undefined,
  objects: ReadonlyMap<string, BatchObject | null>): StoreResult<{ content: string; fields?: unknown } | undefined> {
  if (oid === undefined) return { status: "ok", result: undefined };
  const object = objects.get(oid);
  if (object?.type !== "blob") return { status: "refused", refusal: { code: "state-unresolvable", class: "recoverable", reference, historyRefs: [],
    condition: `The captured record blob ${oid} is unavailable.`,
    remedy: { text: "Restore or fetch the missing record objects, then retry the write." } } };
  const content = new TextDecoder("utf-8", { fatal: true }).decode(object.bytes);
  const parsed = context.registry[reference.kind].parser?.(content);
  return { status: "ok", result: { content, ...(parsed?.success ? { fields: parsed.data } : {}) } };
}
