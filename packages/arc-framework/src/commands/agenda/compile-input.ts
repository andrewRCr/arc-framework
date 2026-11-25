/** Checkout-bound reads and validated inputs for session agenda compilation. */

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { GitExec } from "../../lib/git/index.js";
import type { SessionInitProbeResult } from "../status.js";
import type { SessionStatusContext } from "../../handlers/status/session-context.js";
import type { AgendaAnswers, AgendaSignals } from "./schema.js";

/** Synchronization channels available to the selected entering row. */
export type SyncChannels = "all" | "notes";

/** Read-only operations bound to the session's checkout, replaceable by unit fixtures. */
export interface AgendaReadPort {
  exists(path: string): Promise<boolean>;
  size(path: string): Promise<number>;
  read(path: string): Promise<string>;
  git(args: readonly string[]): Promise<string>;
}

/** Request-bound personal readers and selected operational store for explicit entry. */
export type AgendaEntryContext = Pick<SessionStatusContext, "cwd" | "io" | "identity" | "readUserInbox" | "store">;

/** The shared probe result, invocation intent, and checkout reads for one compile. */
export interface AgendaCompileInput {
  envelope: SessionInitProbeResult;
  signals: AgendaSignals;
  answers: AgendaAnswers;
  read: AgendaReadPort;
  entry: AgendaEntryContext;
}

/** Bind agenda reads to one checkout without writing files, refs, notes, or markers. */
export function createAgendaReadPort(cwd: string, exec: GitExec): AgendaReadPort {
  return {
    exists: async path => {
      try { return (await stat(resolve(cwd, path))).isFile(); }
      catch (error) {
        if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return false;
        throw error;
      }
    },
    size: async path => (await stat(resolve(cwd, path))).size,
    read: path => readFile(resolve(cwd, path), "utf8"),
    git: async args => (await exec("git", [...args], { cwd })).stdout,
  };
}
