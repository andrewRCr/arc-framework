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

import { arrayAt, integerAt, objectAt, stringAt } from "../../core/validation.js";
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

/** Result of verifying installation-token authority at adapter initialization. */
export type AppIdentityResult = { kind: "verified" } | { kind: "failed"; reason: string };

/** Pinned installation-token facts required to authorize the controller App. */
export interface InstallationAuthorityInput {
  appSlug: string;
  expectedBotId: string;
  expectedRepositoryId: string;
}

function failureFromOutcome(outcome: { kind: string; status?: number; reason?: string }): AppIdentityResult {
  if (outcome.kind === "http-error") {
    return {
      kind: "failed",
      reason: outcome.status === 401 || outcome.status === 403 ? "credential" : `http-${outcome.status}`,
    };
  }
  if (outcome.kind === "schema-error") return { kind: "failed", reason: "malformed" };
  return { kind: "failed", reason: outcome.reason ?? "unavailable" };
}

/** Verify bot identity and repository scope with installation-token-compatible endpoints. */
export async function verifyInstallationAuthority(
  rest: GitHubRestClient,
  input: InstallationAuthorityInput,
): Promise<AppIdentityResult> {
  const bot = await rest.get(`/users/${encodeURIComponent(`${input.appSlug}[bot]`)}`, {
    parse: (value) => {
      const record = objectAt(value, "bot");
      return {
        id: numericId(record.id, "bot.id"),
        type: stringAt(record.type, "bot.type"),
      };
    },
  });
  if (bot.kind !== "ok") return failureFromOutcome(bot);
  if (bot.value.type !== "Bot") return { kind: "failed", reason: "not-bot" };
  if (bot.value.id !== input.expectedBotId) return { kind: "failed", reason: "bot-id-mismatch" };

  const repositories = await rest.getPaginated("/installation/repositories", {
    query: { per_page: 100 },
    parsePage: (value) => {
      const record = objectAt(value, "installationRepositories");
      integerAt(record.total_count, "installationRepositories.total_count", 0);
      return arrayAt(record.repositories, "installationRepositories.repositories", (repository, path) => {
        const repositoryRecord = objectAt(repository, path);
        return numericId(repositoryRecord.id, `${path}.id`);
      });
    },
  });
  if (repositories.kind !== "ok") return failureFromOutcome(repositories);
  if (!repositories.value.includes(input.expectedRepositoryId)) {
    return { kind: "failed", reason: "repository-outside-installation" };
  }
  return { kind: "verified" };
}
