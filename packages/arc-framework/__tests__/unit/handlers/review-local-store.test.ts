/** Default local review handlers select native checkout authority before binding durable ports. */
import { createRepositoryReviewResultReader } from "../../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { withReviewReport } from "../../fixtures/review-report-input.js";
import type { LocalReviewEvaluatorResult } from "../../../src/scripts/review-gate/core/local-review-result.js";
import { parseReviewSourceReference } from "../../../src/scripts/review-gate/core/review-source-reference.js";
import { LocalPrepareEnvelopeSchema, LocalAttestEnvelopeSchema, LocalResumeEnvelopeSchema, ReduceEnvelopeSchema } from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import { appendFile, mkdir, unlink, rm } from "node:fs/promises";
import { join } from "node:path";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";
import { resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import { candidateFixture } from "../../helpers/store/tracked-write-fixture.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { expect, it, onTestFinished } from "vitest";
import { handleReviewLocalPrepare, handleReviewLocalResume, handleReviewLocalAttest, handleReviewLocalCancel, handleReviewReduce, handleReviewRespond } from "../../../src/handlers/review.js";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { scriptRawGitExec } from "../../helpers/git-exec-fake.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";
import { LocalReviewOperationStateStore } from "../../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { createReviewCompositionContext } from "../../../src/scripts/review-gate/runtime/composition-context.js";
import { nativeReviewInFlightRecordName } from "../../../src/scripts/review-gate/hosts/local/in-flight-state-store.js";
import { RepositoryGitCommonStatePublisher } from "../../../src/lib/git-common-state.js";
import { bindNativeReviewOperationReference, parseNativeReviewOperationReference } from "../../../src/scripts/review-gate/core/review-operation-reference.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import type { OwnerIdentity } from "../../../src/lib/store/identity.js";
import { SlugSchema, canonicalDigest } from "../../../src/lib/kernel/index.js";
import { createReviewDecisionPort } from "../../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../../src/lib/store/kinds/review/decision/key.js";
import { performedEvidenceFixture } from "../../fixtures/review-evidence.js";
import { composeReviewDispositionRecord } from "../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewApproval } from "../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { publishNativeReviewPerformance } from "../../../src/scripts/review-gate/runtime/native-review-performance.js";
import { readLaneProgressOwner } from "../../../src/scripts/review-gate/lane-progress.js";
import { livePredecessorReviewAttempt } from "../../../src/scripts/review-gate/lane-progress-supersession.js";

interface ContinuationOverride { operationRef?: string; workItem?: OwnerIdentity; store?: Store }
const projectId = "123e4567-e89b-42d3-a456-426614174099";
async function fixture(project = true, vehicle: "work-unit" | "errand" = "errand", exempt = true) {
  const h = createReviewHarness();
  const projectRecord = project ? await h.seedProject(projectId) : null;
  const claimId = "1".repeat(32), branch = vehicle === "errand" ? "chore/repair" : "topic/opaque";
  if (vehicle === "errand") {
    const errand = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
      claimId, intent: "Repair one issue", owner: "test-user", origin: "description", originEntry: null,
      branch, state: "open", savedHead: null, changeRequest: null,
      createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
    if (errand.kind !== "errand") throw new Error("Expected Errand");
    await h.seedErrand(errand);
  } else {
    const primary = await h.seedMeta("example", { owner: "test-user", branch: null }, { kind: "active" }, {
      branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
    });
    const candidate = candidateFixture();
    await h.seedCandidate(primary.reference.owner, candidate);
    await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
      mode: "pre-publication-review", workUnit: "example", candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: candidate.subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
      nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
  }
  const head = "a".repeat(40), base = "b".repeat(40);
  const pins = new Map<string, string>(), materialized = new Set<string>();
  let activeIdentity = "test-user";
  const advancedHead = "e".repeat(40);
  let currentHead = head;
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["reset", "--hard"], responses: [{ stdout: "" }] },
    { match: ["clean", "-fdx"], responses: [{ stdout: "" }] },
    { match: { prefix: ["worktree", "remove"] }, responses: [async ({ args }) => {
      const root = args[2]; if (root === undefined) throw new Error("Expected materialization path");
      materialized.delete(root); await rm(root, { recursive: true, force: true }); return { stdout: "" };
    }] },
    { match: ["worktree", "prune"], responses: [{ stdout: "" }] },
    { match: { prefix: ["update-ref", "-d"] }, responses: [({ args }) => {
      pins.delete(args[2] ?? ""); return { stdout: "" };
    }] },
    { match: { predicate: args => args[0] === "for-each-ref" && args[1] === "--format=%(refname)"
      && args[2]?.startsWith("refs/arc/review/local-scope/") === true }, responses: [({ args }) => ({
        stdout: [...pins.keys()].filter(ref => ref.startsWith(args[2] ?? "")).join("\n"),
      })] },
    { match: ["config", "--null", "--get", "arc.identity"], responses: [() => ({ stdout: `${activeIdentity}\0` })] },
    { match: ["rev-parse", "--show-object-format"], responses: [{ stdout: "sha1" }] },
    { match: ["config", "--get", "remote.origin.url"], responses: [{ stdout: "https://github.com/owner/repository.git" }] },
    { match: ["check-ref-format", "--branch", branch], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], responses: [{ stdout: head }] },
    { match: ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], responses: [{ stdout: "" }] },
    { command: "gh", match: { prefix: ["pr", "list", "--repo", "owner/repository", "--state", "all"] }, responses: [{ stdout: "[]" }] },
    { match: { predicate: args => args[0] === "show-ref" && args[1] === "--verify" && args[2] === "--hash"
      && (args[3]?.startsWith("refs/arc/review/local/") === true || args[3]?.startsWith("refs/arc/review/local-scope/") === true) }, responses: [({ args }) => {
        const value = pins.get(args[3] ?? "");
        return value === undefined ? { failure: { exitCode: 1 } } : { stdout: value };
      }] },
    { match: { predicate: args => args[0] === "update-ref" && (args[1]?.startsWith("refs/arc/review/local/") === true
      || args[1]?.startsWith("refs/arc/review/local-scope/") === true) },
      responses: [({ args }) => { pins.set(args[1] ?? "", args[2] ?? ""); return { stdout: "" }; }] },
    { match: ["rev-parse", "--is-inside-work-tree"], responses: [({ options }) => materialized.has(options?.cwd ?? "")
      ? { stdout: "true" } : { failure: { exitCode: 128 } }] },
    { match: { prefix: ["worktree", "add", "--detach"] }, responses: [async ({ args }) => {
      const root = args[3]; if (root === undefined) throw new Error("Expected checkout path");
      await mkdir(root, { recursive: true }); materialized.add(root); return { stdout: "" };
    }] },
    { match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [({ options }) => ({
      stdout: materialized.has(options?.cwd ?? "") ? "HEAD" : branch,
    })] },
    { match: ["rev-parse", "HEAD^{tree}"], responses: [() => ({ stdout: (currentHead === head ? "d" : "f").repeat(40) })] },
    { match: ["status", "--porcelain=v2", "--untracked-files=no"], responses: [{ stdout: "" }] },
    ...[`${base}^{commit}`, `${head}^{commit}`, `${advancedHead}^{commit}`,
      `${"c".repeat(40)}^{tree}`, `${"d".repeat(40)}^{tree}`, `${"f".repeat(40)}^{tree}`]
      .map(revision => ({ match: ["cat-file", "-e", revision], responses: [{ stdout: "" }] })),
    { match: ["for-each-ref", "--format=%(refname)", "refs/arc/review/local/"], responses: [() => ({ stdout: [...pins.keys()].join("\n") })] },
    { match: ["rev-parse", "HEAD"], responses: [() => ({ stdout: currentHead })] },
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", "HEAD"], responses: [() => ({ stdout: currentHead })] },
    { match: ["cat-file", "-t", advancedHead], responses: [{ stdout: "commit" }] },
    { match: ["merge-base", "--all", base, advancedHead], responses: [{ stdout: base }] },
    { match: ["rev-parse", `${advancedHead}^{tree}`], responses: [{ stdout: "f".repeat(40) }] },
    { match: ["rev-parse", "--verify", "refs/heads/main"], responses: [{ stdout: base }] },
    { match: ["cat-file", "-t", head], responses: [{ stdout: "commit" }] },
    { match: ["cat-file", "-t", base], responses: [{ stdout: "commit" }] },
    { match: ["status", "--porcelain=v2", "--untracked-files=normal"], responses: [{ stdout: "" }] },
    { match: ["merge-base", "--all", base, head], responses: [{ stdout: base }] },
    { match: ["rev-parse", `${base}^{tree}`], responses: [{ stdout: "c".repeat(40) }] },
    { match: ["rev-parse", `${head}^{tree}`], responses: [{ stdout: "d".repeat(40) }] },
  ] });
  onTestFinished(checkout.cleanup);
  await checkout.occupy(branch, vehicle === "errand" ? { kind: "errand", slug: "repair", claimId }
    : { kind: "work-unit", name: "example" });
  const request = { schemaVersion: 1, evaluatorIdentity: "fresh-reviewer", routingFacts: {
    contentKind: exempt ? "documentation" : "code-bearing", reviewRisk: "routine", changeDeterminacy: "atomic",
    ownership: "self", surfaceAuthority: exempt ? "planning-grooming" : "ordinary",
  } };
  const rawGit = scriptRawGitExec([[base, head], [base, advancedHead], [head, advancedHead]].map(([from, to]) => ({
    match: ["diff", "--numstat", "-z", "-M", "-C", "--find-copies-harder", `${from}..${to}`, "--"],
    responses: [{ stdout: Buffer.from("1\t0\tsrc/example.ts\0") }],
  }))).exec;
  const references = new Map<string, string>();
  const referenceFor = (operationId: string, override?: ContinuationOverride) => override === undefined
    ? references.get(operationId) : override.operationRef;
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const operations = { readOperation: (operationId: string) => createReviewCompositionContext({ ...checkout,
    workItem: parseNativeReviewOperationReference(references.get(operationId) ?? "").workItem }).family.ports.inFlight.readOperation(operationId) };
  const removeSavedOwner = async (operationId: string) => {
    const owner = parseNativeReviewOperationReference(references.get(operationId) ?? "").workItem;
    if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the admitted UID");
    const location = { root: "review-gate", namespace: "in-flight" } as const;
    const name = nativeReviewInFlightRecordName(owner.uid, operationId), raw = await publisher.read(location, name);
    if (raw === null) throw new Error("Expected the real native pending record");
    const corrupt = JSON.parse(raw) as { state: Record<string, unknown> };
    delete corrupt.state.workItem;
    await publisher.update(location, name, () => ({ kind: "write", content: JSON.stringify(corrupt), result: undefined }));
    return async () => { await publisher.update(location, name, () => ({ kind: "write", content: raw, result: undefined })); };
  };
  return { ...checkout, claimId, request, operations, removeSavedOwner, legacyOperations: new LocalReviewOperationStateStore(publisher), readResult: async (operationId: string, workItem?: OwnerIdentity) => {
    const reference = parseNativeReviewOperationReference(references.get(operationId) ?? "");
    return createRepositoryReviewResultReader(new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd), {
      store: checkout.store, workItem: workItem ?? reference.workItem, projectId: createProjectIdentityReader(checkout.store),
    }).readResult(operationId);
  }, respond: async (input: unknown) => {
    let output = "";
    await handleReviewRespond("-", { resolveRoot: () => checkout.cwd, readText: async () => JSON.stringify(input),
      write: text => { output += text; }, setExitCode: () => {} }, undefined,
    { ...checkout, rawGit, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  }, removeProject: async () => {
    if (projectRecord === null) throw new Error("Expected project identity");
    lifecycleSuccess(await h.store.write({ action: "remove", reference: projectRecord.reference, expected: projectRecord.version,
      provenance: { verb: "remove", lifecycleAction: "remove" } }));
  }, advanceHead: () => { currentHead = advancedHead; }, reduce: async (operationId: string, override?: ContinuationOverride) => {
    let output = "";
    await handleReviewReduce("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify({ schemaVersion: 1, operationId, operationRef: referenceFor(operationId, override) }),
      write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, store: override?.store ?? checkout.store, workItem: override?.workItem, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  }, setIdentity: (identity: string) => { activeIdentity = identity; }, attest: async (operationId: string, override?: ContinuationOverride, completion?: LocalReviewEvaluatorResult) => {
    let output = "";
    await handleReviewLocalAttest("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify({ schemaVersion: 1, operationId, operationRef: referenceFor(operationId, override), result: completion ?? { status: "partial", result: null,
        evaluatorIdentity: "fresh-reviewer", reviewRunId: "test-run", applicabilityId: null, findings: [] } }),
      write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, store: override?.store ?? checkout.store, workItem: override?.workItem, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  }, cancel: async (operationId: string, override?: ContinuationOverride) => {
    let output = "";
    await handleReviewLocalCancel("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify({ schemaVersion: 1, operationId, operationRef: referenceFor(operationId, override) }),
      write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, store: override?.store ?? checkout.store, workItem: override?.workItem, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  }, resume: async (operationId: string, override?: ContinuationOverride) => {
    let output = "";
    await handleReviewLocalResume("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify({ schemaVersion: 1, operationId, operationRef: referenceFor(operationId, override) }),
      write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, store: override?.store ?? checkout.store, workItem: override?.workItem, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  }, run: async (input: unknown = request) => {
    let output = "";
    await handleReviewLocalPrepare("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify(input), write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, rawGit, projectId: createProjectIdentityReader(checkout.store) });
    const result = JSON.parse(output) as unknown;
    const prepared = LocalPrepareEnvelopeSchema.safeParse(result);
    if (prepared.success && prepared.data.state === "ready" && prepared.data.payload.operationRef !== undefined) {
      references.set(prepared.data.payload.operationId, prepared.data.payload.operationRef);
    }
    return result;
  } };
}
it.each(["work-unit", "errand"] as const)("selects the actual stored %s before reporting exempt preparation", async vehicle => {
  const h = await fixture(true, vehicle);
  const result = await h.run();
  expect(result, JSON.stringify(result)).toMatchObject({ mode: "review-local-prepare", state: "exempt", nextAction: "none" });
});
it("keeps the vehicle refusal and completes exempt preparation after marker repair", async () => {
  const h = await fixture();
  await unlink(resolveWorktreeMarkerPath(h.cwd));
  const version = lifecycleSuccess(await h.store.version());
  expect(await h.run()).toMatchObject({ error: { code: "invalid-input", message: "vehicle-unresolved" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  await h.occupy("chore/repair", { kind: "errand", slug: "repair", claimId: h.claimId });
  expect(await h.run()).toMatchObject({ state: "exempt", nextAction: "none" });
});
it("retains project-identity recovery and completes exempt preparation after repair", async () => {
  const h = await fixture(false);
  const version = lifecycleSuccess(await h.store.version());
  expect(await h.run()).toMatchObject({ error: { code: "project-identity-unavailable" },
    remedy: { argv: ["arc", "review", "local", "prepare", "-"], stdin: h.request } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  await h.seedProject(projectId);
  expect(await h.run()).toMatchObject({ state: "exempt", nextAction: "none" });
});

it.each(["work-unit", "errand"] as const)("prepares a native %s review without an injected owner", async vehicle => {
  const h = await fixture(true, vehicle, false);
  const result = await h.run();
  expect(result, JSON.stringify(result)).toMatchObject({ state: "ready", nextAction: "launch-review",
    payload: { operationRef: expect.any(String) } });
});

async function completedFirstNativeLocalPass() {
  const h = await fixture(true, "errand", false);
  const first = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (first.state !== "ready" || first.payload.operationRef === undefined) throw new Error(JSON.stringify(first));
  expect(await h.attest(first.payload.operationId, undefined, { status: "complete", result: "clean",
    evaluatorIdentity: "fresh-reviewer", reviewRunId: "completed-first-pass", applicabilityId: null, findings: [] }))
    .toMatchObject({ state: "attested-current" });
  return { h, first, owner: parseNativeReviewOperationReference(first.payload.operationRef).workItem };
}

it("records an additional pass and validates its exact reference before replaying native local preparation", async () => {
  const { h, first, owner } = await completedFirstNativeLocalPass();
  const judgment = { additionalPassAuthorization: { headSha: first.payload.target.headSha,
    precedingProducerId: first.payload.operationId, completedPasses: 1, nextPass: 2 } };
  const nextRequest = { ...h.request, coverageAdmission: { requestedCoverage: "complete" }, policyJudgment: judgment };
  const second = LocalPrepareEnvelopeSchema.parse(await h.run(nextRequest));
  expect(second).toMatchObject({ state: "ready" });
  if (second.state !== "ready") throw new Error(JSON.stringify(second));
  expect((await h.operations.readOperation(second.payload.operationId)).state).toMatchObject({ logicalPass: 2 });
  const decisions = createReviewDecisionPort(h.store, owner), listing = await decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  expect(listing.records).toHaveLength(1);
  const decision = listing.records[0]!, key = reviewDecisionKey(decision.value);
  expect(decision.value).toMatchObject({ decidedBy: "test-user", choice: { kind: "extra-pass", passCount: 1,
    precondition: { kind: "additional", precedingProducerId: first.payload.operationId, targetBinding: { kind: "call-target" } } } });
  const version = lifecycleSuccess(await h.store.version());
  const relay = (decisionKey: string) => ({ ...nextRequest, policyJudgment: { additionalPassAuthorization: {
    ...judgment.additionalPassAuthorization, decisionKey } } });
  expect(await h.run(relay(canonicalDigest({ missing: true })))).toMatchObject({ error: { code: "invalid-input" } });
  const replayed = await h.run(relay(key));
  expect(replayed, JSON.stringify(replayed)).toMatchObject({ state: "ready", payload: { operationId: second.payload.operationId,
    request: { requestId: second.payload.request.requestId } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  expect(await decisions.read(key)).toEqual(decision);
});

type FirstLocalPass = Awaited<ReturnType<typeof completedFirstNativeLocalPass>>["first"];
async function completedSecondNativeLocalPass(judgmentFor: (first: FirstLocalPass) => Record<string, object>, maxPasses?: number) {
  const { h, first, owner } = await completedFirstNativeLocalPass();
  if (maxPasses !== undefined) {
    // A ceiling admits a further pass over a head the exhausted passes did not review.
    await appendFile(join(h.cwd, ".arc", "system", "arc-config.yml"), `review.standard_max_passes: ${maxPasses}\n`);
    h.advanceHead();
  }
  const judgment = judgmentFor(first);
  const request = { ...h.request, coverageAdmission: { requestedCoverage: "complete" }, policyJudgment: judgment };
  const second = LocalPrepareEnvelopeSchema.parse(await h.run(request));
  if (second.state !== "ready") throw new Error(JSON.stringify(second));
  expect(await h.attest(second.payload.operationId, undefined, { status: "complete", result: "clean",
    evaluatorIdentity: "fresh-reviewer", reviewRunId: "completed-second-pass", applicabilityId: null, findings: [] }))
    .toMatchObject({ state: "attested-current" });
  const listing = await createReviewDecisionPort(h.store, owner).list();
  if (listing.status !== "complete" || listing.records.length !== 1) throw new Error(JSON.stringify(listing));
  return { h, second, request, judgment, key: reviewDecisionKey(listing.records[0]!.value) };
}

const completedGrants = {
  additional: { judgment: (first: FirstLocalPass) => ({ additionalPassAuthorization: { headSha: first.payload.target.headSha,
    precedingProducerId: first.payload.operationId, completedPasses: 1, nextPass: 2 } }), maxPasses: undefined },
  ceiling: { judgment: () => ({ ceilingOverride: { exhaustedPassCount: 1, nextPass: 2 } }), maxPasses: 1 },
} as const;

it.each([["additional", "keyless"], ["additional", "keyed"], ["ceiling", "keyless"], ["ceiling", "keyed"]] as const)(
  "replays a completed native %s pass on a %s re-entry rather than judging its grant again", async (grant, form) => {
    const { h, second, request, judgment, key } = await completedSecondNativeLocalPass(completedGrants[grant].judgment,
      completedGrants[grant].maxPasses);
    const [name, value] = Object.entries(judgment)[0]!;
    const reentry = form === "keyless" ? request : { ...request, policyJudgment: { [name]: { ...value, decisionKey: key } } };
    const version = lifecycleSuccess(await h.store.version());
    const replayed = await h.run(reentry);
    expect(replayed, JSON.stringify(replayed)).toMatchObject({ state: "review-complete", nextAction: "reduce",
      payload: { operationId: second.payload.operationId } });
    expect(lifecycleSuccess(await h.store.version())).toBe(version);
  });

it("admits a stored additional pass after the local coverage choice without another judgment", async () => {
  const { h, first } = await completedFirstNativeLocalPass();
  const choice = await h.run({ ...h.request, policyJudgment: { additionalPassAuthorization: {
    headSha: first.payload.target.headSha, precedingProducerId: first.payload.operationId, completedPasses: 1, nextPass: 2 } } });
  expect(choice, JSON.stringify(choice)).toMatchObject({ state: "coverage-required" });
  const version = lifecycleSuccess(await h.store.version());
  const second = LocalPrepareEnvelopeSchema.parse(await h.run({ ...h.request, coverageAdmission: { requestedCoverage: "complete" } }));
  expect(second).toMatchObject({ state: "ready" });
  if (second.state !== "ready") throw new Error(JSON.stringify(second));
  expect(second.payload.operationId).not.toBe(first.payload.operationId);
  expect((await h.operations.readOperation(second.payload.operationId)).state).toMatchObject({ logicalPass: 2 });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});

it.each(["work-unit", "errand"] as const)("resumes the prepared native %s review while it awaits its reviewer", async vehicle => {
  const h = await fixture(true, vehicle, false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const resumed = await h.resume(prepared.payload.operationId);
  expect(resumed, JSON.stringify(resumed)).toMatchObject({ state: "suspended", nextAction: "wait",
    payload: { operationId: prepared.payload.operationId } });
});

it.each(["work-unit", "errand"] as const)("resumes the saved %s operation without current checkout occupancy", async vehicle => {
  const h = await fixture(true, vehicle, false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  await unlink(resolveWorktreeMarkerPath(h.cwd));
  h.setIdentity("another-user");
  const resumed = await h.resume(prepared.payload.operationId);
  expect(resumed, JSON.stringify(resumed)).toMatchObject({ state: "suspended", nextAction: "wait",
    payload: { operationId: prepared.payload.operationId } });
});

it.each(["work-unit", "errand"] as const)("retains the selected %s generation with its saved operation", async vehicle => {
  const h = await fixture(true, vehicle, false);
  const selected = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse(vehicle === "errand" ? "repair" : "example") }));
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  expect((await h.operations.readOperation(prepared.payload.operationId)).state).toMatchObject({ workItem: selected.reference.owner });
  expect(parseNativeReviewOperationReference(prepared.payload.operationRef ?? "")).toEqual({ repositoryId: projectId,
    operationId: prepared.payload.operationId, workItem: selected.reference.owner });
});

it.each(["resume", "attest", "reduce"] as const)("requires the producer reference for native %s and retries after repair", async command => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  h.advanceHead();
  const version = lifecycleSuccess(await h.store.version());
  const refused = await h[command](prepared.payload.operationId, {});
  expect(refused).toMatchObject({ error: { code: "invalid-input", message: expect.stringContaining("matching reference") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  expect(await h[command](prepared.payload.operationId)).toMatchObject({
    state: command === "attest" ? "not-attestable" : "stale-target",
    payload: { operationRef: prepared.payload.operationRef },
  });
});

it.each(["resume", "attest", "reduce"] as const)("refuses a foreign project reference for native %s and retries", async command => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  const reference = parseNativeReviewOperationReference(prepared.payload.operationRef);
  const operationRef = bindNativeReviewOperationReference({ ...reference, repositoryId: "another-project" });
  h.advanceHead();
  expect(await h[command](prepared.payload.operationId, { operationRef })).toMatchObject({ error: {
    code: "invalid-input", message: expect.stringContaining("matching reference"),
  } });
  expect(await h[command](prepared.payload.operationId)).toMatchObject({
    state: command === "attest" ? "not-attestable" : "stale-target",
    payload: { operationRef: prepared.payload.operationRef },
  });
});

it.each(["resume", "attest", "reduce"] as const)("checks an already bound owner for native %s and retries", async command => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  const other = await h.seedMeta("other");
  h.advanceHead();
  expect(await h[command](prepared.payload.operationId, { operationRef: prepared.payload.operationRef,
    workItem: other.reference.owner })).toMatchObject({ error: {
    code: "invalid-input", message: expect.stringContaining("matching reference"),
  } });
  expect(await h[command](prepared.payload.operationId)).toMatchObject({
    state: command === "attest" ? "not-attestable" : "stale-target",
    payload: { operationRef: prepared.payload.operationRef },
  });
});

it("reports a missing saved owner and resumes after its working state is repaired", async () => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const saved = await h.operations.readOperation(prepared.payload.operationId);
  if (saved.state?.kind !== "local-review") throw new Error("Expected saved local review");
  const restore = await h.removeSavedOwner(prepared.payload.operationId);
  expect(await h.attest(prepared.payload.operationId)).toMatchObject({ error: {
    code: "corrupt-state", message: expect.stringContaining("Restore the pending local review record"),
  } });
  expect(await h.resume(prepared.payload.operationId)).toMatchObject({ error: {
    code: "corrupt-state", message: expect.stringContaining("Restore the pending local review record"),
  } });
  await restore();
  expect(await h.attest(prepared.payload.operationId)).toMatchObject({ state: "not-attestable", nextAction: "rerun-review" });
  expect(await h.resume(prepared.payload.operationId)).toMatchObject({ state: "suspended", nextAction: "wait" });
});

it.each(["work-unit", "errand"] as const)("attests a partial saved %s result without current checkout occupancy", async vehicle => {
  const h = await fixture(true, vehicle, false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  await unlink(resolveWorktreeMarkerPath(h.cwd));
  h.setIdentity("another-user");
  const result = await h.attest(prepared.payload.operationId);
  expect(result, JSON.stringify(result)).toMatchObject({ state: "not-attestable", nextAction: "rerun-review",
    payload: { operationId: prepared.payload.operationId, result: { status: "partial" } } });
});

it.each(["work-unit", "errand"] as const)("reduces the saved %s operation to a stale target without checkout occupancy", async vehicle => {
  const h = await fixture(true, vehicle, false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  await unlink(resolveWorktreeMarkerPath(h.cwd));
  h.setIdentity("another-user");
  h.advanceHead();
  const version = lifecycleSuccess(await h.store.version());
  const result = await h.reduce(prepared.payload.operationId);
  expect(result, JSON.stringify(result)).toMatchObject({ state: "stale-target", nextAction: "prepare-current-target",
    payload: { operationId: prepared.payload.operationId, currentTarget: { headSha: "e".repeat(40) } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});

it("reports reduction's missing saved owner and reduces after its working state is repaired", async () => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const saved = await h.operations.readOperation(prepared.payload.operationId);
  if (saved.state?.kind !== "local-review") throw new Error("Expected saved local review");
  const restore = await h.removeSavedOwner(prepared.payload.operationId);
  expect(await h.reduce(prepared.payload.operationId)).toMatchObject({ error: {
    code: "corrupt-state", message: expect.stringContaining("Restore the pending review record"),
  } });
  await restore();
  h.advanceHead();
  expect(await h.reduce(prepared.payload.operationId)).toMatchObject({ state: "stale-target", nextAction: "prepare-current-target" });
});

it.each(["resume", "attest", "reduce"] as const)("gives reference repair guidance for malformed native %s inputs", async command => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  const reference = parseNativeReviewOperationReference(prepared.payload.operationRef);
  for (const operationRef of ["arc-review-operation:v1:broken", bindNativeReviewOperationReference({
    ...reference, operationId: "another-operation",
  })]) {
    expect(await h[command](prepared.payload.operationId, { operationRef })).toMatchObject({ error: {
      code: "invalid-input", message: expect.stringContaining("matching reference"),
    } });
  }
  h.advanceHead();
  expect(await h[command](prepared.payload.operationId)).toMatchObject({
    state: command === "attest" ? "not-attestable" : "stale-target",
  });
});

it.each(["resume", "attest", "reduce"] as const)("retains project-identity recovery before native %s reference selection", async command => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  await h.removeProject();
  const version = lifecycleSuccess(await h.store.version());
  expect(await h[command](prepared.payload.operationId, {})).toMatchObject({ error: { code: "project-identity-unavailable" },
    remedy: { stdin: { schemaVersion: 1, operationId: prepared.payload.operationId } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  await h.seedProject(projectId);
  h.advanceHead();
  expect(await h[command](prepared.payload.operationId)).toMatchObject({
    state: command === "attest" ? "not-attestable" : "stale-target",
  });
});

it.each(["resume", "attest", "reduce"] as const)("retains unavailable execution for a well-formed native %s locator selecting an absent owner", async command => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  const other = await h.seedMeta("other");
  const operationRef = bindNativeReviewOperationReference({ ...parseNativeReviewOperationReference(prepared.payload.operationRef),
    workItem: other.reference.owner });
  for (const workItem of [undefined, other.reference.owner]) {
    expect(await h[command](prepared.payload.operationId, { operationRef, workItem })).toMatchObject({ error: {
      code: "corrupt-state", message: expect.stringContaining("operation is unavailable"),
    } });
  }
  h.advanceHead();
  expect(await h[command](prepared.payload.operationId)).toMatchObject({
    state: command === "attest" ? "not-attestable" : "stale-target",
  });
});

it.each(["resume", "attest", "reduce"] as const)("rejects native locators at repository roots for %s", async command => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const store = createStore(createDefaultStorePorts({ checkoutRoot: h.cwd, exec: h.exec }));
  expect(await h[command](prepared.payload.operationId, { operationRef: prepared.payload.operationRef, store }))
    .toMatchObject({ error: { code: "invalid-input", message: expect.stringContaining("omit `operationRef`") } });
});

it.each(["resume", "attest", "reduce"] as const)("retains an already bound internal owner for native %s", async command => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  const { workItem } = parseNativeReviewOperationReference(prepared.payload.operationRef);
  h.advanceHead();
  expect(await h[command](prepared.payload.operationId, { workItem })).toMatchObject({
    state: command === "attest" ? "not-attestable" : "stale-target",
    payload: { operationRef: prepared.payload.operationRef },
  });
});

it.each(["attest", "resume", "reduce"] as const)("retains the native local source owner through %s", async command => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  const operationId = prepared.payload.operationId;
  const attestedRaw = await h.attest(operationId, undefined, { status: "complete", result: "findings",
    evaluatorIdentity: "fresh-reviewer", reviewRunId: "completed-run", applicabilityId: null,
    findings: [{ findingId: "source-retention", severity: "major", locus: "src/example.ts:7",
      evidenceUrlOrId: "source:src/example.ts:7" }] });
  expect(attestedRaw, JSON.stringify(attestedRaw)).toMatchObject({ state: "attested-current" });
  const attested = LocalAttestEnvelopeSchema.parse(attestedRaw);
  if (attested.state !== "attested-current") throw new Error(JSON.stringify(attested));
  let receiptRef = attested.payload.receiptRef;
  if (command === "resume") {
    const resumed = LocalResumeEnvelopeSchema.parse(await h.resume(operationId));
    if (resumed.state !== "respond-to-findings") throw new Error(JSON.stringify(resumed));
    receiptRef = resumed.payload.receiptRef;
  }
  if (command === "reduce") {
    const reduced = ReduceEnvelopeSchema.parse(await h.reduce(operationId));
    if (reduced.state !== "findings" || reduced.payload.responseSource.kind !== "attested-local") throw new Error(JSON.stringify(reduced));
    receiptRef = reduced.payload.responseSource.receiptRef;
  }
  expect(parseReviewSourceReference(receiptRef, "attested-local", true)).toMatchObject({ repositoryId: projectId,
    workItem: parseNativeReviewOperationReference(prepared.payload.operationRef).workItem, operationId });
});

it.each(["work-unit", "errand"] as const)("binds a %s response proposal from the default local source", async vehicle => {
  const h = await fixture(true, vehicle, false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const attested = LocalAttestEnvelopeSchema.parse(await h.attest(prepared.payload.operationId, undefined, {
    status: "complete", result: "findings", evaluatorIdentity: "fresh-reviewer", reviewRunId: "completed-run",
    applicabilityId: null, findings: [{ findingId: "source-retention", severity: "major", locus: "src/example.ts:7",
      evidenceUrlOrId: "source:src/example.ts:7" }],
  }));
  if (attested.state !== "attested-current") throw new Error(JSON.stringify(attested));
  const resumed = LocalResumeEnvelopeSchema.parse(await h.resume(prepared.payload.operationId));
  if (resumed.state !== "respond-to-findings") throw new Error(JSON.stringify(resumed));
  expect(resumed.payload.responsePlan.source).toEqual({ kind: "attested-local", receiptRef: attested.payload.receiptRef });
  const request = withReviewReport({ schemaVersion: 1, source: resumed.payload.responsePlan.source,
    proposal: { proposedVerification: "focused", severityGatingPolicy: { minorGating: "record-only" },
      findings: resumed.payload.responsePlan.findings.map(finding => ({ findingId: finding.findingId,
        sourceVerification: "verified", verifiedSeverity: finding.severity, verificationRefs: [finding.evidenceUrlOrId],
        disposition: "defer", title: "Preserve target facts", issue: "The target changes before continuation.",
        rationale: "The selected source supports the finding.", recommendation: "Retain the target facts.", openQuestions: [] })) } });
  const response = await h.respond(request);
  expect(response, JSON.stringify(response)).toMatchObject({ state: "awaiting-approval", nextAction: "obtain-approval" });
});

it("retains the selected native result owner and refuses another owner before returning its evidence", async () => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  const owner = parseNativeReviewOperationReference(prepared.payload.operationRef).workItem;
  const attested = await h.attest(prepared.payload.operationId, undefined, { status: "complete", result: "findings",
    evaluatorIdentity: "fresh-reviewer", reviewRunId: "completed-run", applicabilityId: null,
    findings: [{ findingId: "source-retention", severity: "major", locus: "src/example.ts:7", evidenceUrlOrId: "source:src/example.ts:7" }] });
  expect(attested, JSON.stringify(attested)).toMatchObject({ state: "attested-current" });
  expect(await h.readResult(prepared.payload.operationId)).toMatchObject({ workItem: owner });
  const other = await h.seedMeta("another", { branch: null });
  await expect(h.readResult(prepared.payload.operationId, other.reference.owner)).rejects.toThrow(/No review producer matches/u);
  expect(await h.readResult(prepared.payload.operationId)).toMatchObject({ workItem: owner });
});

it.each(["resume", "attest", "reduce"] as const)("ignores leftover legacy execution when entering native %s", async command => {
  const h = await fixture(true, "work-unit", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const pending = await h.operations.readOperation(prepared.payload.operationId);
  if (pending.state?.kind !== "local-review") throw new Error("Expected the actual native admission");
  await h.legacyOperations.publishOperation({ ...pending.state, workItem: undefined }, 0);
  h.advanceHead();
  expect(await h[command](prepared.payload.operationId)).toMatchObject({
    state: command === "attest" ? "not-attestable" : "stale-target" });
});

it("prepares a native Errand fix check only after its approved response is performed", async () => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  const owner = parseNativeReviewOperationReference(prepared.payload.operationRef).workItem;
  expect(await h.attest(prepared.payload.operationId, undefined, { status: "complete", result: "findings",
    evaluatorIdentity: "fresh-reviewer", reviewRunId: "findings-before-fix", applicabilityId: null,
    findings: [{ findingId: "retained-finding", severity: "major", locus: "src/example.ts:1", evidenceUrlOrId: "source:src/example.ts:1" }] }))
    .toMatchObject({ state: "attested-current" });
  expect(await h.resume(prepared.payload.operationId)).toMatchObject({ state: "respond-to-findings" });
  expect(await h.run()).toMatchObject({ state: "review-complete", payload: { operationId: prepared.payload.operationId } });
  const { family } = createReviewCompositionContext({ ...h, workItem: owner });
  if (family.mode !== "stored") throw new Error("Expected native review facts");
  const stored = await family.ports.outcomes.read(prepared.payload.operationId);
  if (stored === null) throw new Error("Expected the actual local outcome");
  const outcome = stored.value, value = performedEvidenceFixture("errand", outcome).value;
  const evidence = { ...value, binding: { kind: "errand" as const,
    errand: { key: SlugSchema.parse("repair"), claimId: h.claimId, branch: "chore/repair" } } };
  const { performance, ...approval } = evidence;
  if (performance?.fixResponse === undefined) throw new Error("Expected the complete performed fix");
  const ports = { ...family.ports, readProjectId: h.projectId };
  await publishNativeReviewApproval({ ...ports, record: composeReviewDispositionRecord(outcome, [approval], owner),
    now: () => "2026-10-20T12:00:00Z" });
  const laneInput = { lane: "standard" as const, repositoryId: projectId, headSha: outcome.target.headSha, lineage: outcome.lineage };
  const approvedLane = await readLaneProgressOwner(family.ports.inFlight, laneInput);
  if (approvedLane === null) throw new Error("Expected the findings lane");
  expect(livePredecessorReviewAttempt(approvedLane)).toMatchObject({ attemptId: outcome.attemptId, outcome: "findings" });
  expect(await h.run()).toMatchObject({ state: "review-complete", payload: { operationId: outcome.attemptId } });
  const { fixResponse: ignored, ...header } = performance;
  void ignored;
  await publishNativeReviewPerformance({ ...ports, record: composeReviewDispositionRecord(outcome, [evidence], owner), performance: header });
  const performedLane = await readLaneProgressOwner(family.ports.inFlight, laneInput);
  if (performedLane === null) throw new Error("Expected the performed findings lane");
  expect(livePredecessorReviewAttempt(performedLane)).toBeNull();
  h.advanceHead();
  const offered = LocalPrepareEnvelopeSchema.parse(await h.run());
  expect(offered, JSON.stringify(offered)).toMatchObject({ state: "coverage-required" });
  if (offered.state !== "coverage-required") throw new Error(JSON.stringify(offered));
  const coverageAdmission = offered.payload.coverageSelectionAction.choices.find(choice => choice.requestedCoverage === "incremental");
  expect(coverageAdmission).toMatchObject({ requestedCoverage: "incremental", correctionScope: { predecessorProducerId: outcome.attemptId } });
  const nextResult = await h.run({ ...h.request, coverageAdmission });
  expect(nextResult, JSON.stringify(nextResult)).toMatchObject({ state: "ready" });
  const next = LocalPrepareEnvelopeSchema.parse(nextResult);
  if (next.state !== "ready") throw new Error(JSON.stringify(next));
  expect(next.payload.operationId).not.toBe(outcome.attemptId);
  expect(await h.operations.readOperation(next.payload.operationId)).toMatchObject({ state: {
    logicalPass: 2, coverageAdmission: { requestedCoverage: "incremental", correctionScope: { predecessorProducerId: outcome.attemptId,
      predecessorHeadSha: outcome.target.headSha, headSha: performance.producedHeadSha } } } });
  expect(await family.ports.outcomes.read(outcome.attemptId)).toEqual(stored);
});

it("cancels a native dispatch through its produced reference and replays the same reference", async () => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  const { operationId, operationRef } = prepared.payload;
  const cancelled = await h.cancel(operationId);
  expect(cancelled, JSON.stringify(cancelled)).toMatchObject({ mode: "review-local-cancel", state: "cancelled",
    nextAction: "rerun-review", payload: { operationId, operationRef } });
  expect(await h.operations.readOperation(operationId)).toMatchObject({ state: null });
  expect(await h.cancel(operationId)).toMatchObject({ state: "terminal-operation", nextAction: "resume-review",
    payload: { operationId, operationRef } });
});

it("refuses malformed and foreign native cancel references, then cancels with the produced one", async () => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error(JSON.stringify(prepared));
  const reference = parseNativeReviewOperationReference(prepared.payload.operationRef);
  for (const operationRef of ["arc-review-operation:v1:broken", bindNativeReviewOperationReference({
    ...reference, operationId: "another-operation" })]) {
    expect(await h.cancel(prepared.payload.operationId, { operationRef })).toMatchObject({ error: {
      code: "invalid-input", message: expect.stringContaining("emitted by arc review local prepare") } });
  }
  const other = await h.seedMeta("other");
  const foreign = bindNativeReviewOperationReference({ ...reference, workItem: other.reference.owner });
  for (const workItem of [undefined, other.reference.owner]) {
    expect(await h.cancel(prepared.payload.operationId, { operationRef: foreign, workItem })).toMatchObject({ error: {
      code: "corrupt-state", message: expect.stringContaining("operation is unavailable") } });
  }
  expect(await h.operations.readOperation(prepared.payload.operationId)).toMatchObject({ state: { kind: "local-review" } });
  expect(await h.cancel(prepared.payload.operationId)).toMatchObject({ state: "cancelled" });
});

const unreadableListing = { error: { code: "store-refused" },
  refusal: { class: "recoverable", rule: "review.listing-unreadable", remedy: { text: "Restore the family index from a saved state." } },
  remedy: { text: expect.stringContaining("Restore the family index from a saved state.") } };

it.each(["resume", "reduce"] as const)("reports an unreadable native review listing whole for %s and continues once readable", async command => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  if (command === "reduce") h.advanceHead();
  h.store.state.unreadable.add("review");
  const refused = await h[command](prepared.payload.operationId);
  expect(refused, JSON.stringify(refused)).toMatchObject(unreadableListing);
  h.store.state.unreadable.clear();
  expect(await h[command](prepared.payload.operationId)).toMatchObject({ state: command === "resume" ? "suspended" : "stale-target" });
});

it("reports an unreadable native review listing whole for respond and records the response once readable", async () => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const attested = LocalAttestEnvelopeSchema.parse(await h.attest(prepared.payload.operationId, undefined, {
    status: "complete", result: "findings", evaluatorIdentity: "fresh-reviewer", reviewRunId: "completed-run",
    applicabilityId: null, findings: [{ findingId: "source-retention", severity: "major", locus: "src/example.ts:7",
      evidenceUrlOrId: "source:src/example.ts:7" }],
  }));
  if (attested.state !== "attested-current") throw new Error(JSON.stringify(attested));
  const resumed = LocalResumeEnvelopeSchema.parse(await h.resume(prepared.payload.operationId));
  if (resumed.state !== "respond-to-findings") throw new Error(JSON.stringify(resumed));
  const request = withReviewReport({ schemaVersion: 1, source: resumed.payload.responsePlan.source,
    proposal: { proposedVerification: "focused", severityGatingPolicy: { minorGating: "record-only" },
      findings: resumed.payload.responsePlan.findings.map(finding => ({ findingId: finding.findingId,
        sourceVerification: "verified", verifiedSeverity: finding.severity, verificationRefs: [finding.evidenceUrlOrId],
        disposition: "defer", title: "Preserve target facts", issue: "The target changes before continuation.",
        rationale: "The selected source supports the finding.", recommendation: "Retain the target facts.", openQuestions: [] })) } });
  h.store.state.unreadable.add("review");
  const refused = await h.respond(request);
  expect(refused, JSON.stringify(refused)).toMatchObject(unreadableListing);
  h.store.state.unreadable.clear();
  expect(await h.respond(request)).toMatchObject({ state: "awaiting-approval", nextAction: "obtain-approval" });
});
