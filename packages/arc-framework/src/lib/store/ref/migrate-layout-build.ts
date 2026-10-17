/** Private layout builds acquire objects without exposing any destination ref piecemeal. */

import { join } from "node:path";
import type { MigrateReport } from "../commands.js";
import { prepareRefCopy } from "./migrate-copy.js";
import type { Store } from "../contract.js";
import type { RefBackendContext } from "./context.js";
import { bindRefRepository } from "./repository-context.js";
import { readObjectFormat } from "./manifest.js";
import { readSyncRefs } from "./sync-graph.js";
import { updateRefTransaction, type RefChange } from "../../git/ref-transaction.js";
import { MOVE_REF, type LayoutMoveRecord } from "./migrate-record.js";

/** One isolated plan and its source/destination bases, all protected by the held layout lock. */
export interface LayoutBuild {
  context: RefBackendContext; source: Map<string, string>; destination: Map<string, string>; planned: Map<string, string>;
  notices: MigrateReport["notices"];
}

/** Select state, acquired remote views, and every machine-local history/version keeper. */
export async function layoutRefs(context: RefBackendContext): Promise<Map<string, string>> {
  return new Map([...(await readSyncRefs(context, ["refs/arc/", "refs/arc-remotes/"]))]
    .filter(([ref]) => !ref.startsWith("refs/arc/tmp/migrate/")));
}

/** Replace an interrupted build from fresh source refs, keeping the destination untouched. */
export async function buildLayoutMove(code: RefBackendContext, source: RefBackendContext, store: Store,
  record: LayoutMoveRecord, directory: string): Promise<LayoutBuild> {
  await code.migrateStep?.("layout.build");
  await code.fs.removeDirectory(directory);
  // Keep the latest logical cut alive in the repository whose keepers will be transferred.
  const pinned = await store.version();
  if (pinned.status === "refused") throw new Error(pinned.refusal.condition);
  const refs = await layoutRefs(source);
  const destination = record.destination === "default" ? await layoutRefs(code) : new Map<string, string>();
  const common = code.repository?.commonDir;
  if (!common) throw new Error("No common code repository selected");
  await clearLayoutGathering(code);
  await fetchLayoutObjects(code, source.repository?.gitDir ?? common, refs);
  await requireLayoutTransaction(code, [...refs].map(([ref, next]) => ({ ref: gatheringRef("source", ref), next, expected: null })));
  await code.fs.mkdir(join(common, "arc"), { recursive: true });
  await code.exec("git", ["init", "--bare", "--ref-format=reftable", `--object-format=${await readObjectFormat(source)}`, directory]);
  const target = bindRefRepository(code, common, directory);
  await fetchLayoutObjects(target, common, new Map([...refs].map(([ref, tip]): [string, string] => [`source/${ref}`, tip]).concat([...destination])));
  await requireLayoutTransaction(target, [...destination].map(([ref, next]) => ({ ref, next, expected: null })));
  const copied = await prepareRefCopy(target, refs, "held");
  return { context: target, source: refs, destination, planned: copied.refs, notices: copied.notices };
}

/** Move objects using stdin refspecs so a large store never grows a command-line-sized argument list. */
export async function fetchLayoutObjects(context: RefBackendContext, source: string, refs: ReadonlyMap<string, string>): Promise<void> {
  if (!refs.size || source === (context.repository?.gitDir ?? context.repository?.commonDir)) return;
  await context.execInput(["fetch", "--stdin", "--refmap=", "--no-tags", "--no-filter", "--no-write-fetch-head", "--", source],
    [...new Set(refs.values())].join("\n") + "\n", { cwd: context.checkoutRoot });
}

/** One compare-and-swap transaction publishes the complete prepared destination. */
export async function requireLayoutTransaction(context: RefBackendContext, changes: RefChange[]): Promise<void> {
  if (!changes.length) return;
  const result = await updateRefTransaction(context, changes, { cwd: context.checkoutRoot });
  if (result.status !== "committed") throw new Error("The held layout changed during its ref transaction");
}

/** Gathering refs never travel into the installed store, and never erase the move's own record. */
export async function clearLayoutGathering(context: RefBackendContext, layoutOnly = false): Promise<void> {
  const held = await readSyncRefs(context, layoutOnly ? "refs/arc/tmp/migrate/layout/" : "refs/arc/tmp/migrate/");
  await requireLayoutTransaction(context, [...held].filter(([ref]) => ref !== MOVE_REF).map(([ref, expected]) => ({ ref, delete: true, expected })));
}

function gatheringRef(side: string, ref: string): string { return `refs/arc/tmp/migrate/layout/${side}/${ref.slice("refs/".length)}`; }
