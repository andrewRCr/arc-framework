/** Commander and process adapter for `arc check commit-msg`. */

import { access, readFile } from "node:fs/promises";

import { createDefaultCommitCheckRepository } from "../../lib/commit-check/repository.js";
import { gitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import { ARC_PROJECT_ROOT_ERROR } from "../shared.js";
import { runCheckCommitMessage } from "./commit-msg.js";
import { renderCheckCommitMessage } from "./commit-msg-output.js";
import type { CommitMessageCheckFailure } from "./commit-msg.js";

/** Options accepted by the public commit-message check command. */
export interface HandleCheckCommitMessageOptions {
  json?: boolean;
  dashPrefixedSourceAllowed?: boolean;
}

function normalizeSourceInput(
  source: string | string[] | undefined,
  dashPrefixedSourceAllowed: boolean,
): string | undefined | CommitMessageCheckFailure {
  const operands = Array.isArray(source) ? source : source === undefined ? [] : [source];
  if (operands.length > 1) {
    return {
      kind: "error",
      exitCode: 2,
      error: {
        kind: "usage",
        code: "input.invalid",
        message: "Provide exactly one commit-message file path, or - for stdin.",
      },
    };
  }
  const candidate = operands[0];
  if (
    candidate !== undefined
    && candidate !== "-"
    && candidate.startsWith("-")
    && !dashPrefixedSourceAllowed
  ) {
    return {
      kind: "error",
      exitCode: 2,
      error: { kind: "usage", code: "input.invalid", message: `Unknown option: ${candidate}` },
    };
  }
  return candidate;
}

function isMissingPath(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause
    && (cause as Error & { code?: string }).code === "ENOENT";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (cause: unknown) {
    if (isMissingPath(cause)) return false;
    throw cause;
  }
}

async function readStdin(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Run standalone commit-message validation through real process I/O.
 *
 * @param source - Parsed message-file operands, a message path, or `-` for stdin
 * @param options - Output-mode options
 * @returns Resolves after output and process exit state are assigned
 */
export async function handleCheckCommitMessage(
  source: string | string[] | undefined,
  options: HandleCheckCommitMessageOptions,
): Promise<void> {
  const root = resolveArcRoot(process.cwd());
  const normalizedSource = normalizeSourceInput(source, options.dashPrefixedSourceAllowed === true);
  const outcome = typeof normalizedSource === "object"
    ? normalizedSource
    : await runCheckCommitMessage(normalizedSource, {
        readFile: (path) => readFile(path),
        readStdin,
        setupRepository: async () => {
          if (root === null) throw new Error(ARC_PROJECT_ROOT_ERROR);
          return createDefaultCommitCheckRepository(root, {
            exec: gitExec,
            readFile: (path) => readFile(path, "utf8"),
            pathExists,
          });
        },
      });

  const rendered = renderCheckCommitMessage(outcome, options.json === true);
  if (rendered.stdout !== undefined) process.stdout.write(rendered.stdout);
  if (rendered.stderr !== undefined) process.stderr.write(rendered.stderr);

  process.exitCode = outcome.exitCode;
}
