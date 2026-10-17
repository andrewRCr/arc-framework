/** Attribute an ambiguous receiver failure without fetching or merging the carried code. */

import { isGitObjectId } from "../../git/object-id.js";
import { isGitProcessError } from "../../git/process-error.js";
import { classifyRemoteFailure, PASSIVE_REMOTE_INTERACTION } from "../../git/remote-ref-reader.js";
import type { CarryOutcome } from "../sync.js";
import { readBatchObjects } from "./batch-read.js";
import type { RefCarryPublication } from "./push-carry.js";
import { syncRefIsAncestor } from "./sync-graph.js";

/** Compare one live receiver tip with the explicit lease or locally known pushed ancestry. */
export async function observeRefCarryCommitRace(carry: RefCarryPublication, message: string): Promise<CarryOutcome | undefined> {
  const { source, change, remote } = carry, ref = change.ref;
  if (!remote || !change.next) throw new Error("A carried receiver check needs a destination and captured code tip");
  try {
    const target = (await source.exec("git", ["remote", "get-url", "--push", remote], { cwd: source.checkoutRoot })).stdout.trim();
    const { stdout } = await source.exec("git", ["ls-remote", "--refs", "--", target, ref], {
      cwd: source.checkoutRoot, signal: source.syncDeadline?.signal,
      diagnosticLocale: "stable", interaction: PASSIVE_REMOTE_INTERACTION,
    });
    const rows = stdout.split(/\r?\n/u).filter(Boolean).map((line) => line.split("\t"));
    if (rows.length > 1 || rows.some(([oid, name]) => !oid || !isGitObjectId(oid) || name !== ref)) {
      return { ref, status: "unreachable", cause: "error" };
    }
    const tip = rows[0]?.[0] ?? null;
    const raced = change.expected !== undefined ? tip !== change.expected
      : tip !== null && (!(await readBatchObjects(source, [tip])).get(tip)
        || !await syncRefIsAncestor(source, tip, change.next));
    return raced ? { ref, status: "refused", reason: "raced", message } : undefined;
  } catch (error) {
    if (!isGitProcessError(error)) throw error;
    return { ref, status: "unreachable", cause: source.syncDeadline?.signal.aborted ? "timeout" : classifyRemoteFailure(error) };
  }
}
