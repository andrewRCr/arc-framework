/**
 * Handlers for `arc recover` recovery-support commands.
 *
 * @module
 */

import { readFile } from "node:fs/promises";

import { runRecoverStatus } from "../commands/status.js";
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
import type { GitExec } from "../lib/git/index.js";
import type { InteractionContext } from "../lib/command-input/interaction-context.js";
import { declareCliOptionSite, type CommandInputDeclaration } from "../lib/command-input/declaration.js";
import { createGitExec } from "../lib/io-context.js";
import { resolveUserSurfaceResolver } from "../lib/user-surfaces.js";
import { SlugSchema } from "../lib/kernel/index.js";
import {
  auditRecoveryState,
  type RecoveryAuditStopReason,
  type RecoveryAuditVerdict,
} from "../lib/recover/audit.js";
import {
  assertRecoverAuditReport,
  type RecoverAuditReport,
} from "../lib/recover/report.js";
import { readIdentityPointers } from "./identity-pointers.js";
import { createRecoverStatusProbes } from "./recover-probes.js";
import { requireArcProjectRoot } from "./shared.js";

export interface RecoverAuditOptions {
  json?: boolean;
}

/** Machine-output policy owned by the recovery-audit adapter. */
export const recoverCommandInputPolicyDeclarations = [{
  commandPath: "recover audit", aliases: [], sites: [declareCliOptionSite("json", {
    acquisition: "machine-mode", schemaOwnership: "none", cancellation: "not-applicable",
    automation: { noInput: "same", flags: ["--json"], acceptedSyntax: [] },
    mutationBoundary: "output selection", subprocess: "none",
  })],
}] satisfies readonly CommandInputDeclaration[];

/** Handle `arc recover audit`. */
export async function handleRecoverAudit(opts: RecoverAuditOptions, interaction?: InteractionContext): Promise<void> {
  const gitExec = createGitExec(interaction?.subprocess);
  const cwd = requireArcProjectRoot();
  if (!cwd) return;

  const { identity, role } = await readIdentityPointers(gitExec);
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

  const workingMemoryPath = (await resolveUserSurfaceResolver({
    cwd,
    identity: SlugSchema.parse(identity),
    exec: gitExec,
  })).workingMemoryPath;
  const seedPath = resolveCompactionSeedPath({ cwd, identity });
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
    workingMemoryPath,
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

  const [freshBranch, freshHead] = await Promise.all([
    readGitValue(gitExec, ["rev-parse", "--abbrev-ref", "HEAD"]),
    readGitValue(gitExec, ["rev-parse", "--verify", "HEAD^{commit}"]),
  ]);

  const verdict = await auditRecoveryState({
    seed: parsedSeed.seed,
    recover,
    freshUncommittedFiles: parseUncommittedFiles(statusOutput),
    freshBranch,
    freshHead,
    freshRepoRoot: cwd,
  });
  writeReport({
    mode: "recover-audit",
    seedPath,
    seed: seedSummary(parsedSeed.seed),
    recover,
    verdict,
  }, Boolean(opts.json));
}

async function readGitValue(gitExec: GitExec, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await gitExec("git", args);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function dirtyStateFromUncommittedFiles(files: readonly string[]): DirtyStateResult {
  return {
    state: files.length === 0 ? "clean" : "dirty",
    fileCount: files.length,
  };
}

function writeReport(report: RecoverAuditReport, json: boolean): void {
  assertRecoverAuditReport(report);
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
    explainedDrift: [],
    loadSetAudit: null,
    locus: null,
    locusHint: null,
    dirtyFiles: {
      expected: [],
      actual: [],
      pathSetMatch: false,
      dirtyStateConsistent: null,
      match: false,
      explainedByCommittedProgress: false,
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
    ...(seed.locus === undefined ? {} : { locus: seed.locus }),
    ...(seed.locusAbsence === undefined ? {} : { locusAbsence: seed.locusAbsence }),
  };
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
