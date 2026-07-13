import { describe, expect, it } from "vitest";

import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import {
  authenticateAppComment,
  verifyInstallationAuthority,
  type ReceiptCommentAuthority,
} from "../../../../../../src/scripts/review-gate/hosts/github/receipt-auth.js";
import { fetchFake, response, type FetchStep } from "./api/fetch-fake.js";

const AUTHORITY: ReceiptCommentAuthority = { expectedAppId: "4268856", expectedBotId: "302312524" };
const CREATED = "2026-07-10T10:00:00Z";

function comment(overrides: Record<string, unknown> = {}): unknown {
  return {
    node_id: "IC_1",
    body: "receipt body",
    created_at: CREATED,
    updated_at: CREATED,
    user: { id: 302312524, login: "arc-review-gate-andrewrcr[bot]", type: "Bot" },
    performed_via_github_app: { id: 4268856, slug: "arc-review-gate-andrewrcr" },
    ...overrides,
  };
}

function client(steps: FetchStep[]): GitHubRestClient {
  const fake = fetchFake(steps);
  return new GitHubRestClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 });
}

describe("authenticateAppComment identity binding", () => {
  it("authenticates a comment authored through the pinned App and bot account", () => {
    expect(authenticateAppComment(comment(), AUTHORITY)).toEqual({
      kind: "authentic",
      comment: { commentNodeId: "IC_1", createdAt: CREATED, updatedAt: CREATED, body: "receipt body" },
    });
  });

  it("stays authentic across private-key rotation — authority is pinned to App and bot ids, never the key", () => {
    // The signing key never appears in the comment payload, so a rotation that
    // preserves the App and bot ids preserves authority.
    expect(authenticateAppComment(comment(), AUTHORITY).kind).toBe("authentic");
  });

  it("binds identity to the numeric bot id, so a renamed bot login still authenticates", () => {
    const renamed = comment({ user: { id: 302312524, login: "arc-review-gate-renamed[bot]", type: "Bot" } });
    expect(authenticateAppComment(renamed, AUTHORITY).kind).toBe("authentic");
  });
});

describe("authenticateAppComment fail-closed rejections", () => {
  it("rejects a github-actions comment authored via a different App", () => {
    const actions = comment({ performed_via_github_app: { id: 15368, slug: "github-actions" } });
    expect(authenticateAppComment(actions, AUTHORITY)).toEqual({ kind: "rejected", reason: "wrong-app" });
  });

  it("rejects a human comment with no App authorship", () => {
    const human = comment({ performed_via_github_app: null, user: { id: 7, login: "andrewRCr", type: "User" } });
    expect(authenticateAppComment(human, AUTHORITY)).toEqual({ kind: "rejected", reason: "not-app-authored" });
  });

  it("rejects a comment that only claims App identity in its body", () => {
    const spoof = comment({
      performed_via_github_app: null,
      body: "arc-review-gate:receipt performed_via_github_app.id=4268856",
      user: { id: 7, login: "andrewRCr", type: "User" },
    });
    expect(authenticateAppComment(spoof, AUTHORITY)).toEqual({ kind: "rejected", reason: "not-app-authored" });
  });

  it("rejects a lookalike bot account whose numeric id differs", () => {
    const lookalike = comment({ user: { id: 999, login: "arc-review-gate-andrewrcr[bot]", type: "Bot" } });
    expect(authenticateAppComment(lookalike, AUTHORITY)).toEqual({ kind: "rejected", reason: "wrong-bot" });
  });

  it("rejects a non-bot author even under the pinned App", () => {
    const user = comment({ user: { id: 302312524, login: "andrewRCr", type: "User" } });
    expect(authenticateAppComment(user, AUTHORITY)).toEqual({ kind: "rejected", reason: "not-bot" });
  });

  it("rejects an edited receipt comment (edit is tampering)", () => {
    const edited = comment({ updated_at: "2026-07-10T12:00:00Z" });
    expect(authenticateAppComment(edited, AUTHORITY)).toEqual({ kind: "rejected", reason: "edited" });
  });

  it("rejects a malformed comment", () => {
    expect(authenticateAppComment(null, AUTHORITY)).toEqual({ kind: "rejected", reason: "malformed" });
  });
});

describe("authenticateAppComment anchor allowance", () => {
  it("authenticates an edited comment when edits are allowed (the mutable anchor)", () => {
    const edited = comment({ updated_at: "2026-07-10T12:00:00Z" });
    expect(authenticateAppComment(edited, AUTHORITY, { allowEdits: true })).toMatchObject({ kind: "authentic" });
  });
});

const authorityInput = {
  appSlug: "arc-review-gate-andrewrcr",
  expectedBotId: "302312524",
  expectedRepositoryId: "100",
};

function installation(overrides: Record<string, unknown> = {}): unknown {
  return {
    total_count: 1,
    repositories: [{ id: 100, full_name: "andrewRCr/arc-framework" }],
    ...overrides,
  };
}

describe("installation-token authority validation", () => {
  it("verifies the token through its bot identity and scoped repository list", async () => {
    const result = await verifyInstallationAuthority(client([
      response(200, JSON.stringify({ id: 302312524, type: "Bot" })),
      response(200, JSON.stringify(installation())),
    ]), authorityInput);
    expect(result).toEqual({ kind: "verified" });
  });

  it("fails closed on a mismatched bot identity", async () => {
    await expect(verifyInstallationAuthority(client([
      response(200, JSON.stringify({ id: 999, type: "Bot" })),
    ]), authorityInput)).resolves.toEqual({ kind: "failed", reason: "bot-id-mismatch" });
  });

  it("enumerates every installation-repository page before rejecting scope", async () => {
    const result = await verifyInstallationAuthority(client([
      response(200, JSON.stringify({ id: 302312524, type: "Bot" })),
      response(200, JSON.stringify(installation({
        total_count: 2,
        repositories: [{ id: 200, full_name: "other/repo" }],
      })), { link: '<https://api.github.com/installation/repositories?per_page=100&page=2>; rel="next"' }),
      response(200, JSON.stringify(installation({
        total_count: 2,
        repositories: [{ id: 100, full_name: "andrewRCr/arc-framework" }],
      }))),
    ]), authorityInput);
    expect(result).toEqual({ kind: "verified" });
  });

  it("fails closed when the repository is outside the installation scope", async () => {
    const result = await verifyInstallationAuthority(client([
      response(200, JSON.stringify({ id: 302312524, type: "Bot" })),
      response(200, JSON.stringify(installation({ repositories: [{ id: 200, full_name: "other/repo" }] }))),
    ]), authorityInput);
    expect(result).toEqual({ kind: "failed", reason: "repository-outside-installation" });
  });

  it("fails closed on a missing or invalid credential", async () => {
    const result = await verifyInstallationAuthority(client([
      response(401, "{\"message\":\"Bad credentials\"}"),
    ]), authorityInput);
    expect(result).toEqual({ kind: "failed", reason: "credential" });
  });

  it("fails closed when installation scope cannot be read", async () => {
    const result = await verifyInstallationAuthority(client([
      response(200, JSON.stringify({ id: 302312524, type: "Bot" })),
      response(500, ""),
    ]), authorityInput);
    expect(result).toMatchObject({ kind: "failed" });
  });
});
