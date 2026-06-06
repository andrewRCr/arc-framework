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
 *   useful for the consumer who reads it. Interactive `confirm` returns
 *   `false` so the prompt cell can never suspend a non-interactive consumer
 *   waiting for input.
 *
 * Info-level suppression rationale: every `output.log.info` site duplicates
 * data already in the JSON envelope (`worktree.result`, `notes.result`,
 * `interlockState`, etc.). A consumer parsing the envelope reconstructs the
 * same signal; an info-level line on stderr is redundant chatter that turns
 * `2>&1 | jq` into a foot-gun.
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

export type SyncOutputSelectOption<T extends string> = p.Option<T>;

export interface SyncOutputSelectOptions<T extends string> {
  message: string;
  options: SyncOutputSelectOption<T>[];
  /**
   * Value returned in JSON mode without prompting. Should be the safest
   * no-op choice for the call site — typically the cancel/decline option —
   * so a non-interactive consumer never gets a destructive default it
   * didn't opt into. Mirrors the `confirm` → `false` pattern, parameterized
   * because `select` has no universal decline value.
   */
  jsonModeDefault: T;
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
  select<T extends string>(opts: SyncOutputSelectOptions<T>): Promise<T | symbol>;
  isCancel(value: unknown): boolean;
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
      confirm: (opts) => p.confirm(opts),
      select: (opts) => p.select({
        message: opts.message,
        options: opts.options,
      }),
      isCancel: (value) => p.isCancel(value),
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
    confirm: () => Promise.resolve(false),
    select: (opts) => Promise.resolve(opts.jsonModeDefault),
    isCancel: () => false,
  };
}
