/** Staged-tree assertion for the closed layout-migration evidence ledger. */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "../lib/coupling-audit/canonical.js";
import { couplingAuditExitCode, CouplingAuditValidationError, parseCouplingManifest } from "../lib/coupling-audit/contracts.js";
import { collectCorpusFromPaths, selectCorpusPaths } from "../lib/coupling-audit/corpus.js";
import {
  assertLayoutMigrationEvidence,
  LayoutMigrationLedgerV1Schema,
  type LayoutMigrationAssertionResult,
} from "../lib/coupling-audit/layout-migration-ledger.js";
import { scanClassInventory } from "../lib/coupling-audit/scan.js";
import type { GitExec } from "../lib/git/exec.js";
import { gitExec, readGitBlobBytes } from "../lib/io-context.js";
import { resolveRepoRoot } from "./repo-root.js";

export const LAYOUT_MIGRATION_MANIFEST_PATH =
  "packages/arc-framework/audits/coupling-blast-radius/manifest.json";
export const LAYOUT_MIGRATION_LEDGER_PATH =
  "packages/arc-framework/audits/coupling-blast-radius/layout-migration-ledger.json";

/** Injected index and process boundaries for the migration assertion. */
export interface LayoutMigrationScriptContext {
  root: string;
  git: GitExec;
  readIndexBlob(path: string): Promise<Uint8Array | null>;
  writeStdout(content: string): void;
  writeStderr(content: string): void;
}

function nulPaths(stdout: string): string[] {
  return stdout.split("\0").filter((path) => path !== "");
}

function decodeJson(bytes: Uint8Array, path: string): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new CouplingAuditValidationError(path, `invalid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CouplingAuditValidationError(path, `invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function requiredBlob(context: LayoutMigrationScriptContext, path: string): Promise<Uint8Array> {
  const bytes = await context.readIndexBlob(path);
  if (bytes === null) throw new CouplingAuditValidationError(path, "missing indexed input");
  return bytes;
}

/**
 * Assert the canonical migration ledger against exact blobs from the current Git index.
 *
 * @param context - Repository-pinned indexed-byte and process boundaries.
 * @returns Verified selected-hit totals and deterministic owner summaries.
 */
export async function executeLayoutMigrationAssertion(
  context: LayoutMigrationScriptContext,
): Promise<LayoutMigrationAssertionResult> {
  const [{ stdout: cachedOutput }, { stdout: untrackedOutput }] = await Promise.all([
    context.git("git", ["ls-files", "--cached", "-z"]),
    context.git("git", ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const cachedPaths = nulPaths(cachedOutput);
  const cachedSet = new Set(cachedPaths);
  for (const required of [LAYOUT_MIGRATION_MANIFEST_PATH, LAYOUT_MIGRATION_LEDGER_PATH]) {
    if (!cachedSet.has(required)) throw new CouplingAuditValidationError(required, "missing indexed input");
  }

  const manifestBytes = await requiredBlob(context, LAYOUT_MIGRATION_MANIFEST_PATH);
  const manifest = parseCouplingManifest(decodeJson(manifestBytes, LAYOUT_MIGRATION_MANIFEST_PATH));
  if (!manifest.corpus.excluded.some((entry) => entry.path === LAYOUT_MIGRATION_LEDGER_PATH)) {
    throw new CouplingAuditValidationError("manifest.corpus.excluded", "migration ledger must be excluded");
  }
  const relevantUntracked = selectCorpusPaths(manifest.corpus, nulPaths(untrackedOutput), false);
  if (relevantUntracked.length > 0) {
    throw new CouplingAuditValidationError("corpus.untracked", `relevant untracked path: ${relevantUntracked[0] ?? ""}`);
  }

  const ledgerBytes = await requiredBlob(context, LAYOUT_MIGRATION_LEDGER_PATH);
  const parsedLedger = LayoutMigrationLedgerV1Schema.safeParse(decodeJson(ledgerBytes, LAYOUT_MIGRATION_LEDGER_PATH));
  if (!parsedLedger.success) {
    const issue = parsedLedger.error.issues[0];
    throw new CouplingAuditValidationError(
      `layoutMigrationLedger.${issue?.path.join(".") ?? ""}`,
      issue?.message ?? "invalid ledger",
    );
  }
  const canonicalLedger = new TextEncoder().encode(canonicalJson(parsedLedger.data));
  if (canonicalLedger.length !== ledgerBytes.length || canonicalLedger.some((byte, index) => byte !== ledgerBytes[index])) {
    throw new CouplingAuditValidationError(LAYOUT_MIGRATION_LEDGER_PATH, "ledger bytes are not canonical");
  }

  const corpusPaths = selectCorpusPaths(manifest.corpus, cachedPaths);
  const files = await collectCorpusFromPaths(manifest.corpus, corpusPaths, async (path) => {
    const bytes = await context.readIndexBlob(path);
    if (bytes === null) throw new Error("indexed corpus blob disappeared");
    return bytes;
  });
  const result = assertLayoutMigrationEvidence(scanClassInventory(manifest, files), parsedLedger.data);
  const lines = [
    `layout-migration: ${result.selectedHitCount} selected hits certified`,
    ...result.classes.map(({ classId, hitCount, owners }) =>
      `${classId}: ${hitCount} ${hitCount === 1 ? "hit" : "hits"}; ${owners.map(({ owner, count }) => `${owner}=${count}`).join(", ")}`,
    ),
  ];
  context.writeStdout(`${lines.join("\n")}\n`);
  return result;
}

/**
 * Construct the production assertion context pinned to one repository root.
 *
 * @param root - Repository root whose current index is authoritative.
 * @returns Real Git-index and process-stream adapters.
 */
export function createLayoutMigrationScriptContext(root: string): LayoutMigrationScriptContext {
  return {
    root,
    git: (command, args, options) => gitExec(command, args, { ...options, cwd: root }),
    readIndexBlob: (path) => readGitBlobBytes(root, null, path),
    writeStdout: (content) => process.stdout.write(content),
    writeStderr: (content) => process.stderr.write(content),
  };
}

/**
 * Run the assertion with stable diagnostics and exit codes.
 *
 * @param context - Repository-pinned indexed-byte and process boundaries.
 * @returns Zero on success or the stable coupling-audit failure code.
 */
export async function runLayoutMigrationAssertionCommand(
  context: LayoutMigrationScriptContext,
): Promise<0 | 2 | 3 | 4> {
  try {
    await executeLayoutMigrationAssertion(context);
    return 0;
  } catch (error) {
    context.writeStderr(`layout-migration: ${error instanceof Error ? error.message : String(error)}\n`);
    return couplingAuditExitCode(error);
  }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await runLayoutMigrationAssertionCommand(createLayoutMigrationScriptContext(resolveRepoRoot()));
}
