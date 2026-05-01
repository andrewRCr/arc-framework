/**
 * Session autonomy policy resolution.
 *
 * Resolves the effective `session.autonomy` policy from the precedence chain:
 * `git config arc.autonomy` → `arc-config.yml` `session.autonomy` → default
 * (`manual-commit`). Invalid values at each tier warn and fall through.
 *
 * Parallels `lib/sync-policy.ts`. Generic resolver consolidation
 * (`resolveGitConfigOverride<T>`) is deferred to `plan-user-sync-ux`, which
 * adds the third concrete toggle (worktree push) and owns the DRY pass with
 * all three in hand.
 *
 * @module
 */

import { join } from "node:path";

import { parseArcConfig } from "./config/index.js";
import { ARC_CONFIG_SEGMENTS } from "./constants.js";
import { gitConfigGet } from "./git/index.js";
import type { GitExec } from "./git/index.js";

/** Valid autonomy policy values. */
export type AutonomyPolicy = "manual-commit" | "auto-commit" | "auto-push";

/** Default policy when no source provides a valid value. */
export const DEFAULT_AUTONOMY_POLICY: AutonomyPolicy = "manual-commit";

/** Git-config key for the per-developer override. */
export const AUTONOMY_GIT_CONFIG_KEY = "arc.autonomy";

/** Yaml key in `arc-config.yml`. */
export const AUTONOMY_YAML_KEY = "session.autonomy";

const VALID_POLICIES: readonly AutonomyPolicy[] = [
  "manual-commit",
  "auto-commit",
  "auto-push",
];

export interface ResolveAutonomyOptions {
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  /** Repo root — used to locate `arc-config.yml`. */
  cwd: string;
  /** Invoked once per invalid value encountered. Defaults to a no-op. */
  warn?: (message: string) => void;
}

export interface ResolvedAutonomy {
  policy: AutonomyPolicy;
  source: "git-config" | "yaml" | "default";
}

function isValidPolicy(value: string | undefined): value is AutonomyPolicy {
  return typeof value === "string"
    && (VALID_POLICIES as readonly string[]).includes(value);
}

/**
 * Resolve the effective autonomy policy.
 *
 * Precedence: `git config arc.autonomy` → yaml `session.autonomy` → default.
 * Invalid values at any tier fall through to the next with a warning.
 * Missing `arc-config.yml` falls through silently (not an error — policy just
 * defaults).
 */
export async function resolveAutonomyPolicy(
  opts: ResolveAutonomyOptions,
): Promise<ResolvedAutonomy> {
  const warn = opts.warn ?? (() => undefined);

  const override = await gitConfigGet(opts.exec, AUTONOMY_GIT_CONFIG_KEY);
  if (override !== undefined && override !== "") {
    if (isValidPolicy(override)) {
      return { policy: override, source: "git-config" };
    }
    warn(
      `Ignoring invalid value "${override}" for ${AUTONOMY_GIT_CONFIG_KEY} — `
      + `expected one of: ${VALID_POLICIES.join(", ")}.`,
    );
  }

  try {
    const configPath = join(opts.cwd, ...ARC_CONFIG_SEGMENTS);
    const content = await opts.readFile(configPath);
    const yamlValue = parseArcConfig(content)[AUTONOMY_YAML_KEY];
    if (yamlValue !== undefined && yamlValue !== "") {
      if (isValidPolicy(yamlValue)) {
        return { policy: yamlValue, source: "yaml" };
      }
      warn(
        `Ignoring invalid value "${yamlValue}" for ${AUTONOMY_YAML_KEY} in `
        + `arc-config.yml — expected one of: ${VALID_POLICIES.join(", ")}.`,
      );
    }
  } catch {
    // arc-config.yml unreadable — fall through to default silently.
  }

  return { policy: DEFAULT_AUTONOMY_POLICY, source: "default" };
}
