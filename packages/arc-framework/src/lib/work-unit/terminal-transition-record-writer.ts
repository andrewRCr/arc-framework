/** Typed write and rollback port for terminal transition history. */

import type { GitExec } from "../git/exec.js";
import type { TransitionRecord } from "./transition-record.js";
import { resolveTransitionRecordRelativePath } from "./transition-record-store.js";

/** Closed terminal history write result. */
export type TerminalTransitionRecordWriteResult =
  | { status: "recorded" }
  | { status: "origin-occupied" }
  | { status: "unavailable"; diagnostic: string };

/** Closed rollback result for one attempted terminal history record. */
export type TerminalTransitionRecordRollbackResult =
  | { status: "rolled-back" }
  | { status: "unavailable"; diagnostic: string };

/** Terminal verbs' storage-independent history port. */
export interface TerminalTransitionRecordWriter {
  record(record: TransitionRecord): Promise<TerminalTransitionRecordWriteResult>;
  rollback(record: TransitionRecord): Promise<TerminalTransitionRecordRollbackResult>;
}

/** In-repository terminal writer dependencies. */
export interface InRepoTerminalTransitionRecordWriterDeps {
  cwd: string;
  exec: GitExec;
  createRecord(record: TransitionRecord): Promise<void>;
  removeRecord(origin: string): Promise<void>;
}

/** Build the Git/filesystem terminal transition writer. */
export function createInRepoTerminalTransitionRecordWriter(
  deps: InRepoTerminalTransitionRecordWriterDeps,
): TerminalTransitionRecordWriter {
  return {
    record: async (record) => {
      const path = resolveTransitionRecordRelativePath(record.origin);
      try {
        await deps.createRecord(record);
      } catch (error) {
        return isNodeError(error) && error.code === "EEXIST"
          ? { status: "origin-occupied" }
          : { status: "unavailable", diagnostic: errorMessage(error) };
      }
      try {
        await deps.exec("git", ["add", "--", path], { cwd: deps.cwd });
        return { status: "recorded" };
      } catch (error) {
        const cleanup = await rollbackRecord(deps, record);
        return {
          status: "unavailable",
          diagnostic: `transition record staging failed: ${errorMessage(error)}`
            + (cleanup.status === "rolled-back" ? "" : `; ${cleanup.diagnostic}`),
        };
      }
    },
    rollback: async (record) => await rollbackRecord(deps, record),
  };
}

async function rollbackRecord(
  deps: InRepoTerminalTransitionRecordWriterDeps,
  record: TransitionRecord,
): Promise<TerminalTransitionRecordRollbackResult> {
  const failures: string[] = [];
  const path = resolveTransitionRecordRelativePath(record.origin);
  try {
    await deps.exec("git", ["rm", "-f", "--cached", "--ignore-unmatch", "--", path], { cwd: deps.cwd });
  } catch (error) {
    failures.push(`index cleanup failed: ${errorMessage(error)}`);
  }
  try {
    await deps.removeRecord(record.origin);
  } catch (error) {
    failures.push(`record removal failed: ${errorMessage(error)}`);
  }
  return failures.length === 0
    ? { status: "rolled-back" }
    : { status: "unavailable", diagnostic: failures.join("; ") };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
