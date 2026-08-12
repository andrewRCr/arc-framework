/** Transient identity indexes projected from the orphan state ref. */

import { errandsRef } from "./ref-tree.js";
import type { TransientIdentityRecord } from "./identity-record.js";
import {
  readTransientIdentitySnapshot,
  readTransientIdentitySnapshotAtRef,
  type IdentitySnapshotDiagnostic,
} from "./identity-snapshot.js";

import type { GitExec } from "../git/exec.js";
import { uniqueRefToken } from "../git/ref-tree.js";
import { gitFailureText, isGitProcessError } from "../git/process-error.js";
import { isRemoteUnavailableError } from "../user-sync/index.js";
import type { TransientWorktreeSubject } from "../git/worktree-marker.js";

/** Exact branch indexes for transient in-flight classification and marker-generation joins. */
export interface TransientInFlightIndexes {
  slugByBranch: Map<string, string>;
  expectedByBranch: Map<string, TransientWorktreeSubject>;
  expectedBySlug: Map<string, TransientWorktreeSubject>;
  records: TransientIdentityRecord[];
}

/**
 * Exact outcome of one identity-index read.
 *
 * Only `absent` and a diagnostic-free `complete` establish the identity's whole
 * claim set — the state a caller needs before treating a branch the indexes omit
 * as carrying no transient claim. `error` establishes nothing, and a `complete`
 * read that dropped entries reports them rather than presenting a partial index
 * as the whole one.
 */
export type TransientInFlightRead =
  | { kind: "absent"; indexes: TransientInFlightIndexes }
  | {
      kind: "complete";
      indexes: TransientInFlightIndexes;
      diagnostics: readonly IdentitySnapshotDiagnostic[];
    }
  | { kind: "error"; stage: "cleanup" | "fetch" | "tip" | "tree"; message: string };

/**
 * Project a read into usable indexes plus whether they establish the whole claim set.
 *
 * Every consumer degrades the same way — derive over what was readable — but none may
 * treat a branch the indexes omit as claim-free unless `complete` holds. Callers reach
 * the indexes through this projection so the unreadable arm cannot be skipped silently.
 *
 * @param read - Outcome of {@link readTransientInFlightIndexes}
 * @returns Indexes to derive over, whether absence is established, and any degradation notice
 */
export function projectTransientInFlightRead(read: TransientInFlightRead): {
  indexes: TransientInFlightIndexes;
  complete: boolean;
  degraded: string | null;
} {
  if (read.kind === "error") {
    return {
      indexes: emptyTransientInFlightIndexes(),
      complete: false,
      degraded: `Transient identity unreadable (${read.stage}): ${read.message}`,
    };
  }
  if (read.kind === "absent") return { indexes: read.indexes, complete: true, degraded: null };
  if (read.diagnostics.length === 0) {
    return { indexes: read.indexes, complete: true, degraded: null };
  }
  return {
    indexes: read.indexes,
    complete: false,
    degraded: `Transient identity dropped ${read.diagnostics.length} unreadable entr`
      + `${read.diagnostics.length === 1 ? "y" : "ies"}.`,
  };
}

/** Indexes carrying no claims — the basis a caller degrades onto after an unreadable identity. */
export function emptyTransientInFlightIndexes(): TransientInFlightIndexes {
  return {
    slugByBranch: new Map(),
    expectedByBranch: new Map(),
    expectedBySlug: new Map(),
    records: [],
  };
}

/**
 * Read the identity's transient records into branch and slug indexes.
 *
 * @param io - Injected read seam (`exec`) and the identity, which may be `null`.
 * @returns Clean absence, an unreadable identity, or the indexes plus any dropped entries.
 */
export async function readTransientInFlightIndexes(
  io: { exec: GitExec; identity: string | null },
): Promise<TransientInFlightRead> {
  // No identity resolves no claims by definition — an established absence, not an
  // unreadable one, so it stays distinct from a failed read of a real identity.
  if (io.identity === null) return { kind: "absent", indexes: emptyTransientInFlightIndexes() };
  const snapshot = await readTransientIdentitySnapshot({ exec: io.exec, identity: io.identity });
  return projectTransientSnapshot(snapshot);
}

/**
 * Read discovery indexes from an isolated fetched identity snapshot.
 *
 * The configured local identity ref is never updated. An absent remote ref falls
 * back to the local read so unborn identities retain their established behavior.
 *
 * @param io - Injected Git boundary, identity, and configured remote.
 * @returns Remote-backed indexes, local absence, or a typed operational failure.
 */
export async function readFetchedTransientInFlightIndexes(
  io: { exec: GitExec; identity: string | null; remote: string },
): Promise<TransientInFlightRead> {
  if (io.identity === null) return { kind: "absent", indexes: emptyTransientInFlightIndexes() };
  const sourceRef = errandsRef(io.identity);
  const snapshotRef = `refs/arc/tmp/transient-discovery/${uniqueRefToken()}`;
  const fetchArgs = ["fetch", io.remote, `+${sourceRef}:${snapshotRef}`];
  try {
    await io.exec("git", fetchArgs);
  } catch (error) {
    const detail = gitFailureText(error);
    const absent = isGitProcessError(error) && error.expectedOutcome === "absent-remote-ref";
    if (absent || isRemoteUnavailableError(detail)
      || /(?:could(?:n't| not)|cannot) find remote ref/iu.test(detail)) {
      return readTransientInFlightIndexes(io);
    }
    return { kind: "error", stage: "fetch", message: errorMessage(error) };
  }

  const snapshot = await readTransientIdentitySnapshotAtRef(
    { exec: io.exec, identity: io.identity },
    snapshotRef,
  );
  const outcome = projectTransientSnapshot(snapshot);
  try {
    await io.exec("git", ["update-ref", "-d", snapshotRef]);
  } catch (error) {
    if (outcome.kind === "error") return outcome;
    return { kind: "error", stage: "cleanup", message: errorMessage(error) };
  }
  return outcome;
}

function projectTransientSnapshot(
  snapshot: Awaited<ReturnType<typeof readTransientIdentitySnapshotAtRef>>,
): TransientInFlightRead {
  if (snapshot.kind === "error") {
    return { kind: "error", stage: snapshot.stage, message: snapshot.message };
  }
  if (snapshot.kind === "absent") return { kind: "absent", indexes: emptyTransientInFlightIndexes() };

  const indexes = emptyTransientInFlightIndexes();
  for (const record of snapshot.records.values()) {
    if (record.branch === null) continue;
    indexes.slugByBranch.set(record.branch, record.slug);
    const kind = record.kind === "groom"
      ? "groom"
      : record.purpose === "housekeep-routing"
        ? "housekeep"
        : "errand";
    const subject = { kind, slug: record.slug, claimId: record.claimId } as TransientWorktreeSubject;
    indexes.expectedByBranch.set(record.branch, subject);
    indexes.expectedBySlug.set(record.slug, subject);
  }
  indexes.records = [...snapshot.records.values()];
  return { kind: "complete", indexes, diagnostics: snapshot.diagnostics };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
