/**
 * Handlers for `arc recover` recovery-support commands.
 *
 * @module
 */

import { readFile } from "node:fs/promises";

import { runRecoverStatus } from "../commands/status.js";
import type { SessionRecoverProbeResult } from "../commands/status.js";
import {
  parseCompactionSeedJson,
  type CompactionSeed,
  type CompactionSeedSchemaError,
} from "../lib/compaction-seed/schema.js";
import {
  parseUncommittedFiles,
  resolveCompactionSeedPath,
} from "../lib/compaction-seed/emitter.js";
import type { DirtyStateResult } from "../lib/git/dirty-state.js";
import { gitConfigGet } from "../lib/git/index.js";
import { gitExec } from "../lib/io-context.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";
import {
  auditRecoveryState,
  type RecoveryAuditStopReason,
  type RecoveryAuditVerdict,
} from "../lib/recover/audit.js";
import { createRecoverStatusProbes } from "./recover-probes.js";
import { requireArcProjectRoot } from "./shared.js";

export interface RecoverAuditOptions {
  json?: boolean;
}

interface RecoverAuditReport {
  mode: "recover-audit";
  seedPath: string | null;
  seed: Pick<
    CompactionSeed,
    "schemaVersion" | "emittedAt" | "head" | "branch" | "sessionType"
  > | null;
  recover: SessionRecoverProbeResult | null;
  verdict: RecoveryAuditVerdict;
}

/** Handle `arc recover audit`. */
export async function handleRecoverAudit(opts: RecoverAuditOptions): Promise<void> {
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { identity, role } = await readIdentityPointers();
  if (identity === null) {
    writeReport(stopReport({
      seedPath: null,
      reason: {
        kind: "identity-missing",
        message: "arc.identity is not configured; compaction seed path cannot be resolved",
      },
    }), Boolean(opts.json));
    return;
  }

  const identityGlobalUserDir = (await resolveUserSurfaceResolver({ cwd, identity, exec: gitExec }))
    .identityGlobalRoot;
  const seedPath = resolveCompactionSeedPath({ cwd, identity, identityGlobalUserDir });
  let seedContent: string;
  try {
    seedContent = await readFile(seedPath, "utf8");
  } catch (err) {
    writeReport(stopReport({
      seedPath,
      reason: seedReadReason(err),
    }), Boolean(opts.json));
    return;
  }

  const parsedSeed = parseCompactionSeedJson(seedContent);
  if (!parsedSeed.ok) {
    writeReport(stopReport({
      seedPath,
      reason: seedParseReason(parsedSeed.error),
    }), Boolean(opts.json));
    return;
  }

  let gitStatusOutputP: Promise<string> | undefined;
  const getGitStatusOutput = (): Promise<string> => {
    gitStatusOutputP ??= gitExec("git", ["status", "--porcelain=v1", "-z"])
      .then(({ stdout }) => stdout);
    return gitStatusOutputP;
  };
  const probes = createRecoverStatusProbes({
    cwd,
    dirty: async () => dirtyStateFromUncommittedFiles(
      parseUncommittedFiles(await getGitStatusOutput()),
    ),
  });
  const recover = await runRecoverStatus({
    identity,
    role,
    probes,
    identityGlobalUserDir,
  });

  let statusOutput: string;
  try {
    statusOutput = await getGitStatusOutput();
  } catch (err) {
    writeReport({
      mode: "recover-audit",
      seedPath,
      seed: seedSummary(parsedSeed.seed),
      recover,
      verdict: stopVerdict({
        kind: "git-status-failed",
        message: errorMessage(err),
      }),
    }, Boolean(opts.json));
    return;
  }

  const verdict = auditRecoveryState({
    seed: parsedSeed.seed,
    recover,
    freshUncommittedFiles: parseUncommittedFiles(statusOutput),
  });
  writeReport({
    mode: "recover-audit",
    seedPath,
    seed: seedSummary(parsedSeed.seed),
    recover,
    verdict,
  }, Boolean(opts.json));
}

function dirtyStateFromUncommittedFiles(files: readonly string[]): DirtyStateResult {
  return {
    state: files.length === 0 ? "clean" : "dirty",
    fileCount: files.length,
  };
}

async function readIdentityPointers(): Promise<{
  identity: string | null;
  role: string | null;
}> {
  const [identityRaw, roleRaw] = await Promise.all([
    gitConfigGet(gitExec, "arc.identity"),
    gitConfigGet(gitExec, "arc.role"),
  ]);
  return {
    identity: normalizeGitConfigValue(identityRaw),
    role: normalizeGitConfigValue(roleRaw),
  };
}

function writeReport(report: RecoverAuditReport, json: boolean): void {
  if (json) {
    process.stdout.write(`${JSON.stringify(report)}\n`);
    return;
  }
  process.stdout.write(`recover-audit: ${report.verdict.status}\n`);
  for (const reason of report.verdict.stopReasons) {
    process.stdout.write(`- ${reason.kind}: ${reason.message}\n`);
  }
}

function stopReport(input: {
  seedPath: string | null;
  reason: RecoveryAuditStopReason;
}): RecoverAuditReport {
  return {
    mode: "recover-audit",
    seedPath: input.seedPath,
    seed: null,
    recover: null,
    verdict: stopVerdict(input.reason),
  };
}

function stopVerdict(reason: RecoveryAuditStopReason): RecoveryAuditVerdict {
  return {
    status: "stop",
    ready: false,
    stopReasons: [reason],
    loadSetAudit: null,
    dirtyFiles: {
      expected: [],
      actual: [],
      pathSetMatch: false,
      dirtyStateConsistent: null,
      match: false,
    },
    taskCursor: null,
  };
}

function seedReadReason(err: unknown): RecoveryAuditStopReason {
  return {
    kind: isNotFoundError(err) ? "seed-missing" : "seed-unreadable",
    message: errorMessage(err),
    detail: err,
  };
}

function seedParseReason(error: CompactionSeedSchemaError): RecoveryAuditStopReason {
  return {
    kind: "seed-invalid",
    message: error.message,
    detail: error,
  };
}

function seedSummary(
  seed: CompactionSeed,
): RecoverAuditReport["seed"] {
  return {
    schemaVersion: seed.schemaVersion,
    emittedAt: seed.emittedAt,
    head: seed.head,
    branch: seed.branch,
    sessionType: seed.sessionType,
  };
}

function normalizeGitConfigValue(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isNotFoundError(err: unknown): boolean {
  return typeof err === "object"
    && err !== null
    && "code" in err
    && (err as { code?: unknown }).code === "ENOENT";
}
