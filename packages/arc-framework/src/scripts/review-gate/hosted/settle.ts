/** Direct reply and review-thread settlement contract for hosted findings. */

import { z } from "zod";

import { HostedTargetSchema, type HostedTarget } from "./request.js";

const HostedSettleDispositionSchema = z.enum(["fix", "defer", "reject"]);

export const HostedSettleEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  response: z.strictObject({
    attemptRef: z.string().trim().min(1),
    dispositionSetId: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    findingId: z.string().trim().min(1),
  }),
  target: HostedTargetSchema,
  fixTarget: HostedTargetSchema.nullable(),
  actorIdentity: z.string().min(1),
  finding: z.strictObject({
    commentId: z.string().min(1),
    threadId: z.string().min(1),
  }),
  disposition: HostedSettleDispositionSchema,
  reply: z.string().min(1),
}).superRefine((request, context) => {
  if (request.disposition !== "fix") {
    if (request.fixTarget !== null) {
      context.addIssue({
        code: "custom",
        path: ["fixTarget"],
        message: "fixTarget must be null unless disposition is fix",
      });
    }
    return;
  }

  if (request.fixTarget === null) {
    context.addIssue({
      code: "custom",
      path: ["fixTarget"],
      message: "fixTarget is required when disposition is fix",
    });
    return;
  }
  if (
    request.fixTarget.repository !== request.target.repository
    || request.fixTarget.pullRequest !== request.target.pullRequest
  ) {
    context.addIssue({
      code: "custom",
      path: ["fixTarget"],
      message: "fixTarget must identify the originating repository and pull request",
    });
  }
  if (request.fixTarget.headSha === request.target.headSha) {
    context.addIssue({
      code: "custom",
      path: ["fixTarget", "headSha"],
      message: "fixTarget must identify a changed head",
    });
  }
});
export type HostedSettleEnvelope = z.infer<typeof HostedSettleEnvelopeSchema>;

export interface HostedSettlementReply {
  id: string;
  actorIdentity: string;
  body: string;
  inReplyToId: string;
}

export interface HostedSettlementPort {
  currentActorIdentity(): Promise<string>;
  readHead(target: HostedTarget, options?: { signal?: AbortSignal }): Promise<string>;
  readThread(
    target: HostedTarget,
    threadId: string,
  ): Promise<
    | { kind: "missing" }
    | { kind: "present"; isResolved: boolean; commentIds: string[] }
  >;
  findReplies(input: {
    target: HostedTarget;
    commentId: string;
    actorIdentity: string;
    body: string;
  }): Promise<HostedSettlementReply[]>;
  postReply(input: {
    target: HostedTarget;
    commentId: string;
    body: string;
  }): Promise<{ kind: "created"; id: string } | { kind: "ambiguous" }>;
  resolveThread(
    target: HostedTarget,
    threadId: string,
  ): Promise<{ kind: "resolved" } | { kind: "ambiguous" }>;
}

const HostedSettleResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-hosted-settle"),
  response: HostedSettleEnvelopeSchema.shape.response,
  disposition: HostedSettleDispositionSchema,
  threadId: z.string().min(1),
};

export const HostedSettleResultSchema = z.union([
  z.strictObject({
    ...HostedSettleResultBaseShape,
    state: z.literal("settled"),
    nextAction: z.literal("complete"),
    replyId: z.string().min(1),
  }),
  z.strictObject({
    ...HostedSettleResultBaseShape,
    state: z.literal("already-settled"),
    nextAction: z.literal("complete"),
  }),
  z.strictObject({
    ...HostedSettleResultBaseShape,
    state: z.enum(["missing-thread", "missing-comment", "actor-mismatch", "stale-target", "ambiguous"]),
    nextAction: z.literal("stop"),
  }),
]);
export type HostedSettleResult = z.infer<typeof HostedSettleResultSchema>;

interface HostedSettleBase {
  schemaVersion: 1;
  mode: "review-hosted-settle";
  response: HostedSettleEnvelope["response"];
  disposition: "fix" | "defer" | "reject";
  threadId: string;
}

function resultBase(request: HostedSettleEnvelope): HostedSettleBase {
  return {
    schemaVersion: 1,
    mode: "review-hosted-settle",
    response: request.response,
    disposition: request.disposition,
    threadId: request.finding.threadId,
  };
}

async function canonicalReply(
  request: HostedSettleEnvelope,
  port: HostedSettlementPort,
): Promise<
  | { kind: "missing" }
  | { kind: "unique"; reply: HostedSettlementReply }
  | { kind: "ambiguous" }
> {
  const replies = await port.findReplies({
    target: request.target,
    commentId: request.finding.commentId,
    actorIdentity: request.actorIdentity,
    body: request.reply,
  });
  if (replies.length === 0) return { kind: "missing" };
  const reply = replies[0];
  return replies.length === 1 && reply !== undefined
    ? { kind: "unique", reply }
    : { kind: "ambiguous" };
}

async function targetIsCurrent(
  request: HostedSettleEnvelope,
  port: HostedSettlementPort,
): Promise<boolean> {
  const expectedTarget = request.disposition === "fix" && request.fixTarget !== null
    ? request.fixTarget
    : request.target;
  return await port.readHead(expectedTarget) === expectedTarget.headSha;
}

/** Reply at the originating comment and resolve its live thread under exact actor/current-head checks. */
export async function settleHostedFinding(
  input: unknown,
  dependencies: { port: HostedSettlementPort },
): Promise<HostedSettleResult> {
  const request = HostedSettleEnvelopeSchema.parse(input);
  const base = resultBase(request);
  if (await dependencies.port.currentActorIdentity() !== request.actorIdentity) {
    return { ...base, state: "actor-mismatch", nextAction: "stop" };
  }
  if (!await targetIsCurrent(request, dependencies.port)) {
    return { ...base, state: "stale-target", nextAction: "stop" };
  }

  const before = await dependencies.port.readThread(request.target, request.finding.threadId);
  if (before.kind === "missing") {
    return { ...base, state: "missing-thread", nextAction: "stop" };
  }
  if (!before.commentIds.includes(request.finding.commentId)) {
    return { ...base, state: "missing-comment", nextAction: "stop" };
  }
  if (before.isResolved) {
    return { ...base, state: "already-settled", nextAction: "complete" };
  }

  let replyMatch = await canonicalReply(request, dependencies.port);
  if (replyMatch.kind === "ambiguous") {
    return { ...base, state: "ambiguous", nextAction: "stop" };
  }
  if (replyMatch.kind === "missing") {
    if (!await targetIsCurrent(request, dependencies.port)) {
      return { ...base, state: "stale-target", nextAction: "stop" };
    }
    await dependencies.port.postReply({
      target: request.target,
      commentId: request.finding.commentId,
      body: request.reply,
    });
    replyMatch = await canonicalReply(request, dependencies.port);
    if (replyMatch.kind !== "unique") return { ...base, state: "ambiguous", nextAction: "stop" };
  }

  if (!await targetIsCurrent(request, dependencies.port)) {
    return { ...base, state: "stale-target", nextAction: "stop" };
  }
  await dependencies.port.resolveThread(request.target, request.finding.threadId);
  const after = await dependencies.port.readThread(request.target, request.finding.threadId);
  if (after.kind !== "present" || !after.isResolved) {
    return { ...base, state: "ambiguous", nextAction: "stop" };
  }
  return {
    ...base,
    state: "settled",
    nextAction: "complete",
    replyId: replyMatch.reply.id,
  };
}
