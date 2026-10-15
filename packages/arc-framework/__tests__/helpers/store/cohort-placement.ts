/** Allocate completed cohort sidecar coordinates inside the atomic reference namespace. */
import { ArchiveSequenceSchema } from "../../../src/lib/kernel/index.js";
import { ParsedMetaRecordSchema } from "../../../src/lib/active/meta-schema.js";
import { ParsedCohortDocumentSchema } from "../../../src/lib/store/kinds/cohort/parser.js";
import type { Mutation } from "../../../src/lib/store/write.js";
import type { ReferenceContext } from "./context.js";
import { canonicalReference, recordKey } from "./model.js";
import { publicRecord } from "./read.js";
import type { MemoryRecord, MemoryState } from "./model.js";
import { RecordVersionSchema } from "../../../src/lib/store/identity.js";
import { randomUUID } from "node:crypto";

/** Borrow a same-batch member number, or allocate the next standalone cohort number. */
export function assignCompletedCohorts(context: ReferenceContext, writes: readonly Mutation[], since: number): void {
  const records = [...context.state.records.values()];
  const cohorts = records.filter((record) => record.reference.kind === "cohort/document");
  for (const write of writes) {
    if (write.action !== "put" || write.reference.kind !== "cohort/document" || write.placement?.kind !== "completed") continue;
    const reference = canonicalReference(context.state, write.reference), record = context.state.records.get(recordKey(reference));
    if (record === undefined) throw new Error("Completed cohort is absent from the prepared namespace");
    if (record.placement?.kind === "completed" && "closeout" in record.placement) continue;
    const quarter = write.placement.quarter;
    const memberNumbers = writes.flatMap((memberWrite) => {
      if (memberWrite.action !== "put" || memberWrite.reference.kind !== "work-item/meta" || memberWrite.placement?.kind !== "completed" || memberWrite.placement.quarter !== quarter) return [];
      const member = context.state.records.get(recordKey(canonicalReference(context.state, memberWrite.reference)));
      if (member === undefined || member.placement?.kind !== "completed" || !("sequence" in member.placement)) return [];
      const fields = ParsedMetaRecordSchema.parse(publicRecord(context, member).fields);
      return fields.cohort?.split("/").includes(reference.owner.name) === true ? [Number(member.placement.sequence)] : [];
    });
    const imported = records.flatMap((candidate) => candidate.placement?.kind === "completed" && candidate.placement.quarter === quarter && "sequence" in candidate.placement ? [Number(candidate.placement.sequence)] : []);
    const number = memberNumbers.length > 0 ? Math.max(...memberNumbers) : Math.max(context.state.archiveSequences.get(quarter) ?? 0, ...imported) + 1;
    context.state.archiveSequences.set(quarter, Math.max(context.state.archiveSequences.get(quarter) ?? 0, number));
    const parent = cohorts.some((candidate) => ParsedCohortDocumentSchema.parse(publicRecord(context, candidate).fields).parent === reference.owner.name);
    record.placement = { kind: "completed", quarter, sequence: ArchiveSequenceSchema.parse(String(number).padStart(2, "0")), closeout: parent ? "b" : "a" };
    for (const [version, snapshot] of context.state.snapshots) {
      if (Number(version.slice("state:".length)) <= since) continue;
      const saved = snapshot.get(recordKey(reference));
      if (saved !== undefined) saved.placement = structuredClone(record.placement);
    }
  }
}

/** Preserve published sidecars and carry each unpublished one with its own closing member. */
export function reconcileCompletedCohorts(context: ReferenceContext, records: Map<string, MemoryRecord>, remote: MemoryState,
  originalMembers: readonly MemoryRecord[], highWater: Map<string, number>): void {
  for (const cohort of records.values()) {
    const placement = cohort.placement;
    if (cohort.reference.kind !== "cohort/document" || placement?.kind !== "completed" || !("closeout" in placement)) continue;
    const published = remote.records.get(recordKey(cohort.reference))?.placement;
    let sequence;
    if (published?.kind === "completed" && "closeout" in published && published.quarter === placement.quarter) sequence = published.sequence;
    else {
      const closingMembers = originalMembers.filter((member) => member.placement?.kind === "completed"
        && "sequence" in member.placement && member.placement.quarter === placement.quarter && member.placement.sequence === placement.sequence
        && ParsedMetaRecordSchema.parse(publicRecord(context, member, records).fields).cohort?.split("/").includes(cohort.reference.owner.name));
      const numbers = closingMembers.flatMap((member) => {
        const current = records.get(recordKey(member.reference))?.placement;
        return current?.kind === "completed" && "sequence" in current ? [Number(current.sequence)] : [];
      });
      const number = numbers.length === 0 ? (highWater.get(placement.quarter) ?? 0) + 1 : Math.max(...numbers);
      highWater.set(placement.quarter, Math.max(highWater.get(placement.quarter) ?? 0, number));
      sequence = ArchiveSequenceSchema.parse(String(number).padStart(2, "0"));
    }
    if (sequence !== placement.sequence) {
      cohort.placement = { ...placement, sequence };
      cohort.version = RecordVersionSchema.parse(`record:sync:${randomUUID()}`);
    }
  }
}
