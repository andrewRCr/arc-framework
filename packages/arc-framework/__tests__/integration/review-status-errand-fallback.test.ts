/** Hosted Errand fallback through public driver actions and durable attempt admission. */
import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { handleReviewHostedRequest, handleReviewResolve } from "../../src/handlers/review.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordV3Schema } from
  "../../src/lib/errand/identity-record.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { HostedRequestEnvelopeSchema, HostedRequestResultSchema } from
  "../../src/scripts/review-gate/hosted/request.js";
import { readLaneProgressOwner, recordHostedAwaitAttempt } from "../../src/scripts/review-gate/lane-progress.js";
import { ReviewResolveEnvelopeSchema } from "../../src/scripts/review-gate/policy/review-policy-driver.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { makeGitExec } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => removeGitBackedDir(root)));
});

async function git(cwd: string, args: readonly string[]): Promise<string> {
  return (await execFileAsync("git", [...args], { cwd })).stdout.trim();
}

async function fallbackErrand() {
  const primary = await createTempRepoCore({ prefix: "arc-errand-fallback-", identity: "andrew" });
  roots.push(primary);
  await writeFile(join(primary, ".git/info/exclude"), ".arc/\n.arc-fixture/\n");
  const branch = "fix/fallback";
  const identity = TransientIdentityRecordV3Schema.parse({
    version: 3, kind: "errand", slug: "fallback", claimId: "0123456789abcdef0123456789abcdef",
    purpose: "errand", origin: "description", originEntry: null, intent: "Review a change",
    branch, state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-27T00:00:00.000Z", updatedAt: "2026-10-27T00:00:00.000Z",
  });
  await writeFile(join(primary, identity.slug), serializeTransientIdentityRecord(identity));
  await git(primary, ["add", identity.slug]);
  await git(primary, ["commit", "-m", "identity"]);
  await git(primary, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
  const root = `${primary}-errand`;
  await git(primary, ["worktree", "add", "-b", branch, root, "HEAD"]);
  roots.push(root);
  await writeWorktreeMarker(root, { spawnedByArc: true,
    createdFor: { kind: "errand", slug: identity.slug, claimId: identity.claimId },
    spawningIdentity: "andrew", createdAt: identity.createdAt, provisioning: "ready" });
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await writeFile(join(root, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [coderabbit-pr, codex-pr, delegated-agent]\n");
  await writeFile(join(root, "change.txt"), "review me\n");
  await git(root, ["add", "change.txt"]);
  await git(root, ["commit", "-m", "change"]);
  const headSha = await git(root, ["rev-parse", "HEAD"]);
  const remote = join(primary, ".arc-fixture/origin.git");
  const bin = join(root, ".arc-fixture/bin");
  await mkdir(bin, { recursive: true });
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(root, ["remote", "add", "origin", "git@github.com:owner/repo.git"]);
  await git(root, ["config", `url.${remote}.insteadOf`, "git@github.com:owner/repo.git"]);
  await git(root, ["push", "origin", "main", branch]);
  const commentsPath = join(root, ".arc-fixture/comments.json");
  await writeFile(commentsPath, "[]");
  const script = join(bin, "gh");
  await writeFile(script, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const commentsPath = ${JSON.stringify(commentsPath)};
let response;
switch (args[0] + ":" + args[1]) {
  case "repo:view": response = { nameWithOwner: "owner/repo" }; break;
  case "pr:list": response = [{ number: 42, url: "https://github.com/owner/repo/pull/42", state: "OPEN",
    baseRefName: "main", headRefName: ${JSON.stringify(branch)}, headRefOid: ${JSON.stringify(headSha)} }]; break;
  case "api:user": response = { id: 1 }; break;
  case "api:repos/owner/repo/pulls/42": response = { head: { sha: ${JSON.stringify(headSha)} } }; break;
  case "api:repos/owner/repo/issues/42/comments": {
    if (!args.includes("POST")) throw new Error("only comment creation is supported");
    const comments = JSON.parse(fs.readFileSync(commentsPath, "utf8"));
    const now = new Date().toISOString();
    response = { node_id: "request-" + (comments.length + 1),
      html_url: "https://example.test/request-" + (comments.length + 1), user: { id: 1 },
      body: args.find(arg => arg.startsWith("body=")).slice(5), created_at: now, updated_at: now };
    comments.push(response);
    fs.writeFileSync(commentsPath, JSON.stringify(comments));
    break;
  }
  default: throw new Error("unexpected host invocation: " + JSON.stringify(args));
}
process.stdout.write(JSON.stringify(response));
`);
  await chmod(script, 0o755);
  const publisher = new RepositoryGitCommonStatePublisher(makeGitExec(root), root);
  return { root, bin, commentsPath, identity, publisher, headSha,
    target: { repository: "owner/repo", pullRequest: 42, headSha },
    repositoryId: await resolveRepositoryIdentity(publisher),
    store: new LocalReviewOperationStateStore(publisher) };
}

async function invokeHostedRequest(input: unknown) {
  const output: string[] = []; const exitCodes: number[] = [];
  await handleReviewHostedRequest("-", { readText: async () => JSON.stringify(input),
    write: text => output.push(text), setExitCode: code => exitCodes.push(code) });
  expect(exitCodes, output.join("")).toEqual([]);
  const result = HostedRequestResultSchema.parse(JSON.parse(output.join("")));
  expect(result).toMatchObject({ state: "requested", nextAction: "await" });
  if (result.state !== "requested") throw new Error("expected a requested review");
  return result;
}

describe("hosted Errand source fallback", () => {
  it.each(["rate-limited", "transient-unavailable"] as const)(
    "submits the unchanged next-source action after %s without losing history or spending another pass", async outcome => {
      const fixture = await fallbackErrand();
      const priorPath = process.env.PATH; const priorCwd = process.cwd();
      process.env.PATH = `${fixture.bin}${delimiter}${priorPath ?? ""}`;
      process.chdir(fixture.root);
      try {
        const standardReview = { obligation: "required", reasons: ["sensitive-change-set"],
          rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
          rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest, retrigger: "full-final", count: 1 };
        const resolve = async (attempts: readonly unknown[]) => {
          const output: string[] = []; const exitCodes: number[] = [];
          await handleReviewResolve("-", { resolveRoot: () => fixture.root,
            readText: async () => JSON.stringify({ schemaVersion: 1, target: fixture.target, lane: "standard",
              frontlineActive: false, standardReview, completedPasses: 0, attempts,
              scopeSelection: { mode: "whole-target", target: fixture.target } }),
            write: text => output.push(text), setExitCode: code => exitCodes.push(code) });
          expect(exitCodes, output.join("")).toEqual([]);
          const result = ReviewResolveEnvelopeSchema.parse(JSON.parse(output.join("")));
          expect(result).toMatchObject({ state: "ready", nextAction: "hosted-request", payload: { pass: 1 } });
          return HostedRequestEnvelopeSchema.parse("action" in result ? result.action : undefined);
        };
        const opening = await resolve([]);
        expect(opening.provider).toBe("coderabbit-pr");
        const first = await invokeHostedRequest(opening);
        const recorded = await recordHostedAwaitAttempt(fixture.store, { repositoryId: fixture.repositoryId,
          result: { schemaVersion: 1, mode: "review-hosted-await", handle: first.handle,
            state: outcome, nextAction: "try-next-source" }, now: new Date().toISOString() });
        expect(recorded).toMatchObject({ completedPasses: 0 });
        const fallback = await resolve([{ sourceId: "coderabbit-pr", outcome }]);
        expect(fallback.provider).toBe("codex-pr");
        const second = await invokeHostedRequest(fallback);
        const replay = await invokeHostedRequest(fallback);
        expect(replay.handle).toEqual(second.handle);
        expect(second.handle.admission.logicalPass).toBe(1);
        expect(second.handle.target).toEqual(fixture.target);
        expect(second.handle.vehicle).toMatchObject({ kind: "errand", claimId: fixture.identity.claimId,
          sources: ["codex-pr", "delegated-agent"], standardReview });
        const progress = await readLaneProgressOwner(fixture.store, { lane: "standard",
          repositoryId: fixture.repositoryId, headSha: fixture.headSha,
          lineage: first.handle.admission.lineage });
        expect(progress).toMatchObject({ completedPasses: 0, attempts: [
          { sourceId: "coderabbit-pr", outcome, logicalPass: 1 },
          { sourceId: "codex-pr", outcome: "pending", logicalPass: 1 },
        ] });
        const comments = JSON.parse(await readFile(fixture.commentsPath, "utf8")) as { body: string }[];
        expect(comments.map(comment => comment.body)).toEqual(["@coderabbitai full review", "@codex review"]);
      } finally {
        process.chdir(priorCwd);
        if (priorPath === undefined) delete process.env.PATH; else process.env.PATH = priorPath;
      }
    }, 60_000);
});
