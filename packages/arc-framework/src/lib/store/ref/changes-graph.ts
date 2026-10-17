/** Immutable commit windows and raw trees used to enumerate landed record changes. */
import type { ChangesInput } from "../contract.js";
import type { StateVersion } from "../identity.js";
import { HistoryRefSchema, type StoreResult, type StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, readRefTrees, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { parseHistoryRows, orderHistoryCommits, type HistoryCommit } from "./history-order.js";

/** An exact upper commit with an optional older ancestry exclusion. */
export interface RefChangeWindow { ref: string; upper: string; lower?: string; version: StateVersion; paths?: readonly string[] }
/** Captured commits include boundary parents so per-record comparisons need no live reads. */
export interface CapturedChangeWindow {
  window: RefChangeWindow; rows: HistoryCommit[]; trees: Map<string, RefTreeEntry[]>; objects: Map<string, BatchObject | null>;
}

/** The exact saved-state comparison shared by end discovery and record selection. */
export interface RefChangeInterval { input: ChangesInput; before: ReadonlyMap<string, string>; after: ReadonlyMap<string, string> }
/** One memoized immutable window read within a comparison. */
export type ChangeWindowReader = (window: RefChangeWindow) => Promise<StoreResult<CapturedChangeWindow>>;

/** Reuse an end ref's captured graph when it also supplies ordinary record events. */
export function createChangeWindowReader(context: RefBackendContext): ChangeWindowReader {
  const reads = new Map<string, Promise<StoreResult<CapturedChangeWindow>>>();
  return (window) => {
    const key = JSON.stringify([window.ref, window.upper, window.lower, window.paths, window.version]);
    let captured = reads.get(key);
    if (!captured) { captured = captureChangeWindow(context, window); reads.set(key, captured); }
    return captured;
  };
}

/** Read each branch in local-before-remote order, bounded by the caller's exact commits. */
export async function captureChangeWindow(context: RefBackendContext, window: RefChangeWindow): Promise<StoreResult<CapturedChangeWindow>> {
  const heads = await readBatchObjects(context, [window.upper, ...window.lower ? [window.lower] : []]);
  if ([...heads.values()].some((object) => object?.type !== "commit")) return { status: "refused", refusal: missingChangeState(window) };
  const { stdout } = await context.exec("git", ["rev-list", "--full-history", "--parents", "--topo-order", window.upper,
    ...window.lower ? [`^${window.lower}`] : [], ...window.paths ? ["--", ...window.paths.map((path) => `:(literal)${path}`)] : []],
  { cwd: context.checkoutRoot, objectAccess: "local-only" });
  const rows = orderHistoryCommits(parseHistoryRows(stdout)).reverse();
  if (!rows.length) return { status: "ok", result: { window, rows, trees: new Map(), objects: heads } };
  const revisions = [...new Set([...rows.flatMap(({ revision, parents }) => [revision, ...parents]), ...window.lower ? [window.lower] : []])];
  const trees = await readRefTrees(context, new Map(revisions.map((revision) => [revision, revision])), window.paths);
  if (revisions.some((revision) => !trees.has(revision))) return { status: "refused", refusal: missingChangeState(window) };
  const objects = await readBatchObjects(context, [...new Set([...revisions, ...[...trees.values()].flatMap((entries) => entries.map(({ oid }) => oid))])]);
  if (revisions.some((revision) => objects.get(revision)?.type !== "commit")) return { status: "refused", refusal: missingChangeState(window) };
  return { status: "ok", result: { window, rows, trees, objects } };
}

/** Name the retained history that can repair a missing item window. */
export function missingChangeState(window: Pick<RefChangeWindow, "ref" | "version">): StoreRefusal {
  const history = HistoryRefSchema.safeParse(window.ref.replace(/^refs\/arc\/(?:history\/)?(work|cohort)\//u, "refs/arc/history/$1/"));
  return { code: "state-unresolvable", class: "recoverable", stateVersion: window.version, historyRefs: history.success ? [history.data] : [],
    condition: `The saved changes window for ${window.ref} is not available locally.`,
    remedy: { text: "Pull the named history refs or restore the missing state objects, then retry the comparison." } };
}

/** Return a captured commit's verbatim message after its Git header. */
export function changeCommitMessage(captured: CapturedChangeWindow, revision: string): string {
  const object = captured.objects.get(revision);
  if (object?.type !== "commit") throw new Error("A captured history revision is not a commit");
  const raw = new TextDecoder().decode(object.bytes), boundary = raw.indexOf("\n\n");
  if (boundary < 0) throw new Error("Git returned a commit without its header boundary");
  return raw.slice(boundary + 2);
}
