/** Byte-preserving Git adapter for transition-record enumeration. */

import type { RawGitExec } from "../change-facts.js";
import {
  queryTransitionDisposition,
  type TransitionDispositionQuery,
  type TransitionDispositionQueryResult,
} from "./transition-disposition-query.js";
import {
  validateTransitionRecordEnumeration,
  type TransitionRecordEnumerationEntry,
  type TransitionRecordEnumerationResult,
} from "./transition-record-enumeration.js";
import { TRANSITION_RECORD_NAMESPACE } from "./transition-record-store.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const TREE_ENTRY_PATTERN = /^([0-7]{6}) ([^ ]+) ([0-9a-f]{40}(?:[0-9a-f]{24})?)\t(.+)$/u;
const INDEX_ENTRY_PATTERN = /^([0-7]{6}) ([0-9a-f]{40}(?:[0-9a-f]{24})?) ([0-3])\t(.+)$/u;
/** Enumerate transition records from exactly one selected Git tree. */
export async function enumerateGitTransitionRecords(
  exec: RawGitExec,
  ref: string,
): Promise<TransitionRecordEnumerationResult> {
  const { stdout } = await exec([
    "ls-tree",
    "--full-tree",
    "-r",
    "-t",
    "-z",
    ref,
    "--",
    TRANSITION_RECORD_NAMESPACE,
  ]);
  let listing: string;
  try {
    listing = decoder.decode(stdout);
  } catch {
    return { status: "namespace-corrupt" };
  }

  const entries: TransitionRecordEnumerationEntry[] = [];
  for (const raw of listing.split("\0").filter(Boolean)) {
    const parsed = parseTreeEntry(raw);
    if (parsed === null) return { status: "namespace-corrupt" };
    if (parsed.type === "tree"
      && (parsed.path === TRANSITION_RECORD_NAMESPACE
        || TRANSITION_RECORD_NAMESPACE.startsWith(`${parsed.path}/`))) continue;
    const prefix = `${TRANSITION_RECORD_NAMESPACE}/`;
    if (!parsed.path.startsWith(prefix)) return { status: "namespace-corrupt" };
    const content = parsed.mode === "100644" && parsed.type === "blob"
      ? (await exec(["cat-file", "blob", parsed.oid])).stdout
      : new Uint8Array();
    entries.push({
      filename: parsed.path.slice(prefix.length),
      mode: parsed.mode,
      type: parsed.type,
      content,
    });
  }
  return validateTransitionRecordEnumeration(entries);
}

/** Enumerate transition records from the repository's exact current index. */
export async function enumerateGitIndexTransitionRecords(
  exec: RawGitExec,
): Promise<TransitionRecordEnumerationResult> {
  const { stdout } = await exec([
    "ls-files",
    "--stage",
    "-z",
    "--",
    TRANSITION_RECORD_NAMESPACE,
  ]);
  let listing: string;
  try {
    listing = decoder.decode(stdout);
  } catch {
    return { status: "namespace-corrupt" };
  }

  const entries: TransitionRecordEnumerationEntry[] = [];
  for (const raw of listing.split("\0").filter(Boolean)) {
    const match = INDEX_ENTRY_PATTERN.exec(raw);
    if (match?.[1] === undefined
      || match[2] === undefined
      || match[3] !== "0"
      || match[4] === undefined) return { status: "namespace-corrupt" };
    const prefix = `${TRANSITION_RECORD_NAMESPACE}/`;
    if (!match[4].startsWith(prefix)) return { status: "namespace-corrupt" };
    const content = match[1] === "100644"
      ? (await exec(["cat-file", "blob", match[2]])).stdout
      : new Uint8Array();
    entries.push({
      filename: match[4].slice(prefix.length),
      mode: match[1],
      type: "blob",
      content,
    });
  }
  return validateTransitionRecordEnumeration(entries);
}

/** Check whether committed or staged history already claims an origin. */
export async function isGitTransitionOriginOccupied(
  exec: RawGitExec,
  origin: string,
): Promise<boolean> {
  const snapshots = await Promise.all([
    enumerateGitTransitionRecords(exec, "HEAD"),
    enumerateGitIndexTransitionRecords(exec),
  ]);
  if (snapshots.some(({ status }) => status !== "valid")) {
    throw new Error("transition record namespace is corrupt");
  }
  return snapshots.some((snapshot) => snapshot.status === "valid"
    && snapshot.groups.some((group) => group.origin === origin));
}

/** Resolve one lean disposition from history reachable at the selected ref. */
export async function queryGitTransitionDisposition(
  exec: RawGitExec,
  ref: string,
  input: TransitionDispositionQuery,
): Promise<TransitionDispositionQueryResult> {
  return queryTransitionDisposition(await enumerateGitTransitionRecords(exec, ref), input);
}

function parseTreeEntry(raw: string): {
  mode: string;
  type: string;
  oid: string;
  path: string;
} | null {
  const match = TREE_ENTRY_PATTERN.exec(raw);
  if (match?.[1] === undefined
    || match[2] === undefined
    || match[3] === undefined
    || match[4] === undefined) return null;
  return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
}
