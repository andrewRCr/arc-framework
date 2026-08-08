/**
 * Request-scoped remote prerequisites for session-init status composition.
 *
 * @module
 */

import type { GitExec, GitExecInput } from "../lib/git/exec.js";
import {
  readHistoryCompleteness,
  type HistoryCompletenessResult,
} from "../lib/git/history-completeness.js";
import {
  readObjectAvailability,
  type ObjectAvailabilityResult,
} from "../lib/git/object-availability.js";
import {
  readRemoteHeadSnapshot,
  type RemoteHeadSnapshotResult,
} from "../lib/git/remote-ref-reader.js";

/** Internal all-heads context shared by one session-init request. */
export type SessionRemoteContext =
  | { kind: "not-needed"; reason: "remote-sync-disabled" | "no-remote" }
  | { kind: "unavailable"; prerequisite: "remote-configuration" }
  | { kind: "unreachable"; snapshot: Extract<RemoteHeadSnapshotResult, { kind: "unreachable" }> }
  | {
      kind: "available";
      snapshot: Extract<RemoteHeadSnapshotResult, { kind: "available" }>;
      objectAvailability: ObjectAvailabilityResult;
      history: HistoryCompletenessResult;
    };

/** Analyzer-ready projection of one request context. */
export type SessionRemotePrerequisites =
  | Extract<SessionRemoteContext, { kind: "not-needed" }>
  | {
      kind: "supplied";
      snapshot: RemoteHeadSnapshotResult;
      objectAvailability: ObjectAvailabilityResult;
      history: HistoryCompletenessResult;
    };

/** Project the context into shared analyzer inputs without fabricating remote evidence. */
export function sessionRemotePrerequisites(
  context: SessionRemoteContext,
): SessionRemotePrerequisites {
  if (context.kind === "unavailable") {
    throw new Error(`Session remote prerequisite failed: ${context.prerequisite}.`);
  }
  if (context.kind === "not-needed") return context;
  if (context.kind === "unreachable") {
    return Object.freeze({
      kind: "supplied" as const,
      snapshot: context.snapshot,
      objectAvailability: Object.freeze({ kind: "unavailable" as const, reason: "execution" as const }),
      history: Object.freeze({ kind: "unavailable" as const, reason: "execution" as const }),
    });
  }
  return Object.freeze({
    kind: "supplied" as const,
    snapshot: context.snapshot,
    objectAvailability: context.objectAvailability,
    history: context.history,
  });
}

/** Dependencies for one memoized session-init remote-context reader. */
export interface SessionRemoteContextReaderOptions {
  cwd: string;
  exec: GitExec;
  /**
   * Stdin-capable executor for batch object availability. When absent, the snapshot
   * still resolves and only the availability half degrades, so snapshot-only
   * conclusions stay usable.
   */
  execInput?: GitExecInput | undefined;
  remoteSyncEnabled: () => Promise<boolean>;
}

/**
 * Create the memoized remote-context prerequisite for one session-init request.
 *
 * @param options - Request-bound Git and configuration dependencies.
 * @returns A zero-argument reader that reuses one context promise.
 */
export function createSessionRemoteContextReader(
  options: SessionRemoteContextReaderOptions,
): () => Promise<SessionRemoteContext> {
  let contextPromise: Promise<SessionRemoteContext> | undefined;
  return () => {
    contextPromise ??= (async () => {
      if (!await options.remoteSyncEnabled()) {
        return Object.freeze({ kind: "not-needed" as const, reason: "remote-sync-disabled" as const });
      }
      let remotes: string;
      try {
        ({ stdout: remotes } = await options.exec("git", ["remote"], { cwd: options.cwd }));
      } catch {
        return Object.freeze({ kind: "unavailable" as const, prerequisite: "remote-configuration" as const });
      }
      if (!remotes.split(/\r?\n/u).includes("origin")) {
        return Object.freeze({ kind: "not-needed" as const, reason: "no-remote" as const });
      }
      // The executor is not bound to a root, so this must name the request's own
      // directory: reading heads from the process directory would let one request
      // combine a snapshot and its availability facts from different repositories.
      const snapshot = await readRemoteHeadSnapshot({
        exec: options.exec,
        cwd: options.cwd,
        scope: { kind: "all-heads" },
      });
      if (snapshot.kind !== "available") {
        return Object.freeze({
          kind: "unreachable" as const,
          snapshot: Object.freeze({ ...snapshot }),
        });
      }
      const immutableSnapshot = Object.freeze({
        ...snapshot,
        tips: Object.freeze({ ...snapshot.tips }),
      });
      const oids = [...new Set(Object.values(immutableSnapshot.tips))];
      const execInput = options.execInput;
      const [availability, history] = await Promise.all([
        execInput === undefined
          ? Promise.resolve({ kind: "unavailable" as const, reason: "execution" as const })
          : readObjectAvailability({ execInput, oids, cwd: options.cwd }),
        readHistoryCompleteness({ exec: options.exec, cwd: options.cwd }),
      ]);
      const immutableAvailability = availability.kind === "complete"
        ? Object.freeze({ ...availability, commits: Object.freeze({ ...availability.commits }) })
        : Object.freeze({ ...availability });
      return Object.freeze({
        kind: "available" as const,
        snapshot: immutableSnapshot,
        objectAvailability: immutableAvailability,
        history: Object.freeze({ ...history }),
      });
    })();
    return contextPromise;
  };
}
