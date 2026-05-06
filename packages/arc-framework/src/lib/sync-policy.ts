/**
 * Sync push policy resolution.
 *
 * Resolves the effective `user.sync_push` policy from the precedence chain:
 * `git config arc.syncPush` → `arc-config.yml` `user.sync_push` → default (`always`).
 * Invalid values at each tier warn and fall through.
 *
 * @module
 */

import {
  resolveGitConfigOverride,
  type ResolvedConfigOverride,
} from "./config/resolve-override.js";
import type { GitExec } from "./git/index.js";

/** Valid push policy values. */
export type SyncPushPolicy = "always" | "prompt" | "manual";

/** Default policy when no source provides a valid value. */
export const DEFAULT_SYNC_PUSH_POLICY: SyncPushPolicy = "always";

/** Git-config key for the per-developer override. */
export const SYNC_PUSH_GIT_CONFIG_KEY = "arc.syncPush";

/** Yaml key in `arc-config.yml`. */
export const SYNC_PUSH_YAML_KEY = "user.sync_push";

const VALID_POLICIES: readonly SyncPushPolicy[] = ["always", "prompt", "manual"];

export interface ResolveSyncPushOptions {
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  /** Repo root — used to locate `arc-config.yml`. */
  cwd: string;
  /** Invoked once per invalid value encountered. Defaults to a no-op. */
  warn?: (message: string) => void;
}

export type ResolvedSyncPush = ResolvedConfigOverride<SyncPushPolicy>;

function isValidPolicy(value: string | undefined): value is SyncPushPolicy {
  return typeof value === "string"
    && (VALID_POLICIES as readonly string[]).includes(value);
}

/**
 * Resolve the effective sync push policy.
 *
 * Precedence: `git config arc.syncPush` → yaml `user.sync_push` → default.
 * Invalid values at any tier fall through to the next with a warning.
 * Missing `arc-config.yml` falls through silently (not an error — policy just
 * defaults).
 */
export async function resolveSyncPushPolicy(
  opts: ResolveSyncPushOptions,
): Promise<ResolvedSyncPush> {
  return resolveGitConfigOverride<SyncPushPolicy>({
    exec: opts.exec,
    readFile: opts.readFile,
    cwd: opts.cwd,
    gitConfigKey: SYNC_PUSH_GIT_CONFIG_KEY,
    yamlKey: SYNC_PUSH_YAML_KEY,
    defaultValue: DEFAULT_SYNC_PUSH_POLICY,
    isValidValue: isValidPolicy,
    validValues: VALID_POLICIES,
    warn: opts.warn,
  });
}
