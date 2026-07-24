/** Deterministic terminal-settlement gating over approved dispositions and channel authority. */

import { z } from "zod";

import { canonicalDigest, canonicalize, type KernelRegistry } from "../../../lib/kernel/index.js";
import type { NativeReviewState } from "./requirements.js";
import {
  FindingConversationClosureV2Schema,
  FindingSettlementV2Schema,
  LocalDispositionTerminalV2Schema,
  NormalizedReviewFindingSchema,
  ProviderNativeConversationClosureV2Schema,
  type FindingConversationClosureV2,
  type FindingSettlementV2,
  type LocalDispositionTerminalV2,
  type NormalizedReviewFinding,
  type ProviderNativeConversationClosureV2,
} from "./finding-records.js";
import type { ApprovedDispositionSet } from "./disposition-records.js";
import { validateDispositionState } from "./dispositions.js";
import {
  SeverityGatingPolicySchema,
  registerSeverityGatingPolicySchema,
  resolveFindingGating,
  type SeverityGatingPolicy,
} from "./severity-gating-policy.js";

export {
  PACKAGE_DEFAULT_SEVERITY_GATING_POLICY,
  resolveFindingGating,
  type SeverityGatingPolicy,
} from "./severity-gating-policy.js";

const FindingIdSchema = z.string().trim().min(1).max(512);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u);
const NativeReviewStateSchema = z.strictObject({
  requestedChanges: z.boolean(),
  unresolvedRequiredConversations: z.number().int().nonnegative(),
});

export const FindingConversationRequirementSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("controller-finding"),
    findingId: FindingIdSchema,
    sourceIdentity: IdentifierSchema,
  }),
  z.strictObject({
    kind: z.literal("provider-native"),
    findingId: FindingIdSchema,
    providerIdentity: IdentifierSchema,
    conversationId: IdentifierSchema,
    decisiveReviewId: IdentifierSchema,
  }),
]);
export type FindingConversationRequirement = z.infer<typeof FindingConversationRequirementSchema>;

export const SeveritySettlementGateResultSchema = z.strictObject({
  schemaVersion: z.literal(2),
  semanticsVersion: z.literal("review-gate/v2"),
  terminalSettlementAllowed: z.boolean(),
  blockingFindingIds: z.array(FindingIdSchema),
  recordOnlyFindingIds: z.array(FindingIdSchema),
  blockers: z.array(z.string().trim().min(1)),
  promptForAnotherRound: z.boolean(),
});
export type SeveritySettlementGateResult = z.infer<typeof SeveritySettlementGateResultSchema>;

export interface ReduceSeveritySettlementGateInput {
  channel: "local" | "hosted";
  policy: SeverityGatingPolicy;
  dispositionState: ApprovedDispositionSet;
  settlements: FindingSettlementV2[];
  recurrences: NormalizedReviewFinding[];
  localTerminal: LocalDispositionTerminalV2 | null;
  conversationRequirements: FindingConversationRequirement[];
  controllerClosures: FindingConversationClosureV2[];
  providerClosures: ProviderNativeConversationClosureV2[];
  nativeReview: NativeReviewState;
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function settlementMatches(
  state: ApprovedDispositionSet,
  settlement: FindingSettlementV2,
): boolean {
  const item = state.dispositionSet.findings.find((candidate) => candidate.findingId === settlement.findingId);
  return item !== undefined
    && settlement.targetId === state.dispositionSet.targetId
    && settlement.dispositionSetId === state.dispositionSet.dispositionSetId
    && canonicalize(settlement.approval) === canonicalize(state.approval)
    && settlement.sourceIdentity === item.sourceIdentity
    && settlement.severity === item.severity
    && settlement.nit === item.nit
    && settlement.disposition === item.disposition
    && settlement.rationale === item.rationale;
}

function localTerminalMatches(
  state: ApprovedDispositionSet,
  terminal: LocalDispositionTerminalV2 | null,
): boolean {
  return terminal !== null
    && terminal.targetId === state.dispositionSet.targetId
    && terminal.dispositionSetId === state.dispositionSet.dispositionSetId
    && canonicalize(terminal.approval) === canonicalize(state.approval);
}

/** Reduce ARC severity policy without weakening native review or conversation authority. */
export function reduceSeveritySettlementGate(input: ReduceSeveritySettlementGateInput): SeveritySettlementGateResult {
  const policy = SeverityGatingPolicySchema.parse(input.policy);
  const state = validateDispositionState(input.dispositionState);
  if (state.state !== "approved") throw new Error("severity gating requires approved dispositions");
  const settlements = input.settlements.map((item) => FindingSettlementV2Schema.parse(item));
  const recurrences = input.recurrences.map((item) => NormalizedReviewFindingSchema.parse(item));
  const localTerminal = input.localTerminal === null ? null : LocalDispositionTerminalV2Schema.parse(input.localTerminal);
  const requirements = input.conversationRequirements.map((item) => FindingConversationRequirementSchema.parse(item));
  const controllerClosures = input.controllerClosures.map((item) => FindingConversationClosureV2Schema.parse(item));
  const providerClosures = input.providerClosures.map((item) => ProviderNativeConversationClosureV2Schema.parse(item));
  const nativeReview = NativeReviewStateSchema.parse(input.nativeReview);
  const knownFindingIds = new Set(state.dispositionSet.findings.map((item) => item.findingId));
  if (requirements.some((item) => !knownFindingIds.has(item.findingId))) {
    throw new Error("conversation requirement names an unknown disposition finding");
  }
  if (new Set(requirements.map((item) => item.findingId)).size !== requirements.length) {
    throw new Error("duplicate conversation requirement finding");
  }
  if (input.channel === "local" && (requirements.length > 0
    || controllerClosures.length > 0 || providerClosures.length > 0)) {
    throw new Error("local severity gating has no conversation authority surface");
  }
  if (input.channel === "hosted" && localTerminal !== null) {
    throw new Error("hosted severity gating cannot consume a local terminal record");
  }

  const recordOnlyFindingIds = new Set<string>();
  const blockingFindingIds = new Set<string>();
  const blockers = new Set<string>();
  const blockingRecurrences = new Set(recurrences.flatMap((item) =>
    item.recursFindingId === undefined ? [] : [item.recursFindingId]));
  const validSettlements = settlements.filter((settlement) => settlementMatches(state, settlement));
  const localRecorded = input.channel === "local" && localTerminalMatches(state, localTerminal);

  for (const item of state.dispositionSet.findings) {
    const gating = resolveFindingGating(item, policy);
    if (item.gating !== gating) throw new Error(`non-deterministic finding gating: ${item.findingId}`);
    if (gating === "record-only") recordOnlyFindingIds.add(item.findingId);
    const recurred = blockingRecurrences.has(item.findingId);
    const fixSettled = item.disposition !== "fix"
      || validSettlements.some((settlement) => settlement.findingId === item.findingId);
    const arcUnresolved = recurred || !fixSettled || (input.channel === "local" && !localRecorded);
    if (gating === "blocking" && arcUnresolved) blockingFindingIds.add(item.findingId);
    if (!fixSettled) blockers.add(`fix:${item.findingId}:unsettled`);
  }

  if (input.channel === "local" && !localRecorded) blockers.add("local-disposition-report:missing");

  for (const requirement of requirements) {
    const settlement = validSettlements.find((item) => item.findingId === requirement.findingId);
    const closed = requirement.kind === "controller-finding"
      ? settlement !== undefined && controllerClosures.some((closure) =>
          closure.targetId === settlement.targetId
          && closure.findingId === requirement.findingId
          && closure.sourceIdentity === requirement.sourceIdentity
          && closure.settlementId === canonicalDigest(settlement))
      : providerClosures.some((closure) =>
        closure.targetId === state.dispositionSet.targetId
        && closure.providerIdentity === requirement.providerIdentity
        && closure.conversationId === requirement.conversationId
        && closure.decisiveReviewId === requirement.decisiveReviewId);
    if (!closed) blockers.add(`conversation:${requirement.findingId}:unresolved`);
  }

  if (nativeReview.requestedChanges) blockers.add("native-requested-changes");
  if (nativeReview.unresolvedRequiredConversations > 0) {
    blockers.add("unresolved-required-conversations");
  }
  for (const findingId of blockingFindingIds) blockers.add(`finding:${findingId}:unresolved`);

  const resultBlockers = sorted(blockers);
  return SeveritySettlementGateResultSchema.parse({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    terminalSettlementAllowed: resultBlockers.length === 0,
    blockingFindingIds: sorted(blockingFindingIds),
    recordOnlyFindingIds: sorted(recordOnlyFindingIds),
    blockers: resultBlockers,
    promptForAnotherRound: [...blockingFindingIds].some((findingId) => blockingRecurrences.has(findingId)),
  });
}

/** Register severity-policy, conversation-requirement, and terminal-gate records. */
export function registerSeverityGatingSchemas(registry: KernelRegistry): KernelRegistry {
  registerSeverityGatingPolicySchema(registry);
  registry.register(FindingConversationRequirementSchema, {
    id: "finding-conversation-requirement",
    version: 1,
    migrationPosture: "strict-current",
  });
  registry.register(SeveritySettlementGateResultSchema, {
    id: "severity-settlement-gate-result",
    version: 2,
    migrationPosture: "strict-current",
  });
  return registry;
}
