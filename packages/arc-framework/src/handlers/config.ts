/**
 * Handlers for ARC configuration inspection and validation.
 *
 * Branches on scope (`--session-init`) and format (`--json`). `--json`
 * bypasses Clack and writes the typed result to stdout for harness
 * consumption; default renders a Clack note.
 *
 * @module
 */

import * as p from "@clack/prompts";
import { join, resolve } from "node:path";

import {
  buildConfigSessionInitSummary,
  buildConfigStatusSummary,
  ConfigValidateCommandInputSchema,
  runConfigSessionInitStatus,
  runConfigStatus,
  validateConfigFile,
} from "../commands/config.js";
import { ARC_CONFIG_SUFFIX } from "../lib/constants.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { createGitExec } from "../lib/io-context.js";
import { materializeArcPath, resolveArcPath } from "../lib/layout/index.js";
import { requireArcProjectRoot } from "./shared.js";

export interface ConfigStatusCliOptions {
  sessionInit?: boolean;
  json?: boolean;
}

export interface ConfigValidateCliOptions {
  file?: string;
}

/** Validate the default project config or an explicitly selected file. */
export async function handleConfigValidate(opts: ConfigValidateCliOptions): Promise<void> {
  const parsed = ConfigValidateCommandInputSchema.safeParse(opts);
  if (!parsed.success) {
    process.stderr.write(`${parsed.error.issues.map((issue) => issue.message).join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  const selectedPath = parsed.data.file;
  let readPath: string;
  let displayPath: string;

  if (selectedPath === undefined) {
    const root = requireArcProjectRoot();
    if (!root) return;
    const relativePath = resolveArcPath({ kind: "arc-root" });
    readPath = join(materializeArcPath(root, relativePath), ...ARC_CONFIG_SUFFIX);
    displayPath = join(relativePath, ...ARC_CONFIG_SUFFIX);
  } else {
    readPath = resolve(process.cwd(), selectedPath);
    displayPath = selectedPath;
  }

  const result = await validateConfigFile({ readPath, displayPath });
  process.stdout.write(`${result.lines.join("\n")}\n`);
  process.exitCode = result.exitCode;
}

export async function handleConfigStatus(
  opts: ConfigStatusCliOptions,
  context?: InteractionContext,
): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  if (opts.sessionInit) {
    const result = await runConfigSessionInitStatus({ cwd, exec: createGitExec(context?.subprocess) });
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    p.intro("arc config status");
    p.note(buildConfigSessionInitSummary(result), "Session Init");
    p.outro("Done.");
    return;
  }

  const result = await runConfigStatus({ cwd });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  p.intro("arc config status");
  p.note(buildConfigStatusSummary(result), "Config");
  p.outro("Done.");
}
