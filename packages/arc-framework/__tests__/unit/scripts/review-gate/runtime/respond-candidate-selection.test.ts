/** A response reads only the Candidates its checkout may continue, natively only its bound work item's. */
import { expect, it } from "vitest";
import { selectRespondCandidateWorkUnits } from "../../../../../src/scripts/review-gate/runtime/respond-candidate-selection.js";
import { createLifecycleHarness } from "../../../../helpers/store/lifecycle-harness.js";
import { createStore, createDefaultStorePorts, OwnerIdentitySchema } from "../../../../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../../../../src/lib/kernel/index.js";

const byName = (name: string) => OwnerIdentitySchema.parse({ type: "work-item", name });
const completed = async () => [byName("alpha"), byName("beta")];
const shipped = { branch: null, state: "Shipped", currentWorkflow: null } as const;
const archive = { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } as const;

it("reads only the bound completed work item natively from a free primary", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("beta", shipped, archive)).reference;
  expect(await selectRespondCandidateWorkUnits({ store: h.store, workItem: owner }, { status: "unowned" }, async () => [owner]))
    .toEqual(["beta"]);
});

it("reads nothing natively from a free primary for a live work unit reusing a completed one's slug", async () => {
  const h = createLifecycleHarness();
  const ended = (await h.seedMeta("beta", shipped, archive)).reference.owner;
  const live = (await h.seedMeta("beta")).reference.owner;
  expect(live).not.toEqual(ended);
  expect(await selectRespondCandidateWorkUnits({ store: h.store, workItem: live }, { status: "unowned" }, async () => [ended]))
    .toEqual([]);
});

it("reads nothing natively when the bound work item is neither the checkout's nor completed", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("gamma")).reference;
  const input = { store: h.store, workItem: owner };
  expect(await selectRespondCandidateWorkUnits(input, { status: "unowned" }, completed)).toEqual([]);
  expect(await selectRespondCandidateWorkUnits(input, { status: "owned", workUnit: "alpha" }, completed)).toEqual([]);
  expect(await selectRespondCandidateWorkUnits(input, { status: "owned", workUnit: "gamma" }, completed)).toEqual(["gamma"]);
});

it("reads natively only the generation the owning checkout's marker binds, not a namesake sharing its slug", async () => {
  const h = createLifecycleHarness();
  const ended = (await h.seedMeta("beta", shipped, archive)).reference.owner;
  const live = (await h.seedMeta("beta")).reference.owner;
  if (ended.type !== "work-item" || ended.uid === undefined) throw new Error("Expected a minted work-unit UID");
  const owner = { status: "owned" as const, workUnit: "beta", completed: true as const, uid: ended.uid };
  expect(await selectRespondCandidateWorkUnits({ store: h.store, workItem: live }, owner, completed)).toEqual([]);
  expect(await selectRespondCandidateWorkUnits({ store: h.store, workItem: ended }, owner, completed)).toEqual(["beta"]);
});

it("keeps every completed work unit in-repo", async () => {
  const store = createStore(createDefaultStorePorts({ checkoutRoot: "/unavailable" }));
  expect(await selectRespondCandidateWorkUnits({ store }, { status: "unowned" }, completed)).toEqual(["alpha", "beta"]);
  expect(await selectRespondCandidateWorkUnits({ store }, { status: "owned", workUnit: "alpha" }, completed)).toEqual(["alpha"]);
});
