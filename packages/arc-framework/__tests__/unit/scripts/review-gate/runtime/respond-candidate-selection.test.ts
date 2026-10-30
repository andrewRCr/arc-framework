/** A response reads only the Candidates its checkout may continue, natively only its bound work item's. */
import { expect, it } from "vitest";
import { selectRespondCandidateWorkUnits } from "../../../../../src/scripts/review-gate/runtime/respond-candidate-selection.js";
import { createLifecycleHarness } from "../../../../helpers/store/lifecycle-harness.js";
import { createStore, createDefaultStorePorts } from "../../../../../src/lib/store/index.js";

const completed = async () => ["alpha", "beta"] as const;

it("reads only the bound completed work item natively from a free primary", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("beta")).reference;
  expect(await selectRespondCandidateWorkUnits({ store: h.store, workItem: owner }, { status: "unowned" }, completed))
    .toEqual(["beta"]);
});

it("reads nothing natively when the bound work item is neither the checkout's nor completed", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("gamma")).reference;
  const input = { store: h.store, workItem: owner };
  expect(await selectRespondCandidateWorkUnits(input, { status: "unowned" }, completed)).toEqual([]);
  expect(await selectRespondCandidateWorkUnits(input, { status: "owned", workUnit: "alpha" }, completed)).toEqual([]);
  expect(await selectRespondCandidateWorkUnits(input, { status: "owned", workUnit: "gamma" }, completed)).toEqual(["gamma"]);
});

it("keeps every completed work unit in-repo", async () => {
  const store = createStore(createDefaultStorePorts({ checkoutRoot: "/unavailable" }));
  expect(await selectRespondCandidateWorkUnits({ store }, { status: "unowned" }, completed)).toEqual(["alpha", "beta"]);
  expect(await selectRespondCandidateWorkUnits({ store }, { status: "owned", workUnit: "alpha" }, completed)).toEqual(["alpha"]);
});
