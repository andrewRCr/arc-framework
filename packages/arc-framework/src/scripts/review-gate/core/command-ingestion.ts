/** Reduce immutable host comment versions into authorized review commands. */

import { hashContent } from "../../../lib/manifest/hash.js";
import {
  authorizeReviewCommand,
  type ReviewScopeIdentity,
} from "./authorization.js";
import {
  parseReviewCommand,
  type ReviewCommand,
  type ReviewCommandContext,
} from "./commands.js";
import type { CapabilitySet } from "./contracts.js";
import type { ActorAddress } from "./ports.js";

/** Immutable host comment facts retained for command authorization and durable receipt provenance. */
export interface ReviewCommandComment {
  commentId: number;
  commentNodeId: string;
  actor: ActorAddress;
  actorNodeId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  durableRef: string;
}

/** One command ready to become a durable receipt. */
export interface AuthorizedReviewCommandEvent {
  eventId: string;
  commentNodeId: string;
  actorIdentity: string;
  actorLogin: string;
  permission: CapabilitySet["permissions"][number];
  command: ReviewCommand;
  durableRef: string;
  createdAt: string;
  updatedAt: string;
}

/** A command-shaped comment deliberately refused before persistence. */
export interface ReviewCommandRejection {
  commentNodeId: string;
  eventId: string;
  code: string;
}

/** Inputs for one current-scope command reduction. */
export interface ReviewCommandIngestionInput {
  comments: ReviewCommandComment[];
  commandContext: ReviewCommandContext;
  currentScope: ReviewScopeIdentity;
  expectedScope: ReviewScopeIdentity;
  receiptedEventIds: readonly string[];
  resolveCapabilities: (actor: ActorAddress) => Promise<CapabilitySet>;
}

/** Authorized current events, exact replay identities, and rejected command versions. */
export interface ReviewCommandIngestionResult {
  accepted: AuthorizedReviewCommandEvent[];
  replayedEventIds: string[];
  rejections: ReviewCommandRejection[];
}

/** Derive an edit-sensitive identity from the comment node, host update, and exact body. */
export function commandEventId(comment: ReviewCommandComment): string {
  return `command:${comment.commentNodeId}:${comment.updatedAt}:${hashContent(comment.body)}`;
}

function isReviewCommandBody(body: string): boolean {
  return body === "/review-gate" || /^\/review-gate\s/u.test(body);
}

function orderedComments(comments: ReviewCommandComment[]): ReviewCommandComment[] {
  return [...comments].sort((left, right) => {
    const time = left.updatedAt.localeCompare(right.updatedAt);
    return time === 0 ? left.commentNodeId.localeCompare(right.commentNodeId) : time;
  });
}

/** Resolve, parse, and authorize current command versions, retaining exact replay identity. */
export async function ingestReviewCommands(input: ReviewCommandIngestionInput): Promise<ReviewCommandIngestionResult> {
  const accepted: AuthorizedReviewCommandEvent[] = [];
  const replayedEventIds: string[] = [];
  const rejections: ReviewCommandRejection[] = [];
  const receipted = new Set(input.receiptedEventIds);

  for (const comment of orderedComments(input.comments)) {
    if (!isReviewCommandBody(comment.body)) continue;
    const eventId = commandEventId(comment);
    if (receipted.has(eventId)) {
      replayedEventIds.push(eventId);
    }
    const parsed = parseReviewCommand(comment.body, input.commandContext);
    if (!parsed.ok) {
      rejections.push({ commentNodeId: comment.commentNodeId, eventId, code: parsed.error.code });
      continue;
    }

    let capabilities: CapabilitySet;
    try {
      capabilities = await input.resolveCapabilities(comment.actor);
    } catch {
      rejections.push({ commentNodeId: comment.commentNodeId, eventId, code: "capability-unavailable" });
      continue;
    }
    if (capabilities.actorIdentity !== comment.actor.expectedActorId) {
      rejections.push({ commentNodeId: comment.commentNodeId, eventId, code: "identity-mismatch" });
      continue;
    }
    const authorization = authorizeReviewCommand({
      command: parsed.command,
      capabilities,
      currentScope: input.currentScope,
      expectedScope: input.expectedScope,
    });
    if (!authorization.authorized) {
      rejections.push({ commentNodeId: comment.commentNodeId, eventId, code: authorization.reason });
      continue;
    }
    accepted.push({
      eventId,
      commentNodeId: comment.commentNodeId,
      actorIdentity: authorization.receipt.actorIdentity,
      actorLogin: comment.actor.login,
      permission: authorization.receipt.permission,
      command: authorization.receipt.command,
      durableRef: comment.durableRef,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    });
  }

  return { accepted, replayedEventIds, rejections };
}
