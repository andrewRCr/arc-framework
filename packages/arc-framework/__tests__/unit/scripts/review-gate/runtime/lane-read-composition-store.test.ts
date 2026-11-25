/** Native lane reads bind the production checkout vehicle before durable-family access. */
import { unlink } from "node:fs/promises";
import { resolveWorktreeMarkerPath } from "../../../../../src/lib/git/worktree-marker.js";
import { scriptRawGitExec } from "../../../../helpers/git-exec-fake.js";
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { TransientIdentityRecordSchema } from "../../../../../src/lib/errand/identity-record.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { createProjectIdentityReader } from "../../../../../src/lib/store/project-identity.js";
import { readReviewLane } from "../../../../../src/scripts/review-gate/runtime/lane-read-composition.js";
import type { Store } from "../../../../../src/lib/store/contract.js";
import type { StoreRecord } from "../../../../../src/lib/store/read.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
async function fixture(vehicle: "work-unit" | "errand", project = true, boundaryWorkUnit = "example") {
  const h = createReviewHarness();
  if (project) await h.seedProject(projectId);
  const claimId = "1".repeat(32), branch = vehicle === "errand" ? "chore/repair" : "topic/opaque";
  let boundary: StoreRecord | undefined;
  if (vehicle === "errand") {
    const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "repair",
      claimId, intent: "Repair one issue", owner: "test-user", origin: "description", originEntry: null,
      branch, state: "open", savedHead: null, changeRequest: null,
      createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
    if (record.kind !== "errand") throw new Error("Expected Errand");
    await h.seedErrand(record);
  } else {
    const primary = await h.seedMeta("example", { owner: "test-user", branch: null }, { kind: "active" }, {
      branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
    });
    const candidate = candidateFixture();
    await h.seedCandidate(primary.reference.owner, candidate);
    boundary = await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
      mode: "pre-publication-review", workUnit: boundaryWorkUnit, candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: candidate.subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
      nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
  }
  const head = "a".repeat(40), base = "b".repeat(40);
  const checkout = await createReviewCheckout(h, { script: [
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
  const rawGit = scriptRawGitExec([{ match: ["diff", "--numstat", "-z", "-M", "-C", "--find-copies-harder", `${base}..${head}`, "--"],
    responses: [{ stdout: new Uint8Array() }] }]).exec;
  return { ...checkout, claimId, boundary, run: (store: Store = checkout.store) => readReviewLane({ schemaVersion: 1 },
    { ...checkout, store, rawGit, projectId: createProjectIdentityReader(store) }) };
}

it.each(["work-unit", "errand"] as const)("reads the stored %s with no injected owner or legacy copy", async vehicle => {
  const h = await fixture(vehicle);
  const version = lifecycleSuccess(await h.store.version());
  const result = await h.run();
  expect(result, JSON.stringify(result)).toMatchObject({ state: "ready", payload: {
    lineage: vehicle === "errand" ? { kind: "head-bound", vehicleIdentity: h.claimId } : { kind: "candidate" },
    facts: { completePasses: 0 },
  } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});
it("refuses missing project authority with its remedy and resumes after repair", async () => {
  const h = await fixture("work-unit", false);
  const version = lifecycleSuccess(await h.store.version());
  expect(await h.run()).toMatchObject({ state: "refused", payload: { code: "project-identity-unavailable",
    remedy: { argv: ["arc", "review", "lane", "read", "-"], stdin: { schemaVersion: 1 } } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  await h.seedProject(projectId);
  expect(await h.run()).toMatchObject({ state: "ready", payload: { lineage: { kind: "candidate" } } });
});

it("keeps the unresolved-vehicle refusal and reads the exact claim after marker repair", async () => {
  const h = await fixture("errand");
  await unlink(resolveWorktreeMarkerPath(h.cwd));
  expect(await h.run()).toMatchObject({ state: "refused", payload: { code: "vehicle-unresolved" } });
  await h.occupy("chore/repair", { kind: "errand", slug: "repair", claimId: h.claimId });
  expect(await h.run()).toMatchObject({ state: "ready", payload: { lineage: { vehicleIdentity: h.claimId } } });
});

it("refuses a store refusal naming its own command with that command, and reads once the store is repaired", async () => {
  const h = await fixture("work-unit");
  let missing = true;
  const store = Object.create(h.store) as Store;
  store.read = async input => missing && input.reference.kind === "review/candidate" ? { status: "refused", refusal: {
    code: "state-unresolvable", class: "recoverable", historyRefs: [], reference: input.reference,
    condition: "The Candidate record's objects are missing locally.",
    remedy: { text: "Run arc sync to fetch the missing state, then retry.", argv: ["arc", "sync"] } } }
    : h.store.read(input);
  expect(await h.run(store)).toMatchObject({ state: "refused", payload: { code: "store-refused",
    detail: "The Candidate record's objects are missing locally.",
    remedy: { argv: ["arc", "sync"], text: expect.stringContaining("fetch the missing state") } } });
  missing = false;
  expect(await h.run(store)).toMatchObject({ state: "ready", payload: { lineage: { kind: "candidate" } } });
});

it("refuses a stored boundary naming another work unit under its own code and remedy, and reads once it names this one", async () => {
  const h = await fixture("work-unit", true, "other");
  if (h.boundary === undefined) throw new Error("Expected the seeded boundary");
  expect(await h.run()).toMatchObject({ state: "refused", payload: { code: "invalid-input",
    detail: "The bound work item's submission boundary belongs to work unit `other`, not `example`.",
    remedy: { text: expect.stringContaining("Name work unit `other`, or run the command from `example`'s checkout."),
      argv: ["arc", "review", "lane", "read", "-"], stdin: { schemaVersion: 1 } } } });
  lifecycleSuccess(await h.store.write({ action: "put", reference: h.boundary.reference, expected: h.boundary.version,
    content: h.boundary.content.replace('"workUnit":"other"', '"workUnit":"example"'),
    provenance: { verb: "review", lifecycleAction: "edit" } }));
  expect(await h.run()).toMatchObject({ state: "ready", payload: { lineage: { kind: "candidate" } } });
});
