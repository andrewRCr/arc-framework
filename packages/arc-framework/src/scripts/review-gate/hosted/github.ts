/** Developer-authenticated GitHub boundary for hosted review effects. */

import type { HostedArtifact, HostedTarget } from "./request.js";
import type {
  HostedSettlementPort,
  HostedSettlementReply,
} from "./settle.js";

export class HostedGitHubReadError extends Error {
  readonly kind: "rate-limited" | "transient-unavailable" | "terminal-failure";

  constructor(
    kind: "rate-limited" | "transient-unavailable" | "terminal-failure",
    message: string = kind,
  ) {
    super(message);
    this.name = "HostedGitHubReadError";
    this.kind = kind;
  }
}

export type HostedGitHubReadOutcome =
  | { kind: "rate-limited" | "transient-unavailable" }
  | { kind: "terminal-failure"; reason: string };

/** Normalize a known GitHub read failure without classifying unknown or possibly effected errors. */
export function normalizeHostedGitHubReadFailure(error: unknown): HostedGitHubReadOutcome | null {
  if (!(error instanceof HostedGitHubReadError)) return null;
  return error.kind === "terminal-failure"
    ? { kind: "terminal-failure", reason: error.message }
    : { kind: error.kind };
}

export interface HostedGitHubReview {
  id: string;
  url: string;
  actorIdentity: string;
  state: "approved" | "changes-requested" | "commented";
  headSha: string;
  body: string;
  submittedAt: string;
}

export interface HostedGitHubThreadComment {
  id: string;
  reviewId: string;
  replyToReviewId: string | null;
  actorIdentity: string | null;
  body: string;
  url: string;
  path: string;
  line: number | null;
  headSha: string;
}

export interface HostedGitHubThread {
  id: string;
  isResolved: boolean;
  comments: HostedGitHubThreadComment[];
}

export interface HostedGitHubIssueComment {
  id: string;
  url: string;
  actorIdentity: string;
  appId?: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface HostedGitHubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  appOwnerIdentity: string | null;
  summary: string;
}

export interface HostedGitHubCommitStatus {
  context: string;
  state: "pending" | "success" | "failure";
  description: string;
  createdAt: string;
  updatedAt: string;
}

export type HostedGitHubWriteResult =
  | {
    kind: "created";
    artifact: HostedArtifact;
    actorIdentity: string;
    body: string;
  }
  | { kind: "rate-limited" | "transient-unavailable" | "ambiguous-delivery" }
  | { kind: "terminal-failure"; reason: string };

export interface HostedGitHubPort extends HostedSettlementPort {
  createIssueComment(target: HostedTarget, body: string): Promise<HostedGitHubWriteResult>;
  readReviews(target: HostedTarget, options?: { signal?: AbortSignal }): Promise<HostedGitHubReview[]>;
  readThreads(target: HostedTarget, options?: { signal?: AbortSignal }): Promise<HostedGitHubThread[]>;
  readIssueComments(target: HostedTarget, options?: { signal?: AbortSignal }): Promise<HostedGitHubIssueComment[]>;
  readCheckRuns(target: HostedTarget, options?: { signal?: AbortSignal }): Promise<HostedGitHubCheckRun[]>;
  readCommitStatuses(target: HostedTarget, options?: { signal?: AbortSignal }): Promise<HostedGitHubCommitStatus[]>;
  findReplies(input: {
    target: HostedTarget;
    commentId: string;
    actorIdentity: string;
    body: string;
  }): Promise<HostedSettlementReply[]>;
}
