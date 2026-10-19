/** Restartable retirement of re-homed identity refs, leased to retained source tips. */
import type { RefBackendContext } from "../context.js";
import type { MigrateReport, StoreMigrateResult } from "../../commands.js";
import { updateRefTransaction, type RefChange } from "../../../git/ref-transaction.js";
import { readSyncRefs } from "../sync-graph.js";
import { readRefRepository } from "../repository.js";
import { readRefDesignation, refDesignationStop } from "../designation.js";

/** Kept tips live in the code repository until all licensed cleanup finishes. */
export const IMPORT_KEPT_PREFIX = "refs/arc/tmp/migrate/import/kept/";

/** Preserve the source snapshot independently of the destination's gathering refs. */
export async function keepImportTransients(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<void> {
  const held = await readSyncRefs(context, IMPORT_KEPT_PREFIX);
  const changes = [...tips].map(([ref, next]) => ({ ref: keptRef(ref), next, expected: held.get(keptRef(ref)) ?? null }));
  if (changes.length && (await updateRefTransaction(context, changes, { cwd: context.checkoutRoot })).status !== "committed") {
    throw new Error("The import's retained transient tips changed during its build");
  }
}

/** Default-layout source deletes join the destination landing transaction. */
export function importTransientDeletes(tips: ReadonlyMap<string, string>): RefChange[] {
  return [...tips].map(([ref, expected]) => ({ ref, expected, delete: true }));
}

/** Finish the separate layout's local transaction before any publication. */
export async function retireImportLocals(context: RefBackendContext, report: MigrateReport): Promise<StoreMigrateResult | undefined> {
  const kept = await readSyncRefs(context, IMPORT_KEPT_PREFIX);
  if (!kept.size) return;
  const physical = await readRefRepository(context);
  if (!physical.repository?.gitDir) return;
  await context.migrateStep?.("import.transient.local-delete");
  const local = await readSyncRefs(context, "refs/arc/user/");
  const changes: RefChange[] = [];
  for (const [ref, expected] of kept) {
    const source = sourceRef(ref);
    const actual = local.get(source);
    if (actual !== undefined && actual !== expected) return cleanupRefused(`${source} advanced after the import read it.`);
    if (actual !== undefined) changes.push({ ref: source, expected, delete: true });
  }
  const designation = await readRefDesignation(context);
  if (refDesignationStop(designation)?.status === "no-remote") {
    const notices = await retainedRemoteNotices(context, kept);
    report.notices.push(...notices);
    changes.push(...[...kept].map(([ref, expected]) => ({ ref, expected, delete: true as const })));
  }
  if (changes.length && (await updateRefTransaction(context, changes, { cwd: context.checkoutRoot })).status !== "committed") {
    return cleanupRefused("Transient identity refs changed during their local deletion.");
  }
}

/** After publication, remove only the origin generations actually re-homed. */
export async function retireImportRemote(context: RefBackendContext): Promise<StoreMigrateResult | undefined> {
  const kept = await readSyncRefs(context, IMPORT_KEPT_PREFIX);
  if (!kept.size) return;
  await context.migrateStep?.("import.transient.remote-delete");
  try {
    const remote = await originTips(context, [...kept.keys()].map(sourceRef));
    for (const [ref, expected] of kept) {
      const source = sourceRef(ref), actual = remote.get(source);
      if (actual === undefined) continue;
      if (actual !== expected) return cleanupRefused(`origin's ${source} advanced after the import read it.`);
      await context.exec("git", ["push", `--force-with-lease=${source}:${expected}`, "origin", `:${source}`], { cwd: context.checkoutRoot });
    }
  } catch (error) { return cleanupRefused(`Could not retire origin's transient refs: ${error instanceof Error ? error.message : String(error)}`); }
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
  const { stdout } = await context.exec("git", ["ls-remote", "--refs", "origin", ...refs], { cwd: context.checkoutRoot });
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
