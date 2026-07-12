/** Typed controller next-state and terminal states exposed to repository launchers. */

import type { GateProjection, ReviewRequest } from "./execution.js";
import { computeRequestKey } from "./request-key.js";
import { digestAt, enumAt, exactKeys, integerAt, objectAt, schemaOneAt, stringAt } from "./validation.js";

interface ControllerScope {
  schemaVersion: 1;
  repositoryId: string;
  changeRequestId: string;
  headSha: string;
}

/** One developer-authenticated provider trigger ready for exact consumption. */
export interface NeedsUserTriggerAction extends ControllerScope {
  kind: "needs-user-trigger";
  requestKey: string;
  providerIdentity: string;
  generation: number;
  command: string;
  requiredActorIdentity: string;
}

/** Current controller state requires coordination rather than transport work. */
export interface AttentionAction extends ControllerScope {
  kind: "attention";
  summary: string;
}

/** Current controller state is still pending without an actor-owned trigger. */
export interface WaitingAction extends ControllerScope {
  kind: "waiting";
  summary: string;
}

/** Current controller state is terminally successful for this head. */
export interface TerminalAction extends ControllerScope {
  kind: "terminal";
  conclusion: "success";
}

/** Closed next-action result returned by the neutral reducer. */
export type ReviewGateAction = NeedsUserTriggerAction | AttentionAction | WaitingAction | TerminalAction;

/** Derive one typed action from the admitted request and current projection. */
export function deriveReviewGateAction(input: {
  repositoryId: string;
  changeRequestId: string;
  headSha: string;
  request: ReviewRequest | null;
  projection: GateProjection;
}): ReviewGateAction {
  const scope: ControllerScope = {
    schemaVersion: 1,
    repositoryId: input.repositoryId,
    changeRequestId: input.changeRequestId,
    headSha: input.headSha,
  };
  if (input.request?.requestMechanism === "user-trigger") {
    if (input.request.requestCommand === null) throw new Error("user-trigger request is missing its command");
    return {
      ...scope,
      kind: "needs-user-trigger",
      requestKey: computeRequestKey(input.request),
      providerIdentity: input.request.sourceIdentity,
      generation: input.request.generation,
      command: input.request.requestCommand,
      requiredActorIdentity: input.request.requiredActorIdentity,
    };
  }
  if (input.projection.conclusion === "success") return { ...scope, kind: "terminal", conclusion: "success" };
  if (input.projection.conclusion === "failure") return { ...scope, kind: "attention", summary: input.projection.summary };
  return { ...scope, kind: "waiting", summary: input.projection.summary };
}

/** Parse an exact next-action JSON contract without inferring from prose. */
export function parseReviewGateAction(input: unknown): ReviewGateAction {
  const record = objectAt(input, "action");
  const kind = enumAt(record.kind, ["needs-user-trigger", "attention", "waiting", "terminal"], "action.kind");
  const scope = {
    schemaVersion: schemaOneAt(record.schemaVersion, "action.schemaVersion"),
    repositoryId: stringAt(record.repositoryId, "action.repositoryId"),
    changeRequestId: stringAt(record.changeRequestId, "action.changeRequestId"),
    headSha: digestAt(record.headSha, "action.headSha", 40),
  };
  if (kind === "needs-user-trigger") {
    exactKeys(record, [
      "schemaVersion", "kind", "repositoryId", "changeRequestId", "headSha", "requestKey", "providerIdentity",
      "generation", "command", "requiredActorIdentity",
    ], "action");
    return {
      ...scope,
      kind,
      requestKey: digestAt(record.requestKey, "action.requestKey"),
      providerIdentity: stringAt(record.providerIdentity, "action.providerIdentity"),
      generation: integerAt(record.generation, "action.generation"),
      command: stringAt(record.command, "action.command"),
      requiredActorIdentity: stringAt(record.requiredActorIdentity, "action.requiredActorIdentity"),
    };
  }
  if (kind === "terminal") {
    exactKeys(record, [
      "schemaVersion", "kind", "repositoryId", "changeRequestId", "headSha", "conclusion",
    ], "action");
    return { ...scope, kind, conclusion: enumAt(record.conclusion, ["success"], "action.conclusion") };
  }
  exactKeys(record, ["schemaVersion", "kind", "repositoryId", "changeRequestId", "headSha", "summary"], "action");
  return { ...scope, kind, summary: stringAt(record.summary, "action.summary") };
}
