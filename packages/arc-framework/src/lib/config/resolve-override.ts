/**
 * Git-config-backed arc-config override resolution.
 *
 * Provides shared precedence handling for settings with personal git-config
 * overrides — either three-tier (`git config → arc-config.yml → default`) when
 * a `yamlKey` is supplied, or two-tier (`git config → default`) when omitted
 * for per-developer-only keys.
 *
 * @module
 */

import { join } from "node:path";
import { z } from "zod";

import { ARC_CONFIG_SUFFIX } from "../constants.js";
import { materializeArcPath, resolveArcPath } from "../layout/index.js";
import { gitConfigGet, type GitExec } from "../git/index.js";
import { parseArcConfig } from "./index.js";
import type { ArcConfigKey } from "./schema.js";

/** Runtime authority for the source tier that supplied a resolved value. */
export const ConfigOverrideSourceSchema = z.enum(["git-config", "yaml", "default"]);

/** Source tier that supplied the resolved value. */
export type ConfigOverrideSource = z.infer<typeof ConfigOverrideSourceSchema>;

/**
 * Build the provenance-bearing schema for a resolved configuration value.
 *
 * @param valueSchema - Runtime authority for the setting-specific value
 * @returns A strict `{ value, source }` record schema
 */
export function createResolvedConfigOverrideSchema<T extends z.ZodType<string>>(
  valueSchema: T,
) {
  return z.strictObject({
    value: valueSchema,
    source: ConfigOverrideSourceSchema,
  });
}

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
  /**
   * Dotted yaml key in `arc-config.yml`. Omit for per-developer-only keys —
   * the yaml tier is skipped and resolution falls through directly from
   * git-config to default.
   */
  yamlKey?: ArcConfigKey;
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
 * Resolve a setting from git config, then optionally `arc-config.yml`, then a
 * default.
 *
 * Invalid values warn and fall through to the next tier. Missing or unreadable
 * `arc-config.yml` falls through silently because the project default remains
 * available. When `yamlKey` is omitted, the yaml tier is skipped entirely.
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

  if (opts.yamlKey !== undefined) {
    const yamlKey = opts.yamlKey;
    try {
      const configPath = join(
        materializeArcPath(opts.cwd, resolveArcPath({ kind: "arc-root" })),
        ...ARC_CONFIG_SUFFIX,
      );
      const content = await opts.readFile(configPath);
      const yamlValue = parseArcConfig(content)[yamlKey];
      if (hasConfiguredValue(yamlValue)) {
        if (opts.isValidValue(yamlValue)) {
          return { value: yamlValue, source: "yaml" };
        }
        warn(
          `Ignoring invalid value "${yamlValue}" for ${yamlKey} in `
          + `arc-config.yml - expected one of: ${expected}.`,
        );
      }
    } catch {
      // arc-config.yml unreadable - fall through to default silently.
    }
  }

  return { value: opts.defaultValue, source: "default" };
}
