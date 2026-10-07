/**
 * Output routing wrapper for `arc sync`.
 *
 * Wraps `@clack/prompts` so the orchestrator can keep one set of call sites
 * (`output.log.warn(...)`, `output.spinner()`, etc.) while routing changes
 * based on whether the run is human-facing or `--json`.
 *
 * - **Human mode**: pass-through to Clack — preserves existing CLI UX.
 * - **JSON mode**: visual decorations (intro / outro / spinner) and
 *   informational surfaces (`log.info`, `note`) become no-ops; warnings and
 *   errors still route to stderr because they carry recovery guidance not
 *   reconstructible from envelope result codes (partial-publish, force-push,
 *   identity-absent). Stdout stays pure for the JSON envelope; stderr stays
 *   useful for the consumer who reads it. Confirmation answers come from the
 *   caller's declared policy and invocation context.
 *
 * Info-level suppression rationale: every `output.log.info` site duplicates
 * data already in the JSON envelope (`worktree.result`, `notes.result`,
 * `interlockState`, etc.). A consumer parsing the envelope reconstructs the
 * same signal; an info-level line on stderr is redundant chatter that turns
 * `2>&1 | jq` into a foot-gun.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { prompt, type ConfirmQuestion, type PromptOutcome } from "./command-input/prompter.js";
import type { PromptSite } from "./command-input/declaration.js";
import type { InteractionContext } from "./command-input/interaction-context.js";

export interface SyncOutputSpinner {
  start(message?: string): void;
  stop(message?: string): void;
}

export interface SyncOutput {
  jsonMode: boolean;
  intro(message: string): void;
  outro(message: string): void;
  log: {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
  };
  note(message: string, title?: string): void;
  spinner(): SyncOutputSpinner;
  confirm(site: PromptSite<"confirm">, context: InteractionContext,
    opts: ConfirmQuestion): Promise<PromptOutcome<boolean>>;
}

function writeStderr(prefix: string, message: string): void {
  process.stderr.write(`${prefix}${message}\n`);
}

export function createSyncOutput(jsonMode: boolean): SyncOutput {
  if (!jsonMode) {
    return {
      jsonMode: false,
      intro: (message) => { p.intro(message); },
      outro: (message) => { p.outro(message); },
      log: {
        info: (message) => { p.log.info(message); },
        warn: (message) => { p.log.warn(message); },
        error: (message) => { p.log.error(message); },
      },
      note: (message, title) => { p.note(message, title); },
      spinner: () => p.spinner(),
      confirm: prompt,
    };
  }
  return {
    jsonMode: true,
    intro: () => undefined,
    outro: () => undefined,
    log: {
      info: () => undefined,
      warn: (message) => { writeStderr("warn: ", message); },
      error: (message) => { writeStderr("error: ", message); },
    },
    note: () => undefined,
    spinner: () => ({ start: () => undefined, stop: () => undefined }),
    confirm: prompt,
  };
}
