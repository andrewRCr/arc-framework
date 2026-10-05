/** Whole-file personal mutations serialized by the existing notes lock. */
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { digestBytes } from "../../kernel/canonical/canonical-json.js";
import { ArcError } from "../../kernel/errors.js";
import { RecordVersionSchema } from "../identity.js";
import type { WriteInput, WriteResult, BatchInput, BatchResult } from "../write.js";
import type { InRepoContext } from "./context.js";
import { personalIdentity, personalSurfaces, personalPath, personalRoot, personalPathRemedy } from "./personal-paths.js";
import { personalFileAt } from "./personal.js";
import { isMissing, unsupported } from "./refusals.js";
import { staleWrites, withTrackedRefusal } from "./write-conflicts.js";

interface PreparedPersonalWrite { input: WriteInput; path: string; root: string; before: string | null }
async function writeAll(context: InRepoContext, inputs: WriteInput[]): Promise<WriteResult[]> {
  const paths: { input: WriteInput; path: string; root: string }[] = [];
  for (const input of inputs) {
    const identity = await personalIdentity(context, input.reference);
    const surfaces = await personalSurfaces(context, identity);
    const path = personalPath(surfaces, input.reference);
    if (path === undefined) return unsupported("unhomed-kind", "This path has no personal-document storage role", personalPathRemedy(identity, input.reference));
    paths.push({ input, path, root: personalRoot(surfaces, input.reference) });
  }
  return withTrackedRefusal(() => context.ports.locks.notes(async () => {
    const prepared: PreparedPersonalWrite[] = [];
    for (const entry of paths) prepared.push({ ...entry, before: await personalFileAt(context, entry.path, entry.root, entry.input.reference) });
    const stale = prepared.filter(({ input, before }) => input.expected !== (before === null ? null : RecordVersionSchema.parse(digestBytes(Buffer.from(before)))));
    if (stale.length !== 0) staleWrites(stale.map(({ input }) => input.reference));
    return applyPersonalWrites(context, prepared);
  }));
}
async function restorePersonalEntry(context: InRepoContext, entry: PreparedPersonalWrite): Promise<void> {
  if (await personalFileAt(context, entry.path, entry.root, entry.input.reference) === entry.before) return;
  if (entry.before !== null) { await context.ports.fs.writeFile(entry.path, entry.before); return; }
  try { await context.ports.fs.unlink(entry.path); } catch (error) { if (!isMissing(error)) throw error; }
}
async function restorePersonal(context: InRepoContext, attempted: PreparedPersonalWrite[], primary: unknown): Promise<void> {
  const failures: { path: string; error: unknown }[] = [];
  for (const entry of [...attempted].reverse()) {
    try { await restorePersonalEntry(context, entry); }
    catch (error) {
      try { if (await personalFileAt(context, entry.path, entry.root, entry.input.reference) === entry.before) continue; } catch { /* Unreadable restored bytes cannot be certified. */ }
      failures.push({ path: entry.path, error });
    }
  }
  if (failures.length !== 0) throw new ArcError(`Personal write restoration left these files changed or unreadable: ${failures.map(({ path }) => path).join(", ")}. Inspect each and restore it by hand.`,
    "store.restore-failed", { cause: new AggregateError([primary, ...failures.map(({ error }) => error)], "Personal write and restoration failed") });
}
async function applyPersonalWrites(context: InRepoContext, prepared: PreparedPersonalWrite[]): Promise<WriteResult[]> {
  const attempted: PreparedPersonalWrite[] = [];
  const results: WriteResult[] = [];
  try {
    for (const entry of prepared) {
      attempted.push(entry);
      if (entry.input.action === "remove") await context.ports.fs.unlink(entry.path);
      else {
        await context.ports.fs.mkdir(dirname(entry.path), { recursive: true });
        await context.ports.fs.writeFile(entry.path, entry.input.content);
      }
      results.push({ reference: entry.input.reference, conflicts: [], ...(entry.input.action === "remove" ? {}
        : { version: RecordVersionSchema.parse(digestBytes(Buffer.from(entry.input.content))) }) });
    }
  } catch (error) { await restorePersonal(context, attempted, error); throw error; }
  return results;
}
/** Replace or remove one digest-bound personal record.
 * @param context - Explicit checkout dependencies.
 * @param input - Whole-file mutation and caller provenance.
 * @returns The written digest or no version for removal.
 */
export async function writePersonal(context: InRepoContext, input: WriteInput): Promise<WriteResult> {
  const result = (await writeAll(context, [input]))[0];
  if (result === undefined) throw new Error("A successful personal write has no result");
  return result;
}
/** Preflight and atomically apply a personal batch under one notes lock.
 * @param context - Explicit checkout dependencies.
 * @param input - Whole-file mutations and shared provenance.
 * @returns Every mutation result or restoration of all attempted bytes.
 */
export async function batchPersonal(context: InRepoContext, input: BatchInput): Promise<BatchResult> {
  return { batchId: randomUUID(), writes: await writeAll(context, input.writes.map((write) => ({ ...write, provenance: input.provenance }))) };
}
