/**
 * Output routing wrapper for `arc sync`.
 *
 * Wraps `@clack/prompts` so the orchestrator can keep one set of call sites
 * (`output.log.warn(...)`, `output.spinner()`, etc.) while routing changes
 * based on whether the run is human-facing or `--json`.
 *
 * - **Human mode**: pass-through to Clack — preserves existing CLI UX.
 * - **JSON mode**: visual decorations (intro / outro / spinner) become
 *   no-ops; diagnostics (`log.*`, `note`) route to stderr so stdout stays
 *   pure; interactive `confirm` returns `false` so the prompt cell can never
 *   suspend a non-interactive consumer waiting for input.
 *
 * The orchestrator additionally degrades `notes_push: prompt` → `manual` at
 * policy-resolution time when `opts.json` is set, so the JSON-mode confirm
 * fallback only protects callers from an unexpected prompt path.
 *
 * @module
 */

import * as p from "@clack/prompts";

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
  confirm(opts: { message: string; initialValue?: boolean }): Promise<boolean | symbol>;
  isCancel(value: unknown): boolean;
}

function writeStderr(prefix: string, message: string, title?: string): void {
  const heading = title ? `[${title}] ` : "";
  process.stderr.write(`${prefix}${heading}${message}\n`);
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
      confirm: (opts) => p.confirm(opts),
      isCancel: (value) => p.isCancel(value),
    };
  }
  return {
    jsonMode: true,
    intro: () => undefined,
    outro: () => undefined,
    log: {
      info: (message) => { writeStderr("info: ", message); },
      warn: (message) => { writeStderr("warn: ", message); },
      error: (message) => { writeStderr("error: ", message); },
    },
    note: (message, title) => { writeStderr("", message, title); },
    spinner: () => ({ start: () => undefined, stop: () => undefined }),
    confirm: () => Promise.resolve(false),
    isCancel: () => false,
  };
}
