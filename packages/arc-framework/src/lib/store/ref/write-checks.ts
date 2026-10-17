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
  const units = checkUnits(writes).filter(({ reference }) => context.registry[reference.kind].check !== null);
  if (units.length === 0) return undefined;
  const queries = units.flatMap(({ ref, priorPath, nextPath }) => [priorPath ? groups.get(ref)?.original.get(priorPath)?.oid : undefined,
    nextPath ? groups.get(ref)?.entries.get(nextPath)?.oid : undefined].filter((oid): oid is string => oid !== undefined));
  const objects = await readBatchObjects(context, [...new Set(queries)]);
  const { before, after } = createRefWriteViews(context, tips, groups);
  const results: { reference: RecordReference; rules: readonly BrokenRule[] }[] = [];
  for (const { reference, ref, priorPath, nextPath } of units) {
    const group = groups.get(ref);
    if (!group) throw new Error("A checked mutation has no captured ref group");
    const priorSide = checkRecord(context, reference, entryOid(group.original, priorPath), objects);
    if (priorSide.status === "refused") return priorSide.refusal;
    const nextSide = checkRecord(context, reference, entryOid(group.entries, nextPath), objects);
    if (nextSide.status === "refused") return nextSide.refusal;
    const prior = priorSide.result, next = nextSide.result;
    const check = context.registry[reference.kind].check;
    if (!check) continue;
    results.push({ reference, rules: await check({ reference, before, after,
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

interface CheckUnit { reference: RecordReference; ref: string; priorPath: string | undefined; nextPath: string | undefined }

function checkUnits(writes: readonly PreparedRefMutation[]): CheckUnit[] {
  return writes.flatMap(({ mutation, home, prior }) => {
    const replacement = prior && prior.reference.kind !== mutation.reference.kind;
    return [
      ...(replacement ? [{ reference: prior.reference, ref: home.ref, priorPath: prior.home.path, nextPath: undefined }] : []),
      { reference: mutation.reference, ref: home.ref, priorPath: replacement ? undefined : prior?.home.path ?? home.path, nextPath: home.path },
    ];
  });
}

function entryOid(entries: ReadonlyMap<string, { oid: string }>, path: string | undefined): string | undefined {
  return path === undefined ? undefined : entries.get(path)?.oid;
}
