/** In-process driver for the deterministic tail of one delivery review correction. */

import { canonicalize } from "../kernel/index.js";

export interface DeliveryReviewFixDriveProgress {
  readonly stateRevision: number | null;
  readonly operationId: string | null;
  readonly boundaryVersion: string | null;
  readonly relevantHeads: readonly string[];
}

export interface DeliveryReviewFixDriveDispatchAction {
  readonly kind:
    | "delivery-review-fix-authoring-rebind"
    | "delivery-review-fix-publish"
    | "delivery-rematerialize"
    | "delivery-refresh-execute"
    | "delivery-refresh-adopt"
    | "delivery-reconcile"
    | "delivery-review-fix-acknowledge"
    | "review-respond";
  readonly input?: unknown;
}

export type DeliveryReviewFixDriveStep<TAction extends DeliveryReviewFixDriveDispatchAction> =
  | {
      readonly status: "dispatch";
      readonly action: TAction;
      readonly recommendedActionText: string;
    }
  | {
      readonly status: "boundary-carry-required";
      readonly planId: string;
      readonly stateRevision: number;
      readonly recommendedActionText?: string;
    }
  | ({ readonly status: Exclude<string, "dispatch"> } & Readonly<Record<string, unknown>>);

/** Narrow a projected result to the one machine-dispatchable arm. */
export function isDeliveryReviewFixDispatchStep<TAction extends DeliveryReviewFixDriveDispatchAction>(
  step: DeliveryReviewFixDriveStep<TAction>,
): step is Extract<DeliveryReviewFixDriveStep<TAction>, { readonly status: "dispatch" }> {
  return step.status === "dispatch"
    && "action" in step
    && typeof step.action === "object"
    && step.action !== null
    && "kind" in step.action;
}

function isDeliveryReviewFixBoundaryCarryStep<TAction extends DeliveryReviewFixDriveDispatchAction>(
  step: DeliveryReviewFixDriveStep<TAction>,
): step is Extract<DeliveryReviewFixDriveStep<TAction>, {
  readonly status: "boundary-carry-required";
  readonly planId: string;
  readonly stateRevision: number;
}> {
  return step.status === "boundary-carry-required"
    && "planId" in step && typeof step.planId === "string"
    && "stateRevision" in step && typeof step.stateRevision === "number";
}

export type DeliveryReviewFixDriveEffect =
  | {
      readonly kind: "dispatch" | "no-op-replay";
      readonly actionKind: DeliveryReviewFixDriveDispatchAction["kind"];
      readonly resultStatus: string;
    }
  | {
      readonly kind: "boundary-carry";
      readonly path: string;
      readonly candidateId: string;
      readonly stateRevision: number;
    }
  | {
      readonly kind: "commit";
      readonly recordClass: string;
      readonly head: string;
      readonly replayed?: true;
    }
  | {
      readonly kind: "push";
      readonly ref: string;
      readonly beforeHead: string | null;
      readonly afterHead: string;
    };

export interface DeliveryReviewFixDrivePorts<TAction extends DeliveryReviewFixDriveDispatchAction> {
  project(): Promise<{
    readonly step: DeliveryReviewFixDriveStep<TAction>;
    readonly progress: DeliveryReviewFixDriveProgress;
  }>;
  execute(action: TAction): Promise<
    { readonly status: string; readonly replayed?: boolean } & Readonly<Record<string, unknown>>
  >;
  carryBoundary?(input: { readonly planId: string; readonly stateRevision: number }): Promise<
    | {
        readonly status: "carried";
        readonly path: string;
        readonly candidateId: string;
        readonly stateRevision: number;
      }
    | { readonly status: "refused"; readonly reason: string }
  >;
  settleRecordEffects?(): Promise<
    | { readonly status: "idle" | "settled"; readonly effects: readonly DeliveryReviewFixDriveEffect[] }
    | { readonly status: "refused"; readonly reason: string; readonly diagnostics?: readonly string[] }
  >;
}

const successfulResultStatuses: Readonly<Record<
  DeliveryReviewFixDriveDispatchAction["kind"],
  readonly string[]
>> = {
  "delivery-review-fix-authoring-rebind": ["rebound", "already-rebound"],
  "delivery-review-fix-publish": ["published"],
  "delivery-rematerialize": ["rematerialized"],
  "delivery-refresh-execute": ["applied"],
  "delivery-refresh-adopt": ["applied"],
  "delivery-reconcile": ["position", "rebound", "applied"],
  "delivery-review-fix-acknowledge": ["acknowledged", "already-acknowledged"],
  "review-respond": ["ready-to-fix"],
};

function deliveryReviewFixConflictStop(
  action: DeliveryReviewFixDriveDispatchAction,
  result: Readonly<Record<string, unknown>>,
  effectLog: readonly DeliveryReviewFixDriveEffect[],
): Readonly<Record<string, unknown>> | null {
  if (result.status !== "blocked" || result.reason !== "content-conflict"
    || !Array.isArray(result.paths) || !result.paths.every((path) => typeof path === "string")
    || typeof result.conflictPreparation !== "object" || result.conflictPreparation === null
    || typeof action.input !== "object" || action.input === null) {
    return null;
  }
  const actionInput = action.input as Readonly<Record<string, unknown>>;
  if (typeof actionInput.repository !== "string" || typeof actionInput.remote !== "string") return null;
  const preparation = result.conflictPreparation as Readonly<Record<string, unknown>>;
  const workspace = typeof preparation.workspace === "object" && preparation.workspace !== null
    ? preparation.workspace as Readonly<Record<string, unknown>>
    : null;
  const resolutionLocus = typeof workspace?.path === "string"
    ? "conflictPreparation.workspace"
    : "conflictPreparation.topRef";
  return {
    status: "conflict-required",
    stopKind: "conflict",
    paths: result.paths,
    conflictPreparation: result.conflictPreparation,
    resumeAction: {
      argv: ["arc", "delivery", "review-fix", "continue", "-", "--json"],
      input: { repository: actionInput.repository, remote: actionInput.remote },
    },
    effectLog,
    recommendedActionText:
      `Resolve the reported paths in ${resolutionLocus}, record the exact prepared two-parent `
      + "merge there without pushing it, then submit the returned correction resume unchanged.",
  };
}

export type DeliveryReviewFixReviewStatusStop =
  | "finding-disposition"
  | "review-spend"
  | "external-wait"
  | "blocked"
  | "integration";

/** Classify a composed review-status continuation at the correction driver's attended boundary. */
export function classifyDeliveryReviewFixReviewStatusStop(
  nextAction: string,
): DeliveryReviewFixReviewStatusStop {
  switch (nextAction) {
    case "respond-to-findings":
      return "finding-disposition";
    case "run-review":
    case "review-hosted-request":
    case "review-local-prepare":
    case "review-local-resume":
    case "resolve-review-applicability":
    case "obtain-ceiling-override":
      return "review-spend";
    case "rerun-checkpoint":
      return "external-wait";
    case "continue-reconcile":
      return "integration";
    default:
      return "blocked";
  }
}

/**
 * Drive deterministic correction actions until the projector returns an attended stop.
 *
 * @param ports - Projector and in-process action executor for the current correction.
 * @returns The attended stop with ordered effect disclosure.
 */
export async function driveDeliveryReviewFixContinuation<
  TAction extends DeliveryReviewFixDriveDispatchAction,
>(ports: DeliveryReviewFixDrivePorts<TAction>): Promise<Readonly<Record<string, unknown>>> {
  const effectLog: DeliveryReviewFixDriveEffect[] = [];
  const visited = new Set<string>();
  for (;;) {
    if (ports.settleRecordEffects !== undefined) {
      const settlement = await ports.settleRecordEffects();
      if (settlement.status === "refused") {
        return {
          status: "effect-stopped",
          reason: "delivery-review-fix-effect-stopped",
          actionKind: "record-settlement",
          result: settlement,
          effectLog,
          recommendedActionText:
            "The machine-owned correction record effects did not settle. Inspect the captured diagnostics before retrying.",
        };
      }
      effectLog.push(...settlement.effects);
      if (settlement.status === "settled") continue;
    }
    const projected = await ports.project();
    if (isDeliveryReviewFixBoundaryCarryStep(projected.step)) {
      const fingerprint = canonicalize({
        action: {
          kind: "boundary-carry",
          planId: projected.step.planId,
          stateRevision: projected.step.stateRevision,
        },
        progress: projected.progress,
      });
      if (visited.has(fingerprint)) {
        return {
          status: "refused",
          reason: "delivery-review-fix-no-progress",
          actionKind: "boundary-carry",
          progress: projected.progress,
          effectLog,
          recommendedActionText:
            "The correction returned the same boundary carry at the same canonical position. "
            + "Inspect the retained public boundary before retrying.",
        };
      }
      visited.add(fingerprint);
      if (ports.carryBoundary === undefined) {
        return {
          status: "effect-stopped",
          reason: "delivery-review-fix-effect-stopped",
          actionKind: "boundary-carry",
          result: { status: "refused", reason: "boundary-carry-unavailable" },
          effectLog,
          recommendedActionText: "Restore the same-Candidate boundary carry port before retrying.",
        };
      }
      const carried = await ports.carryBoundary({
        planId: projected.step.planId,
        stateRevision: projected.step.stateRevision,
      });
      if (carried.status === "refused") {
        return {
          status: "effect-stopped",
          reason: "delivery-review-fix-effect-stopped",
          actionKind: "boundary-carry",
          result: carried,
          effectLog,
          recommendedActionText:
            "The same-Candidate boundary could not be carried. Inspect the typed refusal before retrying.",
        };
      }
      effectLog.push({
        kind: "boundary-carry",
        path: carried.path,
        candidateId: carried.candidateId,
        stateRevision: carried.stateRevision,
      });
      continue;
    }
    if (!isDeliveryReviewFixDispatchStep(projected.step)) {
      return { ...projected.step, effectLog };
    }
    const fingerprint = canonicalize({
      action: projected.step.action,
      progress: projected.progress,
    });
    if (visited.has(fingerprint)) {
      return {
        status: "refused",
        reason: "delivery-review-fix-no-progress",
        actionKind: projected.step.action.kind,
        progress: projected.progress,
        effectLog,
        recommendedActionText:
          "The correction returned the same action at the same canonical position. "
          + "Inspect the retained operation before retrying.",
      };
    }
    visited.add(fingerprint);
    const result = await ports.execute(projected.step.action);
    effectLog.push({
      kind: result.replayed === true ? "no-op-replay" : "dispatch",
      actionKind: projected.step.action.kind,
      resultStatus: result.status,
    });
    const boundaryCarry = result.boundaryCarry;
    if (typeof boundaryCarry === "object" && boundaryCarry !== null
      && "path" in boundaryCarry && typeof boundaryCarry.path === "string"
      && "candidateId" in boundaryCarry && typeof boundaryCarry.candidateId === "string"
      && "stateRevision" in boundaryCarry && typeof boundaryCarry.stateRevision === "number") {
      effectLog.push({
        kind: "boundary-carry",
        path: boundaryCarry.path,
        candidateId: boundaryCarry.candidateId,
        stateRevision: boundaryCarry.stateRevision,
      });
    }
    const conflict = deliveryReviewFixConflictStop(projected.step.action, result, effectLog);
    if (conflict !== null) return conflict;
    if (!successfulResultStatuses[projected.step.action.kind].includes(result.status)) {
      return {
        status: "effect-stopped",
        reason: "delivery-review-fix-effect-stopped",
        actionKind: projected.step.action.kind,
        result,
        effectLog,
        recommendedActionText:
          "The deterministic correction effect did not reach its expected postcondition. "
          + "Inspect the returned typed result before retrying.",
      };
    }
  }
}
