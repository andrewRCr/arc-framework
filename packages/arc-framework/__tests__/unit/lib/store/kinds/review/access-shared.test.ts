/** Typed review access retries an ended item's history through the store it opens, and leaves a caller's store as given. */
import { expect, it, vi } from "vitest";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../../../../../helpers/store/tracked-write-fixture.js";
import { lackingEndedHistory } from "../../../../../helpers/store/ended-history.js";
import { ArchiveQuarterSchema } from "../../../../../../src/lib/kernel/index.js";
import { recordReferences, type Store } from "../../../../../../src/lib/store/index.js";
import { createCandidateAttestation } from "../../../../../../src/lib/work-unit/candidate-attestation.js";
import { readCandidateRecord, writeCandidateRecord } from "../../../../../../src/lib/store/kinds/review/candidate/access.js";
import { StoreRefusalError } from "../../../../../../src/lib/store/refusal-error.js";

const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../../../../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../../../../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => binding.store ?? original.createStore(...args) };
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
  binding.store = lackingEndedHistory(h.store, owner);
  try {
    await writeCandidateRecord("/no-projected-files", "example", next, saved.version, { owner });
  } finally { binding.store = null; }
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
