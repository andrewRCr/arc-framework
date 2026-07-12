/**
 * Stateful in-memory GitHub "world" plus order-tolerant routing fakes for the
 * review-gate reconcile composition e2e. The composed `createReconcileRuntime`
 * factory fans its reads out through `Promise.all`, so the transport fake routes
 * by method + URL (never call index) and the git-exec fake routes by subcommand;
 * both mutate the shared world so re-reads, receipt appends, and check
 * create-then-update converge exactly as production would.
 */

import type { GitExec } from "../../src/lib/git/exec.js";
import type {
  HttpFetch,
  HttpRequestInit,
  HttpResponse,
} from "../../src/scripts/review-gate/hosts/github/api/http.js";
import type { ChangedPath } from "../../src/scripts/review-gate/policy/self-hosting/lane.js";

/** Fixed clock shared by the fakes and the reconcile invocation. */
export const NOW = new Date("2026-07-11T20:00:00.000Z");

const HEAD_SHA = "a".repeat(40);
const BASE_SHA = "b".repeat(40);
const DIFF_BASE_SHA = "c".repeat(40);

/** Pinned App/bot identities matching `SELF_HOSTING_POLICY.providerIdentities`. */
const APP_ID = 4268856;
const APP_BOT_USER_ID = 302312524;
const CODERABBIT_BOT_USER_ID = 136622811;
const CI_APP_ID = 15368;

/** One GitHub issue comment (ledger anchor, receipt, or human command). */
export interface CommentWire {
  id: number;
  node_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  html_url: string;
  user: { id: number; node_id: string; login: string; type: string };
  performed_via_github_app: { id: number; slug: string } | null;
}

function commentUrl(world: E2EWorld, id: number): string {
  return `https://github.com/${world.owner}/${world.repo}/pull/${world.pull}#issuecomment-${id}`;
}

/** One published check run owned by the review-gate App. */
export interface CheckWire {
  id: number;
  node_id: string;
  name: string;
  external_id: string;
  app: { id: number };
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

/** One submitted PR review (peer or CodeRabbit), in GitHub REST shape. */
export interface ReviewWire {
  node_id: string;
  html_url: string;
  user: { id: number; node_id: string; login: string; type: string };
  state: string;
  commit_id: string;
  submitted_at: string | null;
}

/** A collaborator's numeric id and role, keyed by login for permission reads. */
export interface Collaborator {
  id: number;
  role: string;
}

/** Mutable state the routing fakes read and write for one pull request. */
export interface E2EWorld {
  owner: string;
  repo: string;
  pull: number;
  repositoryId: number;
  appSlug: string;
  author: { id: number; login: string };
  collaborators: Map<string, Collaborator>;
  baseRef: string;
  baseSha: string;
  headSha: string;
  diffBaseSha: string;
  changedPaths: ChangedPath[];
  lifecycleTailChanges: ChangedPath[] | null;
  lifecycleTailReviewedHead: string | null;
  mergeable: boolean;
  isDraft: boolean;
  reviews: ReviewWire[];
  reviewDecision: string | null;
  threads: unknown[];
  ci: { conclusion: "success" | "failure" } | null;
  /** When set, the issue-comment list read fails, degrading the ledger. */
  commentsUnavailable: boolean;
  comments: CommentWire[];
  checks: CheckWire[];
  counters: { commentCreate: number; commentPatch: number; checkCreate: number; checkPatch: number };
  nextCommentId: number;
  nextCheckId: number;
}

/** Build a healthy default world; overrides tune per-scenario topology. */
export function createWorld(overrides: Partial<E2EWorld> = {}): E2EWorld {
  const author = overrides.author ?? { id: 7, login: "andrewRCr" };
  return {
    owner: "andrewRCr",
    repo: "arc-framework",
    pull: 42,
    repositoryId: 100,
    appSlug: "arc-review-gate-andrewrcr",
    author,
    collaborators: overrides.collaborators
      ?? new Map<string, Collaborator>([[author.login, { id: author.id, role: "write" }]]),
    baseRef: "main",
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    diffBaseSha: DIFF_BASE_SHA,
    changedPaths: [{ status: "modified", path: "packages/arc-framework/src/scripts/review-gate/runtime/reconcile.ts" }],
    lifecycleTailChanges: null,
    lifecycleTailReviewedHead: null,
    mergeable: true,
    isDraft: false,
    reviews: [],
    reviewDecision: null,
    threads: [],
    ci: { conclusion: "success" },
    commentsUnavailable: false,
    comments: [],
    checks: [],
    counters: { commentCreate: 0, commentPatch: 0, checkCreate: 0, checkPatch: 0 },
    nextCommentId: 1000,
    nextCheckId: 2000,
    ...overrides,
  };
}

/** A CodeRabbit review in REST shape, at a given head and disposition. */
export function coderabbitReview(
  world: E2EWorld,
  state: "APPROVED" | "CHANGES_REQUESTED",
  commitId: string = world.headSha,
  submittedAt: string = NOW.toISOString(),
): ReviewWire {
  return {
    node_id: `PRR_coderabbit_${state}_${commitId.slice(0, 6)}`,
    html_url: `https://github.com/${world.owner}/${world.repo}/pull/${world.pull}#pullrequestreview-1`,
    user: { id: CODERABBIT_BOT_USER_ID, node_id: "U_coderabbit", login: "coderabbitai[bot]", type: "Bot" },
    state,
    commit_id: commitId,
    submitted_at: submittedAt,
  };
}

/** A human `/review-gate` command comment authored by a named collaborator. */
export function commandComment(world: E2EWorld, login: string, body: string, id = world.nextCommentId++): CommentWire {
  const collaborator = world.collaborators.get(login);
  const comment: CommentWire = {
    id,
    node_id: `IC_cmd_${id}`,
    body,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    html_url: commentUrl(world, id),
    user: { id: collaborator?.id ?? 0, node_id: `U_${login}`, login, type: "User" },
    performed_via_github_app: null,
  };
  world.comments.push(comment);
  return comment;
}

/**
 * An App-authored receipt comment that has been edited (created ≠ updated), which
 * the store treats as tampering — corrupting the ledger into a degraded state.
 */
export function corruptReceiptComment(world: E2EWorld, id = 5000): CommentWire {
  const comment: CommentWire = {
    id,
    node_id: `IC_corrupt_${id}`,
    body: `<!-- arc-review-gate:receipt:PR_node -->\ntampered receipt`,
    created_at: "2026-07-11T10:00:00.000Z",
    updated_at: "2026-07-11T12:00:00.000Z",
    html_url: commentUrl(world, id),
    user: { id: 302312524, node_id: "U_appbot", login: `${world.appSlug}[bot]`, type: "Bot" },
    performed_via_github_app: { id: 4268856, slug: world.appSlug },
  };
  world.comments.push(comment);
  return comment;
}

/** The published `review-gate-shadow` checks currently in the world. */
export function shadowChecks(world: E2EWorld): CheckWire[] {
  return world.checks.filter((check) => check.name === "review-gate-shadow");
}

/** Whether any authenticated receipt comment (non-anchor) has been appended. */
export function receiptComments(world: E2EWorld): CommentWire[] {
  return world.comments.filter((comment) => comment.body.includes("<!-- arc-review-gate:receipt"));
}

/** Advance from a reviewed head through a valid bookkeeping tail or a substantive change. */
export function advanceLifecycleTail(world: E2EWorld, substantive = false): void {
  world.lifecycleTailReviewedHead = world.headSha;
  world.headSha = "e".repeat(40);
  world.lifecycleTailChanges = substantive
    ? [{ status: "modified", path: "packages/arc-framework/src/scripts/review-gate/runtime/reconcile.ts" }]
    : [
        { status: "deleted", path: ".arc/active/meta-review-gate.md" },
        { status: "added", path: ".arc/completed/2026-q3/01_review-gate/meta-review-gate.md" },
        { status: "deleted", path: ".arc/active/tasks-review-gate.md" },
        { status: "added", path: ".arc/completed/2026-q3/01_review-gate/tasks-review-gate.md" },
        { status: "modified", path: ".arc/backlog/ROADMAP.md" },
      ];
}

function jsonResponse(status: number, body: unknown): HttpResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { status, headers: { get: () => null }, text: () => Promise.resolve(text) };
}

function prFactsBody(world: E2EWorld): unknown {
  return {
    node_id: "PR_node",
    number: world.pull,
    draft: world.isDraft,
    mergeable: world.mergeable,
    base: { ref: world.baseRef, sha: world.baseSha, repo: { id: world.repositoryId, node_id: "R_base" } },
    head: { ref: "feature", sha: world.headSha, repo: { id: world.repositoryId, node_id: "R_base" } },
    user: { id: world.author.id, node_id: "U_author", login: world.author.login, type: "User" },
  };
}

function permissionBody(login: string, collaborator: Collaborator): unknown {
  const legacy = collaborator.role === "maintain" ? "write" : collaborator.role === "triage" ? "read" : collaborator.role;
  return {
    permission: legacy,
    role_name: collaborator.role,
    user: { id: collaborator.id, node_id: `U_${login}`, login, type: "User" },
  };
}

function ciCheckRunsBody(world: E2EWorld): unknown {
  if (world.ci === null) return { total_count: 0, check_runs: [] };
  return {
    total_count: 1,
    check_runs: [{
      id: 900,
      node_id: "CR_ci",
      name: "ci-ok",
      external_id: "ci-ok",
      app: { id: CI_APP_ID },
      status: "completed",
      conclusion: world.ci.conclusion,
      created_at: NOW.toISOString(),
      html_url: `https://github.com/${world.owner}/${world.repo}/runs/900`,
    }],
  };
}

function appCheckRunsBody(world: E2EWorld, checkName: string): unknown {
  const runs = world.checks.filter((check) => check.name === checkName);
  return { total_count: runs.length, check_runs: runs };
}

function reviewsBody(world: E2EWorld): unknown {
  return world.reviews;
}

function graphqlBody(world: E2EWorld, query: string): unknown {
  if (query.includes("ReviewDecision")) {
    return { data: { repository: { pullRequest: { reviewDecision: world.reviewDecision } } } };
  }
  return {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: { nodes: world.threads, pageInfo: { hasNextPage: false, endCursor: null } },
        },
      },
    },
  };
}

function createComment(world: E2EWorld, body: string): CommentWire {
  world.counters.commentCreate += 1;
  const id = world.nextCommentId++;
  const comment: CommentWire = {
    id,
    node_id: `IC_${id}`,
    body,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    html_url: commentUrl(world, id),
    user: { id: APP_BOT_USER_ID, node_id: "U_appbot", login: `${world.appSlug}[bot]`, type: "Bot" },
    performed_via_github_app: { id: APP_ID, slug: world.appSlug },
  };
  world.comments.push(comment);
  return comment;
}

function patchComment(world: E2EWorld, id: number, body: string): CommentWire | null {
  const comment = world.comments.find((entry) => entry.id === id);
  if (comment === undefined) return null;
  world.counters.commentPatch += 1;
  comment.body = body;
  comment.updated_at = NOW.toISOString();
  return comment;
}

function createCheck(world: E2EWorld, body: Record<string, unknown>): CheckWire {
  world.counters.checkCreate += 1;
  const id = world.nextCheckId++;
  const check: CheckWire = {
    id,
    node_id: `CR_${id}`,
    name: String(body.name),
    external_id: String(body.external_id),
    app: { id: APP_ID },
    status: String(body.status),
    conclusion: body.conclusion === undefined ? null : String(body.conclusion),
    created_at: NOW.toISOString(),
    html_url: `https://github.com/${world.owner}/${world.repo}/runs/${id}`,
  };
  world.checks.push(check);
  return check;
}

function patchCheck(world: E2EWorld, id: number, body: Record<string, unknown>): CheckWire | null {
  const check = world.checks.find((entry) => entry.id === id);
  if (check === undefined) return null;
  world.counters.checkPatch += 1;
  check.status = String(body.status);
  check.conclusion = body.conclusion === undefined ? null : String(body.conclusion);
  return check;
}

/** Build a method + URL-routing fetch fake over the mutable world. */
export function routingFetch(world: E2EWorld): HttpFetch {
  return (rawUrl: string, init: HttpRequestInit): Promise<HttpResponse> => {
    const url = new URL(rawUrl);
    const path = decodeURIComponent(url.pathname);
    const method = init.method;

    if (path === "/graphql") {
      const query = String((JSON.parse(init.body ?? "{}") as { query?: string }).query ?? "");
      return Promise.resolve(jsonResponse(200, graphqlBody(world, query)));
    }
    if (path.startsWith("/users/")) return Promise.resolve(jsonResponse(200, { id: APP_BOT_USER_ID, type: "Bot" }));
    if (path === "/installation/repositories") {
      return Promise.resolve(jsonResponse(200, {
        installation: { app_id: APP_ID },
        repositories: [{ id: world.repositoryId, full_name: `${world.owner}/${world.repo}` }],
      }));
    }

    const permission = /\/collaborators\/([^/]+)\/permission$/u.exec(path);
    if (permission?.[1] !== undefined && method === "GET") {
      const login = permission[1];
      const collaborator = world.collaborators.get(login);
      if (collaborator === undefined) return Promise.resolve(jsonResponse(404, { message: "Not Found" }));
      return Promise.resolve(jsonResponse(200, permissionBody(login, collaborator)));
    }

    if (/\/pulls\/\d+\/reviews$/u.test(path) && method === "GET") {
      return Promise.resolve(jsonResponse(200, reviewsBody(world)));
    }
    if (/\/pulls\/\d+$/u.test(path) && method === "GET") {
      return Promise.resolve(jsonResponse(200, prFactsBody(world)));
    }

    if (/\/commits\/[^/]+\/check-runs$/u.test(path) && method === "GET") {
      const appId = url.searchParams.get("app_id");
      const checkName = url.searchParams.get("check_name") ?? "";
      if (appId === String(CI_APP_ID)) return Promise.resolve(jsonResponse(200, ciCheckRunsBody(world)));
      return Promise.resolve(jsonResponse(200, appCheckRunsBody(world, checkName)));
    }

    const commentId = /\/issues\/\d+\/comments\/(\d+)$/u.exec(path);
    if (commentId?.[1] !== undefined && method === "PATCH") {
      const updated = patchComment(world, Number(commentId[1]), commentBody(init));
      if (updated === null) return Promise.resolve(jsonResponse(404, { message: "Not Found" }));
      return Promise.resolve(jsonResponse(200, updated));
    }
    if (/\/issues\/\d+\/comments$/u.test(path)) {
      if (method === "GET") {
        if (world.commentsUnavailable) return Promise.resolve(jsonResponse(500, ""));
        return Promise.resolve(jsonResponse(200, world.comments));
      }
      if (method === "POST") return Promise.resolve(jsonResponse(201, createComment(world, commentBody(init))));
    }

    const checkPatch = /\/check-runs\/(\d+)$/u.exec(path);
    if (checkPatch?.[1] !== undefined) {
      const id = Number(checkPatch[1]);
      if (method === "PATCH") {
        const updated = patchCheck(world, id, JSON.parse(init.body ?? "{}") as Record<string, unknown>);
        if (updated === null) return Promise.resolve(jsonResponse(404, { message: "Not Found" }));
        return Promise.resolve(jsonResponse(200, updated));
      }
      if (method === "GET") {
        const check = world.checks.find((entry) => entry.id === id);
        if (check === undefined) return Promise.resolve(jsonResponse(404, { message: "Not Found" }));
        return Promise.resolve(jsonResponse(200, check));
      }
    }
    if (/\/check-runs$/u.test(path) && method === "POST") {
      return Promise.resolve(jsonResponse(201, createCheck(world, JSON.parse(init.body ?? "{}") as Record<string, unknown>)));
    }

    return Promise.reject(new Error(`unexpected fetch: ${method} ${path}`));
  };
}

function commentBody(init: HttpRequestInit): string {
  return String((JSON.parse(init.body ?? "{}") as { body?: string }).body ?? "");
}

// Git diff status codes; the parser reads only the first character, so a rename
// needs just the leading "R" (git's numeric similarity score is not consumed).
const STATUS_LETTER: Record<ChangedPath["status"], string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
};

/** Render a changed-path set as `git diff --name-status -z` NUL-framed output. */
function nameStatusZ(changes: ChangedPath[]): string {
  const fields: string[] = [];
  for (const change of changes) {
    if (change.status === "renamed") fields.push("R", change.previousPath ?? "", change.path);
    else fields.push(STATUS_LETTER[change.status], change.path);
  }
  return fields.length === 0 ? "" : `${fields.join("\0")}\0`;
}

/** Build a git-subcommand-routing exec fake over the mutable world. */
export function routingExec(world: E2EWorld): GitExec {
  return (cmd: string, args: string[]): Promise<{ stdout: string }> => {
    void cmd;
    const [subcommand, ...rest] = args;
    switch (subcommand) {
      case "update-ref":
      case "fetch":
        return Promise.resolve({ stdout: "" });
      case "rev-parse": {
        const ref = rest.find((arg) => arg.includes("^{commit}")) ?? "";
        if (ref.includes("/head^")) return Promise.resolve({ stdout: `${world.headSha}\n` });
        if (ref.includes("/base^")) return Promise.resolve({ stdout: `${world.baseSha}\n` });
        return Promise.reject(new Error(`unexpected rev-parse: ${rest.join(" ")}`));
      }
      case "merge-base":
        return Promise.resolve({ stdout: `${world.diffBaseSha}\n` });
      case "diff":
        return Promise.resolve({
          stdout: nameStatusZ(rest.includes("--no-renames") && world.lifecycleTailChanges !== null
            ? world.lifecycleTailChanges
            : world.changedPaths),
        });
      case "show": {
        const object = rest[0] ?? "";
        if (
          world.lifecycleTailReviewedHead !== null
          && object === `${world.lifecycleTailReviewedHead}:.arc/active/meta-review-gate.md`
        ) {
          return Promise.resolve({
            stdout: [
              "# Metadata: review-gate",
              "",
              "- **State:** Integrating",
              "- **Task List:** tasks-review-gate.md",
              "- **Cohort:** [none]",
              "",
            ].join("\n"),
          });
        }
        return Promise.reject(new Error(`unexpected show: ${object}`));
      }
      default:
        return Promise.reject(new Error(`unexpected git subcommand: ${args.join(" ")}`));
    }
  };
}
