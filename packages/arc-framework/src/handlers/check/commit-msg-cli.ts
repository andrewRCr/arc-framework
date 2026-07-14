/** Commander and process adapter for `arc check commit-msg`. */

import { access, readFile } from "node:fs/promises";

import { createDefaultCommitCheckRepository } from "../../lib/commit-check/repository.js";
import { gitExec } from "../../lib/io-context.js";
import { resolveArcRoot } from "../../lib/paths.js";
import { ARC_PROJECT_ROOT_ERROR } from "../shared.js";
import { runCheckCommitMessage } from "./commit-msg.js";
import { renderCheckCommitMessage } from "./commit-msg-output.js";

/** Options accepted by the public commit-message check command. */
export interface HandleCheckCommitMessageOptions {
  json?: boolean;
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
 * @param source - Message file path, or `-` for stdin
 * @param options - Output-mode options
 * @returns Resolves after output and process exit state are assigned
 */
export async function handleCheckCommitMessage(
  source: string | undefined,
  options: HandleCheckCommitMessageOptions,
): Promise<void> {
  const root = resolveArcRoot(process.cwd());
  const outcome = await runCheckCommitMessage(source, {
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
