/**
 * Notes push policy resolution.
 *
 * Resolves the effective `user.notes_push` policy from the precedence chain:
 * `git config arc.notesPush` → `arc-config.yml` `user.notes_push` → default (`on-sync`).
 * Invalid values at each tier warn and fall through.
 *
 * @module
 */

import {
  resolveGitConfigOverride,
  type ResolvedConfigOverride,
} from "./config/resolve-override.js";
import type { GitExec } from "./git/index.js";

/** Valid notes push policy values. */
export type NotesPushPolicy = "on-sync" | "prompt" | "manual";

/** Default policy when no source provides a valid value. */
export const DEFAULT_NOTES_PUSH_POLICY: NotesPushPolicy = "on-sync";

/** Git-config key for the per-developer override. */
export const NOTES_PUSH_GIT_CONFIG_KEY = "arc.notesPush";

/** Yaml key in `arc-config.yml`. */
export const NOTES_PUSH_YAML_KEY = "user.notes_push";

const VALID_POLICIES: readonly NotesPushPolicy[] = ["on-sync", "prompt", "manual"];

export interface ResolveNotesPushOptions {
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  /** Repo root — used to locate `arc-config.yml`. */
  cwd: string;
  /** Invoked once per invalid value encountered. Defaults to a no-op. */
  warn?: (message: string) => void;
}

export type ResolvedNotesPush = ResolvedConfigOverride<NotesPushPolicy>;

function isValidPolicy(value: string | undefined): value is NotesPushPolicy {
  return typeof value === "string"
    && (VALID_POLICIES as readonly string[]).includes(value);
}

/**
 * Resolve the effective notes push policy.
 *
 * Precedence: `git config arc.notesPush` → yaml `user.notes_push` → default.
 * Invalid values at any tier fall through to the next with a warning.
 * Missing `arc-config.yml` falls through silently (not an error — policy just
 * defaults).
 */
export async function resolveNotesPushPolicy(
  opts: ResolveNotesPushOptions,
): Promise<ResolvedNotesPush> {
  return resolveGitConfigOverride<NotesPushPolicy>({
    exec: opts.exec,
    readFile: opts.readFile,
    cwd: opts.cwd,
    gitConfigKey: NOTES_PUSH_GIT_CONFIG_KEY,
    yamlKey: NOTES_PUSH_YAML_KEY,
    defaultValue: DEFAULT_NOTES_PUSH_POLICY,
    isValidValue: isValidPolicy,
    validValues: VALID_POLICIES,
    warn: opts.warn,
  });
}
