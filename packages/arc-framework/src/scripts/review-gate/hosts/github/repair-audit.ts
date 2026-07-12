/** Static workflow graph and live repository-fact audit for the emergency status writer. */

import { load as parseYaml } from "js-yaml";

import { digestAt, objectAt, stringAt } from "../../core/validation.js";
import type { GitHubRestClient, ReadOutcome } from "./api/rest.js";

type JsonObject = Record<string, unknown>;

export interface RepairWriterAuditInput {
  files: Record<string, string>;
  repositoryDefaultPermission: "read" | "write";
  auditedSha: string;
  liveDefaultBranchSha: string;
  repairWorkflowPath: string;
  repairEnvironment: string;
  changedPaths: string[];
  authorityPaths: string[];
}

export type RepairWriterAuditResult =
  | { ok: true; errors: []; writer: { workflowPath: string; jobId: string } }
  | { ok: false; errors: string[]; writer: null };

export interface RepairStatusObservation {
  context: string;
  headSha: string;
  creatorAppId: string;
  state: "pending" | "failure" | "success";
  targetUrl: string;
}

/** Verify the emitted repair status is exact-head and from the GitHub Actions App identity. */
export function validateRepairStatusSource(
  observation: RepairStatusObservation,
  expectedHeadSha: string,
  expectedRunUrlPrefix: string,
): string[] {
  const errors: string[] = [];
  if (observation.context !== "review-repair-ok") errors.push("repair-status-context-mismatch");
  if (observation.headSha !== expectedHeadSha) errors.push("repair-status-head-mismatch");
  if (observation.creatorAppId !== "15368") errors.push("repair-status-source-app-mismatch");
  if (observation.state !== "success") errors.push("repair-status-not-success");
  if (!observation.targetUrl.startsWith(expectedRunUrlPrefix)) errors.push("repair-status-target-mismatch");
  return errors;
}

function record(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

function permissionMap(value: unknown): JsonObject | null {
  return record(value);
}

function permissionIs(value: unknown, name: string, expected: "read" | "write"): boolean {
  return permissionMap(value)?.[name] === expected;
}

function environmentName(value: unknown): string | null {
  if (typeof value === "string") return value;
  const environment = record(value);
  return typeof environment?.name === "string" ? environment.name : null;
}

function needsJob(value: unknown, jobId: string): boolean {
  return value === jobId || (Array.isArray(value) && value.includes(jobId));
}

function repairTriggerValid(value: unknown): boolean {
  const triggers = record(value);
  if (triggers === null || Object.keys(triggers).join(",") !== "repository_dispatch") return false;
  const dispatch = record(triggers.repository_dispatch);
  return dispatch !== null
    && Array.isArray(dispatch.types)
    && dispatch.types.length === 1
    && dispatch.types[0] === "review-gate-repair";
}

function parseWorkflow(path: string, content: string, errors: string[]): JsonObject | null {
  try {
    const parsed = record(parseYaml(content));
    if (parsed === null) throw new Error("root is not an object");
    return parsed;
  } catch {
    errors.push(`workflow-malformed:${path}`);
    return null;
  }
}

function localWorkflowCall(job: JsonObject): string | null {
  const uses = job.uses;
  if (typeof uses !== "string" || !uses.startsWith("./.github/workflows/")) return null;
  return uses.slice(2);
}

function writerShapeValid(job: JsonObject, validationJob: JsonObject | undefined, environment: string): boolean {
  const permissions = permissionMap(job.permissions);
  if (permissions === null
    || Object.keys(permissions).sort().join(",") !== "contents,pull-requests,statuses"
    || permissions.contents !== "read"
    || permissions["pull-requests"] !== "read"
    || permissions.statuses !== "write") return false;
  if (environmentName(job.environment) !== environment || !needsJob(job.needs, "validate")) return false;
  if (validationJob === undefined || !permissionIs(validationJob.permissions, "contents", "read")
    || permissionIs(validationJob.permissions, "statuses", "write")) return false;
  if (JSON.stringify(job).includes("secrets.")) return false;
  const steps = Array.isArray(job.steps) ? job.steps : [];
  if (steps.length !== 1) return false;
  const step = record(steps[0]);
  if (step === null || "uses" in step || typeof step.run !== "string") return false;
  const env = { ...(record(job.env) ?? {}), ...(record(step.env) ?? {}) };
  if (env.STATUS_CONTEXT !== "review-repair-ok") return false;
  const run = step.run;
  if (!run.includes("gh api")
    || !run.includes("pulls/$PR_NUMBER")
    || !run.includes("statuses/$VALIDATED_HEAD")
    || !run.includes("state=success")
    || !run.includes("$STATUS_CONTEXT")
    || !run.includes("$VALIDATED_HEAD")) return false;
  if (/(?:npm|pnpm|yarn)\s+(?:ci|install)|\bnode\s|\bsource\s|bash\s+\S+\.sh|\.\/\S+/u.test(run)) return false;
  return true;
}

/** Prove one immutable, environment-isolated Actions-token writer and no competing graph path. */
export function auditRepairWriterGraph(input: RepairWriterAuditInput): RepairWriterAuditResult {
  const errors: string[] = [];
  if (input.repositoryDefaultPermission !== "read") errors.push("repository-actions-default-not-read-only");
  if (input.auditedSha !== input.liveDefaultBranchSha) errors.push("default-branch-graph-drift");
  const changed = new Set(input.changedPaths);
  if (input.authorityPaths.some((path) => changed.has(path))) errors.push("repair-authority-code-changed");
  const writers: Array<{ workflowPath: string; jobId: string; job: JsonObject; workflow: JsonObject }> = [];
  const environmentConsumers: Array<{ workflowPath: string; jobId: string }> = [];

  for (const [path, content] of Object.entries(input.files).sort(([left], [right]) => left.localeCompare(right))) {
    if (!/^\.github\/workflows\/[^/]+\.ya?ml$/u.test(path)) continue;
    const workflow = parseWorkflow(path, content, errors);
    if (workflow === null) continue;
    if (!("permissions" in workflow)) errors.push(`workflow-permissions-implicit:${path}`);
    const jobs = record(workflow.jobs);
    if (jobs === null) {
      errors.push(`workflow-jobs-malformed:${path}`);
      continue;
    }
    for (const [jobId, rawJob] of Object.entries(jobs)) {
      const job = record(rawJob);
      if (job === null) {
        errors.push(`workflow-job-malformed:${path}:${jobId}`);
        continue;
      }
      if (!("permissions" in job)) errors.push(`job-permissions-implicit:${path}:${jobId}`);
      const called = localWorkflowCall(job);
      if (called !== null && input.files[called] === undefined) errors.push(`local-workflow-call-missing:${path}:${jobId}`);
      if (permissionIs(job.permissions, "statuses", "write")) writers.push({ workflowPath: path, jobId, job, workflow });
      if (environmentName(job.environment) === input.repairEnvironment) environmentConsumers.push({ workflowPath: path, jobId });
    }
  }

  if (writers.length !== 1) errors.push(`repair-writer-count:${writers.length}`);
  const writer = writers[0];
  if (writer !== undefined) {
    if (writer.workflowPath !== input.repairWorkflowPath || writer.jobId !== "write-status") {
      errors.push(`unexpected-status-writer:${writer.workflowPath}:${writer.jobId}`);
    }
    const jobs = record(writer.workflow.jobs);
    const validationJob = record(jobs?.validate) ?? undefined;
    if (!writerShapeValid(writer.job, validationJob, input.repairEnvironment)) errors.push("repair-writer-shape-invalid");
    if (!repairTriggerValid(writer.workflow.on)) errors.push("repair-workflow-trigger-invalid");
  }
  const soleEnvironmentConsumer = environmentConsumers.length === 1 ? environmentConsumers[0] : undefined;
  if (soleEnvironmentConsumer === undefined
    || soleEnvironmentConsumer.workflowPath !== input.repairWorkflowPath
    || soleEnvironmentConsumer.jobId !== "write-status") {
    errors.push("repair-environment-not-exclusive");
  }
  return errors.length === 0 && writer !== undefined
    ? { ok: true, errors: [], writer: { workflowPath: writer.workflowPath, jobId: writer.jobId } }
    : { ok: false, errors: [...new Set(errors)], writer: null };
}

function valueOrThrow<T>(outcome: ReadOutcome<T>, locus: string): T {
  if (outcome.kind !== "ok") throw new Error(`repair-audit:${locus}-unavailable:${outcome.kind}`);
  return outcome.value;
}

/** Live repository facts that static YAML cannot prove. */
export class GitHubRestRepairAuditFacts {
  constructor(
    private readonly rest: GitHubRestClient,
    private readonly owner: string,
    private readonly repo: string,
  ) {}

  async read(): Promise<{
    repositoryDefaultPermission: "read" | "write";
    defaultBranch: string;
    liveDefaultBranchSha: string;
  }> {
    const root = `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
    const [repository, permissions] = await Promise.all([
      this.rest.get(root, {
        parse: (input) => {
          const value = objectAt(input, "repository");
          return stringAt(value.default_branch, "repository.default_branch");
        },
      }),
      this.rest.get(`${root}/actions/permissions/workflow`, {
        parse: (input) => {
          const value = objectAt(input, "actionsPermissions");
          const permission = stringAt(value.default_workflow_permissions, "actionsPermissions.default_workflow_permissions");
          if (permission !== "read" && permission !== "write") throw new Error("invalid default workflow permission");
          return permission;
        },
      }),
    ]);
    const defaultBranch = valueOrThrow(repository, "repository");
    const branch = valueOrThrow(await this.rest.get(`${root}/branches/${encodeURIComponent(defaultBranch)}`, {
      parse: (input) => {
        const value = objectAt(input, "branch");
        const commit = objectAt(value.commit, "branch.commit");
        return digestAt(commit.sha, "branch.commit.sha", 40);
      },
    }), "default-branch");
    return {
      repositoryDefaultPermission: valueOrThrow(permissions, "actions-permissions"),
      defaultBranch,
      liveDefaultBranchSha: branch,
    };
  }
}
