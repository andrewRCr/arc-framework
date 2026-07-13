/** GitHub composition adapters over the validated host leaf functions. */

import type { GitExec } from "../../../../lib/git/exec.js";
import type {
  ActorAddress,
  GitHostAdapter,
  GitHostReadAdapter,
  HostChangeRequestResolution,
  HostProjectionRef,
  NativeReviewObservation,
  NativeReviewReadInput,
  PendingProjectionConfirmationInput,
  VerdictPublicationInput,
} from "../../core/ports.js";
import { projectContexts } from "../../runtime/rollout.js";
import {
  resolveActorCapabilities as resolveActorCapabilitiesLeaf,
} from "./actor.js";
import type { GitHubGraphQLClient } from "./api/graphql.js";
import type { GitHubRestClient } from "./api/rest.js";
import {
  decodeHostRef,
  resolveChangeRequest as resolveChangeRequestLeaf,
} from "./change-request.js";
import {
  confirmPendingGateCheck,
  publishGateCheck,
  type CheckRunScope,
  type GitHubCheckRunApi,
} from "./check-runs.js";
import {
  reduceNativeReview,
  resolveReviewDecision,
  resolveReviews,
  resolveThreads,
} from "./native-review.js";

/** Stable fail-closed read error from the composed host boundary. */
export class GitHubHostReadError extends Error {
  readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail === undefined ? code : `${code}: ${detail}`);
    this.name = "GitHubHostReadError";
    this.code = code;
  }
}

function readFailureDetail(outcome: {
  kind: string;
  message?: string;
  reason?: string;
  status?: number;
}): string | undefined {
  if (outcome.message !== undefined) {
    return outcome.status === undefined ? outcome.message : `${outcome.status}: ${outcome.message}`;
  }
  return outcome.reason;
}

/** Immutable dependencies and repository scope for GitHub reads. */
export interface GitHubHostReadDeps {
  rest: GitHubRestClient;
  gql: GitHubGraphQLClient;
  exec: GitExec;
  owner: string;
  repo: string;
  baseRemote: string;
}

/** Injectable leaf set used by the production composition. */
export interface GitHubHostReadFunctions {
  resolveChangeRequest: typeof resolveChangeRequestLeaf;
  resolveActorCapabilities: typeof resolveActorCapabilitiesLeaf;
  resolveReviews: typeof resolveReviews;
  resolveReviewDecision: typeof resolveReviewDecision;
  resolveThreads: typeof resolveThreads;
}

const DEFAULT_FUNCTIONS: GitHubHostReadFunctions = {
  resolveChangeRequest: resolveChangeRequestLeaf,
  resolveActorCapabilities: resolveActorCapabilitiesLeaf,
  resolveReviews,
  resolveReviewDecision,
  resolveThreads,
};

/** Production read-side composition over the GitHub host leaves. */
export class GitHubHostReadAdapter implements GitHostReadAdapter {
  protected readonly deps: GitHubHostReadDeps;
  protected readonly functions: GitHubHostReadFunctions;

  constructor(deps: GitHubHostReadDeps, functions: Partial<GitHubHostReadFunctions> = {}) {
    this.deps = deps;
    this.functions = { ...DEFAULT_FUNCTIONS, ...functions };
  }

  protected coordinates(hostRef: string): { owner: string; repo: string; number: number } {
    const coordinates = decodeHostRef(hostRef);
    if (
      coordinates === null
      || coordinates.owner !== this.deps.owner
      || coordinates.repo !== this.deps.repo
    ) {
      throw new GitHubHostReadError("host-ref-outside-pinned-scope");
    }
    return coordinates;
  }

  async resolveChangeRequest(hostRef: string): Promise<HostChangeRequestResolution> {
    this.coordinates(hostRef);
    const result = await this.functions.resolveChangeRequest({
      rest: this.deps.rest,
      exec: this.deps.exec,
      baseRemote: this.deps.baseRemote,
    }, hostRef);
    if (result.kind !== "resolved") throw new GitHubHostReadError(`change-request-${result.kind}`);
    return {
      changeRequest: result.changeRequest,
      context: {
        changedPaths: result.context.changedPaths.map((change) => {
          if (change.status !== "renamed") return { status: change.status, path: change.path };
          if (change.previousPath === undefined) throw new GitHubHostReadError("renamed-path-missing-previous-path");
          return { status: "renamed", path: change.path, previousPath: change.previousPath };
        }),
        author: {
          identity: result.context.author.identity,
          login: result.context.author.login,
        },
        isDraft: result.context.isDraft,
        isCrossRepository: result.context.isCrossRepository,
        mergeability: result.context.mergeability,
      },
    };
  }

  async resolveActorCapabilities(actor: ActorAddress) {
    const result = await this.functions.resolveActorCapabilities({
      rest: this.deps.rest,
      owner: this.deps.owner,
      repo: this.deps.repo,
      login: actor.login,
      expectedActorId: actor.expectedActorId,
    });
    if (result.kind !== "resolved") throw new GitHubHostReadError(`actor-${result.kind}`);
    return result.capabilities;
  }

  async observeNativeReview(input: NativeReviewReadInput): Promise<NativeReviewObservation> {
    const coordinates = this.coordinates(input.hostRef);
    const [reviews, decision, threads] = await Promise.all([
      this.functions.resolveReviews(this.deps.rest, coordinates),
      this.functions.resolveReviewDecision(this.deps.gql, coordinates),
      this.functions.resolveThreads(this.deps.gql, coordinates),
    ]);
    if (reviews.kind !== "ok") {
      throw new GitHubHostReadError(`native-reviews-${reviews.kind}`, readFailureDetail(reviews));
    }
    if (decision.kind !== "ok") {
      throw new GitHubHostReadError(`native-decision-${decision.kind}`, readFailureDetail(decision));
    }
    if (threads.kind !== "ok") {
      throw new GitHubHostReadError(`native-threads-${threads.kind}`, readFailureDetail(threads));
    }
    const reduced = reduceNativeReview({
      reviews: reviews.value,
      reviewDecision: decision.value,
      threads: threads.value,
      headSha: input.headSha,
      authorIdentity: input.authorIdentity,
      expectsNativeReview: input.expectsNativeReview,
      ...(input.nonClosingResolvers === undefined ? {} : { nonClosingResolvers: input.nonClosingResolvers }),
    });
    return {
      ...reduced,
      providerReviews: reviews.value.map((review) => ({
        reviewId: review.reviewId,
        actorIdentity: review.actor.identity,
        state: review.state,
        commitId: review.commitId,
        submittedAt: review.submittedAt,
        evidenceRef: review.url,
      })),
    };
  }
}

/** Full production GitHub host adapter, including guarded verdict publication. */
export class GitHubHostAdapter extends GitHubHostReadAdapter implements GitHostAdapter {
  private readonly checks: GitHubCheckRunApi;

  constructor(
    deps: GitHubHostReadDeps,
    checks: GitHubCheckRunApi,
    functions: Partial<GitHubHostReadFunctions> = {},
  ) {
    super(deps, functions);
    this.checks = checks;
  }

  private scopeFor(input: {
    hostRef: string;
    headSha: string;
    changeSetId: string;
    expectedAppId: string;
  }, contextName: string): CheckRunScope {
    const coordinates = this.coordinates(input.hostRef);
    return {
      owner: this.deps.owner,
      repo: this.deps.repo,
      pullNumber: coordinates.number,
      headSha: input.headSha,
      changeSetId: input.changeSetId,
      contextName,
      expectedAppId: input.expectedAppId,
    };
  }

  async publishVerdict(input: VerdictPublicationInput): Promise<HostProjectionRef[]> {
    const named = projectContexts(input.mode, input.projection);
    const results = await Promise.all(named.map(async ({ name, projection }) => publishGateCheck({
      api: this.checks,
      scope: this.scopeFor(input, name),
      projection,
      anchorReceiptCount: input.anchorReceiptCount,
      readCurrentState: input.readCurrentState,
    })));
    return results.map((result) => ({ opaqueRef: result.checkRun.htmlUrl }));
  }

  async confirmPendingProjection(input: PendingProjectionConfirmationInput): Promise<boolean> {
    if (input.projection.conclusion !== "pending") return false;
    const named = projectContexts(input.mode, input.projection);
    const confirmations = await Promise.all(named.map(({ name }) =>
      confirmPendingGateCheck(this.checks, this.scopeFor(input, name))));
    return confirmations.length > 0 && confirmations.every(Boolean);
  }
}
