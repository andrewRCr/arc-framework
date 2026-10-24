/** Restartable retirement of re-homed identity refs, leased to retained source tips. */
import type { RefBackendContext } from "../context.js";
import type { MigrateReport, StoreMigrateResult } from "../../commands.js";
import { updateRefTransaction, type RefChange } from "../../../git/ref-transaction.js";
import { pushRefs } from "../../../git/push.js";
import { classifyPushOutcome } from "../../../git/push-classification.js";
import { PASSIVE_REMOTE_INTERACTION } from "../../../git/remote-ref-reader.js";
import { readSyncRefs } from "../sync-graph.js";
import { readRefDesignation, refDesignationStop } from "../designation.js";

/** Kept tips live in the code repository until all licensed cleanup finishes. */
export const IMPORT_KEPT_PREFIX = "refs/arc/tmp/migrate/import/kept/";

/** Preserve the source snapshot independently of the destination's gathering refs, pruning tips a rebuild no longer reads. */
export async function keepImportTransients(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<void> {
  const held = await readSyncRefs(context, IMPORT_KEPT_PREFIX);
  const kept = new Map([...tips].map(([ref, next]) => [keptRef(ref), next]));
  const changes: RefChange[] = [...[...kept].map(([ref, next]) => ({ ref, next, expected: held.get(ref) ?? null })),
    ...[...held].filter(([ref]) => !kept.has(ref)).map(([ref, expected]) => ({ ref, expected, delete: true as const }))];
  if (changes.length && (await updateRefTransaction(context, changes, { cwd: context.checkoutRoot })).status !== "committed") {
    throw new Error("The import's retained transient tips changed during its build");
  }
}

/** Default-layout source deletes join the destination landing transaction. */
export function importTransientDeletes(tips: ReadonlyMap<string, string>): RefChange[] {
  return [...tips].map(([ref, expected]) => ({ ref, expected, delete: true }));
}

/** Delete what local transient refs remain before any publication: a separate landing leaves them, and a move into the default layout keeps them. */
export async function retireImportLocals(context: RefBackendContext): Promise<StoreMigrateResult | undefined> {
  const kept = await readSyncRefs(context, IMPORT_KEPT_PREFIX);
  if (!kept.size) return;
  await context.migrateStep?.("import.transient.local-delete");
  const local = await readSyncRefs(context, "refs/arc/user/");
  const changes: RefChange[] = [];
  for (const [ref, expected] of kept) {
    const source = sourceRef(ref);
    const actual = local.get(source);
    if (actual !== undefined && actual !== expected) return cleanupRefused(`${source} advanced after the import read it.`);
    if (actual !== undefined) changes.push({ ref: source, expected, delete: true });
  }
  if (changes.length && (await updateRefTransaction(context, changes, { cwd: context.checkoutRoot })).status !== "committed") {
    return cleanupRefused("Transient identity refs changed during their local deletion.");
  }
}

/** After publication, remove only the origin generations actually re-homed; with no state remote, name them instead. */
export async function retireImportRemote(context: RefBackendContext, report: MigrateReport): Promise<StoreMigrateResult | undefined> {
  const kept = await readSyncRefs(context, IMPORT_KEPT_PREFIX);
  if (!kept.size) return;
  if (refDesignationStop(await readRefDesignation(context))?.status === "no-remote") {
    try { report.notices.push(...await retainedRemoteNotices(context, kept)); }
    catch (error) { return cleanupRefused(`Could not read origin's transient refs: ${error instanceof Error ? error.message : String(error)}`); }
    return dropKeptTips(context, kept);
  }
  await context.migrateStep?.("import.transient.remote-delete");
  let refused: string | undefined;
  try { refused = await retireOriginRefs(context, kept); }
  catch (error) { refused = `Could not retire origin's transient refs: ${error instanceof Error ? error.message : String(error)}`; }
  return refused ? cleanupRefused(refused) : dropKeptTips(context, kept);
}

/** Delete each re-homed origin ref under its kept tip's lease, naming the first that cannot go. */
async function retireOriginRefs(context: RefBackendContext, kept: ReadonlyMap<string, string>): Promise<string | undefined> {
  const remote = await originTips(context, [...kept.keys()].map(sourceRef));
  for (const [ref, expected] of kept) {
    const source = sourceRef(ref), actual = remote.get(source);
    if (actual === undefined) continue;
    const pushed = actual === expected
      ? classifyPushOutcome(await pushRefs(context.exec, "origin", [{ ref: source, next: null, expected }], { cwd: context.checkoutRoot })) : undefined;
    if (!pushed || pushed.status === "lost-race") return `origin's ${source} advanced after the import read it.`;
    if (pushed.status !== "ok") return `Could not retire origin's ${source}: ${pushed.message}`;
  }
  return undefined;
}

/** The kept tips go last, so an interrupted cleanup still knows what it re-homed. */
async function dropKeptTips(context: RefBackendContext, kept: ReadonlyMap<string, string>): Promise<StoreMigrateResult | undefined> {
  await context.migrateStep?.("import.transient.drop-kept");
  const changes = [...kept].map(([ref, expected]) => ({ ref, expected, delete: true as const }));
  if ((await updateRefTransaction(context, changes, { cwd: context.checkoutRoot })).status !== "committed") {
    return cleanupRefused("The import's retained transient tips changed during cleanup.");
  }
}

async function retainedRemoteNotices(context: RefBackendContext, kept: ReadonlyMap<string, string>): Promise<MigrateReport["notices"]> {
  const refs = [...kept.keys()].map(sourceRef);
  const remote = await originTips(context, refs);
  return refs.filter((ref) => remote.has(ref)).map((ref) => ({ condition: `origin still holds ${ref}; no state remote is designated.`,
    remedy: { text: `After checking that the import is retained, delete ${ref} from origin with an explicit expected-tip lease.` } }));
}

async function originTips(context: RefBackendContext, refs: string[]): Promise<Map<string, string>> {
  const designation = await readRefDesignation(context);
  if (!designation.codeRemotes.some(({ name }) => name === "origin")) return new Map();
  const { stdout } = await context.exec("git", ["ls-remote", "--refs", "origin", ...refs],
    { cwd: context.checkoutRoot, diagnosticLocale: "stable", interaction: PASSIVE_REMOTE_INTERACTION });
  return new Map(stdout.split(/\r?\n/u).filter(Boolean).map((row) => {
    const [tip, ref] = row.split("\t");
    if (!ref || !tip) throw new Error("Invalid remote transient ref listing");
    return [ref, tip];
  }));
}

function keptRef(ref: string): string { return `${IMPORT_KEPT_PREFIX}${ref.slice("refs/arc/".length)}`; }
function sourceRef(ref: string): string { return `refs/arc/${ref.slice(IMPORT_KEPT_PREFIX.length)}`; }
function cleanupRefused(condition: string): StoreMigrateResult {
  return { status: "refused", refusal: { code: "move-unfinished", class: "recoverable", condition,
    remedy: { text: "Preserve the kept tips. Reconcile the named transient refs with the imported records, then rerun arc store migrate --import.",
      argv: ["arc", "store", "migrate", "--import"] } } };
}
