/** Native frontline defaults select their actual stored vehicle before durable family access. */
import { mkdir, unlink, writeFile, chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { withReviewReport } from "../../fixtures/review-report-input.js";
import { scriptRawGitExec } from "../../helpers/git-exec-fake.js";
import { parseReviewSourceReference } from "../../../src/scripts/review-gate/core/review-source-reference.js";
import { expect, it, onTestFinished, vi } from "vitest";
import { handleReviewFrontlineResolve, handleReviewFrontlineRun, handleReviewReduce, handleReviewRespond } from "../../../src/handlers/review.js";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";
import { resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot } from "../../../src/lib/work-unit/candidate-attestation.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { FrontlineResolveEnvelopeSchema, FrontlineRunEnvelopeSchema, ReduceEnvelopeSchema, RespondEnvelopeSchema } from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import { RepositoryGitCommonStatePublisher } from "../../../src/lib/git-common-state.js";
import { createReviewOutcomePort } from "../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewCompositionContext } from "../../../src/scripts/review-gate/runtime/composition-context.js";
import { nativeReviewInFlightRecordName } from "../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { laneProgressOperationId } from "../../../src/scripts/review-gate/lane-progress.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { bindNativeReviewOperationReference, parseNativeReviewOperationReference } from "../../../src/scripts/review-gate/core/review-operation-reference.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { OwnerIdentity } from "../../../src/lib/store/identity.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../../src/lib/kernel/index.js";
import { approveDispositionState } from "../../../src/scripts/review-gate/core/dispositions.js";
import { createReviewEvidencePort } from "../../../src/lib/store/kinds/review/evidence/access.js";
import { projectStandardReviewObligation } from "../../../src/scripts/review-gate/policy/standard-review-projection.js";
import { createReviewDecisionPort } from "../../../src/lib/store/kinds/review/decision/access.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
const head = "a".repeat(40), base = "b".repeat(40);
async function fixture(project = true, vehicle: "errand" | "work-unit" = "errand", findings = false) {
  const h = createReviewHarness();
  if (project) await h.seedProject(projectId);
  const claimId = "1".repeat(32), branch = vehicle === "errand" ? "chore/repair" : "topic/opaque";
  if (vehicle === "work-unit") {
    const primary = await h.seedMeta("example", { branch: null }, { kind: "active" }, {
      branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
    });
    const subject = createCandidateSubjectSnapshot([]);
    const candidate = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const, subject,
      attestation: createCandidateAttestation({ workUnit: "example", subject, baseRevision: head, attestedBy: "test-user",
        attestedAt: "2026-10-19T12:00:00Z", verificationEvidenceRef: "verified" }), transitions: [], lineageAttestations: [] };
    await h.seedCandidate(primary.reference.owner, candidate);
    await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
      mode: "pre-publication-review", workUnit: "example", candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
      nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
  } else {
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
    claimId, intent: "Repair one issue", owner: "test-user", origin: "description", originEntry: null,
    branch, state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
  if (record.kind !== "errand") throw new Error("Expected Errand");
  await h.seedErrand(record);
  }
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    ...[head, base].flatMap(revision => [
      { match: ["rev-parse", "--verify", revision], responses: [{ stdout: revision }] },
      { match: ["cat-file", "-t", revision], responses: [{ stdout: "commit" }] },
      { match: ["rev-parse", `${revision}^{tree}`], responses: [{ stdout: "c".repeat(40) }] },
    ]),
    { match: ["config", "--get-all", "arc.frontlineSources"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["for-each-ref", "--format=%(objectname)", "refs/remotes/origin/main"], responses: [{ stdout: base }] },
    { match: ["rev-parse", "--verify", "HEAD^{commit}"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "HEAD"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "--verify", `${head}^{commit}`], responses: [{ stdout: head }] },
    { match: ["merge-base", "--all", head, base], responses: [{ stdout: base }] },
    { match: ["merge-base", "--all", "refs/heads/main", head], responses: [{ stdout: base }] },
    { match: ["diff", "--cached", "--name-only", "-z", base, "--"], responses: [{ stdout: "" }] },
    { match: ["diff", "--name-only", "-z", base, head, "--"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "--verify", "refs/heads/main"], responses: [{ stdout: base }] },
    { match: ["merge-base", "--all", base, head], responses: [{ stdout: base }] },
    { match: ["status", "--porcelain=v2", "--untracked-files=normal"], responses: [{ stdout: "" }] },
    { match: { prefix: ["worktree", "add", "--detach"] }, responses: [async ({ args }) => {
      const root = args[3]; if (root === undefined) throw new Error("Expected materialization path");
      await mkdir(root, { recursive: true }); return { stdout: "" };
    }] },
    { match: { prefix: ["worktree", "remove", "--force"] }, responses: [{ stdout: "" }] },
  ] });
  onTestFinished(checkout.cleanup);
  const providerPath = join(checkout.cwd, "provider");
  const stdout = findings ? await readFile(new URL("../../fixtures/coderabbit-frontline/agent-0.8.1-findings.ndjson", import.meta.url), "utf8") : "";
  if (findings) {
    await mkdir(providerPath);
    const executable = join(providerPath, "coderabbit");
    await writeFile(executable, "captured provider executable\n");
    await chmod(executable, 0o700);
  }
  const codeRabbit = findings ? { executable: { pathValue: providerPath, interrogate: async () => "CodeRabbit 0.8.1" },
    run: async () => ({ exitCode: 0, signal: null, stdout, stderr: "", canceled: false }) } : undefined;
  await checkout.occupy(branch, vehicle === "errand" ? { kind: "errand", slug: "repair", claimId }
    : { kind: "work-unit", name: "example" });
  const request = (mode: "skip" | "force") => ({ schemaVersion: 1,
    target: { kind: "change-set", baseRef: "main", diffBaseSha: base, headSha: head },
    changeSet: { schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary",
      assurance: { workContext: vehicle, workClass: vehicle === "errand" ? "none" : "Light" },
      activity: { selfReview: true, frontlineReview: false } },
    invocation: mode === "skip" ? { mode } : { mode, sourceId: "coderabbit-cli" },
  });
  const references = new Map<string, string>();
  return { ...checkout, claimId, request, respond: async (input: unknown) => {
    let output = "";
    await handleReviewRespond("-", { resolveRoot: () => checkout.cwd, readText: async () => JSON.stringify(input),
      write: text => { output += text; }, setExitCode: () => {} }, undefined,
    { ...checkout, rawGit: scriptRawGitExec([{ match: ["diff", "--numstat", "-z", "-M", "-C", "--find-copies-harder", `${base}..${head}`, "--"],
      responses: [{ stdout: Buffer.from("1\t0\tsrc/example.ts\0") }] }]).exec, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  }, reduce: async (operationId: string) => {
    let output = "";
    await handleReviewReduce("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify({ schemaVersion: 1, operationId, operationRef: references.get(operationId) }),
      write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  }, run: async (resolution: unknown, bound: { workItem?: OwnerIdentity; store?: Store } = {}) => {
    let output = "";
    await handleReviewFrontlineRun("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify({ schemaVersion: 1, target: request("force").target, resolution }),
      write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, codeRabbit, store: bound.store ?? checkout.store, workItem: bound.workItem, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  }, resolve: async (mode: "skip" | "force" = "skip") => {
    let output = "";
    await handleReviewFrontlineResolve("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify(request(mode)), write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, projectId: createProjectIdentityReader(checkout.store) });
    const result = JSON.parse(output) as unknown;
    const parsed = FrontlineResolveEnvelopeSchema.safeParse(result);
    if (parsed.success && parsed.data.state === "ready" && parsed.data.payload.operationRef !== undefined) {
      references.set(parsed.data.payload.admission.operationId, parsed.data.payload.operationRef);
    }
    return result;
  } };
}

it.each(["skip", "force"] as const)("resolves a native work unit's %s from its stored Candidate", async mode => {
  const h = await fixture(true, "work-unit");
  const result = await h.resolve(mode);
  expect(result, JSON.stringify(result)).toMatchObject({ state: mode === "skip" ? "skipped" : "ready",
    nextAction: mode === "skip" ? "none" : "run-frontline" });
});

it.each(["errand", "work-unit"] as const)("runs the saved native %s admission without current checkout occupancy", async vehicle => {
  const h = await fixture(true, vehicle);
  const resolution = FrontlineResolveEnvelopeSchema.parse(await h.resolve("force"));
  if (resolution.state !== "ready") throw new Error(JSON.stringify(resolution));
  await unlink(resolveWorktreeMarkerPath(h.cwd));
  vi.stubEnv("PATH", "");
  onTestFinished(() => { vi.unstubAllEnvs(); });
  const result = await h.run(resolution);
  expect(result, JSON.stringify(result)).toMatchObject({ state: "unavailable", nextAction: "operator-repair",
    payload: { operationRef: resolution.payload.operationRef } });
});

it("runs the admitted work-unit generation after its name is reused", async () => {
  const h = await fixture(true, "work-unit");
  const selected = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("example") }));
  const primary = lifecycleSuccess(await h.store.read({ reference: selected.reference }));
  const resolution = FrontlineResolveEnvelopeSchema.parse(await h.resolve("force"));
  if (resolution.state !== "ready") throw new Error(JSON.stringify(resolution));
  lifecycleSuccess(await h.store.write({ action: "put", reference: primary.reference, expected: primary.version,
    content: primary.content,
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const replacement = await h.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: "topic/opaque", linkedAs: "adopted", excluded: [] }],
  });
  expect(replacement.reference.owner).not.toEqual(primary.reference.owner);
  vi.stubEnv("PATH", "");
  onTestFinished(() => { vi.unstubAllEnvs(); });
  expect(await h.run(resolution)).toMatchObject({ state: "unavailable", nextAction: "operator-repair" });
  const workItem = parseNativeReviewOperationReference(resolution.payload.operationRef ?? "").workItem;
  const saved = await createReviewOutcomePort(h.store, workItem).read(resolution.payload.admission.operationId);
  expect(saved?.reference.owner).toEqual(primary.reference.owner);
});

it("reports a missing admission owner and runs after its working state is repaired", async () => {
  const h = await fixture();
  const resolution = FrontlineResolveEnvelopeSchema.parse(await h.resolve("force"));
  if (resolution.state !== "ready") throw new Error(JSON.stringify(resolution));
  const workItem = parseNativeReviewOperationReference(resolution.payload.operationRef ?? "").workItem;
  const operations = createReviewCompositionContext({ ...h, workItem }).family.ports.inFlight;
  const admission = resolution.payload.admission;
  const saved = await operations.readOperation(laneProgressOperationId({ lane: "frontline", repositoryId: projectId,
    headSha: head, lineage: admission.lineage }));
  if (saved.state?.kind !== "lane-progress") throw new Error("Expected admitted lane owner");
  if (workItem.type !== "work-item" || workItem.uid === undefined) throw new Error("Expected selected UID");
  const publisher = new RepositoryGitCommonStatePublisher(h.exec, h.cwd);
  const location = { root: "review-gate", namespace: "in-flight" } as const;
  const name = nativeReviewInFlightRecordName(workItem.uid, saved.state.operationId);
  const raw = await publisher.read(location, name);
  if (raw === null) throw new Error("Expected real native admission");
  const corrupt = JSON.parse(raw) as { state: Record<string, unknown> };
  delete corrupt.state.workItem;
  await publisher.update(location, name, () => ({ kind: "write", content: JSON.stringify(corrupt), result: undefined }));
  expect(await h.run(resolution)).toMatchObject({ error: { code: "corrupt-state",
    message: expect.stringContaining("Restore the pending frontline admission and retry") } });
  await publisher.update(location, name, () => ({ kind: "write", content: raw, result: undefined }));
  vi.stubEnv("PATH", "");
  onTestFinished(() => { vi.unstubAllEnvs(); });
  expect(await h.run(resolution)).toMatchObject({ state: "unavailable", nextAction: "operator-repair" });
});

it.each(["errand", "work-unit"] as const)("retains the selected %s generation with its frontline admission", async vehicle => {
  const h = await fixture(true, vehicle);
  const selected = lifecycleSuccess(await h.store.lookup({ kind: "slug",
    slug: SlugSchema.parse(vehicle === "errand" ? "repair" : "example") }));
  const resolution = FrontlineResolveEnvelopeSchema.parse(await h.resolve("force"));
  if (resolution.state !== "ready") throw new Error(JSON.stringify(resolution));
  const admission = resolution.payload.admission;
  const workItem = parseNativeReviewOperationReference(resolution.payload.operationRef ?? "").workItem;
  const operations = createReviewCompositionContext({ ...h, workItem }).family.ports.inFlight;
  const saved = await operations.readOperation(laneProgressOperationId({ lane: "frontline", repositoryId: projectId,
    headSha: head, lineage: admission.lineage }));
  expect(saved.state).toMatchObject({ workItem: selected.reference.owner });
  expect(parseNativeReviewOperationReference(resolution.payload.operationRef ?? "")).toEqual({ repositoryId: projectId,
    operationId: admission.operationId, workItem: selected.reference.owner });
});

it.each(["skip", "force"] as const)("resolves a native Errand's %s without an injected owner", async mode => {
  const h = await fixture();
  const result = await h.resolve(mode);
  expect(result, JSON.stringify(result)).toMatchObject({ state: mode === "skip" ? "skipped" : "ready",
    nextAction: mode === "skip" ? "none" : "run-frontline" });
});

it.each(["errand", "work-unit"] as const)("persists a native %s skip and closes its opening window on replay", async vehicle => {
  const h = await fixture(true, vehicle);
  const selected = lifecycleSuccess(await h.store.lookup({ kind: "slug",
    slug: SlugSchema.parse(vehicle === "errand" ? "repair" : "example") }));
  expect(await h.resolve("skip")).toMatchObject({ state: "skipped", nextAction: "none" });
  const decisions = createReviewDecisionPort(h.store, selected.reference.owner);
  const first = await decisions.list();
  expect(first).toMatchObject({ status: "complete", records: [{ value: {
    lane: "frontline", choice: { kind: "lane-skip" }, decidedBy: "test-user",
    subject: { headSha: head }, basis: null,
  } }] });
  expect(await h.resolve("force")).toMatchObject({ state: "skipped", nextAction: "none",
    diagnostics: [{ code: "frontline-window-closed" }] });
  expect(await h.resolve("skip")).toMatchObject({ state: "skipped", nextAction: "none" });
  expect(await decisions.list()).toEqual(first);
});

it("reports missing project identity and resolves normally after repair", async () => {
  const h = await fixture(false);
  expect(await h.resolve()).toMatchObject({ error: { code: "project-identity-unavailable" },
    remedy: { argv: ["arc", "review", "frontline", "resolve", "-"], stdin: h.request("skip") } });
  await h.seedProject(projectId);
  expect(await h.resolve()).toMatchObject({ state: "skipped", nextAction: "none" });
});

it("keeps the unresolved-lineage refusal and resolves normally after marker repair", async () => {
  const h = await fixture();
  await unlink(resolveWorktreeMarkerPath(h.cwd));
  expect(await h.resolve()).toMatchObject({ error: { message: "frontline review lineage authority is unavailable" } });
  await h.occupy("chore/repair", { kind: "errand", slug: "repair", claimId: h.claimId });
  expect(await h.resolve()).toMatchObject({ state: "skipped", nextAction: "none" });
});

it.each(["errand", "work-unit"] as const)("reduces the saved native %s frontline result without checkout occupancy", async vehicle => {
  const h = await fixture(true, vehicle);
  const resolution = FrontlineResolveEnvelopeSchema.parse(await h.resolve("force"));
  if (resolution.state !== "ready") throw new Error(JSON.stringify(resolution));
  await unlink(resolveWorktreeMarkerPath(h.cwd));
  vi.stubEnv("PATH", "");
  onTestFinished(() => { vi.unstubAllEnvs(); });
  expect(await h.run(resolution)).toMatchObject({ state: "unavailable", nextAction: "operator-repair" });
  const version = lifecycleSuccess(await h.store.version());
  const result = await h.reduce(resolution.payload.admission.operationId);
  expect(result, JSON.stringify(result)).toMatchObject({ state: "retryable", nextAction: "operator-repair" });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});

it.each(["missing", "foreign-project", "bound-owner", "pending-owner", "malformed", "wrong-id"] as const)(
  "refuses a %s frontline continuation reference and runs after correction", async invalid => {
    const h = await fixture();
    const resolution = FrontlineResolveEnvelopeSchema.parse(await h.resolve("force"));
    if (resolution.state !== "ready" || resolution.payload.operationRef === undefined) throw new Error(JSON.stringify(resolution));
    const reference = parseNativeReviewOperationReference(resolution.payload.operationRef);
    const other = await h.seedMeta("other");
    const operationRef = invalid === "missing" ? undefined : invalid === "malformed" ? "arc-review-operation:v1:broken"
      : bindNativeReviewOperationReference({ ...reference,
        repositoryId: invalid === "foreign-project" ? "another-project" : reference.repositoryId,
        operationId: invalid === "wrong-id" ? "another-operation" : reference.operationId,
        workItem: invalid === "pending-owner" ? other.reference.owner : reference.workItem });
    vi.stubEnv("PATH", "");
    onTestFinished(() => { vi.unstubAllEnvs(); });
    expect(await h.run({ ...resolution, payload: { ...resolution.payload, operationRef } },
      { workItem: invalid === "bound-owner" ? other.reference.owner : undefined })).toMatchObject({ error: invalid === "pending-owner"
        ? { code: "invalid-input", message: expect.stringContaining("frontline ready admission is unavailable") }
        : { code: "invalid-input", message: expect.stringContaining("matching reference") } });
    expect(await h.run(resolution)).toMatchObject({ state: "unavailable", nextAction: "operator-repair",
      payload: { operationRef: resolution.payload.operationRef } });
  });

it("rejects a native frontline locator at a repository root", async () => {
  const h = await fixture();
  const resolution = FrontlineResolveEnvelopeSchema.parse(await h.resolve("force"));
  if (resolution.state !== "ready") throw new Error(JSON.stringify(resolution));
  const store = createStore(createDefaultStorePorts({ checkoutRoot: h.cwd, exec: h.exec }));
  expect(await h.run(resolution, { store })).toMatchObject({ error: {
    code: "invalid-input", message: expect.stringContaining("matching reference"),
  } });
});

async function completedFindings(vehicle: "work-unit" | "errand" = "errand") {
  const h = await fixture(true, vehicle, true);
  const resolution = FrontlineResolveEnvelopeSchema.parse(await h.resolve("force"));
  if (resolution.state !== "ready" || resolution.payload.operationRef === undefined) throw new Error(JSON.stringify(resolution));
  const raw = await h.run(resolution);
  expect(raw, JSON.stringify(raw)).toMatchObject({ state: "findings", nextAction: "respond" });
  const result = FrontlineRunEnvelopeSchema.parse(raw);
  if (result.state !== "findings") throw new Error(JSON.stringify(result));
  const workItem = parseNativeReviewOperationReference(resolution.payload.operationRef).workItem;
  const saved = await createReviewOutcomePort(h.store, workItem).read(result.payload.operationId);
  if (saved?.value.outcome !== "findings") throw new Error("Expected produced findings");
  return { ...h, resolution, result, findings: saved.value.findings };
}

it.each(["run", "reduce"] as const)("retains the native frontline source owner through %s findings", async command => {
  const h = await completedFindings();
  let outcomeRef = h.result.payload.outcomeRef;
  if (command === "reduce") {
    const raw = await h.reduce(h.result.payload.operationId);
    expect(raw, JSON.stringify(raw)).toMatchObject({ state: "findings" });
    const reduced = ReduceEnvelopeSchema.parse(raw);
    if (reduced.state !== "findings" || reduced.payload.responseSource.kind !== "frontline") throw new Error(JSON.stringify(reduced));
    outcomeRef = reduced.payload.responseSource.outcomeRef;
  }
  expect(parseReviewSourceReference(outcomeRef, "frontline", true)).toEqual({ repositoryId: projectId,
    workItem: parseNativeReviewOperationReference(h.resolution.payload.operationRef ?? "").workItem,
    kind: "frontline", operationId: h.result.payload.operationId,
    durableRef: parseReviewSourceReference(h.result.payload.outcomeRef, "frontline", true).durableRef });
});

it.each(["work-unit", "errand"] as const)("binds a %s response proposal from the default frontline source", async vehicle => {
  const h = await completedFindings(vehicle);
  const request = frontlineProposal(h);
  const response = await h.respond(request);
  expect(response, JSON.stringify(response)).toMatchObject({ state: "awaiting-approval", nextAction: "obtain-approval" });
});

function frontlineProposal(h: Awaited<ReturnType<typeof completedFindings>>) {
  return withReviewReport({ schemaVersion: 1, source: { kind: "frontline", outcomeRef: h.result.payload.outcomeRef },
    proposal: { proposedVerification: "focused", severityGatingPolicy: { minorGating: "record-only" },
      findings: h.findings.map(finding => ({ findingId: finding.findingId,
        sourceVerification: "verified", verifiedSeverity: finding.severity, verificationRefs: [finding.evidenceUrlOrId],
        disposition: "defer", title: "Preserve target facts", issue: "The target changes before continuation.",
        rationale: "The selected source supports the finding.", recommendation: "Retain the target facts.", openQuestions: [] })) } });
}

it("records a performed native frontline response through the default handler", async () => {
  const h = await completedFindings();
  const proposal = RespondEnvelopeSchema.parse(await h.respond(frontlineProposal(h)));
  if (proposal.state !== "awaiting-approval" || h.resolution.state !== "ready") throw new Error("Expected proposal and admission");
  const dispositions = approveDispositionState({ proposed: proposal.payload.proposal, approvedBy: "test-user",
    approvedAt: new Date().toISOString() });
  const request = { schemaVersion: 1, source: { kind: "frontline", outcomeRef: h.result.payload.outcomeRef }, dispositions,
    policyRequest: { schemaVersion: 1, lane: "frontline", target: { repository: "owner/repository", pullRequest: null, headSha: head },
      standardReview: projectStandardReviewObligation(h.resolution.payload.routing.decision), completedPasses: 1,
      attempts: [{ sourceId: "coderabbit-cli", outcome: "findings", reviewOperationId: h.result.payload.operationId }] } };
  const result = await h.respond(request);
  expect(result, JSON.stringify(result)).toMatchObject({ state: "settled" });
  const workItem = parseNativeReviewOperationReference(h.resolution.payload.operationRef ?? "").workItem;
  const evidence = createReviewEvidencePort(h.store, workItem);
  const first = await evidence.read(dispositions.dispositionSet.dispositionSetId);
  expect(first?.value.performance).toMatchObject({ producerId: h.result.payload.operationId,
    originatingHeadSha: head, producedHeadSha: head });
  expect(await h.respond(request)).toMatchObject({ state: "already-settled" });
  expect(await evidence.read(dispositions.dispositionSet.dispositionSetId)).toEqual(first);
});
