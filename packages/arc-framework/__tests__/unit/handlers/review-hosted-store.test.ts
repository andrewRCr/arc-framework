/** Native hosted defaults retain their selected owner through the produced await action. */
import { RespondEnvelopeSchema } from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import { approveDispositionState } from "../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewCompositionContext } from "../../../src/scripts/review-gate/runtime/composition-context.js";
import { createReviewEvidencePort } from "../../../src/lib/store/kinds/review/evidence/access.js";
import { scriptRawGitExec } from "../../helpers/git-exec-fake.js";
import { withReviewReport } from "../../fixtures/review-report-input.js";
import { HostedAwaitCommandResultSchema } from "../../../src/scripts/review-gate/hosted/await.js";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { handleReviewHostedRequest, handleReviewHostedAwait, handleReviewRespond, handleReviewHostedSettle } from "../../../src/handlers/review.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot } from "../../../src/lib/work-unit/candidate-attestation.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { createStandardReviewReservation } from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import type { OwnerIdentity } from "../../../src/lib/store/identity.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";
import { resolveReviewRouting } from "../../../src/scripts/review-gate/policy/routing.js";
import { projectStandardReviewObligation } from "../../../src/scripts/review-gate/policy/standard-review-projection.js";
import { resolveReviewPolicy, ReviewPolicyCommandRequestSchema, projectReviewPolicyAttempt } from "../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { withReviewNextPassContext } from "../../fixtures/review-next-pass.js";
import { HostedRequestEnvelopeSchema, HostedRequestResultSchema } from "../../../src/scripts/review-gate/hosted/request.js";
import type { HostedProcessRunner } from "../../../src/scripts/review-gate/hosted/gh-process.js";
import { RepositoryGitCommonStatePublisher } from "../../../src/lib/git-common-state.js";
import { HostedRequestOwnerIndex } from "../../../src/scripts/review-gate/hosts/local/hosted-request-owner-index.js";
import { bindReviewSourceReference, parseReviewSourceReference } from "../../../src/scripts/review-gate/core/review-source-reference.js";
import { bindNativeReviewOperationReference, parseNativeReviewOperationReference } from "../../../src/scripts/review-gate/core/review-operation-reference.js";

import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
const head = "a".repeat(40), base = "b".repeat(40), branch = "chore/repair";

async function fixture(workUnit = false, findings = false, threaded = false) {
  const h = createReviewHarness();
  const projectRecord = await h.seedProject(projectId);
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
    claimId: "1".repeat(32), intent: "Repair one issue", owner: "test-user", origin: "description", originEntry: null,
    branch, state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
  if (record.kind !== "errand") throw new Error("Expected ordinary Errand");
  const primary = workUnit ? await h.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  }) : await h.seedErrand(record);
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["rev-parse", "--verify", "HEAD^{commit}"], responses: [{ stdout: head }] },
    { match: ["for-each-ref", "--format=%(objectname)", "refs/remotes/origin/main"], responses: [{ stdout: base }] },
    { match: ["merge-base", "--all", head, base], responses: [{ stdout: base }] },
    { match: ["merge-base", "--all", "refs/heads/main", head], responses: [{ stdout: base }] },
    { match: ["diff", "--cached", "--name-only", "-z", base, "--"], responses: [{ stdout: "" }] },
    { match: ["diff", "--name-only", "-z", base, head, "--"], responses: [{ stdout: "" }] },
    { match: ["rev-list", `${base}..${head}`], responses: [{ stdout: head }] },
    { match: ["status", "--porcelain=v2", "--untracked-files=normal"], responses: [{ stdout: "" }] },
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    { match: ["config", "--get", "remote.origin.url"], responses: [{ stdout: "https://github.com/owner/repository.git" }] },
    { match: ["check-ref-format", "--branch", branch], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], responses: [{ stdout: head }] },
    { match: ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], responses: [{ stdout: `${head}\trefs/heads/${branch}` }] },
    { command: "gh", match: { prefix: ["pr", "list", "--repo", "owner/repository", "--state", "all"] }, responses: [{
      stdout: JSON.stringify([{ number: 42, url: "https://example.test/pull/42", state: "OPEN", baseRefName: "main",
        headRefName: branch, headRefOid: head }]),
    }] },
    { match: ["rev-parse", "--show-object-format"], responses: [{ stdout: "sha1" }] },
    { match: ["rev-parse", "HEAD"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "--verify", "refs/heads/main"], responses: [{ stdout: base }] },
    ...[head, base].flatMap(revision => [
      { match: ["rev-parse", "--verify", revision], responses: [{ stdout: revision }] },
      { match: ["cat-file", "-t", revision], responses: [{ stdout: "commit" }] },
    ]),
    { match: ["merge-base", "--all", base, head], responses: [{ stdout: base }] },
    { match: ["rev-parse", `${base}^{tree}`], responses: [{ stdout: "c".repeat(40) }] },
    { match: ["rev-parse", `${head}^{tree}`], responses: [{ stdout: "d".repeat(40) }] },
  ] });
  onTestFinished(checkout.cleanup);
  await appendFile(join(checkout.cwd, ".arc", "system", "arc-config.yml"), "review.standard_sources: [codex-pr]\n");
  await checkout.occupy(branch, workUnit ? { kind: "work-unit", name: "example" }
    : { kind: "errand", slug: record.slug, claimId: record.claimId });
  const target = { repository: "owner/repository", pullRequest: 42, headSha: head };
  const routing = resolveReviewRouting({ schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing",
    reviewRisk: "sensitive", changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary",
    assurance: { workContext: "errand", workClass: "none" }, activity: { selfReview: true, frontlineReview: false } });
  const policyRequest = withReviewNextPassContext({ schemaVersion: 1, target, lane: "standard",
    standardReview: projectStandardReviewObligation(routing.decision), sources: ["codex-pr"], completedPasses: 0,
    maxPasses: 2, attempts: [], errandVehicle: true, invocation: { mode: "force", sourceId: "codex-pr" } });
  const policy = resolveReviewPolicy(policyRequest);
  if (policy.state !== "ready" || policy.nextAction !== "hosted-request") throw new Error(JSON.stringify(policy));
  if (workUnit) {
    const subject = createCandidateSubjectSnapshot([]);
    const candidate = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const, subject,
      attestation: createCandidateAttestation({ workUnit: "example", subject, baseRevision: head, attestedBy: "test-user",
        attestedAt: "2026-10-19T12:00:00Z", verificationEvidenceRef: "verified" }), transitions: [], lineageAttestations: [] };
    await h.seedCandidate(primary.reference.owner, candidate);
    const reservation = createStandardReviewReservation({ candidateId: candidate.attestation.candidateId,
      sourceId: "codex-pr", sources: ["codex-pr"], repository: target.repository, headSha: head,
      obligation: projectStandardReviewObligation(routing.decision) });
    await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
      mode: "integration-boundary", workUnit: "example", candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: subject.subjectDigest, locus: "hosted-review-pending", reservation,
      nextAction: { kind: "continue-pre-publication-review", command: "arc review pre-publication example",
        interactionText: "Continue review." } }));
  }
  const request = HostedRequestEnvelopeSchema.parse(workUnit
    ? { schemaVersion: 1, target, provider: "codex-pr", coverage: "complete" } : policy.action);
  let complete = false, resolved = false;
  let reply: string | null = null;
  const hostedRunner: HostedProcessRunner = { run: async args => {
    const endpoint = args[1];
    let value: unknown;
    if (args[0] !== "api") throw new Error(`Unexpected hosted command: ${args.join(" ")}`);
    if (endpoint === "user") value = { id: 123 };
    else if (endpoint === "repos/owner/repository/pulls/42") value = { number: 42, state: "open", merged: false, draft: false,
      head: { ref: branch, sha: head, repo: { full_name: target.repository } },
      base: { ref: "main", sha: base, repo: { full_name: target.repository } } };
    else if (endpoint === "repos/owner/repository/issues/42/comments" && args.includes("POST")) value = {
      node_id: "request-comment", html_url: "https://example.test/request", user: { id: 123 }, body: "@codex review",
      created_at: "2026-10-19T12:00:00Z", updated_at: "2026-10-19T12:00:00Z" };
    else if (endpoint?.startsWith("repos/owner/repository/issues/42/comments?")) value = [complete ? [{
      node_id: "clean-comment", html_url: "https://example.test/clean", user: { id: 199175422 },
      performed_via_github_app: { id: 1144995 }, body: `Codex Review: didn't find any major issues\nReviewed commit: ${head}`,
      created_at: "2026-10-19T12:01:00Z", updated_at: "2026-10-19T12:01:00Z",
    }] : []];
    else if (endpoint?.startsWith("repos/owner/repository/pulls/42/reviews?")) value = [complete && findings ? [{
      node_id: "finding-review", html_url: "https://example.test/review", user: { id: 199175422 }, state: "COMMENTED",
      commit_id: head, submitted_at: "2026-10-19T12:01:00Z", body: threaded ? "" : `<!-- codex-code-review-finding:v1 -->
### 💡 Codex Review
https://github.com/owner/repository/blob/${head}/src/example.ts#L7
**<sub><sub>![P1 Badge](https://img.shields.io/badge/P1-yellow?style=flat)</sub></sub> Preserve target facts**
Reclassify the changed target before continuing.`,
    }] : []];
    else if (endpoint === "repos/owner/repository/pulls/42/comments/123/replies") {
      reply = args.find(arg => arg.startsWith("body="))?.slice(5) ?? null;
      value = { id: 456 };
    } else if (endpoint?.startsWith("repos/owner/repository/pulls/42/comments?")) value = [reply === null ? [] : [
      { id: 456, in_reply_to_id: 123, user: { id: 123 }, body: reply },
    ]];
    else if (endpoint === "graphql" && args.some(arg => arg.includes("resolveReviewThread"))) {
      resolved = true;
      value = { data: { resolveReviewThread: { thread: { id: "finding-thread", isResolved: true } } } };
    } else if (endpoint === "graphql") value = { data: { repository: { pullRequest: {
      reviewThreads: { nodes: complete && findings && threaded ? [{ id: "finding-thread", isResolved: resolved,
        comments: { nodes: [{ fullDatabaseId: 123, pullRequestReview: { id: "finding-review" }, replyTo: null,
          author: { databaseId: 199175422 }, body: "[P1] Preserve target facts", path: "src/example.ts", line: 7,
          url: "https://example.test/thread/123", commit: { oid: head } }],
        pageInfo: { hasNextPage: false, endCursor: null } } }] : [],
        pageInfo: { hasNextPage: false, endCursor: null } },
    } } } };
    else throw new Error(`Unexpected hosted command: ${args.join(" ")}`);
    return { stdout: JSON.stringify(value), stderr: "" };
  } };
  const invoke = async (handler: typeof handleReviewHostedRequest | typeof handleReviewHostedAwait | typeof handleReviewHostedSettle, input: unknown,
    bound: { workItem?: OwnerIdentity; store?: Store } = {}) => {
    let output = "";
    const invocation = { ...checkout, ...bound, cwd: checkout.cwd, hostedRunner,
      projectId: createProjectIdentityReader(checkout.store) };
    await handler("-", { readText: async () => JSON.stringify(input), write: text => { output += text; }, setExitCode: () => {} },
      undefined, invocation);
    return JSON.parse(output) as unknown;
  };
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const index = new HostedRequestOwnerIndex(publisher);
  return { ...checkout, primary, request, policyRequest, record, publisher, index, complete: () => { complete = true; },
    removeProject: async () => { lifecycleSuccess(await h.store.write({ action: "remove", reference: projectRecord.reference,
      expected: projectRecord.version, provenance: { verb: "remove", lifecycleAction: "remove" } })); },
    respond: async (input: unknown, bound: { workItem?: OwnerIdentity; store?: Store } = {}) => {
      let output = "";
      await handleReviewRespond("-", { resolveRoot: () => checkout.cwd, readText: async () => JSON.stringify(input),
        write: text => { output += text; }, setExitCode: () => {} }, undefined,
      { ...checkout, ...bound, rawGit: scriptRawGitExec([{ match: ["diff", "--numstat", "-z", "-M", "-C", "--find-copies-harder", `${base}..${head}`, "--"],
        responses: [{ stdout: Buffer.from("1\t0\tsrc/example.ts\0") }] }]).exec, projectId: createProjectIdentityReader(checkout.store) });
      return JSON.parse(output) as unknown;
    },
    run: (bound?: { workItem?: OwnerIdentity }) => invoke(handleReviewHostedRequest, request, bound),
    settle: (input: unknown, bound?: { workItem?: OwnerIdentity; store?: Store }) => invoke(handleReviewHostedSettle, input, bound),
    awaitResult: (input: unknown, bound?: { workItem?: OwnerIdentity; store?: Store }) => invoke(handleReviewHostedAwait, input, bound) };
}

it("retains the stored Errand owner from hosted request through its actual await action", async () => {
  const h = await fixture();
  const raw = await h.run();
  expect(raw, JSON.stringify(raw)).toMatchObject({ state: "requested", nextAction: "await" });
  const requested = HostedRequestResultSchema.parse(raw);
  if (requested.state !== "requested" || requested.operationRef === undefined) throw new Error(JSON.stringify(requested));
  expect(requested.action.operationRef).toBe(requested.operationRef);
  expect(parseNativeReviewOperationReference(requested.operationRef)).toEqual({ repositoryId: projectId,
    operationId: requested.handle.admission.admissionId, workItem: h.primary.reference.owner });
  const index = new HostedRequestOwnerIndex(new RepositoryGitCommonStatePublisher(h.exec, h.cwd));
  expect(await index.read(projectId, h.request)).toMatchObject({ workItem: h.primary.reference.owner });
  h.complete();
  expect(await h.awaitResult(requested.action)).toMatchObject({ state: "clean", nextAction: "complete",
    operationRef: requested.operationRef });
});

it.each(["missing", "foreign-project", "bound-owner", "pending-owner", "malformed", "wrong-id"] as const)(
  "refuses a %s hosted await reference and succeeds after correction", async invalid => {
    const h = await fixture();
    const requested = HostedRequestResultSchema.parse(await h.run());
    if (requested.state !== "requested" || requested.operationRef === undefined) throw new Error(JSON.stringify(requested));
    const reference = parseNativeReviewOperationReference(requested.operationRef);
    const other = await h.seedMeta("other");
    const operationRef = invalid === "missing" ? undefined : invalid === "malformed" ? "arc-review-operation:v1:broken"
      : bindNativeReviewOperationReference({ ...reference,
        repositoryId: invalid === "foreign-project" ? "another-project" : reference.repositoryId,
        operationId: invalid === "wrong-id" ? "another-operation" : reference.operationId,
        workItem: invalid === "pending-owner" ? other.reference.owner : reference.workItem });
    h.complete();
    const saved = await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" });
    if (invalid === "bound-owner") {
      for (const entry of saved) if (entry.kind === "file") await h.publisher.update(
        { root: "review-gate", namespace: "in-flight" }, entry.name, () => ({ kind: "delete", result: undefined }));
    }
    const before = await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" });
    expect(await h.awaitResult({ ...requested.action, operationRef },
      { workItem: invalid === "bound-owner" ? other.reference.owner : undefined })).toMatchObject({ error: invalid === "pending-owner"
        ? { message: "hosted acknowledged request is unavailable" }
        : { code: "invalid-input", message: expect.stringContaining("matching reference") } });
    expect(await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" })).toEqual(before);
    if (invalid === "bound-owner") {
      for (const entry of saved) if (entry.kind === "file") await h.publisher.update(
        { root: "review-gate", namespace: "in-flight" }, entry.name,
        () => ({ kind: "write", content: entry.content, result: undefined }));
    }
    expect(await h.awaitResult(requested.action)).toMatchObject({ state: "clean", nextAction: "complete",
      operationRef: requested.operationRef });
  });

it("rejects native hosted locators at a repository root", async () => {
  const h = await fixture();
  const requested = HostedRequestResultSchema.parse(await h.run());
  if (requested.state !== "requested") throw new Error(JSON.stringify(requested));
  const store = createStore(createDefaultStorePorts({ checkoutRoot: h.cwd, exec: h.exec }));
  expect(await h.awaitResult(requested.action, { store })).toMatchObject({ error: {
    code: "invalid-input", message: expect.stringContaining("matching reference"),
  } });
});

it("retains a bound internal hosted owner without an input locator and publishes its locator", async () => {
  const h = await fixture();
  const requested = HostedRequestResultSchema.parse(await h.run());
  if (requested.state !== "requested") throw new Error(JSON.stringify(requested));
  h.complete();
  expect(await h.awaitResult({ schemaVersion: 1, handle: requested.handle }, { workItem: h.primary.reference.owner }))
    .toMatchObject({ state: "clean", operationRef: requested.operationRef });
});

it("preserves hosted project-identity recovery before reference selection", async () => {
  const h = await fixture();
  const requested = HostedRequestResultSchema.parse(await h.run());
  if (requested.state !== "requested") throw new Error(JSON.stringify(requested));
  await h.removeProject();
  const input = { schemaVersion: 1, handle: requested.handle };
  expect(await h.awaitResult(input)).toMatchObject({ error: { code: "project-identity-unavailable" },
    remedy: { argv: ["arc", "review", "hosted", "await", "-"], stdin: input } });
  await h.seedProject(projectId);
  h.complete();
  expect(await h.awaitResult(requested.action)).toMatchObject({ state: "clean", operationRef: requested.operationRef });
});

it("checks the indexed owner during request replay and retries with the matching owner", async () => {
  const h = await fixture();
  const requested = HostedRequestResultSchema.parse(await h.run());
  if (requested.state !== "requested") throw new Error(JSON.stringify(requested));
  const other = await h.seedMeta("other");
  expect(await h.run({ workItem: other.reference.owner })).toMatchObject({ error: {
    code: "invalid-input", message: expect.stringContaining("matching reference"),
  } });
  expect(await h.run()).toEqual(requested);
});

it.each(["missing", "other-owner"] as const)("refuses a %s indexed owner and replays after index repair", async invalid => {
  const h = await fixture();
  const requested = HostedRequestResultSchema.parse(await h.run());
  if (requested.state !== "requested") throw new Error(JSON.stringify(requested));
  const saved = await h.index.read(projectId, h.request);
  if (saved === null) throw new Error("Expected produced owner index");
  const entries = await h.publisher.snapshot({ root: "review-gate", namespace: "identity" });
  const entry = entries.find(item => item.kind === "file" && item.content.includes(saved.fingerprint));
  if (entry?.kind !== "file") throw new Error("Expected produced owner-index bytes");
  const other = await h.seedMeta("other");
  const corrupt = { ...saved, workItem: invalid === "missing" ? undefined : other.reference.owner };
  await h.publisher.update({ root: "review-gate", namespace: "identity" }, entry.name,
    () => ({ kind: "write", content: JSON.stringify(corrupt), result: undefined }));
  const refused = await h.run();
  expect(refused).toMatchObject(invalid === "missing" ? { error: { message: expect.stringContaining("Restore") } }
    : { state: "ambiguous-delivery", nextAction: "stop" });
  await h.publisher.update({ root: "review-gate", namespace: "identity" }, entry.name,
    () => ({ kind: "write", content: entry.content, result: undefined }));
  expect(await h.run()).toEqual(requested);
});

it("retains a branch-linked Work Unit UID through default hosted continuation after slug reuse", async () => {
  const h = await fixture(true);
  const raw = await h.run();
  expect(raw, JSON.stringify(raw)).toMatchObject({ state: "requested", nextAction: "await" });
  const requested = HostedRequestResultSchema.parse(raw);
  if (requested.state !== "requested" || requested.operationRef === undefined) throw new Error(JSON.stringify(requested));
  expect(parseNativeReviewOperationReference(requested.operationRef).workItem).toEqual(h.primary.reference.owner);
  lifecycleSuccess(await h.store.write({ action: "put", reference: h.primary.reference, expected: h.primary.version,
    content: h.primary.content, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const replacement = await h.seedMeta("example", { branch: null });
  expect(replacement.reference.owner).not.toEqual(h.primary.reference.owner);
  h.complete();
  expect(await h.awaitResult(requested.action)).toMatchObject({ state: "clean", operationRef: requested.operationRef });
});

it("publishes a native hosted source reference outside the sealed result identity", async () => {
  const h = await fixture();
  const requested = HostedRequestResultSchema.parse(await h.run());
  if (requested.state !== "requested" || requested.operationRef === undefined) throw new Error(JSON.stringify(requested));
  h.complete();
  const result = HostedAwaitCommandResultSchema.parse(await h.awaitResult(requested.action));
  if (result.state !== "clean" || result.responseSourceRef === undefined) throw new Error(JSON.stringify(result));
  const snapshot = await createReviewCompositionContext({ ...h, workItem: h.primary.reference.owner }).family.ports.inFlight.readOperationSnapshot();
  if (snapshot.status !== "complete") throw new Error(JSON.stringify(snapshot));
  const lane = snapshot.records.find(({ state }) => state.kind === "lane-progress");
  if (lane?.state.kind !== "lane-progress") throw new Error("Expected actual lane state");
  const attempt = lane.state.attempts.find(item => item.hosted?.admission.admissionId === requested.handle.admission.admissionId);
  if (attempt === undefined) throw new Error("Expected actual acknowledged attempt");
  expect(parseReviewSourceReference(result.responseSourceRef, "hosted", true)).toEqual({ repositoryId: projectId,
    workItem: h.primary.reference.owner, kind: "hosted", operationId: lane.state.operationId, durableRef: attempt.attemptId });
  const replay = await h.awaitResult(requested.action);
  expect(replay).toMatchObject({ responseSourceRef: result.responseSourceRef, hostedResultId: result.hostedResultId });
});

async function hostedProposalFixture(threaded = false) {
  const h = await fixture(false, true, threaded);
  const requested = HostedRequestResultSchema.parse(await h.run());
  if (requested.state !== "requested") throw new Error(JSON.stringify(requested));
  h.complete();
  const raw = await h.awaitResult(requested.action);
  expect(raw, JSON.stringify(raw)).toMatchObject({ state: "findings" });
  const result = HostedAwaitCommandResultSchema.parse(raw);
  if (result.state !== "findings" || result.responseSourceRef === undefined) throw new Error(JSON.stringify(result));
  const request = withReviewReport({ schemaVersion: 1,
    source: { kind: "hosted", attemptRef: result.responseSourceRef },
    proposal: { proposedVerification: "focused", severityGatingPolicy: { minorGating: "record-only" },
      findings: result.findings.map(finding => ({ findingId: finding.findingId, sourceVerification: "verified", verifiedSeverity: finding.severity,
        verificationRefs: ["source:src/example.ts:7"], disposition: "defer", title: "Preserve target facts",
        issue: "The target changes before continuation.", rationale: "The selected source supports the finding.",
        recommendation: "Retain the target facts.", openQuestions: [] })) } });
  return { ...h, result, sourceReference: result.responseSourceRef, request };
}

it("binds a hosted response proposal from the source emitted by default await", async () => {
  const h = await hostedProposalFixture();
  const response = await h.respond(h.request);
  expect(response, JSON.stringify(response)).toMatchObject({ state: "awaiting-approval", nextAction: "obtain-approval" });
});

it.each(["missing", "foreign-project", "bound-owner", "pending-owner", "malformed", "wrong-kind", "legacy"] as const)(
  "refuses a %s hosted response source and accepts its corrected producer reference", async invalid => {
    const h = await hostedProposalFixture();
    const reference = parseReviewSourceReference(h.sourceReference, "hosted", true);
    if (!("workItem" in reference)) throw new Error("Expected native source");
    const other = await h.seedMeta("other");
    const attemptRef = invalid === "missing" ? undefined : invalid === "malformed" ? "arc-review-source:v2:broken" : invalid === "legacy"
      ? bindReviewSourceReference({ kind: "hosted", operationId: reference.operationId, durableRef: reference.durableRef })
      : bindReviewSourceReference({ ...reference, kind: invalid === "wrong-kind" ? "frontline" : "hosted",
        repositoryId: invalid === "foreign-project" ? "another-project" : reference.repositoryId,
        workItem: invalid === "pending-owner" ? other.reference.owner : reference.workItem });
    const input = { ...(h.request as object), source: { kind: "hosted", attemptRef } };
    const before = lifecycleSuccess(await h.store.version());
    expect(await h.respond(input, { workItem: invalid === "bound-owner" ? other.reference.owner : undefined }))
      .toMatchObject({ error: invalid === "pending-owner" ? { code: "corrupt-state", message: expect.stringContaining("No review producer matches") }
        : { code: "invalid-input", message: expect.stringContaining("matching reference") } });
    expect(lifecycleSuccess(await h.store.version())).toBe(before);
    expect(await h.respond(h.request)).toMatchObject({ state: "awaiting-approval", nextAction: "obtain-approval" });
  });

it("preserves response project recovery before selecting its source owner", async () => {
  const h = await hostedProposalFixture();
  await h.removeProject();
  expect(await h.respond(h.request)).toMatchObject({ error: { code: "project-identity-unavailable" },
    remedy: { argv: ["arc", "review", "respond", "-"], stdin: h.request } });
  await h.seedProject(projectId);
  expect(await h.respond(h.request)).toMatchObject({ state: "awaiting-approval" });
});

it("rejects a native response source at a repository root", async () => {
  const h = await hostedProposalFixture();
  const store = createStore(createDefaultStorePorts({ checkoutRoot: h.cwd, exec: h.exec }));
  expect(await h.respond(h.request, { store })).toMatchObject({ error: {
    code: "invalid-input", message: expect.stringContaining("matching reference"),
  } });
});

it("keeps internal response calls that already hold the exact owner", async () => {
  const h = await hostedProposalFixture();
  const reference = parseReviewSourceReference(h.sourceReference, "hosted", true);
  const attemptRef = bindReviewSourceReference({ kind: "hosted", operationId: reference.operationId,
    durableRef: reference.durableRef });
  expect(await h.respond({ ...(h.request as object), source: { kind: "hosted", attemptRef } },
    { workItem: h.primary.reference.owner })).toMatchObject({ state: "awaiting-approval" });
});

it("reads an ended hosted source after its working state is pruned", async () => {
  const h = await hostedProposalFixture();
  const before = lifecycleSuccess(await h.store.version());
  const location = { root: "review-gate", namespace: "in-flight" } as const;
  const retained = await h.publisher.snapshot(location);
  for (const entry of retained) if (entry.kind === "file") {
    await h.publisher.update(location, entry.name, () => ({ kind: "delete", result: undefined }));
  }
  expect(await h.publisher.snapshot(location)).toEqual([]);
  expect(await h.respond(h.request)).toMatchObject({ state: "awaiting-approval" });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
});

async function approvedHostedResponseFixture(threaded: boolean) {
  const h = await hostedProposalFixture(threaded);
  const proposal = RespondEnvelopeSchema.parse(await h.respond(h.request));
  if (proposal.state !== "awaiting-approval") throw new Error(JSON.stringify(proposal));
  const approved = approveDispositionState({ proposed: proposal.payload.proposal, approvedBy: "test-user",
    approvedAt: new Date().toISOString() });
  const reference = parseReviewSourceReference(h.sourceReference, "hosted", true);
  const operations = createReviewCompositionContext({ ...h, workItem: h.primary.reference.owner }).family.ports.inFlight;
  const saved = await operations.readOperation(reference.operationId);
  if (saved.state?.kind !== "lane-progress") throw new Error("Expected composed native lane");
  const attempt = saved.state.attempts.find(item => item.attemptId === reference.durableRef);
  if (attempt?.hosted === undefined) throw new Error("Expected actual hosted attempt");
  const policyRequest = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1, target: h.policyRequest.target,
    lane: h.policyRequest.lane, standardReview: h.policyRequest.standardReview, invocation: h.policyRequest.invocation,
    completedPasses: attempt.logicalPass, attempts: [projectReviewPolicyAttempt(attempt)] });
  const approvalResult = await h.respond({ schemaVersion: 1,
    source: { kind: "hosted", attemptRef: h.sourceReference }, dispositions: approved, policyRequest });
  expect(approvalResult, JSON.stringify(approvalResult)).toMatchObject({ state: threaded ? "ready-to-settle" : "settled" });
  const evidence = await createReviewEvidencePort(h.store, h.primary.reference.owner).read(approved.dispositionSet.dispositionSetId);
  expect(evidence?.value.dispositionSet).toEqual(approved.dispositionSet);
  return { ...h, approved, attempt };
}

async function hostedSettlementFixture() {
  const h = await approvedHostedResponseFixture(true);
  const { approved, attempt } = h;
  const hosted = attempt.hosted;
  const finding = hosted?.sealedResult?.findings[0];
  if (hosted === undefined || finding?.origin !== "review-thread") throw new Error("Expected actual thread finding");
  const request = { schemaVersion: 1, response: { attemptRef: h.sourceReference,
    dispositionSetId: approved.dispositionSet.dispositionSetId, findingId: finding.findingId },
    target: hosted.target, fixTarget: null, actorIdentity: hosted.actorIdentity,
    finding: { commentId: finding.commentId, threadId: finding.threadId }, disposition: "defer",
    reply: "The verified finding is deferred to a separate repair." };
  return { ...h, settlementRequest: request, approved };
}

it("settles a produced native hosted source through the default handler and replays it", async () => {
  const h = await hostedSettlementFixture();
  const settled = await h.settle(h.settlementRequest);
  expect(settled, JSON.stringify(settled)).toMatchObject({ state: "settled", nextAction: "complete", replyId: "456" });
  const evidence = createReviewEvidencePort(h.store, h.primary.reference.owner);
  const first = await evidence.read(h.approved.dispositionSet.dispositionSetId);
  expect(first?.value.settlement?.evidence).toMatchObject([{ replyId: "456", channelAction: "reply-and-resolve" }]);
  expect(await h.settle(h.settlementRequest)).toMatchObject({ state: "already-settled", replyId: "456" });
  expect(await evidence.read(h.approved.dispositionSet.dispositionSetId)).toEqual(first);
});

it.each(["missing", "malformed", "wrong-kind", "foreign-project", "bound-owner", "pending-owner", "legacy"] as const)(
  "refuses a %s hosted settlement source and settles after correction", async invalid => {
    const h = await hostedSettlementFixture();
    const reference = parseReviewSourceReference(h.sourceReference, "hosted", true);
    if (!("workItem" in reference)) throw new Error("Expected native source");
    const other = await h.seedMeta("other");
    const attemptRef = invalid === "missing" ? undefined : invalid === "malformed" ? "arc-review-source:v2:broken"
      : invalid === "legacy" ? bindReviewSourceReference({ kind: "hosted", operationId: reference.operationId,
        durableRef: reference.durableRef }) : bindReviewSourceReference({ ...reference,
          kind: invalid === "wrong-kind" ? "frontline" : "hosted",
          repositoryId: invalid === "foreign-project" ? "another-project" : reference.repositoryId,
          workItem: invalid === "pending-owner" ? other.reference.owner : reference.workItem });
    const request = { ...h.settlementRequest, response: { ...h.settlementRequest.response, attemptRef } };
    const before = await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" });
    expect(await h.settle(request, { workItem: invalid === "bound-owner" ? other.reference.owner : undefined }))
      .toMatchObject({ error: invalid === "pending-owner" ? { message: "Hosted settlement requires a persisted standard-lane operation." }
        : { code: "invalid-input", message: expect.stringContaining("matching reference") } });
    expect(await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" })).toEqual(before);
    expect(await h.settle(h.settlementRequest)).toMatchObject({ state: "settled", replyId: "456" });
  });

it("preserves hosted settlement project recovery and retries the submitted request", async () => {
  const h = await hostedSettlementFixture();
  await h.removeProject();
  expect(await h.settle(h.settlementRequest)).toMatchObject({ error: { code: "project-identity-unavailable" },
    remedy: { argv: ["arc", "review", "hosted", "settle", "-"], stdin: h.settlementRequest } });
  await h.seedProject(projectId);
  expect(await h.settle(h.settlementRequest)).toMatchObject({ state: "settled" });
});

it("rejects native settlement sources at a repository root", async () => {
  const h = await hostedSettlementFixture();
  const store = createStore(createDefaultStorePorts({ checkoutRoot: h.cwd, exec: h.exec }));
  expect(await h.settle(h.settlementRequest, { store })).toMatchObject({ error: {
    code: "invalid-input", message: expect.stringContaining("matching reference"),
  } });
});

it("settles internal calls that already hold their exact owner", async () => {
  const h = await hostedSettlementFixture();
  const reference = parseReviewSourceReference(h.sourceReference, "hosted", true);
  const attemptRef = bindReviewSourceReference({ kind: "hosted", operationId: reference.operationId,
    durableRef: reference.durableRef });
  expect(await h.settle({ ...h.settlementRequest, response: { ...h.settlementRequest.response, attemptRef } },
    { workItem: h.primary.reference.owner })).toMatchObject({ state: "settled" });
});

it.each(["actor", "disposition"] as const)("retains the existing settlement %s check after native binding", async field => {
  const h = await hostedSettlementFixture();
  const request = { ...h.settlementRequest, actorIdentity: field === "actor" ? "another-actor" : h.settlementRequest.actorIdentity,
    disposition: field === "disposition" ? "reject" : h.settlementRequest.disposition };
  const before = await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" });
  expect(await h.settle(request)).toMatchObject({ error: {
    message: expect.stringContaining(field === "actor" ? "actorIdentity differs" : "approved disposition"),
  } });
  expect(await h.publisher.snapshot({ root: "review-gate", namespace: "in-flight" })).toEqual(before);
  expect(await h.settle(h.settlementRequest)).toMatchObject({ state: "settled" });
});

it("settles native hosted body findings from their approved record-only evidence", async () => {
  const h = await approvedHostedResponseFixture(false);
  const evidence = await createReviewEvidencePort(h.store, h.primary.reference.owner).read(h.approved.dispositionSet.dispositionSetId);
  expect(evidence?.value.settlement).toMatchObject({ evidence: [{ channelAction: "record-only", disposition: "defer" }] });
  const operations = createReviewCompositionContext({ ...h, workItem: h.primary.reference.owner }).family.ports.inFlight;
  const reference = parseReviewSourceReference(h.sourceReference, "hosted", true);
  expect((await operations.readOperation(reference.operationId)).state).toMatchObject({ attempts: [{ outcome: "settled-findings" }] });
});
