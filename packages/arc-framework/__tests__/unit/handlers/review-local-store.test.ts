/** Default local review handlers select native checkout authority before binding durable ports. */
import { mkdir, unlink } from "node:fs/promises";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";
import { resolveWorktreeMarkerPath } from "../../../src/lib/git/worktree-marker.js";
import { candidateFixture } from "../../helpers/store/tracked-write-fixture.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { expect, it, onTestFinished } from "vitest";
import { LocalPrepareEnvelopeSchema } from "../../../src/scripts/review-gate/core/review-command-envelope.js";
import { handleReviewLocalPrepare, handleReviewLocalResume } from "../../../src/handlers/review.js";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { scriptRawGitExec } from "../../helpers/git-exec-fake.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";
import { LocalReviewOperationStateStore } from "../../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { RepositoryGitCommonStatePublisher } from "../../../src/lib/git-common-state.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
async function fixture(project = true, vehicle: "work-unit" | "errand" = "errand", exempt = true) {
  const h = createReviewHarness();
  if (project) await h.seedProject(projectId);
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
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["config", "--null", "--get", "arc.identity"], responses: [() => ({ stdout: `${activeIdentity}\0` })] },
    { match: ["rev-parse", "--show-object-format"], responses: [{ stdout: "sha1" }] },
    { match: ["config", "--get", "remote.origin.url"], responses: [{ stdout: "https://github.com/owner/repository.git" }] },
    { match: ["check-ref-format", "--branch", branch], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], responses: [{ stdout: head }] },
    { match: ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], responses: [{ stdout: "" }] },
    { command: "gh", match: { prefix: ["pr", "list", "--repo", "owner/repository", "--state", "all"] }, responses: [{ stdout: "[]" }] },
    { match: { predicate: args => args[0] === "show-ref" && args[1] === "--verify" && args[2] === "--hash"
      && args[3]?.startsWith("refs/arc/review/local/") === true }, responses: [({ args }) => {
        const value = pins.get(args[3] ?? "");
        return value === undefined ? { failure: { exitCode: 1 } } : { stdout: value };
      }] },
    { match: { predicate: args => args[0] === "update-ref" && args[1]?.startsWith("refs/arc/review/local/") === true },
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
    { match: ["rev-parse", "HEAD^{tree}"], responses: [{ stdout: "d".repeat(40) }] },
    { match: ["status", "--porcelain=v2", "--untracked-files=no"], responses: [{ stdout: "" }] },
    ...[`${base}^{commit}`, `${head}^{commit}`, `${"c".repeat(40)}^{tree}`, `${"d".repeat(40)}^{tree}`]
      .map(revision => ({ match: ["cat-file", "-e", revision], responses: [{ stdout: "" }] })),
    { match: ["for-each-ref", "--format=%(refname)", "refs/arc/review/local/"], responses: [() => ({ stdout: [...pins.keys()].join("\n") })] },
    { match: ["rev-parse", "HEAD"], responses: [{ stdout: head }] },
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: head }] },
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
  const rawGit = scriptRawGitExec([{ match: ["diff", "--numstat", "-z", "-M", "-C", "--find-copies-harder", `${base}..${head}`, "--"],
    responses: [{ stdout: Buffer.from("1\t0\tsrc/example.ts\0") }] }]).exec;
  const operations = new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd));
  return { ...checkout, claimId, request, operations, setIdentity: (identity: string) => { activeIdentity = identity; }, resume: async (operationId: string) => {
    let output = "";
    await handleReviewLocalResume("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify({ schemaVersion: 1, operationId }),
      write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  }, run: async () => {
    let output = "";
    await handleReviewLocalPrepare("-", { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify(request), write: text => { output += text; }, setExitCode: () => {} },
    undefined, { ...checkout, rawGit, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
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
  expect(result, JSON.stringify(result)).toMatchObject({ state: "ready", nextAction: "launch-review" });
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
});

it("keeps the unavailable-operation refusal without current checkout occupancy", async () => {
  const h = await fixture();
  await unlink(resolveWorktreeMarkerPath(h.cwd));
  expect(await h.resume("missing-operation")).toMatchObject({ error: {
    code: "corrupt-state", message: "local review operation is unavailable",
  } });
});

it("reports a missing saved owner and resumes after its working state is repaired", async () => {
  const h = await fixture(true, "errand", false);
  const prepared = LocalPrepareEnvelopeSchema.parse(await h.run());
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const saved = await h.operations.readOperation(prepared.payload.operationId);
  if (saved.state?.kind !== "local-review") throw new Error("Expected saved local review");
  const { workItem, ...unbound } = saved.state;
  if (workItem === undefined) throw new Error("Expected selected owner");
  const corrupt = await h.operations.publishOperation(unbound, saved.version);
  expect(await h.resume(prepared.payload.operationId)).toMatchObject({ error: {
    code: "corrupt-state", message: "local review operation has no selected work item",
  } });
  await h.operations.publishOperation(saved.state, corrupt.version);
  expect(await h.resume(prepared.payload.operationId)).toMatchObject({ state: "suspended", nextAction: "wait" });
});
