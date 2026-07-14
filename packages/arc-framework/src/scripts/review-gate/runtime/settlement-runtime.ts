/** Safe developer-write/App-read adoption for finding settlement mutations. */

import type { SettlementReply, SettlementThread } from "../hosts/github/settlement.js";

interface ReplyDeveloperPort {
  postInlineReply(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    commentId: string;
    expectedActorIdentity: string;
    expectedHeadSha: string;
    body: string;
  }): Promise<{ kind: "created"; reply: SettlementReply & { bodyDigest: string } } | { kind: "ambiguous" }>;
}

interface ThreadDeveloperPort {
  resolveReviewThread(input: {
    repositoryRef: string;
    pullRequestNumber: number;
    threadId: string;
    expectedActorIdentity: string;
    expectedHeadSha: string;
  }): Promise<{ kind: "resolved"; threadId: string } | { kind: "ambiguous" }>;
}

/** Attempt one reply write, then accept only its exact canonical read-side identity. */
export async function ensureDirectReply(input: {
  repositoryRef: string;
  pullRequestNumber: number;
  commentId: string;
  expectedActorIdentity: string;
  expectedHeadSha: string;
  body: string;
  notBefore: string;
}, deps: {
  developer: ReplyDeveloperPort;
  canonical: { findReplies(query: {
    pullRequestNumber: number;
    commentId: string;
    actorIdentity: string;
    body: string;
    notBefore: string;
  }): Promise<SettlementReply[]> };
}): Promise<SettlementReply> {
  await deps.developer.postInlineReply(input);
  const matches = await deps.canonical.findReplies({
    pullRequestNumber: input.pullRequestNumber,
    commentId: input.commentId,
    actorIdentity: input.expectedActorIdentity,
    body: input.body,
    notBefore: input.notBefore,
  });
  if (matches.length !== 1) throw new Error("canonical-inline-reply-mismatch");
  const match = matches[0];
  if (match === undefined) throw new Error("canonical-inline-reply-mismatch");
  return match;
}

/** Attempt resolution at most once and accept only the exact canonical actor/thread state. */
export async function ensureThreadResolution(input: {
  repositoryRef: string;
  pullRequestNumber: number;
  threadId: string;
  expectedActorIdentity: string;
  expectedHeadSha: string;
}, deps: {
  developer: ThreadDeveloperPort;
  canonical: { readThread(threadId: string): Promise<SettlementThread> };
}): Promise<SettlementThread> {
  const before = await deps.canonical.readThread(input.threadId);
  if (!before.isResolved) await deps.developer.resolveReviewThread(input);
  const current = before.isResolved ? before : await deps.canonical.readThread(input.threadId);
  if (!current.isResolved || current.resolvedByActorIdentity !== input.expectedActorIdentity) {
    throw new Error("canonical-thread-resolution-mismatch");
  }
  return current;
}
