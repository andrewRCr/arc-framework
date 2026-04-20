/**
 * Sync push policy resolution.
 *
 * Resolves the effective `user.sync_push` policy from the precedence chain:
 * `git config arc.syncPush` → `arc-config.yml` `user.sync_push` → default (`always`).
 * Invalid values at each tier warn and fall through.
 *
 * @module
 */

import { join } from "node:path";

import { parseArcConfig } from "./config.js";
import { ARC_CONFIG_SEGMENTS } from "./constants.js";
import { gitConfigGet } from "./git/index.js";
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

export interface ResolvedSyncPush {
  policy: SyncPushPolicy;
  source: "git-config" | "yaml" | "default";
}

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
  const warn = opts.warn ?? (() => undefined);

  const override = await gitConfigGet(opts.exec, SYNC_PUSH_GIT_CONFIG_KEY);
  if (override !== undefined && override !== "") {
    if (isValidPolicy(override)) {
      return { policy: override, source: "git-config" };
    }
    warn(
      `Ignoring invalid value "${override}" for ${SYNC_PUSH_GIT_CONFIG_KEY} — `
      + `expected one of: ${VALID_POLICIES.join(", ")}.`,
    );
  }

  try {
    const configPath = join(opts.cwd, ...ARC_CONFIG_SEGMENTS);
    const content = await opts.readFile(configPath);
    const yamlValue = parseArcConfig(content)[SYNC_PUSH_YAML_KEY];
    if (yamlValue !== undefined && yamlValue !== "") {
      if (isValidPolicy(yamlValue)) {
        return { policy: yamlValue, source: "yaml" };
      }
      warn(
        `Ignoring invalid value "${yamlValue}" for ${SYNC_PUSH_YAML_KEY} in `
        + `arc-config.yml — expected one of: ${VALID_POLICIES.join(", ")}.`,
      );
    }
  } catch {
    // arc-config.yml unreadable — fall through to default silently.
  }

  return { policy: DEFAULT_SYNC_PUSH_POLICY, source: "default" };
}
