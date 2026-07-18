/**
 * Repository command for deterministic coupling-blast-radius enumeration.
 *
 * @module
 */

import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../lib/coupling-audit/canonical.js";
import {
  couplingAuditExitCode,
  CouplingAuditValidationError,
  parseCouplingManifest,
} from "../lib/coupling-audit/contracts.js";
import { collectCorpus } from "../lib/coupling-audit/corpus.js";
import { scanCorpus } from "../lib/coupling-audit/scan.js";
import type { CouplingScanResult } from "../lib/coupling-audit/types.js";
import { atomicWriteFile } from "../lib/fs.js";
import type { GitExec } from "../lib/git/exec.js";
import { gitExec } from "../lib/io-context.js";
import { resolveRepoRoot } from "./repo-root.js";

/** Injected executable boundaries for the repository audit command. */
export interface CouplingAuditScriptContext {
  root: string;
  git: GitExec;
  readBytes(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  writeStdout(content: string): void;
  writeStderr(content: string): void;
}

interface AuditArguments {
  manifest: string;
  output: string;
}

function parseArguments(argv: readonly string[]): AuditArguments {
  let manifest: string | undefined;
  let output: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === "--manifest" || argument === "--output") {
      if (value === undefined || value.startsWith("--")) {
        throw new CouplingAuditValidationError("arguments", `${argument} requires a value`);
      }
      if (argument === "--manifest") manifest = value;
      else output = value;
      index += 1;
      continue;
    }
    throw new CouplingAuditValidationError("arguments", `unknown argument: ${argument ?? ""}`);
  }
  if (manifest === undefined || output === undefined) {
    throw new CouplingAuditValidationError("arguments", "required: --manifest <path> --output <path|->");
  }
  return { manifest, output };
}

function resolveInput(root: string, path: string): string {
  return isAbsolute(path) ? path : resolve(root, path);
}

/**
 * Construct production I/O pinned to one repository root.
 *
 * @param root - Repository root containing the manifest corpus.
 * @returns Real Git, filesystem, and process-stream adapters.
 */
export function createCouplingAuditScriptContext(root: string): CouplingAuditScriptContext {
  return {
    root,
    git: (command, args, options) => gitExec(command, args, { ...options, cwd: root }),
    readBytes: async (path) => new Uint8Array(await readFile(path)),
    readText: (path) => readFile(path, "utf8"),
    writeFile: atomicWriteFile,
    writeStdout: (content) => process.stdout.write(content),
    writeStderr: (content) => process.stderr.write(content),
  };
}

/**
 * Execute one complete audit with explicit manifest and output arguments.
 *
 * @param argv - Non-interactive command arguments.
 * @param context - Repository-pinned executable boundaries.
 * @returns The canonical scan result written by the command.
 */
export async function executeCouplingAudit(
  argv: readonly string[],
  context: CouplingAuditScriptContext,
): Promise<CouplingScanResult> {
  const args = parseArguments(argv);
  const manifestPath = resolveInput(context.root, args.manifest);
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(await context.readText(manifestPath));
  } catch (error) {
    throw new CouplingAuditValidationError(
      "manifest",
      `cannot read valid JSON from ${args.manifest}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const manifest = parseCouplingManifest(rawManifest);
  const files = await collectCorpus(manifest.corpus, {
    git: context.git,
    readFile: (path) => context.readBytes(resolve(context.root, path)),
  });
  const result = scanCorpus(manifest, files);
  const content = canonicalJson(result);
  if (args.output === "-") context.writeStdout(content);
  else await context.writeFile(resolveInput(context.root, args.output), content);
  context.writeStderr(
    `coupling-audit: ${result.corpus.fileCount} files, ${result.classes.length} classes, ${result.candidates.unresolved.length} unresolved\n`,
  );
  return result;
}

/**
 * Route command success and known failure classes to stable process codes.
 *
 * @param argv - Non-interactive command arguments.
 * @param context - Repository-pinned executable boundaries.
 * @returns Stable zero or coupling-audit failure code.
 */
export async function runCouplingAuditCommand(
  argv: readonly string[],
  context: CouplingAuditScriptContext,
): Promise<0 | 2 | 3 | 4> {
  try {
    await executeCouplingAudit(argv, context);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    context.writeStderr(`coupling-audit: ${message}\n`);
    return couplingAuditExitCode(error);
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await runCouplingAuditCommand(
    process.argv.slice(2),
    createCouplingAuditScriptContext(resolveRepoRoot()),
  );
}
