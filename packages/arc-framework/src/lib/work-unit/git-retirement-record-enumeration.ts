/**
 * Git adapter for complete retirement-record namespace enumeration.
 *
 * The current canonical tree is converted to path-free raw entries, then
 * authenticated before subject-specific logic can inspect it.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import {
  validateRetirementRecordEnumeration,
  type RetirementRecordEnumerationEntry,
  type RetirementRecordEnumerationResult,
} from "./retirement-record-enumeration.js";
import {
  queryRetirementDisposition,
  type RetirementDispositionQuery,
  type RetirementDispositionQueryResult,
} from "./retirement-disposition-query.js";
import { RETIREMENT_RECORD_NAMESPACE } from "./retirement-record-store.js";

interface GitTreeEntry {
  mode: string;
  type: string;
  oid: string;
  path: string;
}

const TREE_ENTRY_PATTERN = /^([0-7]{6}) ([^ ]+) ([0-9a-f]+)\t(.+)$/u;

/**
 * Enumerate and authenticate retirement records reachable from one ref.
 *
 * @param exec - Git process boundary
 * @param ref - Dependent or authority ref whose reachable history is trusted
 * @returns A complete validated namespace result with no storage paths
 */
export async function enumerateGitRetirementRecords(
  exec: GitExec,
  ref: string,
): Promise<RetirementRecordEnumerationResult> {
  const entries: RetirementRecordEnumerationEntry[] = [];
  const seen = new Set<string>();
  const canonical = await listNamespace(exec, ref, RETIREMENT_RECORD_NAMESPACE);
  if (canonical === null) return { status: "namespace-corrupt" };
  await appendUniqueEntries(exec, RETIREMENT_RECORD_NAMESPACE, canonical, seen, entries);
  return validateRetirementRecordEnumeration(entries);
}

/**
 * Resolve one dependent disposition from evidence reachable from its ref.
 *
 * @param exec - Git process boundary
 * @param dependentRef - Committed history trusted by the dependent
 * @param input - Subject and dependent-specific lookup
 * @returns One path-free disposition resolution
 */
export async function queryGitRetirementDisposition(
  exec: GitExec,
  dependentRef: string,
  input: RetirementDispositionQuery,
): Promise<RetirementDispositionQueryResult> {
  return queryRetirementDisposition(
    await enumerateGitRetirementRecords(exec, dependentRef),
    input,
  );
}

async function appendUniqueEntries(
  exec: GitExec,
  namespace: string,
  source: readonly GitTreeEntry[],
  seen: Set<string>,
  destination: RetirementRecordEnumerationEntry[],
): Promise<void> {
  for (const entry of source) {
    const signature = `${entry.mode}\0${entry.type}\0${entry.oid}\0${entry.path}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    const prefix = `${namespace}/`;
    const filename = entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path;
    const content = entry.mode === "100644" && entry.type === "blob"
      ? (await exec("git", ["show", entry.oid])).stdout
      : "";
    destination.push({ filename, mode: entry.mode, type: entry.type, content });
  }
}

async function listNamespace(
  exec: GitExec,
  ref: string,
  namespace: string,
): Promise<readonly GitTreeEntry[] | null> {
  const { stdout } = await exec("git", [
    "ls-tree",
    "--full-tree",
    "-r",
    "-z",
    ref,
    "--",
    namespace,
  ]);
  const entries: GitTreeEntry[] = [];
  for (const raw of stdout.split("\0").filter(Boolean)) {
    const match = TREE_ENTRY_PATTERN.exec(raw);
    if (match === null
      || match[1] === undefined
      || match[2] === undefined
      || match[3] === undefined
      || match[4] === undefined) return null;
    entries.push({
      mode: match[1],
      type: match[2],
      oid: match[3],
      path: match[4],
    });
  }
  return entries;
}
