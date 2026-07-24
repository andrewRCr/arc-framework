/** Direct reply and review-thread settlement contract for hosted findings. */

import { z } from "zod";

import { HostedTargetSchema, type HostedTarget } from "./request.js";

export const HostedSettleEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: HostedTargetSchema,
  actorIdentity: z.string().min(1),
  finding: z.strictObject({
    commentId: z.string().min(1),
    threadId: z.string().min(1),
  }),
  disposition: z.enum(["defer", "reject"]),
  reply: z.string().min(1),
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

interface HostedSettleBase {
  schemaVersion: 1;
  mode: "review-hosted-settle";
  disposition: "defer" | "reject";
  threadId: string;
}

export type HostedSettleResult =
  | (HostedSettleBase & {
    state: "settled";
    nextAction: "complete";
    replyId: string;
  })
  | (HostedSettleBase & {
    state: "already-settled";
    nextAction: "complete";
  })
  | (HostedSettleBase & {
    state: "missing-thread" | "missing-comment" | "actor-mismatch" | "stale-target" | "ambiguous";
    nextAction: "stop";
  });

function resultBase(request: HostedSettleEnvelope): HostedSettleBase {
  return {
    schemaVersion: 1,
    mode: "review-hosted-settle",
    disposition: request.disposition,
    threadId: request.finding.threadId,
  };
}

async function canonicalReply(
  request: HostedSettleEnvelope,
  port: HostedSettlementPort,
): Promise<HostedSettlementReply | null> {
  const replies = await port.findReplies({
    target: request.target,
    commentId: request.finding.commentId,
    actorIdentity: request.actorIdentity,
    body: request.reply,
  });
  return replies.length === 1 ? replies[0] ?? null : null;
}

async function targetIsCurrent(
  request: HostedSettleEnvelope,
  port: HostedSettlementPort,
): Promise<boolean> {
  return await port.readHead(request.target) === request.target.headSha;
}

/** Reply at the originating comment and resolve its live thread under exact actor/head checks. */
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

  let reply = await canonicalReply(request, dependencies.port);
  if (reply === null) {
    if (!await targetIsCurrent(request, dependencies.port)) {
      return { ...base, state: "stale-target", nextAction: "stop" };
    }
    await dependencies.port.postReply({
      target: request.target,
      commentId: request.finding.commentId,
      body: request.reply,
    });
    reply = await canonicalReply(request, dependencies.port);
    if (reply === null) return { ...base, state: "ambiguous", nextAction: "stop" };
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
    replyId: reply.id,
  };
}
