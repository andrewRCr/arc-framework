/** Reserved singleton obligations govern fresh preparation and pending replay. */
import { expect, it } from "vitest";
import { createLocalReviewPreparationFixture } from "../../../../fixtures/local-review-preparation.js";
import { createStandardReviewReservation } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectStandardReviewObligation } from "../../../../../src/scripts/review-gate/policy/standard-review-projection.js";
import { resolveReviewRouting } from "../../../../../src/scripts/review-gate/policy/routing.js";
import { prepareLocalReview } from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";

const facts = { contentKind: "code-bearing", reviewRisk: "sensitive", changeDeterminacy: "ordinary",
  ownership: "self", surfaceAuthority: "ordinary" } as const;
const request = { schemaVersion: 1, evaluatorIdentity: "evaluator-1", routingFacts: facts };
const incompatible = { ...request, routingFacts: { ...facts, reviewRisk: "routine" } };

async function fixture() {
  const local = createLocalReviewPreparationFixture();
  const { authority } = await local.dependencies.resolveAuthority("evaluator-1");
  const assurance = await local.dependencies.composeAssurance(authority);
  if (assurance.status !== "resolved") throw new Error("expected resolved assurance");
  const lineage = await local.dependencies.resolveLineage(authority.vehicle, local.changeSetTarget.headSha);
  if (lineage.kind !== "candidate") throw new Error("expected Candidate lineage");
  const projection = projectStandardReviewObligation(resolveReviewRouting({ schemaVersion: 1, ...facts,
    changeSetState: "known", assurance: assurance.assurance, activity: assurance.activity }).decision);
  const reservation = createStandardReviewReservation({ candidateId: lineage.candidateId, sourceId: "codex-pr",
    sources: ["codex-pr", "delegated-agent"], obligation: projection,
    target: { kind: "pinned-head", repository: "owner/repo", headSha: local.changeSetTarget.headSha } });
  return { ...local, reservation, dependencies: { ...local.dependencies,
    readReservedWorkUnitObligation: async () => reservation.obligation } };
}

it("refuses incompatible routing facts, then prepares the reserved singleton requirement after repair", async () => {
  const local = await fixture();
  await expect(prepareLocalReview(incompatible, local.dependencies)).rejects.toThrow(/reserved.*obligation/u);
  expect([...local.operations.values()].some(({ state }) => state.kind === "local-review")).toBe(false);
  const prepared = await prepareLocalReview(request, local.dependencies);
  expect(prepared).toMatchObject({ state: "ready" });
  const state = local.published();
  if (state?.kind !== "local-review") throw new Error("expected a prepared local review");
  expect(state.requirement).toMatchObject(local.reservation.obligation);
});

it("refuses incompatible routing facts when replaying a reserved pending operation", async () => {
  const local = await fixture();
  await expect(prepareLocalReview(request, local.dependencies)).resolves.toMatchObject({ state: "ready" });
  await expect(prepareLocalReview(incompatible, local.dependencies)).rejects.toThrow(/reserved.*obligation/u);
  await expect(prepareLocalReview(request, local.dependencies)).resolves.toMatchObject({ state: "ready" });
});

it("refuses a reservation change between obligation binding and admission", async () => {
  const local = await fixture();
  let read = false;
  let obligation = local.reservation.obligation;
  const dependencies = { ...local.dependencies,
    readReservedWorkUnitObligation: async () => { read = true; return obligation; },
    withLocalReviewLock: async <T>(action: () => Promise<T>) => {
      if (read) obligation = { ...obligation, retrigger: "incremental" };
      return action();
    },
  };
  await expect(prepareLocalReview(request, dependencies)).rejects.toThrow(/policy changed|reserved.*obligation/u);
  expect([...local.operations.values()].some(({ state }) => state.kind === "local-review")).toBe(false);
});
