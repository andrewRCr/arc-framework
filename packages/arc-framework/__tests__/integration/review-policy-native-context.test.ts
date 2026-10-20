/** Generic native policy calculates without a vehicle until record evidence is required. */
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
  const collected = await collectGitCandidateSubject({ cwd: h.cwd, name: "example", baseBranch: "main", exec: h.exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: collected.target.subject,
    baseRevision: await h.git("rev-parse", "main"), attestedBy: "andrew", attestedAt: "2026-10-20T15:00:00Z",
    verificationEvidenceRef: "test://verified" });
  await h.reference.seedCandidate(primary.reference.owner, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject: collected.target.subject, transitions: [], lineageAttestations: [] });
  const target = await deriveLocalReviewTarget({ cwd: h.cwd, exec: h.exec, repositoryId: projectId, baseRef: "main" });
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
