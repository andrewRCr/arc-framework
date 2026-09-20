/** Exact-target retrieval and local materialization of completed failed check-job logs. */

import { z } from "zod";

import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";

const PositiveIdentifierSchema = z.string().regex(/^[1-9][0-9]*$/u);

export const FailedCheckLogsInputSchema = z.strictObject({
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u),
  pullRequest: z.number().int().positive(),
  headSha: GitObjectIdSchema,
});
export type FailedCheckLogsInput = z.infer<typeof FailedCheckLogsInputSchema>;

export const FailedCheckJobBindingSchema = z.strictObject({
  name: z.string().trim().min(1),
  runId: PositiveIdentifierSchema,
  jobId: PositiveIdentifierSchema,
  headSha: GitObjectIdSchema,
  url: z.url(),
});
export type FailedCheckJobBinding = z.infer<typeof FailedCheckJobBindingSchema>;

export const FailedCheckLogFailureSchema = z.strictObject({
  name: z.string().trim().min(1),
  runId: PositiveIdentifierSchema.optional(),
  jobId: PositiveIdentifierSchema.optional(),
  url: z.url().optional(),
  reason: z.enum([
    "not-github-actions-job",
    "job-unavailable",
    "job-not-complete",
    "binding-mismatch",
    "log-unavailable",
  ]),
  detail: z.string().trim().min(1),
});
export type FailedCheckLogFailure = z.infer<typeof FailedCheckLogFailureSchema>;

export const FailedCheckLogFileSchema = FailedCheckJobBindingSchema.extend({
  path: z.string().trim().min(1),
});
export type FailedCheckLogFile = z.infer<typeof FailedCheckLogFileSchema>;

const ResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-failed-check-logs"),
  repository: z.string().trim().min(1),
  pullRequest: z.number().int().positive(),
  headSha: GitObjectIdSchema,
};

export const FailedCheckLogsResultSchema = z.union([
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("none"),
    nextAction: z.literal("complete"),
    logs: z.tuple([]),
    failures: z.tuple([]),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("retrieved"),
    nextAction: z.literal("inspect"),
    logs: z.array(FailedCheckLogFileSchema).min(1),
    failures: z.tuple([]),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("partial"),
    nextAction: z.literal("inspect-or-retry"),
    logs: z.array(FailedCheckLogFileSchema).min(1),
    failures: z.array(FailedCheckLogFailureSchema).min(1),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("unavailable"),
    nextAction: z.literal("retry"),
    cause: z.enum(["provider", "local-storage"]),
    detail: z.string().trim().min(1),
    logs: z.tuple([]),
    failures: z.array(FailedCheckLogFailureSchema),
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("stale-target"),
    nextAction: z.literal("stop"),
    actualHeadSha: GitObjectIdSchema,
  }),
  z.strictObject({
    ...ResultBaseShape,
    state: z.literal("target-mismatch"),
    nextAction: z.literal("stop"),
    actualRepository: z.string().trim().min(1),
  }),
]);
export type FailedCheckLogsResult = z.infer<typeof FailedCheckLogsResultSchema>;

export interface FailedCheckLogsPort {
  resolveRepository(signal: AbortSignal): Promise<string>;
  readHead(repository: string, pullRequest: number, signal: AbortSignal): Promise<string>;
  readFailedJobs(
    repository: string,
    pullRequest: number,
    signal: AbortSignal,
  ): Promise<{
    readonly jobs: readonly FailedCheckJobBinding[];
    readonly failures: readonly FailedCheckLogFailure[];
  }>;
  readJobLog(repository: string, job: FailedCheckJobBinding, signal: AbortSignal): Promise<string>;
}

export interface FailedCheckLogStore {
  materialize(entries: readonly {
    readonly job: FailedCheckJobBinding;
    readonly log: string;
  }[]): Promise<readonly FailedCheckLogFile[]>;
}

interface FailedCheckLogsDependencies {
  readonly port: FailedCheckLogsPort;
  readonly store: FailedCheckLogStore;
  readonly signal: AbortSignal;
}

interface FailedCheckLogEntry {
  readonly job: FailedCheckJobBinding;
  readonly log: string;
}

function detailFrom(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value.replace(/\s+/gu, " ").trim().slice(0, 1_024) || "No diagnostic detail was returned.";
}

function sameJob(left: FailedCheckJobBinding, right: FailedCheckLogFile): boolean {
  return left.name === right.name
    && left.runId === right.runId
    && left.jobId === right.jobId
    && left.headSha === right.headSha
    && left.url === right.url;
}

function resultBase(input: FailedCheckLogsInput, repository = input.repository) {
  return {
    schemaVersion: 1 as const,
    mode: "review-failed-check-logs" as const,
    repository,
    pullRequest: input.pullRequest,
    headSha: input.headSha,
  };
}

async function movedHead(
  input: FailedCheckLogsInput,
  repository: string,
  dependencies: FailedCheckLogsDependencies,
): Promise<string | null> {
  dependencies.signal.throwIfAborted();
  const current = await dependencies.port.readHead(repository, input.pullRequest, dependencies.signal);
  return current === input.headSha ? null : current;
}

function staleResult(
  input: FailedCheckLogsInput,
  repository: string,
  actualHeadSha: string,
): FailedCheckLogsResult {
  return FailedCheckLogsResultSchema.parse({
    ...resultBase(input, repository), state: "stale-target", nextAction: "stop", actualHeadSha,
  });
}

function bindDiscoveredJobs(
  input: FailedCheckLogsInput,
  discovery: Awaited<ReturnType<FailedCheckLogsPort["readFailedJobs"]>>,
): { jobs: FailedCheckJobBinding[]; failures: FailedCheckLogFailure[] } {
  const failures = discovery.failures.map((failure) => FailedCheckLogFailureSchema.parse(failure));
  const jobs = discovery.jobs.flatMap((value) => {
    const job = FailedCheckJobBindingSchema.parse(value);
    if (job.headSha === input.headSha) return [job];
    failures.push({
      name: job.name,
      runId: job.runId,
      jobId: job.jobId,
      url: job.url,
      reason: "binding-mismatch",
      detail: `Failed job head ${job.headSha} does not match target head ${input.headSha}.`,
    });
    return [];
  });
  return { jobs, failures };
}

async function downloadJobLogs(
  repository: string,
  jobs: readonly FailedCheckJobBinding[],
  dependencies: FailedCheckLogsDependencies,
): Promise<{ entries: FailedCheckLogEntry[]; failures: FailedCheckLogFailure[] }> {
  const entries: FailedCheckLogEntry[] = [];
  const failures: FailedCheckLogFailure[] = [];
  for (const job of jobs) {
    try {
      dependencies.signal.throwIfAborted();
      entries.push({
        job,
        log: await dependencies.port.readJobLog(repository, job, dependencies.signal),
      });
    } catch (error) {
      failures.push({
        name: job.name,
        runId: job.runId,
        jobId: job.jobId,
        url: job.url,
        reason: "log-unavailable",
        detail: `Failed-job log was unavailable: ${detailFrom(error)}`,
      });
    }
  }
  return { entries, failures };
}

async function materializeJobLogs(
  entries: readonly FailedCheckLogEntry[],
  dependencies: FailedCheckLogsDependencies,
): Promise<{ logs: FailedCheckLogFile[]; detail: null } | { logs: []; detail: string }> {
  try {
    const logs = z.array(FailedCheckLogFileSchema).parse(
      await dependencies.store.materialize(entries),
    );
    if (logs.length !== entries.length
      || entries.some(({ job }) => !logs.some((log) => sameJob(job, log)))) {
      throw new Error("the local store returned incomplete or mismatched job bindings");
    }
    return { logs, detail: null };
  } catch (error) {
    return { logs: [], detail: detailFrom(error) };
  }
}

async function retrieveBoundFailedCheckLogs(
  input: FailedCheckLogsInput,
  repository: string,
  dependencies: FailedCheckLogsDependencies,
): Promise<FailedCheckLogsResult> {
  const base = resultBase(input, repository);
  const discovery = bindDiscoveredJobs(input, await dependencies.port.readFailedJobs(
    repository,
    input.pullRequest,
    dependencies.signal,
  ));
  const afterDiscovery = await movedHead(input, repository, dependencies);
  if (afterDiscovery !== null) return staleResult(input, repository, afterDiscovery);
  if (discovery.jobs.length === 0 && discovery.failures.length === 0) {
    return FailedCheckLogsResultSchema.parse({
      ...base, state: "none", nextAction: "complete", logs: [], failures: [],
    });
  }
  const downloaded = await downloadJobLogs(repository, discovery.jobs, dependencies);
  const failures = [...discovery.failures, ...downloaded.failures];
  const afterDownload = await movedHead(input, repository, dependencies);
  if (afterDownload !== null) return staleResult(input, repository, afterDownload);
  if (downloaded.entries.length === 0) {
    return FailedCheckLogsResultSchema.parse({
      ...base,
      state: "unavailable",
      nextAction: "retry",
      cause: "provider",
      detail: "No completed failed-job log was available for the exact target.",
      logs: [],
      failures,
    });
  }
  const materialized = await materializeJobLogs(downloaded.entries, dependencies);
  if (materialized.detail !== null) {
    return FailedCheckLogsResultSchema.parse({
      ...base,
      state: "unavailable",
      nextAction: "retry",
      cause: "local-storage",
      detail: `Failed-job logs could not be materialized: ${materialized.detail}`,
      logs: [],
      failures,
    });
  }
  return FailedCheckLogsResultSchema.parse(failures.length === 0
    ? { ...base, state: "retrieved", nextAction: "inspect", logs: materialized.logs, failures: [] }
    : { ...base, state: "partial", nextAction: "inspect-or-retry", logs: materialized.logs, failures });
}

/**
 * Retrieve completed failed-job logs for one exact pull-request head.
 *
 * @param input - Exact repository, pull request, and head coordinates.
 * @param dependencies - Host reads, private local storage, and cancellation signal.
 * @returns Retrieved local log paths or one typed refusal/degradation state.
 */
export async function retrieveFailedCheckLogs(
  input: FailedCheckLogsInput,
  dependencies: FailedCheckLogsDependencies,
): Promise<FailedCheckLogsResult> {
  let repository = input.repository;
  try {
    dependencies.signal.throwIfAborted();
    repository = await dependencies.port.resolveRepository(dependencies.signal);
    if (repository.toLowerCase() !== input.repository.toLowerCase()) {
      return FailedCheckLogsResultSchema.parse({
        ...resultBase(input),
        state: "target-mismatch",
        nextAction: "stop",
        actualRepository: repository,
      });
    }
    const initialMovement = await movedHead(input, repository, dependencies);
    if (initialMovement !== null) {
      return staleResult(input, repository, initialMovement);
    }
    return await retrieveBoundFailedCheckLogs(input, repository, dependencies);
  } catch (error) {
    return FailedCheckLogsResultSchema.parse({
      ...resultBase(input, repository),
      state: "unavailable",
      nextAction: "retry",
      cause: "provider",
      detail: `Failed-job diagnostics were unavailable: ${detailFrom(error)}`,
      logs: [],
      failures: [],
    });
  }
}
