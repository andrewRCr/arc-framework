/**
 * App-identity authentication for receipt and anchor comments.
 *
 * A comment is authoritative only when the host attests it was authored through
 * the dedicated App installation: `performed_via_github_app.id` must match the
 * pinned App id and the author account must be the pinned immutable bot user id.
 * Identity binds to numeric ids, so a renamed or lookalike login cannot forge
 * authority, and a `github-actions` comment, a human comment, or a body that
 * merely claims App identity is rejected. Host record id and created/updated
 * times are taken from the comment itself; payload-declared time is never
 * trusted. A receipt comment must be unedited (an edit is tampering); the anchor
 * is the one deliberately mutable comment, so it authenticates with edits
 * allowed. Adapter initialization separately verifies the live token's App
 * identity, failing closed on a wrong or missing installation, credential, or id.
 *
 * @module
 */

import { integerAt, objectAt, stringAt } from "../../core/validation.js";
import type { GitHubRestClient } from "./api/rest.js";

/** Pinned identities an authoritative comment must match. */
export interface ReceiptCommentAuthority {
  /** Numeric App id pinned from ARC_REVIEW_GATE_APP_ID. */
  expectedAppId: string;
  /** Immutable numeric bot account id pinned in versioned policy. */
  expectedBotId: string;
}

/** A comment proven App-authored, with host-attested identity and times. */
export interface AuthenticatedComment {
  commentNodeId: string;
  createdAt: string;
  updatedAt: string;
  body: string;
}

/** Result of authenticating a candidate comment. */
export type CommentAuthResult =
  | { kind: "authentic"; comment: AuthenticatedComment }
  | { kind: "rejected"; reason: string };

/** Options controlling authentication strictness. */
export interface AuthenticateOptions {
  /** Allow an edited comment (true only for the deliberately-mutable anchor). */
  allowEdits?: boolean;
}

function numericId(value: unknown, path: string): string {
  return String(integerAt(value, path, 1));
}

/** Authenticate a candidate comment as App-authored by the pinned App and bot ids. */
export function authenticateAppComment(
  input: unknown,
  authority: ReceiptCommentAuthority,
  options: AuthenticateOptions = {},
): CommentAuthResult {
  let record: Record<string, unknown>;
  try {
    record = objectAt(input, "comment");
  } catch {
    return { kind: "rejected", reason: "malformed" };
  }

  const app = record.performed_via_github_app;
  if (app === null || app === undefined) return { kind: "rejected", reason: "not-app-authored" };

  try {
    const appId = numericId(objectAt(app, "comment.performed_via_github_app").id, "comment.performed_via_github_app.id");
    if (appId !== authority.expectedAppId) return { kind: "rejected", reason: "wrong-app" };

    const user = objectAt(record.user, "comment.user");
    if (stringAt(user.type, "comment.user.type") !== "Bot") return { kind: "rejected", reason: "not-bot" };
    if (numericId(user.id, "comment.user.id") !== authority.expectedBotId) return { kind: "rejected", reason: "wrong-bot" };

    const createdAt = stringAt(record.created_at, "comment.created_at");
    const updatedAt = stringAt(record.updated_at, "comment.updated_at");
    if (options.allowEdits !== true && createdAt !== updatedAt) return { kind: "rejected", reason: "edited" };

    return {
      kind: "authentic",
      comment: {
        commentNodeId: stringAt(record.node_id, "comment.node_id"),
        createdAt,
        updatedAt,
        body: stringAt(record.body, "comment.body"),
      },
    };
  } catch {
    return { kind: "rejected", reason: "malformed" };
  }
}

/** Result of verifying the live token's App identity at adapter initialization. */
export type AppIdentityResult = { kind: "verified" } | { kind: "failed"; reason: string };

/** Verify the authenticated App id matches the pinned id, failing closed otherwise. */
export async function verifyAppIdentity(rest: GitHubRestClient, expectedAppId: string): Promise<AppIdentityResult> {
  const outcome = await rest.get("/app", {
    parse: (value) => numericId(objectAt(value, "app").id, "app.id"),
  });
  switch (outcome.kind) {
    case "ok":
      return outcome.value === expectedAppId ? { kind: "verified" } : { kind: "failed", reason: "app-id-mismatch" };
    case "http-error":
      return { kind: "failed", reason: outcome.status === 401 || outcome.status === 403 ? "credential" : `http-${outcome.status}` };
    case "schema-error":
      return { kind: "failed", reason: "malformed" };
    case "unavailable":
      return { kind: "failed", reason: outcome.reason };
  }
}
