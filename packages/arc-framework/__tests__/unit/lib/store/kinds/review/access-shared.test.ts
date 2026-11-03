/** Typed review access retries an ended item's history through the store it opens, and leaves a caller's store as given. */
import { beforeEach, expect, it, vi } from "vitest";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../../../../../helpers/store/tracked-write-fixture.js";
import { lackingEndedHistory } from "../../../../../helpers/store/ended-history.js";
import { ArchiveQuarterSchema } from "../../../../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../../../../src/lib/store/index.js";
import { createCandidateAttestation } from "../../../../../../src/lib/work-unit/candidate-attestation.js";
import { readCandidateRecord, writeCandidateRecord } from "../../../../../../src/lib/store/kinds/review/candidate/access.js";
import { StoreRefusalError } from "../../../../../../src/lib/store/refusal-error.js";
import { OwnerIdentitySchema } from "../../../../../../src/lib/store/identity.js";
import { requireReviewRecordOwner } from "../../../../../../src/lib/store/kinds/review/access-shared.js";
import { resolveNamedReviewWorkUnitInvocation } from "../../../../../../src/scripts/review-gate/runtime/review-work-unit.js";

const mocks = vi.hoisted(() => ({ createStore: vi.fn<typeof import("../../../../../../src/lib/store/create.js").createStore>() }));
vi.mock("../../../../../../src/lib/store/create.js", async importOriginal => ({
  ...await importOriginal<typeof import("../../../../../../src/lib/store/create.js")>(), createStore: mocks.createStore }));

/** A store typed access opens is the real one unless a test supplies its own. */
async function resetMockDefaults(): Promise<void> {
  const actual = await vi.importActual<typeof import("../../../../../../src/lib/store/create.js")>(
    "../../../../../../src/lib/store/create.js");
  mocks.createStore.mockImplementation(actual.createStore);
}

beforeEach(async () => {
  vi.resetAllMocks();
  await resetMockDefaults();
});

it.each([0, 1])("preserves renamed selection reader %s and selects it after repair", async index => {
  const h = createReviewHarness();
  const primary = await h.seedMeta("example");
  const selected = OwnerIdentitySchema.parse({ ...primary.reference.owner, name: "former" });
  const read = h.store.read.bind(h.store);
  const refusal = { code: "namespace-corrupt" as const, class: "terminal" as const, namespace: "work-item",
    condition: "The selected metadata cannot be read.", remedy: { text: "Restore the selected metadata and retry." } };
  h.store.read = async () => ({ status: "refused", refusal });
  const operations = [
    () => requireReviewRecordOwner(h.store, selected, "example"),
    () => resolveNamedReviewWorkUnitInvocation({ cwd: "/unused", store: h.store, workItem: selected,
      exec: async () => { throw new Error("Unexpected process execution"); } }, "example"),
  ];
  await expect(operations[index]!()).rejects.toMatchObject({
    name: "StoreRefusalError", offBranch: true, refusal,
    message: `${refusal.condition} ${refusal.remedy.text}` });
  h.store.read = read;
  expect(await operations[0]!()).toEqual(primary.reference.owner);
  expect(await operations[1]!()).toMatchObject({ workItem: primary.reference.owner });
});

it("writes an archived item's Candidate through the store it opens after pulling the history this clone lacks", async () => {
  const h = createReviewHarness(), record = candidateFixture();
  const primary = await h.seedMeta("example", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
  const owner = primary.reference.owner;
  const saved = await h.seedCandidate(owner, record);
  const next = { ...record, attestation: createCandidateAttestation({ ...record.attestation, subject: record.subject,
    attestedAt: "2026-08-14T14:00:00Z", supersedes: record.attestation.candidateId }) };
  await expect(writeCandidateRecord("/no-projected-files", "example", next, saved.version,
    { store: lackingEndedHistory(h.store, owner), owner })).rejects.toThrow("Pull refs/arc/history/work/");
  mocks.createStore.mockReturnValue(lackingEndedHistory(h.store, owner));
  await writeCandidateRecord("/no-projected-files", "example", next, saved.version, { owner });
  expect(await readCandidateRecord("/no-projected-files", "example", { store: h.store, owner })).toEqual(next);
  expect(lifecycleSuccess(await h.store.read({ reference: recordReferences["review/candidate"](owner) })).version)
    .not.toBe(saved.version);
});

it("carries the whole store refusal through typed access, with today's message", async () => {
  const h = createReviewHarness(), record = candidateFixture();
  const owner = (await h.seedMeta("example", { state: "Shipped", currentWorkflow: null },
    { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") })).reference.owner;
  const saved = await h.seedCandidate(owner, record);
  const error = await writeCandidateRecord("/no-projected-files", "example", { ...record, attestation: createCandidateAttestation({
    ...record.attestation, subject: record.subject, attestedAt: "2026-08-14T14:00:00Z", supersedes: record.attestation.candidateId }) },
  saved.version, { store: lackingEndedHistory(h.store, owner), owner }).then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(StoreRefusalError);
  const { refusal } = error as StoreRefusalError;
  expect(refusal).toMatchObject({ code: "state-unresolvable", class: "recoverable" });
  expect((error as Error).message).toBe(`${refusal.condition} ${refusal.remedy.text}`);
});
