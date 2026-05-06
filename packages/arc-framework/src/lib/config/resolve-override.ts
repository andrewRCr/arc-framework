/**
 * Git-config-backed arc-config override resolution.
 *
 * Provides shared precedence handling for settings with personal git-config
 * overrides over project yaml defaults.
 *
 * @module
 */

import { join } from "node:path";

import { ARC_CONFIG_SEGMENTS } from "../constants.js";
import { gitConfigGet, type GitExec } from "../git/index.js";
import { parseArcConfig } from "./index.js";

/** Source tier that supplied the resolved value. */
export type ConfigOverrideSource = "git-config" | "yaml" | "default";

/** Resolved override value with provenance metadata. */
export interface ResolvedConfigOverride<T extends string> {
  value: T;
  source: ConfigOverrideSource;
}

/** Options for resolving a git-config-backed arc-config override. */
export interface ResolveGitConfigOverrideOptions<T extends string> {
  exec: GitExec;
  readFile: (path: string) => Promise<string>;
  /** Repo root - used to locate `arc-config.yml`. */
  cwd: string;
  /** Git config key for the per-developer override. */
  gitConfigKey: string;
  /** Dotted yaml key in `arc-config.yml`. */
  yamlKey: string;
  /** Value returned when neither configured source supplies a valid value. */
  defaultValue: T;
  /** Per-key validator for values read from git config or yaml. */
  isValidValue: (value: string) => value is T;
  /** Valid values used in warning messages. */
  validValues: readonly T[];
  /** Invoked once per invalid value encountered. Defaults to a no-op. */
  warn?: (message: string) => void;
}

function hasConfiguredValue(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

function expectedValues(values: readonly string[]): string {
  return values.join(", ");
}

/**
 * Resolve a setting from git config, then `arc-config.yml`, then a default.
 *
 * Invalid values warn and fall through to the next tier. Missing or unreadable
 * `arc-config.yml` falls through silently because the project default remains
 * available.
 *
 * @param opts - Resolution inputs, keys, validator, and warning sink
 * @returns The resolved value and its source tier
 */
export async function resolveGitConfigOverride<T extends string>(
  opts: ResolveGitConfigOverrideOptions<T>,
): Promise<ResolvedConfigOverride<T>> {
  const warn = opts.warn ?? (() => undefined);
  const expected = expectedValues(opts.validValues);

  const override = await gitConfigGet(opts.exec, opts.gitConfigKey);
  if (hasConfiguredValue(override)) {
    if (opts.isValidValue(override)) {
      return { value: override, source: "git-config" };
    }
    warn(
      `Ignoring invalid value "${override}" for ${opts.gitConfigKey} - `
      + `expected one of: ${expected}.`,
    );
  }

  try {
    const configPath = join(opts.cwd, ...ARC_CONFIG_SEGMENTS);
    const content = await opts.readFile(configPath);
    const yamlValue = parseArcConfig(content)[opts.yamlKey];
    if (hasConfiguredValue(yamlValue)) {
      if (opts.isValidValue(yamlValue)) {
        return { value: yamlValue, source: "yaml" };
      }
      warn(
        `Ignoring invalid value "${yamlValue}" for ${opts.yamlKey} in `
        + `arc-config.yml - expected one of: ${expected}.`,
      );
    }
  } catch {
    // arc-config.yml unreadable - fall through to default silently.
  }

  return { value: opts.defaultValue, source: "default" };
}
