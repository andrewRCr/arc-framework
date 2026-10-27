/** Isolated acquisition of a migration remote's complete state and control records. */
import { createHash } from "node:crypto";
import { parseFetchPorcelain, type FetchOutcome } from "../../git/fetch.js";
import { normalizeGitRejection } from "../../git/process-error.js";
import { PASSIVE_REMOTE_INTERACTION } from "../../git/remote-ref-reader.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import type { RefBackendContext } from "./context.js";
import type { MoveRemote } from "./migrate-record.js";
import { readSyncRefs } from "./sync-graph.js";
import { requireLayoutTransaction } from "./migrate-layout-build.js";
import { refFetchArgs, refFetchNegotiation } from "./fetch-target.js";
import { refFetchNeedsCompleteness, missingRefFetchObjects, RefFetchIncompleteError } from "./fetch-completeness.js";
import { isStateRef } from "./manifest.js";
import { FORWARDING_REF } from "./forwarding-record.js";

/** Clear exactly one temporary acquisition namespace, preserving the move and copied tips. */
export async function clearMigrationRefs(context: RefBackendContext, prefix: string): Promise<void> {
  const held = await readSyncRefs(context, prefix);
  await requireLayoutTransaction(context, [...held].map(([ref, expected]) => ({ ref, expected, delete: true })));
}

/** Fetch every store ref, or just project controls, without adopting any as local state. */
export async function fetchMigrationRemote(context: RefBackendContext, remote: MoveRemote, complete: boolean,
  options?: { prefix?: string; controls?: readonly ("registry" | "moved")[] }): Promise<Map<string, string>> {
  const prefix = options?.prefix ?? migrationGatheringPrefix(remote);
  await clearMigrationRefs(context, prefix);
  const patterns = complete ? ["work/*", "cohort/*", "archive/*", "project/*", "user/*", "history/work/*", "history/cohort/*"]
    : (options?.controls ?? ["registry", "moved"]).map(control => `project/${control}*`);
  const args = refFetchArgs(remote.name, await refFetchNegotiation(context, await context.identity()), remote.fetchUrl);
  const input = patterns.map(pattern => `+refs/arc/${pattern}:${prefix}${pattern}`).join("\n") + "\n";
  let fetched = await runMigrationFetch(context, args, input, remote);
  if (await refFetchNeedsCompleteness(context) && (await missingRefFetchObjects(context, fetched)).length) {
    const at = args.indexOf("fetch");
    fetched = await runMigrationFetch(context, [...args.slice(0, at + 1), "--refetch", ...args.slice(at + 1)], input, remote);
    const missing = await missingRefFetchObjects(context, fetched);
    if (missing.length) throw new MigrationRefusal({ code: "store", refusal: new RefFetchIncompleteError(missing, []).failure });
  }
  return readGatheringRefs(context, prefix);
}

/** Read the last acquired remote snapshot before its owning migration clears the gathering. */
export async function readMigrationGathering(context: RefBackendContext, remote: MoveRemote): Promise<Map<string, string>> {
  return readGatheringRefs(context, migrationGatheringPrefix(remote));
}

function migrationGatheringPrefix(remote: MoveRemote): string {
  const key = createHash("sha256").update(JSON.stringify([remote.name, remote.fetchUrl])).digest("hex");
  return `refs/arc/tmp/migrate/remote/${key}/`;
}

async function readGatheringRefs(context: RefBackendContext, prefix: string): Promise<Map<string, string>> {
  return new Map([...(await readSyncRefs(context, prefix))].map(([ref, tip]): [string, string] => ["refs/arc/" + ref.slice(prefix.length), tip])
    .filter(([ref]) => isStateRef(ref) || ref === FORWARDING_REF));
}

async function runMigrationFetch(context: RefBackendContext, args: string[], input: string, remote: MoveRemote): Promise<Extract<FetchOutcome, { status: "refs" }>> {
  let fetched: FetchOutcome, failed = false;
  try { fetched = parseFetchPorcelain(await context.exec("git", args, { cwd: context.checkoutRoot, input,
    diagnosticLocale: "stable", interaction: PASSIVE_REMOTE_INTERACTION, preserveOutput: true })); }
  catch (error) { failed = true; fetched = parseFetchPorcelain(normalizeGitRejection(error, { command: "git", args })); }
  if (fetched.status === "unreachable") throw new MigrationRefusal({ code: "store", refusal: { code: "unreachable", class: "recoverable", cause: fetched.cause,
    condition: fetched.stderr || `Could not fetch migration remote ${remote.name}.`, remedy: { text: `Repair access to ${remote.name} and retry arc store migrate.` } } });
  // Rows printed before a failure do not show what the gathering kept, so the read failed whatever they say.
  if (failed || fetched.refs.some(row => row.flag === "!")) throw new MigrationRefusal({ code: "store", refusal: { code: "refused", class: "terminal",
    message: fetched.stderr || "The migration fetch refused a temporary ref update.", condition: fetched.stderr || "The migration fetch refused a temporary ref update.", remedy: { text: "Repair the temporary ref lock, then retry arc store migrate." } } });
  return fetched;
}
