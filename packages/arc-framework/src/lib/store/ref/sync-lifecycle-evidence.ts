/** Immutable lifecycle evidence scoped to one sync operation in one selected repository. */

import { isArchiveRef, type ArchivedFolder } from "./archive-read.js";
import { matchesFamilyRef } from "./codec.js";
import { HistoryRefSchema } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { isGitProcessError } from "../../git/process-error.js";
import { isUnavailableGraphFailure } from "./history-graph.js";

/** Raw commit facts remain owner-neutral until each caller interprets their provenance. */
export interface LifecycleLogRow { commit: string; parents: readonly string[]; message: string }

/** Successful snapshot reads can be reused; missing objects and failed reads are never retained. */
export interface LifecycleEvidence {
  folders: Map<string, readonly ArchivedFolder[]>;
  logs: Map<string, readonly LifecycleLogRow[]>;
}

/** Attach evidence after repository selection, preserving an enclosing sync's immutable reads. */
export function withLifecycleEvidence(context: RefBackendContext): RefBackendContext {
  return context.lifecycleEvidence ? context : { ...context,
    writeEvidence: context.writeEvidence ?? { objects: new Map(), trees: new Map() },
    lifecycleEvidence: { folders: new Map(), logs: new Map() } };
}

/** Acquire item histories together, returning unavailable roots without caching a missing history as empty. */
export async function primeLifecycleLogs(context: RefBackendContext, snapshots: readonly ReadonlyMap<string, string>[]): Promise<ReadonlySet<string>> {
  if (!context.lifecycleEvidence) return new Set();
  const refs = snapshots.flatMap((snapshot) => [...snapshot]);
  if (!refs.some(([ref]) => isArchiveRef(ref) || HistoryRefSchema.safeParse(ref).success)) return new Set();
  const tips = refs.filter(([ref]) => matchesFamilyRef(ref, "work-item") || matchesFamilyRef(ref, "cohort")
    || HistoryRefSchema.safeParse(ref).success).map(([, tip]) => tip);
  return primeAvailableLifecycleLogs(context, [...new Set(tips)], context.lifecycleEvidence.logs);
}

async function primeAvailableLifecycleLogs(context: RefBackendContext, tips: readonly string[],
  retained: Map<string, readonly LifecycleLogRow[]>): Promise<ReadonlySet<string>> {
  try { await acquireLifecycleLogs(context, tips, retained); return new Set(); }
  catch (error) {
    if (!await isUnavailableGraphFailure(context, error)) throw error;
    if (tips.length === 1) return new Set(tips);
    const middle = Math.ceil(tips.length / 2);
    const left = await primeAvailableLifecycleLogs(context, tips.slice(0, middle), retained);
    const right = await primeAvailableLifecycleLogs(context, tips.slice(middle), retained);
    return new Set([...left, ...right]);
  }
}

/** Read only the commits reachable from the requested immutable tip, through every parent. */
export async function readLifecycleLog(context: RefBackendContext, tip: string): Promise<readonly LifecycleLogRow[]> {
  const logs = context.lifecycleEvidence?.logs ?? new Map<string, readonly LifecycleLogRow[]>();
  await acquireLifecycleLogs(context, [tip], logs);
  return logs.get(tip) ?? [];
}

async function acquireLifecycleLogs(context: RefBackendContext, tips: readonly string[],
  retained: Map<string, readonly LifecycleLogRow[]>): Promise<void> {
  const missing = [...new Set(tips)].filter((tip) => !retained.has(tip));
  if (!missing.length) return;
  let stdout: string;
  try {
    stdout = await context.execInput(["log", "--format=%H %P%n%B%x00", "--stdin"], `${missing.join("\n")}\n`,
      { cwd: context.checkoutRoot, objectAccess: "local-only", diagnosticLocale: "stable" });
  } catch (error) {
    if (!isGitProcessError(error) || error.kind !== "output-limit" || missing.length === 1) throw error;
    const middle = Math.ceil(missing.length / 2);
    await acquireLifecycleLogs(context, missing.slice(0, middle), retained);
    await acquireLifecycleLogs(context, missing.slice(middle), retained);
    return;
  }
  const rows = stdout.split("\0").flatMap((block) => {
    const [header = "", ...message] = block.trimStart().split("\n"), [commit, ...parents] = header.split(" ").filter(Boolean);
    return commit ? [{ commit, parents, message: message.join("\n") }] : [];
  });
  const byCommit = new Map(rows.map((row) => [row.commit, row]));
  for (const tip of missing) {
    if (!byCommit.has(tip)) throw new Error("Git did not return the requested lifecycle history");
    const reachable = new Set<string>(), pending = [tip];
    while (pending.length) {
      const commit = pending.pop();
      if (!commit || reachable.has(commit)) continue;
      reachable.add(commit); pending.push(...byCommit.get(commit)?.parents ?? []);
    }
    retained.set(tip, rows.filter(({ commit }) => reachable.has(commit)));
  }
}
