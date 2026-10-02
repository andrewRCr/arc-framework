/** Atomic mutations over the complete reconciled transient identity basis. */
import { randomUUID } from "node:crypto";
import { deserializeTransientIdentityRecord, serializeTransientIdentityRecord, type TransientIdentityRecord } from "../../errand/identity-record.js";
import { transactTransientIdentities, type IdentityTransactionOutcome } from "../../errand/identity-transaction.js";
import { MAX_LOCUS_JSON_BYTES } from "../../locus/schema/index.js";
import { hashBlob } from "../../errand/ref-tree.js";
import { RecordVersionSchema, type RecordReference } from "../identity.js";
import type { BatchInput, BatchResult, Mutation, WriteInput, WriteResult } from "../write.js";
import type { InRepoContext } from "./context.js";
import { admitTransient, transientIO, transientKey, transientKind, transientMalformed, transientMismatch, transientReference } from "./transient-common.js";
import { refuse, unsupported } from "./refusals.js";

interface TransactionValue { stale: RecordReference[]; writes: WriteResult[] }

/** Apply one identity-ref mutation and publish when a remote is configured.
 * @param context - Explicit dependencies.
 * @param input - Mutation and caller provenance.
 * @returns Its new blob basis or removal acknowledgement.
 */
export async function writeTransient(context: InRepoContext, input: WriteInput): Promise<WriteResult> {
  const result = await batchTransient(context, { writes: [input], provenance: input.provenance });
  const write = result.writes[0];
  if (write === undefined) throw new Error("Identity transaction omitted its write result");
  return write;
}
/** Apply all expected-version mutations under a single identity transaction.
 * @param context - Explicit dependencies.
 * @param input - Atomic writes and shared provenance.
 * @returns Every mutation, or a refusal before caller changes are written.
 */
export async function batchTransient(context: InRepoContext, input: BatchInput): Promise<BatchResult> {
  const io = await transientIO(context);
  for (const write of input.writes) admitTransient(write.reference, io?.identity ?? null);
  if (io === null) throw new Error("Missing admitted identity");
  const replacements = new Map<string, TransientIdentityRecord>();
  for (const write of input.writes) {
    if (write.action === "put") replacements.set(transientKey(write.reference), decodeWrite(write, io.identity));
  }
  const versions = new Map<string, string>();
  for (const [key, record] of replacements) versions.set(key, await hashBlob(io.execInput, serializeTransientIdentityRecord(record)));
  const started = context.ports.clock().getTime();
  const outcome = await transactTransientIdentities<TransactionValue>(io, { remote: await context.ports.remote(),
    message: `${input.provenance.verb}: ${input.provenance.lifecycleAction}`, transform: (records, objects) => {
      if (objects === undefined) throw new Error("Identity transaction omitted blob version basis");
      const stale = input.writes.filter((write) => staleMutation(write, records, objects)).map((write) => write.reference);
      if (stale.length > 0) return { kind: "idempotent", value: { stale, writes: [] } };
      const updated = new Map(records);
      const writes = input.writes.map((write): WriteResult => {
        const key = transientKey(write.reference);
        if (write.action === "remove") { updated.delete(key); return { reference: write.reference, conflicts: [] }; }
        const replacement = replacements.get(key);
        const version = versions.get(key);
        if (replacement === undefined || version === undefined) throw new Error("Validated replacement is missing");
        updated.set(key, replacement);
        return { reference: write.reference, version: RecordVersionSchema.parse(version), conflicts: [] };
      });
      return { kind: "applied", records: updated, value: { stale: [], writes } };
    } });
  const value = transactionValue(outcome, input.writes, io.identity, Math.max(0, context.ports.clock().getTime() - started));
  return { batchId: randomUUID(), writes: value.writes };
}
function staleMutation(write: Mutation, records: ReadonlyMap<string, TransientIdentityRecord>, objects: ReadonlyMap<string, string>): boolean {
  const key = transientKey(write.reference);
  const current = records.get(key);
  return (objects.get(key) ?? null) !== write.expected || (current !== undefined && transientKind(current) !== write.reference.kind);
}

function decodeWrite(write: Extract<Mutation, { action: "put" }>, identity: string): TransientIdentityRecord {
  if (write.links !== undefined) unsupported("links-write", "The in-repo identity ref stores no links value.", "No current verb stores links on an Errand; omit links.");
  if (write.reference.kind === "work-item/record" && write.placement?.kind !== "active") unsupported(write.expected === null ? "completed-create" : "placement-move", "An Errand's identity record is always active.", "Use arc errand close to close the Errand by removing its record.");
  const size = Buffer.byteLength(write.content);
  if (size > MAX_LOCUS_JSON_BYTES) return transientMalformed(write.reference, `Size ${size} exceeds cap ${MAX_LOCUS_JSON_BYTES}`);
  const decoded = deserializeTransientIdentityRecord(write.content, transientKey(write.reference));
  if (decoded.kind === "key-mismatch") return transientMismatch(write.reference, decoded.slug, identity);
  if (decoded.kind !== "valid") return transientMalformed(write.reference, decoded.kind === "unknown-version" ? `Unknown content version ${String(decoded.version)}` : decoded.message);
  if (transientKind(decoded.record) !== write.reference.kind) return transientMalformed(write.reference, "Record kind and purpose disagree with the requested role");
  return decoded.record;
}

function transactionValue(outcome: IdentityTransactionOutcome<TransactionValue>, writes: Mutation[], identity: string, waitedMs: number): TransactionValue {
  if (outcome.kind === "applied" || outcome.kind === "idempotent") {
    if (outcome.value.stale.length > 0) versionConflict(outcome.value.stale);
    return outcome.value;
  }
  if (outcome.kind === "refused") {
    if (outcome.divergentKeys !== undefined) versionConflict(outcome.divergentKeys.map((key) => {
      const record = outcome.divergentRecords?.get(key);
      if (record === undefined) throw new Error(`Divergent key lacks decoded role evidence: ${key}`);
      return transientReference(transientKind(record), key, identity);
    }));
    throw new Error(outcome.reason);
  }
  if (outcome.invalidKeys !== undefined) {
    const key = outcome.invalidKeys[0];
    if (key === undefined) throw new Error(outcome.message);
    const reference = writes.find((write) => transientKey(write.reference) === key)?.reference ?? writes[0]?.reference;
    if (reference === undefined) throw new Error(outcome.message);
    refuse({ code: "record-malformed", class: "recoverable", reference, rule: outcome.message,
      condition: `Identity basis contains invalid entries: ${outcome.invalidKeys.join(", ")}. Requested ${writes.map((write) => transientKey(write.reference)).join(", ")} write cannot proceed.`,
      remedy: { text: `Hand repair identity-ref entries ${outcome.invalidKeys.join(", ")} to valid v3 bytes, then retry the requested write.` } });
  }
  return transactionError(outcome, waitedMs);
}
function transactionError(outcome: Extract<IdentityTransactionOutcome<TransactionValue>, { kind: "error" }>, waitedMs: number): never {
  const failure = outcome.remoteFailure;
  const remedy = { text: "Repair the remote connection or rejection and retry; for contention, reread the record before retrying." };
  if (failure?.code === "unreachable") refuse({ code: "unreachable", class: "recoverable", condition: outcome.message, cause: failure.cause, remedy });
  if (failure?.code === "refused") refuse({ code: "refused", class: "terminal", condition: outcome.message, message: failure.message, remedy });
  if (failure?.code === "retries-exhausted" || outcome.retriesExhausted) {
    const retryCount = failure?.code === "retries-exhausted" ? failure.retryCount : outcome.retryCount;
    if (retryCount === undefined) throw new Error("Identity transaction omitted exhausted attempt count");
    refuse({ code: "retries-exhausted", class: "recoverable", condition: outcome.message, retryCount, waitedMs, remedy });
  }
  throw new Error(outcome.message, { cause: outcome.error });
}
function versionConflict(records: RecordReference[]): never {
  return refuse({ code: "version-conflict", class: "recoverable", records, condition: `Identity versions changed: ${records.map(transientKey).join(", ")}`,
    remedy: { text: "Reread the named records and reapply using their new versions. For divergent clones, hand repair both ref entries to identical valid bytes before retrying." } });
}
