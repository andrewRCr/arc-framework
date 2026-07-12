/** Receipt-backed finding settlement and live actor selection. */

import { meetsMinimumPermission, type CapabilitySet } from "./contracts.js";
import type { Evidence, ReviewFinding } from "./evidence.js";
import type { ReviewReceipt } from "./execution.js";
import type { ConversationResolvedPayload, FindingDispositionPayload } from "./receipt-payload.js";

export interface ActorAddress { login: string; expectedActorId: string }

/** Select the PR author only with freshly observed maintain authority; otherwise use the pinned fallback. */
export async function resolveSettlementActor(input: {
  prAuthor: ActorAddress;
  fallbackMaintainer: ActorAddress;
  resolveCapabilities(actor: ActorAddress): Promise<CapabilitySet>;
}): Promise<ActorAddress> {
  for (const actor of [input.prAuthor, input.fallbackMaintainer]) {
    const capabilities = await input.resolveCapabilities(actor);
    if (capabilities.actorIdentity === actor.expectedActorId
      && capabilities.permissions.some((permission) => meetsMinimumPermission(permission, "maintain"))) return actor;
  }
  throw new Error("settlement-actor-unavailable");
}

interface SourceFinding extends ReviewFinding {
  sourceIdentity: string;
  originHeadSha: string;
}

export interface FindingSettlementReduction {
  openFindings: SourceFinding[];
  errors: string[];
}

function key(sourceIdentity: string, findingId: string): string {
  return `${sourceIdentity}\0${findingId}`;
}

function disposition(receipt: ReviewReceipt): FindingDispositionPayload | null {
  return receipt.payload.kind === "finding-disposition" ? receipt.payload : null;
}

function resolution(receipt: ReviewReceipt): ConversationResolvedPayload | null {
  return receipt.payload.kind === "conversation-resolved" ? receipt.payload : null;
}

/** Reduce only sequenced source or policy authority; host resolution by itself never closes a finding. */
export function reduceFindingSettlements(input: {
  evidence: Evidence[];
  receipts: ReviewReceipt[];
  currentHeadSha: string;
  ciState: "pending" | "failure" | "success";
  authorizedActorIdentity: string;
  qualifiedClosureSources: string[];
}): FindingSettlementReduction {
  const findings = new Map<string, SourceFinding>();
  const errors: string[] = [];
  for (const item of input.evidence) {
    for (const finding of item.findings) {
      const identity = key(item.sourceIdentity, finding.findingId);
      if (!findings.has(identity)) {
        findings.set(identity, { ...finding, sourceIdentity: item.sourceIdentity, originHeadSha: item.headSha });
      }
    }
  }

  const closed = new Set<string>();
  for (const [identity, finding] of findings) {
    const dispositions = input.receipts.flatMap((receipt, index) => {
      const payload = disposition(receipt);
      return payload?.sourceIdentity === finding.sourceIdentity && payload.findingId === finding.findingId
        ? [{ receipt, payload, index }]
        : [];
    });
    const bareResolutions = input.receipts.flatMap((receipt, index) => {
      const payload = resolution(receipt);
      return payload?.sourceIdentity === finding.sourceIdentity && payload.findingId === finding.findingId
        ? [{ receipt, payload, index }]
        : [];
    });
    if (dispositions.length === 0 && bareResolutions.length > 0) errors.push(`bare-resolution:${finding.findingId}`);

    for (const candidate of dispositions) {
      const { payload, receipt } = candidate;
      if (payload.oldHeadSha !== finding.originHeadSha) {
        errors.push(`settlement-origin-mismatch:${finding.findingId}`);
        continue;
      }
      if (payload.disposition === "provider-closed") {
        const sourceClosure = input.evidence.some((item) => item.sourceIdentity === finding.sourceIdentity
          && item.closures.some((itemClosure) => itemClosure.findingId === finding.findingId
            && itemClosure.authorityKind === "source-confirmed"
            && itemClosure.authorityIdentity === finding.sourceIdentity
            && itemClosure.evidenceUrlOrId === payload.followUpEvidenceRef));
        if (!input.qualifiedClosureSources.includes(finding.sourceIdentity) || !sourceClosure) {
          errors.push(`invalid-provider-closure:${finding.findingId}`);
          continue;
        }
        closed.add(identity);
        break;
      }

      if (payload.actorIdentity !== input.authorizedActorIdentity) {
        errors.push(`invalid-settlement-actor:${finding.findingId}`);
      }
      const matchingResolution = bareResolutions.find((item) => item.payload.dispositionReceiptHash === receipt.receiptHash);
      if (matchingResolution !== undefined && matchingResolution.index < candidate.index) {
        errors.push(`resolution-before-disposition:${finding.findingId}`);
      }
      const resolvedAfter = matchingResolution !== undefined
        && matchingResolution.index > candidate.index
        && matchingResolution.payload.headSha === input.currentHeadSha
        && matchingResolution.payload.resolvedByActorIdentity === input.authorizedActorIdentity;
      if (!resolvedAfter) errors.push(`missing-conversation-resolution:${finding.findingId}`);

      if (payload.disposition === "fixed") {
        const followUp = input.evidence.find((item) => item.sourceIdentity === finding.sourceIdentity
          && item.headSha === input.currentHeadSha
          && item.coverageThroughSha === input.currentHeadSha
          && item.coverage === "full"
          && item.evidenceUrlOrId === payload.followUpEvidenceRef);
        const recurred = input.evidence.some((item) => item.sourceIdentity === finding.sourceIdentity
          && item.headSha === input.currentHeadSha
          && item.findings.some((itemFinding) => itemFinding.recursFindingId === finding.findingId));
        if (recurred) errors.push(`finding-recurred:${finding.findingId}`);
        if (payload.fixHeadSha !== input.currentHeadSha || input.ciState !== "success" || followUp === undefined) {
          errors.push(`incomplete-fixed-proof:${finding.findingId}`);
        }
        if (payload.actorIdentity === input.authorizedActorIdentity && resolvedAfter && !recurred
          && payload.fixHeadSha === input.currentHeadSha && input.ciState === "success" && followUp !== undefined) {
          closed.add(identity);
          break;
        }
      } else if (input.currentHeadSha !== payload.oldHeadSha) {
        errors.push(`nonfix-head-changed:${finding.findingId}`);
      } else if (payload.actorIdentity === input.authorizedActorIdentity && resolvedAfter) {
        closed.add(identity);
        break;
      }
    }
  }

  for (const receipt of input.receipts) {
    const payload = disposition(receipt);
    if (payload !== null && !findings.has(key(payload.sourceIdentity, payload.findingId))) {
      errors.push(`foreign-settlement-finding:${payload.findingId}`);
    }
  }
  return { openFindings: [...findings.entries()].filter(([identity]) => !closed.has(identity)).map(([, item]) => item), errors };
}
