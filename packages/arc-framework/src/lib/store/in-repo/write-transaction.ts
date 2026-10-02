/** Capture, preflight and restore exact tracked file bytes inside the checkout write lock. */
import { join } from "node:path";
import { digestBytes } from "../../kernel/canonical/canonical-json.js";
import { ArcError } from "../../kernel/errors.js";
import { RecordVersionSchema } from "../identity.js";
import type { WriteInput, WriteResult } from "../write.js";
import type { InRepoContext } from "./context.js";
import type { MetaSource } from "./meta.js";
import { readFileAt } from "./files.js";
import { isMissing } from "./refusals.js";
import { admittedWritePath, creationMeta } from "./write-admission.js";
import { isWriterVersionConflict, staleWrites } from "./write-conflicts.js";
import { landTracked, withCanonicalRecordLock } from "./write-stores.js";
import type { WriteContent } from "./write-codec.js";

/** One validated input and its original file bytes, including absence. */
export interface PreparedTrackedWrite { input: WriteInput; content?: WriteContent; path: string; before: string | null }
/** Capture each target before any record is replaced, admitting companion creation with its new meta.
 * @param context - Locked checkout dependencies.
 * @param inputs - Caller writes with validated canonical content.
 * @returns Every target's exact pre-operation bytes.
 */
export async function captureTrackedWrites(context: InRepoContext, inputs: { input: WriteInput; content?: WriteContent }[]): Promise<PreparedTrackedWrite[]> {
  const creations = new Map<string, MetaSource>();
  for (const { input } of inputs) if (input.action === "put" && input.expected === null && input.reference.kind === "work-item/meta") creations.set(input.reference.owner.name, creationMeta(input));
  const prepared: PreparedTrackedWrite[] = [];
  for (const entry of inputs) {
    const path = await admittedWritePath(context, entry.input, creations);
    prepared.push({ ...entry, path, before: await readFileAt(context, path) });
  }
  const stale = prepared.filter(({ input, before }) => {
    const current = before === null ? null : RecordVersionSchema.parse(digestBytes(Buffer.from(before)));
    return current !== input.expected || (input.action === "put" && before !== null && context.registry[input.reference.kind].writerRule === "create-only");
  }).map(({ input }) => input.reference);
  if (stale.length !== 0) staleWrites(stale);
  return prepared;
}
async function restoreOne(context: InRepoContext, entry: PreparedTrackedWrite): Promise<void> {
  if (await readFileAt(context, entry.path) === entry.before) return;
  const path = join(context.ports.checkoutRoot, entry.path);
  const restore = async () => {
    if (entry.before !== null) { await context.ports.fs.writeFile(path, entry.before); return; }
    try { await context.ports.fs.unlink(path); } catch (error) { if (!isMissing(error)) throw error; }
  };
  if (entry.content?.kind === "candidate" || entry.content?.kind === "boundary") await withCanonicalRecordLock(context, `${path}.lock`, restore);
  else await restore();
}
async function restoreAttempted(context: InRepoContext, attempted: PreparedTrackedWrite[], primary: unknown): Promise<void> {
  const failures: { path: string; error: unknown }[] = [];
  for (const entry of [...attempted].reverse()) {
    try { await restoreOne(context, entry); }
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
 * @returns One canonical digest per successful put, and no version for removal.
 */
export async function applyTrackedWrites(context: InRepoContext, prepared: PreparedTrackedWrite[]): Promise<WriteResult[]> {
  const attempted: PreparedTrackedWrite[] = [];
  const results: WriteResult[] = [];
  try {
    for (const entry of prepared) {
      attempted.push(entry);
      try { await landTracked(context, entry.path, entry.input, entry.content); }
      catch (error) {
        if (await isWriterVersionConflict(error, entry.input.reference)) { attempted.pop(); staleWrites([entry.input.reference]); }
        throw error;
      }
      results.push(appliedResult(entry));
    }
  } catch (error) { await restoreAttempted(context, attempted, error); throw error; }
  return results;
}

function appliedResult(entry: PreparedTrackedWrite): WriteResult {
  const result = { reference: entry.input.reference, conflicts: [] };
  if (entry.input.action === "remove") return result;
  if (entry.content === undefined) throw new Error("A successful put has no prepared content");
  return { ...result, version: RecordVersionSchema.parse(digestBytes(Buffer.from(entry.content.bytes))) };
}
