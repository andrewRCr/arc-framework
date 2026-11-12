/** Generic native policy calculates without a vehicle until record evidence is required. */
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { writeSubmissionBoundary } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { projectPublicationBoundary, recoverAttestedOwnerTerminusBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { handleReviewResolve } from "../../src/handlers/review.js";
import { createStore } from "../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../src/lib/store/default-ports.js";
import { projectStandardReviewObligation } from "../../src/scripts/review-gate/policy/standard-review-projection.js";
import { resolveReviewRouting } from "../../src/scripts/review-gate/policy/routing.js";

import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import type { OwnerIdentity } from "../../src/lib/store/identity.js";
import { readCandidateRecord } from "../../src/lib/store/kinds/review/candidate/access.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { deriveLocalReviewTarget } from "../../src/scripts/review-gate/hosts/local/repository-target.js";
import { localOutcome, frontlineOutcome } from "../fixtures/review-outcome.js";
import { ReviewOutcomeSchema } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { readLaneProgress } from "../../src/scripts/review-gate/lane-progress.js";
import { projectReviewPolicyAttempt } from "../../src/scripts/review-gate/policy/review-policy-driver.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createReviewDecisionPort } from "../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../src/lib/store/kinds/review/decision/key.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
async function fixture(sources = "[delegated-agent]", project = true) {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  if (project) await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    `branch.base: main\nreview.frontline_sources: [coderabbit-cli]\nreview.standard_sources: ${sources}\nreview.standard_max_passes: 3\n`);
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git("add", ".");
  await git("commit", "-m", "Configure policy context");
  await git("switch", "-c", "topic/opaque");
  await writeFile(join(cwd, "example.ts"), "export const value = true;\n");
  await git("add", "example.ts");
  await git("commit", "-m", "Implement example");
  const headSha = await git("rev-parse", "HEAD");
  const repositoryStore = createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec }));
  const run = async (request: unknown, native = true, workItem?: OwnerIdentity) => {
    let output = "";
    const exits: number[] = [];
    await handleReviewResolve("-", { resolveRoot: () => cwd, readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined,
    native ? { store: h.reference.store, projectId: createProjectIdentityReader(h.reference.store), ...(workItem === undefined ? {} : { workItem }) } : { store: repositoryStore });
    return { value: JSON.parse(output) as unknown, exits };
  };
  return { ...h, cwd, exec, git, headSha, run };
}

it.each(["frontline", "exempt", "source-free"] as const)("resolves an ownerless native %s request through the actual policy handler", async kind => {
  const h = await fixture(kind === "source-free" ? "[]" : "[delegated-agent]");
  const required = projectStandardReviewObligation(resolveReviewRouting({}).decision);
  const standardReview = kind === "exempt" ? projectStandardReviewObligation(resolveReviewRouting({ schemaVersion: 1,
    changeSetState: "known", contentKind: "documentation", reviewRisk: "routine", changeDeterminacy: "ordinary",
    ownership: "self", surfaceAuthority: "planning-grooming", assurance: { workContext: "unscoped", workClass: "none" },
    activity: { selfReview: true, frontlineReview: true } }).decision) : required;
  if (kind === "exempt") expect(standardReview.obligation).toBe("exempt");
  const request = { schemaVersion: 1, lane: kind === "frontline" ? "frontline" : "standard", frontlineActive: true,
    target: { repository: "owner/repo", pullRequest: null, headSha: h.headSha }, standardReview, completedPasses: 0, attempts: [] };
  const expected = await h.run(request, false);
  expect(expected.exits, JSON.stringify(expected.value)).toEqual([]);
  const actual = await h.run(request);
  expect(actual).toEqual(expected);
  expect(actual.value).toMatchObject({ state: kind === "frontline" ? "ready" : "no-op" });
}, 30_000);

async function producedContext(h: Awaited<ReturnType<typeof fixture>>, kind: "runnable-standard" | "terminal-standard" | "terminal-frontline") {
  const primary = await h.reference.seedMeta("example", { owner: "andrew", branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "topic/owner", linkedAs: "adopted", excluded: [] }],
  });
  const target = await deriveLocalReviewTarget({ cwd: h.cwd, exec: h.exec, repositoryId: projectId, baseRef: "main" });
  const collected = await collectGitCandidateSubject({ cwd: h.cwd, name: "example", baseBranch: "main",
    baseRevision: target.diffBaseSha, exec: h.exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: collected.target.subject,
    baseRevision: target.diffBaseSha, attestedBy: "andrew", attestedAt: "2026-10-20T15:00:00Z",
    verificationEvidenceRef: "test://verified" });
  await h.reference.seedCandidate(primary.reference.owner, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject: collected.target.subject, transitions: [], lineageAttestations: [] });
  const lineage = { kind: "candidate" as const, candidateId: attestation.candidateId };
  const local = localOutcome({ target, lineage, vehicle: { kind: "work-unit", identity: "example" } });
  const outcome = ReviewOutcomeSchema.parse(kind === "terminal-frontline" ? frontlineOutcome({ target, lineage }) : local);
  const outcomes = createReviewOutcomePort(h.reference.store, primary.reference.owner);
  const stored = kind === "runnable-standard" ? null : await outcomes.create(outcome);
  const context = createReviewCompositionContext({ ...h.native, workItem: primary.reference.owner });
  const lane = kind === "terminal-frontline" ? "frontline" : "standard";
  const progress = await readLaneProgress(context.family.ports.inFlight, { lane, repositoryId: projectId, headSha: h.headSha, lineage });
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = local.requirement;
  const request = { schemaVersion: 1, lane, frontlineActive: true, target: { repository: "owner/repo", pullRequest: null, headSha: h.headSha },
    standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count },
    completedPasses: progress.status === "recorded" ? progress.completedPasses : 0,
    attempts: progress.status === "recorded" ? progress.attempts.map(projectReviewPolicyAttempt) : [] };
  return { primary, request, stored, outcomes, outcome };
}

it.each(["ceiling", "additional"] as const)("records and relays a native %s grant through generic resolve", async kind => {
  const h = await fixture(), produced = await producedContext(h, "terminal-standard");
  await h.git("switch", "-c", "topic/owner");
  const grant = kind === "ceiling" ? { ceilingOverride: { target: produced.request.target, lane: "standard",
    exhaustedPassCount: 1, nextPass: 2 } } : { additionalPassAuthorization: { target: produced.request.target,
    lane: "standard", completedPasses: 1, nextPass: 2, precedingProducerId: produced.outcome.attemptId } };
  const resolved = await h.run({ ...produced.request, ...grant });
  expect(resolved.exits, JSON.stringify(resolved.value)).toEqual([]);
  const decisions = createReviewDecisionPort(h.reference.store, produced.primary.reference.owner);
  const listing = await decisions.list();
  expect(listing.status).toBe("complete");
  if (listing.status !== "complete") throw new Error(listing.reason);
  expect(listing.records).toHaveLength(1);
  const record = listing.records[0]!;
  expect(record.value).toMatchObject({ decidedBy: "andrew", lane: "standard", choice: { kind: "extra-pass",
    passCount: 1, precondition: { kind, targetBinding: { kind: "policy-target", repository: "owner/repo", pullRequest: null } } } });
  const key = reviewDecisionKey(record.value), version = lifecycleSuccess(await h.reference.store.version());
  await h.git("config", "arc.identity", "another-user");
  const field = kind === "ceiling" ? "ceilingOverride" : "additionalPassAuthorization";
  const relay = await h.run({ ...produced.request, [field]: { ...grant[field], decisionKey: key } });
  expect(relay.exits, JSON.stringify(relay.value)).toEqual([]);
  expect(lifecycleSuccess(await h.reference.store.version())).toBe(version);
  expect(await decisions.read(key)).toEqual(record);
}, 30_000);

it.each(["runnable-standard", "terminal-standard", "terminal-frontline"] as const)(
  "refuses ownerless %s evidence and resolves after the owning branch is restored", async kind => {
    const h = await fixture(), produced = await producedContext(h, kind);
    const version = lifecycleSuccess(await h.reference.store.version());
    const refused = await h.run(produced.request);
    expect(refused).toMatchObject({ exits: [1], value: { error: { code: "invalid-input",
      message: expect.stringContaining("established work item") }, remedy: {
      text: expect.stringContaining("owning work-unit or Errand checkout"), argv: ["arc", "review", "resolve", "-"],
      stdin: produced.request } } });
    expect(lifecycleSuccess(await h.reference.store.version())).toBe(version);
    await h.git("switch", "-c", "topic/owner");
    const resolved = await h.run(produced.request);
    expect(resolved.exits, JSON.stringify(resolved.value)).toEqual([]);
    expect(resolved.value).toMatchObject({ state: kind === "runnable-standard" ? "ready" : "pass-complete" });
    expect(lifecycleSuccess(await h.reference.store.version())).toBe(version);
    if (produced.stored !== null) expect(await produced.outcomes.read(produced.outcome.attemptId)).toEqual(produced.stored);
  }, 30_000);

it("retains the project-identity remedy for fact-free policy and resolves after repair", async () => {
  const h = await fixture("[delegated-agent]", false);
  const request = { schemaVersion: 1, lane: "frontline", frontlineActive: true,
    target: { repository: "owner/repo", pullRequest: null, headSha: h.headSha },
    standardReview: projectStandardReviewObligation(resolveReviewRouting({}).decision), completedPasses: 0, attempts: [] };
  expect(await h.run(request)).toMatchObject({ exits: [1], value: { error: { code: "project-identity-unavailable" },
    remedy: { argv: ["arc", "review", "resolve", "-"], stdin: request } } });
  await h.reference.seedProject(projectId);
  expect(await h.run(request)).toMatchObject({ exits: [], value: { state: "ready" } });
}, 30_000);

it("retains an already selected generation when its slug is reused beside an unlinked checkout", async () => {
  const h = await fixture(), produced = await producedContext(h, "terminal-standard");
  lifecycleSuccess(await h.reference.store.write({ action: "remove", reference: produced.primary.reference,
    expected: produced.primary.version, provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const replacement = await h.reference.seedMeta("example", { owner: "andrew", branch: null });
  expect(replacement.reference.owner).not.toEqual(produced.primary.reference.owner);
  const resolved = await h.run(produced.request, true, produced.primary.reference.owner);
  expect(resolved.exits, JSON.stringify(resolved.value)).toEqual([]);
  expect(resolved.value).toMatchObject({ state: "pass-complete" });
  expect(await produced.outcomes.read(produced.outcome.attemptId)).toEqual(produced.stored);
}, 30_000);

it.each([false, true].flatMap(carried => [null, "recorded-owner"].map(author => ({ carried, author }))))(
  "recomposes omitted native terminus authority with carry=$carried and author=$author", async ({ carried, author }) => {
  const h = await fixture(), produced = await producedContext(h, "runnable-standard");
  await h.git("switch", "-c", "topic/owner");
  const candidate = await readCandidateRecord(h.cwd, "example", { store: h.reference.store, owner: produced.primary.reference.owner });
  if (candidate === null) throw new Error("expected selected Candidate");
  const decisions = createReviewDecisionPort(h.reference.store, produced.primary.reference.owner);
  const recorded = await decisions.create({ schemaVersion: 1, subject: {
    lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId }, headSha: null,
    subjectDigest: carried ? canonicalDigest({ priorSubject: true }) : candidate.subject.subjectDigest }, lane: "standard", choice: { kind: "terminus" },
    decidedBy: author, decidedAt: null, basis: { passCount: 2 } });
  const decisionKey = reviewDecisionKey(recorded.value);
  if (carried) {
    const published = projectPublicationBoundary({ workUnit: "example", branch: "topic/owner",
      candidateId: candidate.attestation.candidateId, candidateSubjectDigest: recorded.value.subject.subjectDigest,
      terminus: decisionKey, reservation: null, changeRequest: null, readinessBinding: null }, 2);
    const recovered = recoverAttestedOwnerTerminusBoundary({ stored: published, workUnit: "example",
      candidateId: candidate.attestation.candidateId, candidateSubjectDigest: candidate.subject.subjectDigest, repairCurrent: true });
    if (recovered === null) throw new Error("Expected recovered singleton boundary");
    await writeSubmissionBoundary(h.cwd, recovered, null, { store: h.reference.store, owner: produced.primary.reference.owner });
  }
  await h.git("config", "arc.identity", "different-relayer");
  const before = lifecycleSuccess(await h.reference.store.version());
  const result = await h.run(produced.request);
  expect(result.exits, JSON.stringify(result.value)).toEqual([]);
  expect(result.value).toMatchObject({ state: "owner-accepted", payload: { terminus: {
    schemaVersion: 2, semanticsVersion: "review-terminus/v2", decisionKey, acceptedBy: author, completedPasses: 2 } } });
  expect(lifecycleSuccess(await h.reference.store.version())).toBe(before);
  expect(await decisions.read(decisionKey)).toEqual(recorded);
}, 30_000);
