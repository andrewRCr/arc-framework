/**
 * Composition roots for the review-gate controller: a shared infrastructure
 * factory (authenticated clients, host adapter, canonical resolvers, receipt-store
 * builder, launch-authority validation) and a reconcile-specific factory that adds
 * the context mode, check-run publisher, CodeRabbit provider boundary, controller-
 * authorized receipt store, command reader, and the assembled `ReconcileRuntime`.
 *
 * Transport and git IO (`fetch`, `exec`) are injected so the whole graph is
 * observable with fakes; the production shells supply the real boundaries.
 *
 * @module
 */

import { computePolicyVersion } from "../core/identity.js";
import type { ReviewReceipt } from "../core/execution.js";
import type { GitHostAdapter, ReviewProviderAdapter, ReviewReceiptStore } from "../core/ports.js";
import type { GitExec } from "../../../lib/git/exec.js";
import { GitHubHostAdapter } from "../hosts/github/adapter.js";
import { GitHubGraphQLClient } from "../hosts/github/api/graphql.js";
import type { HttpFetch } from "../hosts/github/api/http.js";
import { GitHubRestClient } from "../hosts/github/api/rest.js";
import { GitHubRestCheckRunApi, type GitHubCheckRunApi } from "../hosts/github/check-runs.js";
import {
  encodeHostRef,
  resolveChangeRequest,
  type ChangeRequestResolution,
  type GitHubChangeRequestDeps,
} from "../hosts/github/change-request.js";
import { GitHubReviewCommandCommentReader } from "../hosts/github/command-comments.js";
import { resolveCiState } from "../hosts/github/ci.js";
import { GitLifecycleTailProofAdapter } from "../hosts/github/lifecycle-tail.js";
import {
  verifyInstallationAuthority,
  type AppIdentityResult,
  type InstallationAuthorityInput,
  type ReceiptCommentAuthority,
} from "../hosts/github/receipt-auth.js";
import {
  GitHubCommentReceiptStore,
  GitHubRestIssueCommentApi,
  type ReceiptWriteState,
} from "../hosts/github/receipt-store.js";
import { classifyReviewRisk } from "../policy/self-hosting/risk.js";
import { resolveAutoLane, type ChangedPath } from "../policy/self-hosting/lane.js";
import type { SelfHostingPolicy } from "../policy/self-hosting/schema.js";
import {
  CODERABBIT_SHADOW_CAPABILITIES,
  CodeRabbitProviderAdapter,
  type CodeRabbitApi,
} from "../providers/coderabbit/adapter.js";
import { GitHubCodeRabbitObservationApi } from "../providers/coderabbit/github-observation.js";
import { GitHubCodeRabbitTriggerApi } from "../providers/coderabbit/github-trigger.js";
import {
  ReceiptBackedCodeRabbitObservationLocator,
  ReceiptBackedCodeRabbitRequestLocator,
} from "../providers/coderabbit/locators.js";
import { SelfHostingReconcileRuntime, type ReconcileRuntimeDependencies } from "./reconcile-runtime.js";
import type { ContextMode } from "./rollout.js";

/** Repository/PR coordinates, App pins, and policy shared by both entry points. */
export interface SharedInfrastructureConfig {
  owner: string;
  repo: string;
  repositoryId: number;
  pullRequestNumber: number;
  appToken: string;
  appSlug: string;
  expectedAppId: string;
  policy: SelfHostingPolicy;
  baseRemote?: string;
}

/** Reconcile adds the required context mode to the shared configuration. */
export interface ReconcileRuntimeConfig extends SharedInfrastructureConfig {
  mode: ContextMode;
}

/** Injected transport and git boundaries; production supplies real implementations. */
export interface CompositionIo {
  fetch: HttpFetch;
  exec: GitExec;
}

/** Test seams for the two boundary reads that would otherwise require a live host. */
export interface CompositionSeams {
  verifyLaunchAuthority?: (rest: GitHubRestClient, input: InstallationAuthorityInput) => Promise<AppIdentityResult>;
  resolveChange?: (deps: GitHubChangeRequestDeps, hostRef: string) => Promise<ChangeRequestResolution>;
}

/** Validated shared graph; carries no publish or provider-invocation capability. */
export interface SharedInfrastructure {
  rest: GitHubRestClient;
  gql: GitHubGraphQLClient;
  exec: GitExec;
  baseRemote: string;
  hostRef: string;
  checks: GitHubCheckRunApi;
  host: GitHubHostAdapter;
  issueCommentApi: GitHubRestIssueCommentApi;
  launchAuthority: AppIdentityResult;
}

/** The wired reconcile runtime plus the constructed graph for inspection. */
export interface ReconcileComposition {
  runtime: SelfHostingReconcileRuntime;
  host: GitHostAdapter;
  store: ReviewReceiptStore;
  provider: ReviewProviderAdapter;
  checks: GitHubCheckRunApi;
  launchAuthority: AppIdentityResult;
}

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0) throw new Error(`review-gate composition: ${field} is required`);
}

function assertSharedConfig(config: SharedInfrastructureConfig): void {
  assertNonEmpty(config.owner, "owner");
  assertNonEmpty(config.repo, "repo");
  assertNonEmpty(config.appToken, "appToken");
  assertNonEmpty(config.appSlug, "appSlug");
  assertNonEmpty(config.expectedAppId, "expectedAppId");
  if (!Number.isInteger(config.repositoryId) || config.repositoryId <= 0) {
    throw new Error("review-gate composition: repositoryId must be a positive integer");
  }
  if (!Number.isInteger(config.pullRequestNumber) || config.pullRequestNumber <= 0) {
    throw new Error("review-gate composition: pullRequestNumber must be a positive integer");
  }
}

/** A changed code file flips the reviewed lane to sensitive risk. */
function derivesCodeSurface(changes: ChangedPath[]): boolean {
  return changes.some((change) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/u.test(change.path));
}

function composeCodeRabbitApi(
  observation: GitHubCodeRabbitObservationApi,
  trigger: GitHubCodeRabbitTriggerApi,
): CodeRabbitApi {
  return {
    validateCurrent: (request) => trigger.validateCurrent(request),
    applyTriggerLabel: (request) => trigger.applyTriggerLabel(request),
    requestFullReview: (request) => trigger.requestFullReview(request),
    removeTriggerLabel: (request) => trigger.removeTriggerLabel(request),
    readRunContext: (requestIdentity) => observation.readRunContext(requestIdentity),
    readSignals: (requestIdentity) => observation.readSignals(requestIdentity),
    readCapacity: () => observation.readCapacity(),
  };
}

/** Build the authenticated clients, host adapter, and launch-authority verdict. */
export async function createSharedInfrastructure(
  config: SharedInfrastructureConfig,
  io: CompositionIo,
  seams: CompositionSeams = {},
): Promise<SharedInfrastructure> {
  assertSharedConfig(config);
  const rest = new GitHubRestClient({ fetch: io.fetch, token: config.appToken });
  const gql = new GitHubGraphQLClient({ fetch: io.fetch, token: config.appToken });
  const baseRemote = config.baseRemote ?? "origin";
  const hostRef = encodeHostRef({ owner: config.owner, repo: config.repo, number: config.pullRequestNumber });
  const checks = new GitHubRestCheckRunApi(rest, config.owner, config.repo, config.expectedAppId);
  const host = new GitHubHostAdapter({ rest, gql, exec: io.exec, owner: config.owner, repo: config.repo, baseRemote }, checks);
  const issueCommentApi = new GitHubRestIssueCommentApi(rest, config.owner, config.repo, config.pullRequestNumber);
  const verify = seams.verifyLaunchAuthority ?? verifyInstallationAuthority;
  const launchAuthority = await verify(rest, {
    appSlug: config.appSlug,
    expectedAppId: config.expectedAppId,
    expectedBotId: config.policy.providerIdentities.appBotUserId,
    expectedRepositoryId: String(config.repositoryId),
  });
  return { rest, gql, exec: io.exec, baseRemote, hostRef, checks, host, issueCommentApi, launchAuthority };
}

/** Wire the full reconcile runtime over validated shared infrastructure. */
export async function createReconcileRuntime(
  config: ReconcileRuntimeConfig,
  io: CompositionIo,
  seams: CompositionSeams = {},
): Promise<ReconcileComposition> {
  const shared = await createSharedInfrastructure(config, io, seams);
  if (shared.launchAuthority.kind === "failed") {
    throw new Error(`review-gate composition: launch authority failed — ${shared.launchAuthority.reason}`);
  }

  const changeDeps: GitHubChangeRequestDeps = { rest: shared.rest, exec: io.exec, baseRemote: shared.baseRemote };
  const resolveChangeFn = seams.resolveChange ?? resolveChangeRequest;
  const resolveChange = (): Promise<ChangeRequestResolution> => resolveChangeFn(changeDeps, shared.hostRef);
  const change = await resolveChange();
  if (change.kind !== "resolved") {
    throw new Error(`review-gate composition: change request unavailable — ${change.kind}`);
  }
  const changeRequestId = change.changeRequest.changeRequestId;

  const appBotUserId = config.policy.providerIdentities.appBotUserId;
  const authority: ReceiptCommentAuthority = { expectedAppId: config.expectedAppId, expectedBotId: appBotUserId };
  const policyVersion = computePolicyVersion({ policy: config.policy });
  const controllerRevalidate = async (receipt: ReviewReceipt): Promise<ReceiptWriteState> => {
    const current = await resolveChange();
    const currentChange = current.kind === "resolved" ? current.changeRequest : null;
    return {
      repositoryId: String(config.repositoryId),
      changeRequestId: currentChange?.changeRequestId ?? "",
      changeSetId: currentChange?.changeSetId ?? "",
      policyVersion,
      actorIdentity: receipt.request.actorIdentity,
      authorized: shared.launchAuthority.kind === "verified" && receipt.request.actorIdentity === appBotUserId,
    };
  };
  const store = new GitHubCommentReceiptStore({
    api: shared.issueCommentApi,
    authority,
    repositoryId: String(config.repositoryId),
    changeRequestId,
    revalidate: controllerRevalidate,
    stateExpected: () => Promise.resolve(false),
  });

  const locatorDeps = {
    pullRequestNumber: config.pullRequestNumber,
    resolveChange,
    readLedger: (id: string) => store.readLedger(id),
  };
  const observation = new GitHubCodeRabbitObservationApi({
    rest: shared.rest,
    gql: shared.gql,
    owner: config.owner,
    repo: config.repo,
    expectedBotUserId: config.policy.providerIdentities.coderabbitBotUserId,
    locator: new ReceiptBackedCodeRabbitObservationLocator(locatorDeps),
  });
  const trigger = new GitHubCodeRabbitTriggerApi({
    rest: shared.rest,
    owner: config.owner,
    repo: config.repo,
    locator: new ReceiptBackedCodeRabbitRequestLocator(locatorDeps),
  });
  const provider = new CodeRabbitProviderAdapter({
    api: composeCodeRabbitApi(observation, trigger),
    capabilities: CODERABBIT_SHADOW_CAPABILITIES,
    expectedBotUserId: config.policy.providerIdentities.coderabbitBotUserId,
  });

  const commandReader = new GitHubReviewCommandCommentReader(shared.rest, config.owner, config.repo, config.pullRequestNumber);
  const lifecycleTailAdapter = new GitLifecycleTailProofAdapter({ exec: io.exec });

  const deps: ReconcileRuntimeDependencies = {
    policy: config.policy,
    host: shared.host,
    store,
    provider,
    lifecycleTailAdapter,
    coordinates: {
      repositoryId: config.repositoryId,
      pullRequestNumber: config.pullRequestNumber,
      hostRef: shared.hostRef,
    },
    mode: config.mode,
    expectedAppId: config.expectedAppId,
    resolveCiState: (headSha) => resolveCiState(shared.checks, headSha),
    resolveLane: (input) => resolveAutoLane({
      exec: io.exec,
      diffBaseSha: input.diffBaseSha,
      headSha: input.headSha,
      authorLogin: input.authorLogin,
      authorMap: config.policy.authorMap,
      changes: input.changes,
    }),
    resolveRisk: (changes) => classifyReviewRisk({
      paths: changes.map((change) => change.path),
      codeSurface: derivesCodeSurface(changes),
    }),
    listCommandComments: () => commandReader.list(),
  };

  return {
    runtime: new SelfHostingReconcileRuntime(deps),
    host: shared.host,
    store,
    provider,
    checks: shared.checks,
    launchAuthority: shared.launchAuthority,
  };
}
