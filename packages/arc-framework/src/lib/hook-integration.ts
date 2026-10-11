/**
 * Hook manager integration for ARC CLI.
 *
 * Adds ARC hook calls (pre-commit, commit-msg, and pre-push) into the
 * configuration of a detected hook manager. Each manager has its own strategy:
 * - Husky: append shell commands to hook files in .husky/
 * - Lefthook: add command entries to lefthook.yml via YAML manipulation
 * - Pre-commit: add local repo hooks to .pre-commit-config.yaml via YAML
 *
 * All integrations are idempotent — safe to run multiple times.
 *
 * @module
 */

import { join, posix } from "node:path";
import yaml from "js-yaml";
import { INTERNAL_DIR_SEGMENTS } from "./constants.js";
import type { HookManagerResult } from "./hook-manager.js";
import { resolveArcPath } from "./layout/index.js";
import type { ReadFileFn, WriteFileFn } from "./template/index.js";

/** Relative path from repo root to the installed ARC Git hooks. */
export const ARC_GIT_HOOKS_DIR = posix.join(
  resolveArcPath({ kind: "arc-root" }),
  ...INTERNAL_DIR_SEGMENTS,
  "githooks",
);

/** Relative path from repo root to ARC's pre-commit hook. */
const ARC_PRE_COMMIT = posix.join(ARC_GIT_HOOKS_DIR, "pre-commit");

/** Relative path from repo root to ARC's commit-msg hook. */
const ARC_COMMIT_MSG = posix.join(ARC_GIT_HOOKS_DIR, "commit-msg");

const LEGACY_HUSKY_COMMIT_MSG = `${ARC_COMMIT_MSG} $1`;
const HUSKY_COMMIT_MSG = `${ARC_COMMIT_MSG} "$1"`;
const LEGACY_LEFTHOOK_COMMIT_MSG = `${ARC_COMMIT_MSG} {1}`;
const LEFTHOOK_COMMIT_MSG = `${ARC_COMMIT_MSG} "{1}"`;

/** Relative path from repo root to ARC's pre-push hook. */
const ARC_PRE_PUSH = posix.join(ARC_GIT_HOOKS_DIR, "pre-push");

/** Configuration rewrites, unresolved entries, and native installation instructions. */
export interface HookUpgradeReport { files: string[]; warnings: string[]; instructions: string[] }

/**
 * Upgrade existing generated entries without adding missing hooks.
 * @param detection - Detected native manager and configuration path
 * @param readFile - Configuration reader
 * @param writeFile - Configuration writer
 * @returns Rewritten files and actionable update notices
 */
export async function upgradeGeneratedHooks(
  detection: HookManagerResult, readFile: ReadFileFn, writeFile: WriteFileFn,
): Promise<HookUpgradeReport> {
  const report: HookUpgradeReport = { files: [], warnings: [], instructions: [] };
  if (detection.manager === "husky") return report;
  try {
    const parsed: unknown = yaml.load(await readFile(detection.configPath)) ?? {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("expected a configuration mapping");
    const config = parsed as LefthookConfig & PreCommitConfig;
    const changed = detection.manager === "lefthook" ? upgradeLefthookDispatch(config, report, detection.configPath)
      : upgradePreCommitDispatch(config, report, detection.configPath);
    if (!changed) return report;
    await writeFile(detection.configPath, yaml.dump(config, { lineWidth: -1 }));
    report.files.push(detection.configPath);
  } catch (cause) {
    report.instructions = [];
    report.warnings.push(`${detection.configPath}: could not upgrade hook configuration (${cause instanceof Error ? cause.message : String(cause)}); repair the configuration and retry arc update.`);
  }
  return report;
}

function upgradeLefthookDispatch(config: LefthookConfig, report: HookUpgradeReport, path: string): boolean {
  const command = config["pre-push"]?.commands?.["arc-pre-push"];
  if (command === undefined) return false;
  if (command.run !== `${ARC_PRE_PUSH} {1} {2}`) {
    reportUnrecognizedHook(report, path, "arc-pre-push");
    return false;
  }
  if (command.use_stdin === true) return false;
  command.use_stdin = true;
  return true;
}

function upgradePreCommitDispatch(config: PreCommitConfig, report: HookUpgradeReport, path: string): boolean {
  let changed = false, recognized = false;
  for (const repo of config.repos ?? []) {
    if (repo.repo !== "local") continue;
    for (const hook of repo.hooks ?? []) {
      const outcome = upgradePreCommitHook(hook, report, path);
      recognized = outcome.recognized || recognized;
      changed = outcome.changed || changed;
    }
  }
  if (!recognized) return changed;
  const previous = config.default_install_hook_types ?? ["pre-commit"];
  const types = [...previous, ...["pre-commit", "commit-msg", "pre-push"].filter(type => !previous.includes(type))];
  if (config.default_install_hook_types === undefined || types.length !== previous.length) {
    config.default_install_hook_types = types;
    report.instructions.push("Run pre-commit install to activate the configured Git hook types.");
    changed = true;
  }
  return changed;
}

function upgradePreCommitHook(hook: PreCommitHook, report: HookUpgradeReport, path: string): { recognized: boolean; changed: boolean } {
  const expected = [ARC_PRE_COMMIT_HOOK, ARC_COMMIT_MSG_HOOK, ARC_PRE_PUSH_HOOK].find(entry => entry.id === hook.id);
  if (expected === undefined) return { recognized: false, changed: false };
  if (hook.entry !== expected.entry || (hook.id === "arc-commit-msg" && hook.files !== undefined && hook.files !== "^$")) {
    reportUnrecognizedHook(report, path, hook.id);
    return { recognized: false, changed: false };
  }
  const fields = hook.id === "arc-pre-commit" ? { pass_filenames: false, require_serial: true, always_run: true }
    : hook.id === "arc-pre-push" ? { always_run: true } : {};
  let changed = setHookFields(hook, fields);
  if (hook.id === "arc-commit-msg" && Object.hasOwn(hook, "files")) {
    delete hook.files;
    changed = true;
  }
  return { recognized: true, changed };
}

function reportUnrecognizedHook(report: HookUpgradeReport, path: string, id: string): void {
  report.warnings.push(`${path}: ${id} is not a recognized generated entry; left unchanged. Review its hook integration before retrying arc update.`);
}

function setHookFields(hook: PreCommitHook, fields: Record<string, unknown>): boolean {
  let changed = false;
  for (const [key, value] of Object.entries(fields)) {
    if (hook[key] === value) continue;
    hook[key] = value;
    changed = true;
  }
  return changed;
}

/**
 * Integrate ARC hooks into the detected hook manager's configuration.
 *
 * Dispatches to the appropriate strategy based on the detection result.
 * All strategies are idempotent — if ARC hooks are already present, no
 * changes are made and no files are written.
 *
 * @param detection - Hook manager detection result (from detectHookManager)
 * @param readFile - File reader (injectable for testing)
 * @param writeFile - File writer (injectable for testing)
 * @returns Native installation instructions when hook event types changed
 */
export async function integrateHooks(
  detection: HookManagerResult,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<string[]> {
  switch (detection.manager) {
    case "husky":
      await integrateHusky(detection.configPath, readFile, writeFile);
      return [];
    case "lefthook":
      await integrateLefthook(detection.configPath, readFile, writeFile);
      return [];
    case "pre-commit":
      return integratePreCommit(detection.configPath, readFile, writeFile);
  }
}

// -- Husky --

/**
 * Read a file, returning null if it doesn't exist.
 */
async function readFileOrNull(path: string, readFile: ReadFileFn): Promise<string | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

const HUSKY_SHEBANG = "#!/usr/bin/env sh\n";

async function integrateHusky(
  huskyDir: string,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  await integrateHuskyHook(
    join(huskyDir, "pre-commit"),
    ARC_PRE_COMMIT,
    readFile,
    writeFile,
  );
  await integrateHuskyHook(
    join(huskyDir, "commit-msg"),
    HUSKY_COMMIT_MSG,
    readFile,
    writeFile,
    LEGACY_HUSKY_COMMIT_MSG,
  );
  // Pre-push receives the remote name + URL as args and the ref list on stdin;
  // forward "$@" and let stdin pass through to the canonical hook.
  await integrateHuskyHook(
    join(huskyDir, "pre-push"),
    `${ARC_PRE_PUSH} "$@"`,
    readFile,
    writeFile,
  );
}

async function integrateHuskyHook(
  hookPath: string,
  arcLine: string,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
  legacyArcLine?: string,
): Promise<void> {
  const existing = await readFileOrNull(hookPath, readFile);

  if (existing !== null && legacyArcLine !== undefined) {
    const migrated = migrateExactHookLine(existing, legacyArcLine, arcLine);
    if (migrated !== null) {
      await writeFile(hookPath, migrated);
      return;
    }
  }

  if (
    existing !== null
    && (existing.includes(arcLine) || (legacyArcLine !== undefined && existing.includes(legacyArcLine)))
  ) {
    return; // Already integrated — idempotent
  }

  if (existing === null) {
    await writeFile(hookPath, `${HUSKY_SHEBANG}${arcLine}\n`);
  } else {
    const separator = existing.endsWith("\n") ? "" : "\n";
    await writeFile(hookPath, `${existing}${separator}${arcLine}\n`);
  }
}

function migrateExactHookLine(content: string, legacyLine: string, currentLine: string): string | null {
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  if (!lines.includes(legacyLine)) return null;

  const migrated: string[] = [];
  let hasCurrentLine = lines.includes(currentLine);
  for (const line of lines) {
    if (line !== legacyLine) {
      migrated.push(line);
    } else if (!hasCurrentLine) {
      migrated.push(currentLine);
      hasCurrentLine = true;
    }
  }
  return migrated.join(newline);
}

// -- Lefthook --

interface LefthookCommand {
  run: string;
  [key: string]: unknown;
}

interface LefthookHookSection {
  commands?: Record<string, LefthookCommand>;
  [key: string]: unknown;
}

interface LefthookConfig {
  "pre-commit"?: LefthookHookSection;
  "commit-msg"?: LefthookHookSection;
  "pre-push"?: LefthookHookSection;
  [key: string]: unknown;
}

async function integrateLefthook(
  configPath: string,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  const content = await readFile(configPath);
  const config = (yaml.load(content) ?? {}) as LefthookConfig;

  let changed = false;

  // Pre-commit
  if (!config["pre-commit"]) {
    config["pre-commit"] = { commands: {} };
  }
  if (!config["pre-commit"].commands) {
    config["pre-commit"].commands = {};
  }
  if (!config["pre-commit"].commands["arc-pre-commit"]) {
    config["pre-commit"].commands["arc-pre-commit"] = { run: ARC_PRE_COMMIT };
    changed = true;
  }

  // Commit-msg
  if (!config["commit-msg"]) {
    config["commit-msg"] = { commands: {} };
  }
  if (!config["commit-msg"].commands) {
    config["commit-msg"].commands = {};
  }
  const commitMsgCommand = config["commit-msg"].commands["arc-commit-msg"];
  if (!commitMsgCommand) {
    config["commit-msg"].commands["arc-commit-msg"] = { run: LEFTHOOK_COMMIT_MSG };
    changed = true;
  } else if (commitMsgCommand.run === LEGACY_LEFTHOOK_COMMIT_MSG) {
    commitMsgCommand.run = LEFTHOOK_COMMIT_MSG;
    changed = true;
  }

  // Pre-push
  if (!config["pre-push"]) {
    config["pre-push"] = { commands: {} };
  }
  if (!config["pre-push"].commands) {
    config["pre-push"].commands = {};
  }
  if (!config["pre-push"].commands["arc-pre-push"]) {
    config["pre-push"].commands["arc-pre-push"] = { run: `${ARC_PRE_PUSH} {1} {2}`, use_stdin: true };
    changed = true;
  }

  if (changed) {
    await writeFile(configPath, yaml.dump(config, { lineWidth: -1 }));
  }
}

// -- Pre-commit --

interface PreCommitHook {
  id: string;
  name?: string;
  entry?: string;
  language?: string;
  stages?: string[];
  files?: string;
  [key: string]: unknown;
}

interface PreCommitRepo {
  repo: string;
  hooks?: PreCommitHook[];
  rev?: string;
  [key: string]: unknown;
}

interface PreCommitConfig {
  repos?: PreCommitRepo[];
  default_install_hook_types?: string[];
  [key: string]: unknown;
}

// "unsupported_script" is the official modern language for repo-local scripts
// in pre-commit v4.4.0+ (PR #3577). It runs the entry as-is without environment
// provisioning. The older name "script" still works but is headed for deprecation.
const ARC_PRE_COMMIT_HOOK: PreCommitHook = {
  id: "arc-pre-commit",
  name: "ARC Pre-Commit",
  entry: ARC_PRE_COMMIT,
  language: "unsupported_script",
  stages: ["commit"],
  files: ".",
  pass_filenames: false,
  require_serial: true,
  always_run: true,
};

const ARC_COMMIT_MSG_HOOK: PreCommitHook = {
  id: "arc-commit-msg",
  name: "ARC Commit Message",
  entry: ARC_COMMIT_MSG,
  language: "unsupported_script",
  stages: ["commit-msg"],
};

const ARC_PRE_PUSH_HOOK: PreCommitHook = {
  id: "arc-pre-push",
  name: "ARC Pre-Push",
  entry: ARC_PRE_PUSH,
  language: "unsupported_script",
  stages: ["pre-push"],
  files: "^$",
  always_run: true,
};

async function integratePreCommit(
  configPath: string,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<string[]> {
  const content = await readFile(configPath);
  const config = (yaml.load(content) ?? {}) as PreCommitConfig;

  if (!config.repos) {
    config.repos = [];
  }

  // Find existing local repo entry, or create one
  let localRepo = config.repos.find((r) => r.repo === "local");
  if (!localRepo) {
    localRepo = { repo: "local", hooks: [] };
    config.repos.push(localRepo);
  }
  if (!localRepo.hooks) {
    localRepo.hooks = [];
  }

  const previousHookTypes = config.default_install_hook_types ?? ["pre-commit"];
  const hookTypes = [...previousHookTypes, ...["pre-commit", "commit-msg", "pre-push"]
    .filter(type => !previousHookTypes.includes(type))];
  const hookTypesChanged = config.default_install_hook_types === undefined
    || hookTypes.length !== previousHookTypes.length;
  if (hookTypesChanged) config.default_install_hook_types = hookTypes;
  let changed = hookTypesChanged;

  if (!localRepo.hooks.some((h) => h.id === "arc-pre-commit")) {
    localRepo.hooks.push(ARC_PRE_COMMIT_HOOK);
    changed = true;
  }

  if (!localRepo.hooks.some((h) => h.id === "arc-commit-msg")) {
    localRepo.hooks.push(ARC_COMMIT_MSG_HOOK);
    changed = true;
  }

  if (!localRepo.hooks.some((h) => h.id === "arc-pre-push")) {
    localRepo.hooks.push(ARC_PRE_PUSH_HOOK);
    changed = true;
  }

  if (changed) {
    await writeFile(configPath, yaml.dump(config, { lineWidth: -1 }));
  }
  return hookTypesChanged ? ["Run pre-commit install to activate the configured Git hook types."] : [];
}
