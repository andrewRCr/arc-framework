/**
 * Hook manager integration for ARC CLI.
 *
 * Adds ARC hook calls (pre-commit and commit-msg) into the configuration
 * of a detected hook manager. Each manager has its own integration strategy:
 * - Husky: append shell commands to hook files in .husky/
 * - Lefthook: add command entries to lefthook.yml via YAML manipulation
 * - Pre-commit: add local repo hooks to .pre-commit-config.yaml via YAML
 *
 * All integrations are idempotent — safe to run multiple times.
 *
 * @module
 */

import { join } from "node:path";
import yaml from "js-yaml";
import type { HookManagerResult } from "./hook-manager.js";
import type { ReadFileFn, WriteFileFn } from "./template/index.js";

/** Relative path from repo root to ARC's pre-commit hook. */
const ARC_PRE_COMMIT = ".arc/system/githooks/pre-commit";

/** Relative path from repo root to ARC's commit-msg hook. */
const ARC_COMMIT_MSG = ".arc/system/githooks/commit-msg";

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
 */
export async function integrateHooks(
  detection: HookManagerResult,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  switch (detection.manager) {
    case "husky":
      return integrateHusky(detection.configPath, readFile, writeFile);
    case "lefthook":
      return integrateLefthook(detection.configPath, readFile, writeFile);
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
    `${ARC_COMMIT_MSG} $1`,
    readFile,
    writeFile,
  );
}

async function integrateHuskyHook(
  hookPath: string,
  arcLine: string,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
  const existing = await readFileOrNull(hookPath, readFile);

  if (existing !== null && existing.includes(arcLine)) {
    return; // Already integrated — idempotent
  }

  if (existing === null) {
    await writeFile(hookPath, `${HUSKY_SHEBANG}${arcLine}\n`);
  } else {
    const separator = existing.endsWith("\n") ? "" : "\n";
    await writeFile(hookPath, `${existing}${separator}${arcLine}\n`);
  }
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
  if (!config["commit-msg"].commands["arc-commit-msg"]) {
    config["commit-msg"].commands["arc-commit-msg"] = { run: `${ARC_COMMIT_MSG} {1}` };
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
};

const ARC_COMMIT_MSG_HOOK: PreCommitHook = {
  id: "arc-commit-msg",
  name: "ARC Commit Message",
  entry: ARC_COMMIT_MSG,
  language: "unsupported_script",
  stages: ["commit-msg"],
  files: "^$",
};

async function integratePreCommit(
  configPath: string,
  readFile: ReadFileFn,
  writeFile: WriteFileFn,
): Promise<void> {
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

  let changed = false;

  if (!localRepo.hooks.some((h) => h.id === "arc-pre-commit")) {
    localRepo.hooks.push(ARC_PRE_COMMIT_HOOK);
    changed = true;
  }

  if (!localRepo.hooks.some((h) => h.id === "arc-commit-msg")) {
    localRepo.hooks.push(ARC_COMMIT_MSG_HOOK);
    changed = true;
  }

  if (changed) {
    await writeFile(configPath, yaml.dump(config, { lineWidth: -1 }));
  }
}
