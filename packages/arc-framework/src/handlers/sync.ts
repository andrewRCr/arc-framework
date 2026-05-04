/**
 * Handler stub for the top-level `arc sync` orchestrator.
 *
 * The orchestrator routes the 6-cell `push_interlock × notes_push × worktree-state`
 * matrix through `runPairedPush` and owns cross-cutting coherence rules. The
 * dispatch logic lands with the matrix routing task; this file exists so the
 * CLI surface is settled before the dispatch logic.
 *
 * Until dispatch lands, invoking `arc sync` prints a stub notice and exits 1.
 * Notes-only sync is available under `arc user sync` (the migrated handler).
 *
 * @module
 */

import * as p from "@clack/prompts";

export interface SyncOptions {
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export function handleSync(): void {
  p.intro("arc sync");
  p.log.warn("Orchestrator dispatch is not yet implemented.");
  p.log.info("For notes-only sync, use `arc user sync`.");
  p.outro("Done.");
  process.exitCode = 1;
}
