/**
 * Hook manager detection for ARC CLI.
 *
 * Detects whether a project uses an external git hook manager (husky,
 * lefthook, or pre-commit). When detected, ARC integrates into the
 * manager's config instead of setting core.hooksPath directly.
 *
 * @module
 */

import { join } from "node:path";
import { constants } from "node:fs";
import yaml from "js-yaml";

/** Supported hook manager names. */
export type HookManager = "husky" | "lefthook" | "pre-commit";

/** Detection result when a hook manager is found. */
export interface HookManagerResult {
  manager: HookManager;
  configPath: string;
}

/** File-existence check function (injectable for testing). */
export type AccessFn = (path: string) => Promise<void>;

/** I/O dependencies for effective-hook detection. */
export interface EffectiveHookIO {
  access: (path: string, mode?: number) => Promise<void>;
  readFile: (path: string) => Promise<string>;
  resolveGitHookPath: (cwd: string, name: string) => Promise<string>;
}

/** Detection probes in priority order: husky > lefthook > pre-commit. */
const PROBES: ReadonlyArray<{ manager: HookManager; paths: string[] }> = [
  { manager: "husky", paths: [".husky"] },
  { manager: "lefthook", paths: ["lefthook.yml", "lefthook.yaml"] },
  { manager: "pre-commit", paths: [".pre-commit-config.yaml"] },
];

/**
 * Detect which hook manager (if any) a project uses.
 *
 * Checks for manager markers in priority order. Returns the first match,
 * or null if no manager is detected.
 *
 * @param cwd - Repository root directory
 * @param access - File existence check (defaults to fs.access)
 * @returns Detection result or null
 */
export async function detectHookManager(
  cwd: string,
  access: AccessFn,
): Promise<HookManagerResult | null> {
  for (const probe of PROBES) {
    for (const relPath of probe.paths) {
      const fullPath = join(cwd, relPath);
      try {
        await access(fullPath);
        return { manager: probe.manager, configPath: fullPath };
      } catch (cause: unknown) {
        if (!isUnavailable(cause)) throw cause;
      }
    }
  }
  return null;
}

/**
 * Determine whether a repository has an effective hook for a Git hook name.
 *
 * @param cwd - Repository root directory
 * @param name - Git hook name
 * @param io - Filesystem and Git-path dependencies
 * @returns Whether the detected manager exposes an effective hook
 */
export async function hasEffectiveHook(
  cwd: string,
  name: string,
  io: EffectiveHookIO,
): Promise<boolean> {
  const detection = await detectHookManager(cwd, io.access);
  if (detection?.manager === "husky") {
    try {
      await io.access(join(detection.configPath, name));
      return true;
    } catch (cause: unknown) {
      if (isUnavailable(cause)) return false;
      throw cause;
    }
  }
  if (detection?.manager === "lefthook") {
    const content = await readAvailableConfig(detection.configPath, io.readFile);
    if (content === null) return false;
    const config = yaml.load(content);
    if (!isRecord(config)) return false;
    const hook = config[name];
    if (!isRecord(hook)) return false;
    return hasEntries(hook.commands) || hasEntries(hook.scripts) || hasEntries(hook.jobs);
  }
  if (detection?.manager === "pre-commit") {
    const content = await readAvailableConfig(detection.configPath, io.readFile);
    if (content === null) return false;
    const config = yaml.load(content);
    if (!isRecord(config)) return false;
    if (
      Array.isArray(config.default_install_hook_types)
      && config.default_install_hook_types.includes(name)
    ) return true;
    if (!Array.isArray(config.repos)) return false;
    return config.repos.some((repo) => isRecord(repo)
      && Array.isArray(repo.hooks)
      && repo.hooks.some((hook) => isRecord(hook)
        && (Array.isArray(hook.stages)
          ? hook.stages.includes(name)
          : config.default_stages === undefined
            || (Array.isArray(config.default_stages) && config.default_stages.includes(name)))));
  }
  const hookPath = await io.resolveGitHookPath(cwd, name);
  try {
    await io.access(hookPath, constants.X_OK);
    return true;
  } catch (cause: unknown) {
    if (isUnavailable(cause)) return false;
    throw cause;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasEntries(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return isRecord(value) && Object.keys(value).length > 0;
}

async function readAvailableConfig(
  path: string,
  readFile: (path: string) => Promise<string>,
): Promise<string | null> {
  try {
    return await readFile(path);
  } catch (cause: unknown) {
    if (isUnavailable(cause)) return null;
    throw cause;
  }
}

function isUnavailable(cause: unknown): boolean {
  return cause instanceof Error
    && "code" in cause
    && (cause.code === "ENOENT" || cause.code === "ENOTDIR" || cause.code === "EACCES");
}
