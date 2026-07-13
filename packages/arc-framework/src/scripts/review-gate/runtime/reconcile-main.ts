/**
 * Dependency-injectable reconcile main: resolve the environment record into a
 * composition config, build the injected IO, construct the runtime through the
 * supplied factory, run the guarded `reconcile()` orchestration, and report the
 * result status. The production shell passes `process.env` and the real factory;
 * tests pass a fake environment and factory.
 *
 * @module
 */

import type { GitExec } from "../../../lib/git/exec.js";
import type { HttpFetch } from "../hosts/github/api/http.js";
import type { SelfHostingPolicy } from "../policy/self-hosting/schema.js";
import {
  appendTriggerDeletionTombstone,
  parseTriggerDeletionEvent,
  type TriggerDeletionAppendResult,
  type TriggerDeletionEvent,
} from "../core/trigger-tombstone.js";
import type {
  CompositionIo,
  CompositionSeams,
  ReconcileComposition,
  ReconcileRuntimeConfig,
} from "./composition.js";
import { reconcile, type ReconcileResult } from "./reconcile.js";
import { parseContextMode } from "./rollout.js";

/** GitHub Actions environment the reconcile entry consumes. */
export interface ReconcileMainEnv {
  ARC_REPOSITORY_ID?: string;
  ARC_PULL_REQUEST_NUMBER?: string;
  ARC_REVIEW_GATE_APP_ID?: string;
  REVIEW_GATE_CONTEXT_MODE?: string;
  ARC_APP_TOKEN?: string;
  ARC_APP_SLUG?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPOSITORY?: string;
  ARC_TRIGGER_DELETION?: string;
}

/** Injected factory, transport, git-exec builder, policy, and clock. */
export interface ReconcileMainDependencies {
  createRuntime: (
    config: ReconcileRuntimeConfig,
    io: CompositionIo,
    seams?: CompositionSeams,
  ) => Promise<ReconcileComposition>;
  fetch: HttpFetch;
  createGitExec: (gitToken: string) => GitExec;
  policy: SelfHostingPolicy;
  now: Date;
  appendTriggerDeletion?: (input: {
    store: ReconcileComposition["store"];
    changeRequestId: string;
    deletion: TriggerDeletionEvent;
  }) => Promise<TriggerDeletionAppendResult>;
}

/** Reported reconcile outcome for the workflow log. */
export interface ReconcileMainResult {
  status: ReconcileResult["status"];
  effectInvoked: boolean;
}

function requireEnv(env: ReconcileMainEnv, key: keyof ReconcileMainEnv): string {
  const value = env[key];
  if (value === undefined || value.length === 0) throw new Error(`missing-environment:${key}`);
  return value;
}

function splitRepository(repository: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repository.split("/");
  if (owner === undefined || repo === undefined || owner.length === 0 || repo.length === 0 || rest.length > 0) {
    throw new Error("invalid-environment:GITHUB_REPOSITORY");
  }
  return { owner, repo };
}

function positiveInt(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`invalid-environment:${name}`);
  return parsed;
}

/** Resolve the environment, wire the runtime, and run one reconciliation. */
export async function runReconcileMain(
  env: ReconcileMainEnv,
  deps: ReconcileMainDependencies,
): Promise<ReconcileMainResult> {
  const { owner, repo } = splitRepository(requireEnv(env, "GITHUB_REPOSITORY"));
  const config: ReconcileRuntimeConfig = {
    owner,
    repo,
    repositoryId: positiveInt(requireEnv(env, "ARC_REPOSITORY_ID"), "ARC_REPOSITORY_ID"),
    pullRequestNumber: positiveInt(requireEnv(env, "ARC_PULL_REQUEST_NUMBER"), "ARC_PULL_REQUEST_NUMBER"),
    appToken: requireEnv(env, "ARC_APP_TOKEN"),
    appSlug: requireEnv(env, "ARC_APP_SLUG"),
    expectedAppId: requireEnv(env, "ARC_REVIEW_GATE_APP_ID"),
    policy: deps.policy,
    mode: parseContextMode(env.REVIEW_GATE_CONTEXT_MODE),
  };
  const io: CompositionIo = { fetch: deps.fetch, exec: deps.createGitExec(requireEnv(env, "GITHUB_TOKEN")) };
  const composition = await deps.createRuntime(config, io);
  if (env.ARC_TRIGGER_DELETION !== undefined && env.ARC_TRIGGER_DELETION !== "" && env.ARC_TRIGGER_DELETION !== "null") {
    let rawDeletion: unknown;
    try {
      rawDeletion = JSON.parse(env.ARC_TRIGGER_DELETION) as unknown;
    } catch {
      throw new Error("invalid-environment:ARC_TRIGGER_DELETION");
    }
    const deletion = parseTriggerDeletionEvent(rawDeletion);
    await (deps.appendTriggerDeletion ?? appendTriggerDeletionTombstone)({
      store: composition.store,
      changeRequestId: composition.changeRequestId,
      deletion,
    });
  }
  const result = await reconcile(composition.runtime, deps.now);
  return { status: result.status, effectInvoked: result.effect?.invoked ?? false };
}
