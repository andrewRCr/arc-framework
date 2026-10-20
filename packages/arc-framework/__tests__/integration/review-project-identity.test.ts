/** Public review commands carry a repairable project-identity refusal through their real roots. */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { expect, it } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { TransientIdentityRecordSchema } from "../../src/lib/errand/identity-record.js";
import { handleReviewLocalPrepare, handleReviewFrontlineResolve, handleReviewHostedAwait, handleReviewLaneRead, handleReviewStatus, handleReviewReduce, handleReviewResolve } from "../../src/handlers/review.js";
import { resolveReviewRouting } from "../../src/scripts/review-gate/policy/routing.js";
import { projectStandardReviewObligation } from "../../src/scripts/review-gate/policy/standard-review-projection.js";

import { ProjectIdentityError } from "../../src/lib/store/project-identity.js";

import { inProcessReview, localReviewResult } from "../helpers/in-process-review.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createPrePublicationCompositionDependencies } from "../../src/scripts/review-gate/policy/pre-publication-composition.js";

import { LocalPrepareEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";

import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
async function fixture() {
  const h = await createReviewRepositoryHarness();
  const cwd = h.native.cwd, exec = h.native.exec;
  await mkdir(join(cwd, ".arc", "system"), { recursive: true });
  await writeFile(join(cwd, ".arc", "system", "arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [delegated-agent]\nreview.standard_max_passes: 2\n");
  await exec("git", ["config", "arc.identity", "test-user"], { cwd });
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["commit", "-m", "Configure review fixture"], { cwd });
  const base = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  await exec("git", ["switch", "-c", "chore/review-errand"], { cwd });
  await writeFile(join(cwd, "example.ts"), "export const example = true;\n");
  await exec("git", ["add", "example.ts"], { cwd });
  await exec("git", ["commit", "-m", "Implement example"], { cwd });
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand",
    slug: "review-errand", claimId: "1".repeat(32), intent: "Review example", owner: "test-user",
    origin: "description", originEntry: null, branch: "chore/review-errand", state: "open", savedHead: null,
    changeRequest: null, createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
  if (record.kind !== "errand" || record.purpose !== "errand") throw new Error("Expected ordinary Errand");
  const primary = await h.reference.seedErrand(record);
  await h.seedErrandRef(record, "test-user");
  await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: record.createdAt,
    createdFor: { kind: "errand", slug: record.slug, claimId: record.claimId }, provisioning: "ready" });
  const invocation = { store: h.reference.store, workItem: primary.reference.owner };
  return { ...h, cwd, base, head, invocation };
}

it("repairs default policy resolution without injecting the Errand owner", async () => {
  const h = await fixture(), originalCwd = process.cwd();
  const target = { repository: "owner/repo", pullRequest: null, headSha: h.head };
  const request = { schemaVersion: 1, target, lane: "standard", frontlineActive: false,
    standardReview: projectStandardReviewObligation(resolveReviewRouting({}).decision), completedPasses: 0,
    attempts: [], scopeSelection: { mode: "whole-target", target } };
  const run = async () => {
    let output = "";
    await handleReviewResolve("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
      write: value => { output += value; }, setExitCode: () => {} }, undefined, { store: h.reference.store });
    return JSON.parse(output) as unknown;
  };
  try {
    process.chdir(h.cwd);
    expect(await run()).toMatchObject({ error: { code: "project-identity-unavailable" },
      remedy: { argv: ["arc", "review", "resolve", "-"], stdin: request } });
    await h.reference.seedProject(projectId);
    const result = await run();
    expect(result, JSON.stringify(result)).toMatchObject({ mode: "review-resolve", state: "ready",
      payload: { sourceId: "delegated-agent" } });
  } finally { process.chdir(originalCwd); await h.cleanup(); }
}, 30_000);

it("refuses local preparation without a project ID, carries its request, then prepares after repair", async () => {
  const h = await fixture(), originalCwd = process.cwd();
  const request = { schemaVersion: 1, evaluatorIdentity: "reviewer", routingFacts: {},
    policyJudgment: { scopeMode: "whole-target", invocation: { mode: "force", sourceId: "delegated-agent" } } };
  const invoke = async () => {
    const output: string[] = [];
    await handleReviewLocalPrepare("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
      write: text => { output.push(text); }, setExitCode: () => {} }, undefined, h.invocation);
    return JSON.parse(output.join(""));
  };
  try {
    process.chdir(h.cwd);
    const refused = await invoke();
    expect(refused).toMatchObject({ error: { code: "project-identity-unavailable" }, remedy: {
      text: expect.stringContaining("Restore the project's unique, valid identity record"),
      argv: ["arc", "review", "local", "prepare", "-"], stdin: request,
    } });
    await h.reference.seedProject(projectId);
    const prepared = await invoke();
    expect(prepared, JSON.stringify(prepared)).toMatchObject({ mode: "review-local-prepare", state: "ready" });
  } finally { process.chdir(originalCwd); await h.cleanup(); }
}, 30_000);

it("refuses frontline resolution without a project ID and resumes the selected invocation after repair", async () => {
  const h = await fixture(), originalCwd = process.cwd();
  const request = { schemaVersion: 1, target: { kind: "change-set", baseRef: "main", diffBaseSha: h.base, headSha: h.head },
    changeSet: { schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary",
      assurance: { workContext: "work-unit", workClass: "Light" }, activity: { selfReview: true, frontlineReview: false } },
    invocation: { mode: "skip" } };
  const invoke = async () => {
    const output: string[] = [];
    await handleReviewFrontlineResolve("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
      write: text => { output.push(text); }, setExitCode: () => {} }, undefined, h.invocation);
    return JSON.parse(output.join(""));
  };
  try {
    process.chdir(h.cwd);
    expect(await invoke()).toMatchObject({ error: { code: "project-identity-unavailable" }, remedy: {
      argv: ["arc", "review", "frontline", "resolve", "-"], stdin: request,
    } });
    await h.reference.seedProject(projectId);
    const resolved = await invoke();
    expect(resolved, JSON.stringify(resolved)).toMatchObject({ mode: "review-frontline-resolve", state: "skipped" });
  } finally { process.chdir(originalCwd); await h.cleanup(); }
}, 30_000);

it("refuses hosted await without a project ID, then replays its sealed result after repair", async () => {
  const { createHostedHandleFixture, createHostedTerminalAttemptFixture, publishHostedTerminalProgressFixture } = await import("../fixtures/hosted-review.js");
  const { createReviewCompositionContext } = await import("../../src/scripts/review-gate/runtime/composition-context.js");
  const { laneProgressOperationId } = await import("../../src/scripts/review-gate/lane-progress.js");
  const h = await fixture(), originalCwd = process.cwd();
  try {
    const handle = createHostedHandleFixture({ repositoryId: projectId,
      target: { repository: "owner/repo", pullRequest: 42, headSha: h.head },
      lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: "1".repeat(32), headSha: h.head } });
    const ended = createHostedTerminalAttemptFixture({ admission: handle.admission, artifact: handle.artifact, outcome: "clean" });
    const { family } = createReviewCompositionContext({ ...h.native, ...h.invocation });
    await publishHostedTerminalProgressFixture(family.ports.inFlight, {
      operationId: laneProgressOperationId({ lane: "standard", repositoryId: projectId, headSha: h.head, lineage: handle.admission.lineage }),
      repositoryId: projectId, changeRequestId: "pull/42", headSha: h.head, lineage: handle.admission.lineage,
      logicalPass: handle.admission.logicalPass, sourceId: handle.provider, outcome: "clean", terminal: ended,
      now: "2026-10-19T12:00:00Z" });
    const request = { schemaVersion: 1, handle };
    const invoke = async () => {
      const output: string[] = [];
      await handleReviewHostedAwait("-", { readText: async () => JSON.stringify(request),
        write: text => { output.push(text); }, setExitCode: () => {} }, undefined, h.invocation);
      return JSON.parse(output.join(""));
    };
    process.chdir(h.cwd);
    expect(await invoke()).toMatchObject({ error: { code: "project-identity-unavailable" }, remedy: {
      argv: ["arc", "review", "hosted", "await", "-"], stdin: request,
    } });
    await h.reference.seedProject(projectId);
    const awaited = await invoke();
    expect(awaited, JSON.stringify(awaited)).toMatchObject({ mode: "review-hosted-await", state: "clean" });
  } finally { process.chdir(originalCwd); await h.cleanup(); }
}, 30_000);

it("reports missing project identity through the read-only lane envelope and resumes after repair", async () => {
  const h = await fixture(), originalCwd = process.cwd();
  const request = { schemaVersion: 1 };
  const invoke = async () => {
    const output: string[] = [];
    await handleReviewLaneRead("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
      write: text => { output.push(text); }, setExitCode: () => {} }, undefined, h.invocation);
    return JSON.parse(output.join(""));
  };
  try {
    process.chdir(h.cwd);
    expect(await invoke()).toMatchObject({ state: "refused", payload: { code: "project-identity-unavailable",
      remedy: { text: expect.stringContaining("Restore the project's unique, valid identity record"),
        argv: ["arc", "review", "lane", "read", "-"], stdin: request } } });
    await h.reference.seedProject(projectId);
    const read = await invoke();
    expect(read, JSON.stringify(read)).toMatchObject({ mode: "review-lane-read", state: "ready" });
  } finally { process.chdir(originalCwd); await h.cleanup(); }
}, 30_000);

async function installStatusHost(h: Awaited<ReturnType<typeof fixture>>) {
  const exec = h.native.exec, cwd = h.cwd;
  const hostUrl = "git@github.com:owner/repo.git";
  await exec("git", ["remote", "set-url", "origin", hostUrl], { cwd });
  await exec("git", ["config", `url.${h.origin}.insteadOf`, hostUrl], { cwd });
  await exec("git", ["push", "origin", "main", "chore/review-errand"], { cwd });
  const bin = join(cwd, ".arc-fixture", "bin");
  await mkdir(bin, { recursive: true });
  const candidate = { number: 42, url: "https://github.com/owner/repo/pull/42", state: "OPEN",
    baseRefName: "main", headRefName: "chore/review-errand", headRefOid: h.head };
  const pull = { number: 42, state: "open", merged: false, draft: false,
    head: { ref: "chore/review-errand", sha: h.head, repo: { full_name: "owner/repo" } },
    base: { ref: "main", sha: h.base, repo: { full_name: "owner/repo" } } };
  const hostReview = { data: { repository: { pullRequest: { reviewDecision: null,
    latestOpinionatedReviews: { nodes: [] },
    reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
  await writeFile(join(bin, "gh"), ["#!/bin/sh", 'case "$1:$2" in',
    `repo:view) printf '%s\\n' '{"nameWithOwner":"owner/repo"}' ;;`,
    `pr:list) printf '%s\\n' '${JSON.stringify([candidate])}' ;;`,
    "pr:checks) echo 'no required checks reported' >&2; exit 1 ;;",
    `api:repos/owner/repo/pulls/42) printf '%s\\n' '${JSON.stringify(pull)}' ;;`,
    `api:repos/owner/repo/branches/main) printf '%s\\n' '{}' ;;`,
    `api:repos/owner/repo) printf '%s\\n' '{"allow_merge_commit":true,"allow_squash_merge":false,"allow_rebase_merge":false}' ;;`,
    `api:graphql) printf '%s\\n' '${JSON.stringify(hostReview)}' ;;`,
    "api:--paginate) printf '%s\\n' '[[]]' ;;",
    '*) echo "unexpected host invocation: $*" >&2; exit 1 ;;', "esac", ""].join("\n"));
  await chmod(join(bin, "gh"), 0o755);
  return bin;
}

it("preserves the project port's repair command through local preparation", async () => {
  const h = await fixture(), originalCwd = process.cwd();
  let repaired = false;
  const port = async () => {
    if (!repaired) throw new ProjectIdentityError({ status: "unavailable", reason: "Project state needs fetching.",
      remedy: { text: "Fetch the authoritative project state, then retry.", argv: ["git", "fetch", "origin"] } });
    return projectId;
  };
  const request = { schemaVersion: 1, evaluatorIdentity: "reviewer", routingFacts: {},
    policyJudgment: { scopeMode: "whole-target", invocation: { mode: "force", sourceId: "delegated-agent" } } };
  const invoke = async () => {
    const output: string[] = [];
    await handleReviewLocalPrepare("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
      write: text => { output.push(text); }, setExitCode: () => {} }, undefined, { ...h.invocation, projectId: port });
    return JSON.parse(output.join(""));
  };
  try {
    process.chdir(h.cwd);
    const refused = await invoke();
    expect(refused).toMatchObject({ error: { code: "project-identity-unavailable" }, remedy: {
      text: expect.stringContaining("Fetch the authoritative project state"), argv: ["git", "fetch", "origin"] } });
    expect(refused.remedy).not.toHaveProperty("stdin");
    await h.reference.seedProject(projectId);
    repaired = true;
    expect(await invoke()).toMatchObject({ state: "ready" });
  } finally { process.chdir(originalCwd); await h.cleanup(); }
}, 30_000);

it("reports project identity through the status failure arm and resumes after repair", async () => {
  const h = await fixture(), originalCwd = process.cwd(), originalPath = process.env.PATH;
  const target = { repository: "owner/repo", headRef: "chore/review-errand", headSha: h.head };
  let port: (() => Promise<string>) | undefined;
  const invoke = async () => {
    const output: string[] = [];
    await handleReviewStatus({ target: JSON.stringify(target) }, undefined, {
      resolveRoot: () => h.cwd, write: text => { output.push(text); }, setExitCode: () => {},
    }, { ...h.invocation, ...(port === undefined ? {} : { projectId: port }) });
    return JSON.parse(output.join(""));
  };
  try {
    process.chdir(h.cwd);
    process.env.PATH = `${await installStatusHost(h)}${delimiter}${originalPath ?? ""}`;
    const refused = await invoke();
    expect(refused, JSON.stringify(refused)).toMatchObject({ reason: "status-unavailable",
      detail: expect.stringContaining("project-identity-unavailable"), remedy: {
        text: expect.stringContaining("Restore the project's unique, valid identity record"),
        argv: ["arc", "review", "status", "--target", JSON.stringify(target)] } });
    port = async () => { throw new ProjectIdentityError({ status: "unavailable", reason: "Project state needs fetching.",
      remedy: { text: "Fetch the authoritative project state, then retry.", argv: ["git", "fetch", "origin"] } }); };
    expect(await invoke()).toMatchObject({ reason: "status-unavailable", remedy: {
      text: expect.stringContaining("Fetch the authoritative project state"), argv: ["git", "fetch", "origin"] } });
    await h.reference.seedProject(projectId);
    port = undefined;
    const resumed = await invoke();
    expect(resumed, JSON.stringify(resumed)).toMatchObject({ state: "review-required",
      routedObligation: { state: "review-required" } });
  } finally {
    process.chdir(originalCwd);
    if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath;
    await h.cleanup();
  }
}, 30_000);

it("preserves a lazy receipt identity refusal through public reduction and resumes after repair", async () => {
  const h = await fixture(), originalCwd = process.cwd();
  try {
    process.chdir(h.cwd);
    const identity = await h.reference.seedProject(projectId);
    const prepared = LocalPrepareEnvelopeSchema.parse(await inProcessReview.prepare(h.cwd, { schemaVersion: 1, evaluatorIdentity: "reviewer", routingFacts: {},
      policyJudgment: { scopeMode: "whole-target", invocation: { mode: "force", sourceId: "delegated-agent" } } }, h.invocation));
    if (prepared.state !== "ready") throw new Error(`Expected prepared review: ${JSON.stringify(prepared)}`);
    const payload = prepared.payload;
    await inProcessReview.attest(h.cwd, localReviewResult(payload, "identity-repair-review", []), h.invocation);
    lifecycleSuccess(await h.reference.store.write({ action: "remove", reference: identity.reference,
      expected: identity.version, provenance: { verb: "remove-fixture-identity", lifecycleAction: "remove" } }));
    const readResult = () => createRepositoryReviewResultReader(
      new RepositoryGitCommonStatePublisher(h.native.exec, h.cwd), h.invocation).readResult(payload.operationId);
    await expect(readResult()).rejects.toBeInstanceOf(ProjectIdentityError);
    const request = { schemaVersion: 1, operationId: payload.operationId };
    const invoke = async () => {
      const output: string[] = [];
      await handleReviewReduce("-", { resolveRoot: () => h.cwd, readText: async () => JSON.stringify(request),
        write: text => { output.push(text); }, setExitCode: () => {} }, undefined, h.invocation);
      return JSON.parse(output.join(""));
    };
    const refused = await invoke();
    expect(refused, JSON.stringify(refused)).toMatchObject({ error: { code: "project-identity-unavailable" }, remedy: {
      argv: ["arc", "review", "reduce", "-"], stdin: request,
      text: expect.stringContaining("Restore the project's unique, valid identity record") } });
    await h.reference.seedProject(projectId);
    expect(await readResult()).toMatchObject({ kind: "attested-local", originalOutcome: "clean" });
    expect(await invoke()).toMatchObject({ mode: "review-reduce", state: "advisory-complete" });
  } finally { process.chdir(originalCwd); await h.cleanup(); }
}, 30_000);

it("keeps immutable-target identity failures typed across pre-publication composition and repairs", async () => {
  const h = await fixture();
  const dependencies = () => createPrePublicationCompositionDependencies({ cwd: h.cwd, exec: h.native.exec, ...h.invocation });
  try {
    await expect(dependencies().deriveImmutableTarget(h.head)).rejects.toBeInstanceOf(ProjectIdentityError);
    await h.reference.seedProject(projectId);
    expect(await dependencies().deriveImmutableTarget(h.head)).toMatchObject({ status: "resolved",
      target: { repositoryId: projectId, headSha: h.head } });
  } finally { await h.cleanup(); }
}, 30_000);
