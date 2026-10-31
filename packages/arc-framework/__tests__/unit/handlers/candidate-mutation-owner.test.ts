/** A native Candidate mutation writes the generation its checkout continues, never a namesake reusing its slug. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { resolveCandidateMutationGeneration, resolveCompletedCandidateOwners, resolveCompletedCandidateWorkUnits }
  from "../../../src/handlers/candidate-mutation-owner.js";
import { createStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-ports.js";
import { renderMetaFile } from "../../../src/lib/store/kinds/meta/writers.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { recordReferences, type OwnerIdentity } from "../../../src/lib/store/identity.js";
import { canonicalDigest } from "../../../src/lib/kernel/canonical/canonical-json.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot, serializeCandidateManagedRecord }
  from "../../../src/lib/work-unit/candidate-attestation.js";

const named = { cwd: "/repo", candidateId: canonicalDigest({ candidate: "named" }) };

async function reusedSlug() {
  const h = createLifecycleHarness();
  const archived = await h.seedMeta("example", { branch: null, state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const live = await h.seedMeta("example");
  return { h, archived: archived.reference.owner, live: live.reference.owner };
}

it("resolves the completed generation from a free primary while a live work unit reuses its slug", async () => {
  const { h, archived, live } = await reusedSlug();
  expect(archived).not.toEqual(live);
  expect(await resolveCandidateMutationGeneration(h.store, "example", "unowned", named)).toEqual(archived);
});

it("resolves the live generation from the work unit's own checkout", async () => {
  const { h, live } = await reusedSlug();
  expect(await resolveCandidateMutationGeneration(h.store, "example", "owned", named)).toEqual(live);
});

it("resolves a completed checkout's own generation through its branch while a live work unit reuses its slug", async () => {
  const h = createLifecycleHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  const archived = await h.seedMeta("example", { branch: null, state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    { branches: [{ repository: projectId, ref: "feat/old", linkedAs: "created", excluded: [] }] });
  const live = await h.seedMeta("example", {}, { kind: "active" },
    { branches: [{ repository: projectId, ref: "feat/new", linkedAs: "created", excluded: [] }] });
  const checkout = { branch: "feat/old", projectId: async () => projectId };
  expect(await resolveCandidateMutationGeneration(h.store, "example", "owned", named, undefined, checkout))
    .toEqual(archived.reference.owner);
  expect(await resolveCandidateMutationGeneration(h.store, "example", "owned", named, undefined, { ...checkout, branch: "feat/new" }))
    .toEqual(live.reference.owner);
});

it("keeps an owner the invocation already selected", async () => {
  const { h, archived } = await reusedSlug();
  expect(await resolveCandidateMutationGeneration(h.store, "example", "owned", named, archived)).toEqual(archived);
});

it("keeps a bound owner from a free primary only when it is a completed generation", async () => {
  const { h, archived, live } = await reusedSlug();
  await expect(resolveCandidateMutationGeneration(h.store, "example", "unowned", named, live)).rejects.toMatchObject({
    code: "invalid-input", condition: "The selected `example` work item is not a completed generation." });
  expect(await resolveCandidateMutationGeneration(h.store, "example", "unowned", named, archived)).toEqual(archived);
});

it("selects the completed generation of a shared slug holding the named Candidate, and refuses when none does",
  async () => {
    const h = createLifecycleHarness();
    const shipped = { branch: null, state: "Shipped", currentWorkflow: null } as const;
    const completed = { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } as const;
    const first = await h.seedMeta("example", shipped, completed), second = await h.seedMeta("example", shipped, completed);
    const hold = async (owner: OwnerIdentity, attestedAt: string) => {
      const subject = createCandidateSubjectSnapshot([]);
      const record = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const, subject,
        attestation: createCandidateAttestation({ workUnit: "example", subject, baseRevision: "a".repeat(40),
          attestedBy: "andrew", attestedAt, verificationEvidenceRef: "test://verified" }),
        transitions: [], lineageAttestations: [] };
      await h.seed(recordReferences["review/candidate"](owner), serializeCandidateManagedRecord(record));
      return { cwd: "/repo", candidateId: record.attestation.candidateId };
    };
    const firstCandidate = await hold(first.reference.owner, "2026-10-30T12:00:00Z");
    const secondCandidate = await hold(second.reference.owner, "2026-10-30T13:00:00Z");
    await expect(resolveCandidateMutationGeneration(h.store, "example", "unowned", named)).rejects.toMatchObject({
      code: "invalid-input", condition: `No completed \`example\` work unit holds Candidate \`${named.candidateId}\`.` });
    expect(await resolveCandidateMutationGeneration(h.store, "example", "unowned", firstCandidate))
      .toEqual(first.reference.owner);
    expect(await resolveCandidateMutationGeneration(h.store, "example", "unowned", secondCandidate))
      .toEqual(second.reference.owner);
  });

it("refuses an incomplete completed inventory naming what it could not read, and resolves once it is complete", async () => {
  const { h, archived } = await reusedSlug();
  const list = h.store.list.bind(h.store), diagnostic = { kind: "malformed" as const, key: "meta-other",
    condition: "Metadata for `other` is malformed.", remedy: { text: "Repair its metadata." } };
  let incomplete = true;
  h.store.list = async input => {
    const result = await list(input);
    return incomplete && result.status === "ok" && result.result.status === "complete"
      ? { status: "ok", result: { ...result.result, missed: true, diagnostics: [diagnostic] } } : result;
  };
  await expect(resolveCandidateMutationGeneration(h.store, "example", "unowned", named)).rejects.toMatchObject({
    code: "corrupt-state", message: expect.stringContaining(diagnostic.condition) });
  incomplete = false;
  expect(await resolveCandidateMutationGeneration(h.store, "example", "unowned", named)).toEqual(archived);
});

it("carries the store's refusal whole when the checkout's own work unit cannot be read", async () => {
  const h = createLifecycleHarness();
  await expect(resolveCandidateMutationGeneration(h.store, "example", "owned", named)).rejects.toMatchObject({
    refusal: { code: "not-found" } });
  await h.seedMeta("example");
  expect(await resolveCandidateMutationGeneration(h.store, "example", "owned", named)).toMatchObject({ name: "example" });
});

it("keeps an in-repo completed name that is no slug in the name list, selecting no owner for it", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "arc-completed-names-"));
  onTestFinished(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, ".arc", "completed", "2026-q4"), { recursive: true });
  const meta = renderMetaFile("example", { state: "Shipped", owner: "andrew", workClass: "Light", currentWorkflow: null });
  for (const name of ["example", "Legacy_Name"]) {
    await writeFile(join(cwd, ".arc", "completed", "2026-q4", `meta-${name}.md`), meta);
  }
  const store = createStore(createDefaultStorePorts({ checkoutRoot: cwd, exec: scriptGitExec([]).exec }));
  expect([...await resolveCompletedCandidateWorkUnits(cwd, store)].sort()).toEqual(["Legacy_Name", "example"]);
  expect(await resolveCompletedCandidateOwners(cwd, store)).toEqual([{ type: "work-item", name: "example" }]);
});
