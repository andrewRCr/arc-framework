/** Capture, preflight and restore exact tracked file bytes inside the checkout write lock. */
import { join } from "node:path";
import { digestBytes } from "../../kernel/canonical/canonical-json.js";
import { ArcError } from "../../kernel/errors.js";
import { RecordVersionSchema, type RecordReference } from "../identity.js";
import type { WriteInput, WriteResult } from "../write.js";
import type { InRepoContext } from "./context.js";
import type { MetaSource } from "./meta.js";
import { readFileAt } from "./files.js";
import { isMissing, refuse } from "./refusals.js";
import { admittedWritePath, creationMeta } from "./write-admission.js";
import { isWriterVersionConflict, staleWrites } from "./write-conflicts.js";
import { landTracked } from "./write-stores.js";
import type { WriteContent } from "./write-codec.js";

/** One validated input and its original file bytes, including absence. */
export interface TrackedWriteTarget { input: WriteInput; content?: WriteContent; path: string }
/** One target captured after its canonical file lock is held. */
export interface PreparedTrackedWrite extends TrackedWriteTarget { before: string | null }
/** Resolve each target, admitting companion creation with its new meta.
 * @param context - Locked checkout dependencies.
 * @param inputs - Caller writes with validated canonical content.
 * @returns Physical targets whose canonical locks must precede digest preflight.
 */
export async function resolveTrackedWrites(context: InRepoContext, inputs: { input: WriteInput; content?: WriteContent }[]): Promise<TrackedWriteTarget[]> {
  const creations = new Map<string, MetaSource>();
  for (const { input } of inputs) if (input.action === "put" && input.expected === null && input.reference.kind === "work-item/meta") creations.set(input.reference.owner.name, creationMeta(input));
  const prepared: TrackedWriteTarget[] = [];
  const targets = new Map<string, RecordReference>();
  for (const entry of inputs) {
    const path = await admittedWritePath(context, entry.input, creations);
    const previous = targets.get(path);
    if (previous !== undefined) return refuse({ code: "ambiguous-match", class: "recoverable",
      candidates: [previous, entry.input.reference], condition: `Two requested records resolve to ${path}.`,
      remedy: { text: "Use one reference per physical record, then retry this batch." } });
    targets.set(path, entry.input.reference);
    prepared.push({ ...entry, path });
  }
  return prepared;
}
/** Capture and preflight exact bytes while every canonical target lock remains held.
 * @param context - Locked checkout dependencies.
 * @param targets - Resolved, unique physical targets.
 * @returns Mutation bases validated against the actual files.
 */
export async function captureTrackedWrites(context: InRepoContext, targets: TrackedWriteTarget[]): Promise<PreparedTrackedWrite[]> {
  const prepared: PreparedTrackedWrite[] = [];
  for (const target of targets) prepared.push({ ...target, before: await readFileAt(context, target.path) });
  const stale = prepared.filter(({ input, before }) => {
    const current = before === null ? null : RecordVersionSchema.parse(digestBytes(Buffer.from(before)));
    return current !== input.expected || (input.action === "put" && before !== null && context.registry[input.reference.kind].writerRule === "create-only");
  }).map(({ input }) => input.reference);
  if (stale.length !== 0) staleWrites(stale);
  return prepared;
}
async function restoreOne(context: InRepoContext, entry: PreparedTrackedWrite, heldLocks: ReadonlySet<string>): Promise<void> {
  const current = await readFileAt(context, entry.path);
  if (current === entry.before) return;
  const path = join(context.ports.checkoutRoot, entry.path);
  if (["review/candidate", "review/integration-boundary"].includes(entry.input.reference.kind) && !heldLocks.has(`${path}.lock`)) {
    throw new Error(`Canonical restoration has no held lock: ${path}`);
  }
  if (entry.input.reference.kind === "lineage/transition") {
    if (entry.before !== null) { await context.ports.fs.exclusiveCreate(path, entry.before); return; }
    if (current !== entry.content?.bytes) throw new Error(`Transition restoration collision at ${path}: another creation occupies the target`);
  }
  if (entry.before !== null) { await context.ports.fs.writeFile(path, entry.before); return; }
  try { await context.ports.fs.unlink(path); } catch (error) { if (!isMissing(error)) throw error; }
}

async function restoreAttempted(context: InRepoContext, attempted: PreparedTrackedWrite[], primary: unknown, heldLocks: ReadonlySet<string>): Promise<void> {
  const failures: { path: string; error: unknown }[] = [];
  for (const entry of [...attempted].reverse()) {
    try { await restoreOne(context, entry, heldLocks); }
    catch (error) {
      try { if (await readFileAt(context, entry.path) === entry.before) continue; } catch { /* An unreadable restored target cannot be certified. */ }
      failures.push({ path: entry.path, error });
    }
  }
  if (failures.length !== 0) throw new ArcError(`Tracked write restoration left these files changed or unreadable: ${failures.map(({ path }) => path).join(", ")}. Inspect each with git diff and restore it by hand.`,
    "store.restore-failed", { cause: new AggregateError([primary, ...failures.map(({ error }) => error)], "Tracked write and restoration failed") });
}
/** Apply prepared writes, restoring even the failing target if its writer changed bytes before throwing.
 * @param context - Locked checkout dependencies.
 * @param prepared - Preflighted mutations and captured original bytes.
 * @param heldLocks - Canonical file locks held through this complete transaction.
 * @returns One canonical digest per successful put, and no version for removal.
 */
export async function applyTrackedWrites(context: InRepoContext, prepared: PreparedTrackedWrite[], heldLocks: ReadonlySet<string>): Promise<WriteResult[]> {
  const attempted: PreparedTrackedWrite[] = [];
  const results: WriteResult[] = [];
  try {
    for (const entry of prepared) {
      attempted.push(entry);
      try { await landTracked(context, entry.path, entry.input, entry.content, heldLocks); }
      catch (error) {
        if (await isWriterVersionConflict(error, entry.input.reference)) { attempted.pop(); staleWrites([entry.input.reference]); }
        throw error;
      }
      results.push(appliedResult(entry));
    }
  } catch (error) { await restoreAttempted(context, attempted, error, heldLocks); throw error; }
  return results;
}

function appliedResult(entry: PreparedTrackedWrite): WriteResult {
  const result = { reference: entry.input.reference, conflicts: [] };
  if (entry.input.action === "remove") return result;
  if (entry.content === undefined) throw new Error("A successful put has no prepared content");
  return { ...result, version: RecordVersionSchema.parse(digestBytes(Buffer.from(entry.content.bytes))) };
}
