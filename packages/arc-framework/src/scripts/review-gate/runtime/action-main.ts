/** Dependency-injectable next-action and developer-authenticated action operations. */

import {
  parseReviewGateAction,
  type NeedsUserTriggerAction,
  type ReviewGateAction,
} from "../core/next-action.js";
import type { ReconcileRuntime } from "./reconcile.js";

/** Exact scope supplied by a repository launcher. */
export interface ActionScopeInput {
  repositoryId: string;
  changeRequestId: string;
  headSha: string;
}

/** Read-side boundary that re-reduces authenticated controller state. */
export interface NextActionReader {
  read(scope: ActionScopeInput): Promise<ReviewGateAction>;
}

function waitingFor(action: NeedsUserTriggerAction, summary: string): ReviewGateAction {
  return {
    schemaVersion: 1,
    kind: "waiting",
    repositoryId: action.repositoryId,
    changeRequestId: action.changeRequestId,
    headSha: action.headSha,
    summary,
  };
}

/** Read-only adapter over the canonical reconcile runtime. */
export class ReconcileNextActionReader implements NextActionReader {
  private readonly runtime: ReconcileRuntime;
  private readonly now: () => Date;

  constructor(runtime: ReconcileRuntime, now: () => Date) {
    this.runtime = runtime;
    this.now = now;
  }

  async read(scope: ActionScopeInput): Promise<ReviewGateAction> {
    const state = await this.runtime.read();
    if (String(state.repositoryId) !== scope.repositoryId || state.headSha !== scope.headSha) {
      throw new Error("next-action: canonical state moved");
    }
    const decision = await this.runtime.reduce(state, this.now());
    if (decision.action === undefined) throw new Error("next-action: runtime did not expose a typed action");
    if (decision.action.kind === "needs-user-trigger") {
      if (decision.request === null || decision.reservationEnvelope === null || decision.reservationEnvelope === undefined) {
        return waitingFor(decision.action, "request reservation is not yet projected");
      }
      const confirmed = await this.runtime.confirmPending(
        decision.request,
        decision.reservationEnvelope,
        decision.projection,
      );
      if (!confirmed) return waitingFor(decision.action, "pending projection is not confirmed");
    }
    return decision.action;
  }
}

/** Resolve one exact typed action for the caller's expected scope. */
export async function runNextAction(
  input: ActionScopeInput,
  reader: NextActionReader,
): Promise<ReviewGateAction> {
  const action = parseReviewGateAction(await reader.read(input));
  if (
    action.repositoryId !== input.repositoryId
    || action.changeRequestId !== input.changeRequestId
    || action.headSha !== input.headSha
  ) throw new Error("next-action: canonical scope changed");
  return action;
}

/** Exact host comment retained for ambiguous-write adoption. */
export interface ActionComment {
  commentId: string;
  actorIdentity: string;
  body: string;
  createdAt: string;
}

/** Developer-authenticated host/process boundary. */
export interface DeveloperActionPort {
  currentActorIdentity(): Promise<string>;
  postComment(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    body: string;
  }): Promise<{ kind: "created"; comment: ActionComment } | { kind: "ambiguous" }>;
  findComments(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    actorIdentity: string;
    body: string;
    notBefore: string;
  }): Promise<ActionComment[]>;
  dispatchReconcile(input: { repositoryRef: string; pullRequestNumber: number; headSha: string }): Promise<void>;
}

/** Exact action identity supplied to the perform-action launcher. */
export interface PerformActionInput extends ActionScopeInput {
  repositoryRef: string;
  pullRequestNumber: number;
  requestKey: string;
  generation: number;
}

/** Stable result proving which comment was posted or adopted. */
export interface PerformActionResult {
  schemaVersion: 1;
  status: "posted" | "adopted";
  commentId: string;
  requestKey: string;
  generation: number;
}

function matchesInput(action: NeedsUserTriggerAction, input: PerformActionInput): boolean {
  return action.repositoryId === input.repositoryId
    && action.changeRequestId === input.changeRequestId
    && action.headSha === input.headSha
    && action.requestKey === input.requestKey
    && action.generation === input.generation;
}

/** Revalidate and consume one current actor-bound trigger without blind replay. */
export async function runPerformAction(input: PerformActionInput, deps: {
  reader: NextActionReader;
  port: DeveloperActionPort;
  now: () => Date;
}): Promise<PerformActionResult> {
  const action = await runNextAction(input, deps.reader);
  if (action.kind !== "needs-user-trigger" || !matchesInput(action, input)) {
    throw new Error("perform-action: action is stale or no longer triggerable");
  }
  const actorIdentity = await deps.port.currentActorIdentity();
  if (actorIdentity !== action.requiredActorIdentity) throw new Error("perform-action: actor mismatch");

  const notBefore = deps.now().toISOString();
  const write = await deps.port.postComment({
    repositoryRef: input.repositoryRef,
    pullRequestNumber: input.pullRequestNumber,
    body: action.command,
  });
  let comment: ActionComment;
  let status: PerformActionResult["status"];
  if (write.kind === "created") {
    comment = write.comment;
    status = "posted";
  } else {
    const matches = await deps.port.findComments({
      repositoryRef: input.repositoryRef,
      pullRequestNumber: input.pullRequestNumber,
      actorIdentity,
      body: action.command,
      notBefore,
    });
    if (matches.length !== 1) throw new Error("perform-action: ambiguous post could not be adopted exactly");
    const adopted = matches[0];
    if (adopted === undefined) throw new Error("perform-action: adopted comment disappeared");
    comment = adopted;
    status = "adopted";
  }
  if (
    comment.actorIdentity !== actorIdentity
    || comment.body !== action.command
    || (status === "adopted" && comment.createdAt < notBefore)
  ) {
    throw new Error("perform-action: comment identity mismatch");
  }
  await deps.port.dispatchReconcile({
    repositoryRef: input.repositoryRef,
    pullRequestNumber: input.pullRequestNumber,
    headSha: input.headSha,
  });
  return { schemaVersion: 1, status, commentId: comment.commentId, requestKey: input.requestKey, generation: input.generation };
}
